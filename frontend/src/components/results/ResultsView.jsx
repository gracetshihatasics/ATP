import { useState, useEffect, useCallback } from "react";
import { getResults, getSummary, getTrend, deleteRun, clearAll, exportJUnitURL, exportSummaryURL } from "../../services/results.js";

const STATUS_COLORS = {
  pass:  { bg:"#0a2010", border:"#4caf50", text:"#7ec87f", dot:"#4caf50" },
  fail:  { bg:"#1a0808", border:"#ff3b3b", text:"#ff6b6b", dot:"#ff3b3b" },
  error: { bg:"#1a0f00", border:"#ff8c00", text:"#ffaa44", dot:"#ff8c00" },
};

const GH_ACTIONS_EXAMPLE = `name: ATP Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start ATP backend
        run: |
          cd backend && npm install
          npx playwright install chromium
          npm start &
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
      - name: Run test suite
        run: |
          curl -X POST http://localhost:3579/api/discover \\
            -H "Content-Type: application/json" \\
            -d '{"url":"\${{ vars.APP_URL }}"}'
      - name: Download JUnit results
        run: curl http://localhost:3579/api/results/export/junit > results.xml
      - name: Publish results
        uses: actions/upload-artifact@v4
        with:
          name: atp-results
          path: results.xml`;

export function ResultsView() {
  const [summary, setSummary]       = useState(null);
  const [records, setRecords]       = useState([]);
  const [total, setTotal]           = useState(0);
  const [selected, setSelected]     = useState(null);
  const [trend, setTrend]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [activeTab, setActiveTab]   = useState("history");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType]     = useState("all");
  const [page, setPage]             = useState(0);
  const LIMIT = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, res] = await Promise.all([
        getSummary(),
        getResults({ limit: LIMIT, offset: page * LIMIT, status: filterStatus === "all" ? undefined : filterStatus, type: filterType === "all" ? undefined : filterType }),
      ]);
      setSummary(sum);
      setRecords(res.records);
      setTotal(res.total);
    } catch {}
    setLoading(false);
  }, [page, filterStatus, filterType]);

  useEffect(() => { load(); }, [load]);

  const handleSelect = async (run) => {
    setSelected(run);
    const t = await getTrend(run.name).catch(() => []);
    setTrend(t);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this run?")) return;
    await deleteRun(id);
    setSelected(null);
    load();
  };

  const handleClear = async () => {
    if (!confirm("Clear all results? This cannot be undone.")) return;
    await clearAll();
    setSelected(null);
    load();
  };

  const passRate = summary?.passRate ?? 0;
  const passRateColor = passRate >= 80 ? "#4caf50" : passRate >= 50 ? "#f0c040" : "#ff3b3b";

  return (
    <div style={{ display:"flex", height:"calc(100vh - 44px)" }}>
      <div style={{ width:300, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
        {summary && (
          <div style={{ padding:"12px 14px", borderBottom:"0.5px solid #1e3a5f", background:"#0a0e12" }}>
            <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:8 }}>Overview</div>
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              <StatCard label="Total"  value={summary.total}  color="#4a7fa5" />
              <StatCard label="Passed" value={summary.passed} color="#4caf50" />
              <StatCard label="Failed" value={summary.failed} color="#ff3b3b" />
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flex:1, height:6, background:"#1e3a5f", borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${passRate}%`, background:passRateColor, borderRadius:3, transition:"width 0.5s" }} />
              </div>
              <span style={{ fontSize:11, fontWeight:600, color:passRateColor }}>{passRate}%</span>
            </div>
            {summary.avgDuration > 0 && <div style={{ fontSize:9, color:"#2d6aad", marginTop:5 }}>avg {(summary.avgDuration/1000).toFixed(1)}s per run</div>}
          </div>
        )}

        <div style={{ padding:"8px 12px", borderBottom:"0.5px solid #1e3a5f", display:"flex", gap:4, flexWrap:"wrap" }}>
          {["all","pass","fail"].map(s => (
            <button key={s} className={`fb ${filterStatus===s?"on":""}`} onClick={() => { setFilterStatus(s); setPage(0); }} style={{ fontSize:9 }}>{s}</button>
          ))}
          <div style={{ width:"100%", height:0 }} />
          {["all","usecase","suite","api"].map(t => (
            <button key={t} className={`fb ${filterType===t?"on":""}`} onClick={() => { setFilterType(t); setPage(0); }} style={{ fontSize:9 }}>{t}</button>
          ))}
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"6px 10px" }}>
          {records.length === 0 && !loading && (
            <div style={{ fontSize:10, color:"#1e3a5f", textAlign:"center", marginTop:30, lineHeight:1.9 }}>No results yet.<br/>Run some tests to see history here.</div>
          )}
          {records.map(run => {
            const sc = STATUS_COLORS[run.status] ?? STATUS_COLORS.error;
            return (
              <div key={run.id} className={`uc-card ${selected?.id===run.id?"sel":""}`} onClick={() => handleSelect(run)} style={{ marginBottom:6 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                  <div style={{ fontSize:10, fontWeight:500, color:"#b0c8e0", flex:1, marginRight:8, lineHeight:1.3 }}>{run.name}</div>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:sc.dot, flexShrink:0, marginTop:2 }} />
                </div>
                <div style={{ display:"flex", gap:8, fontSize:9, color:"#4a7fa5" }}>
                  <span style={{ color:sc.text }}>{run.status}</span>
                  <span>{run.passed}/{run.total} passed</span>
                  {run.duration && <span>{(run.duration/1000).toFixed(1)}s</span>}
                </div>
                <div style={{ fontSize:8, color:"#1e3a5f", marginTop:3 }}>{new Date(run.startedAt).toLocaleString()}</div>
              </div>
            );
          })}
          {total > LIMIT && (
            <div style={{ display:"flex", gap:6, justifyContent:"center", padding:"8px 0" }}>
              <button className="nb" onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} style={{ fontSize:10, padding:"3px 10px" }}>← Prev</button>
              <span style={{ fontSize:10, color:"#4a7fa5", padding:"3px 8px" }}>{page+1}/{Math.ceil(total/LIMIT)}</span>
              <button className="nb" onClick={() => setPage(p => p+1)} disabled={(page+1)*LIMIT>=total} style={{ fontSize:10, padding:"3px 10px" }}>Next →</button>
            </div>
          )}
        </div>

        <div style={{ padding:"8px 12px", borderTop:"0.5px solid #1e3a5f", display:"flex", gap:6 }}>
          <button className="nb" onClick={load} style={{ flex:1, fontSize:10, textAlign:"center" }}>↻ Refresh</button>
          <button onClick={handleClear} style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:5, color:"#ff6b6b", cursor:"pointer", fontSize:10, padding:"5px 10px", fontFamily:"inherit" }}>Clear all</button>
        </div>
      </div>

      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <div style={{ background:"#0a0e12", borderBottom:"0.5px solid #1e3a5f", padding:"0 14px", display:"flex", alignItems:"center" }}>
          {[["history","History"],["flaky","Flaky Tests"],["export","CI Export"]].map(([t,l]) => (
            <button key={t} className={`tab ${activeTab===t?"on":""}`} onClick={() => setActiveTab(t)}>{l}</button>
          ))}
        </div>

        {activeTab === "history" && (
          <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
            {!selected
              ? <div style={{ textAlign:"center", marginTop:60, color:"#2d6aad", fontSize:11 }}>← Select a run to see details</div>
              : <RunDetail run={selected} trend={trend} onDelete={handleDelete} />
            }
          </div>
        )}

        {activeTab === "flaky" && (
          <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
            <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:16, lineHeight:1.7 }}>
              Flaky tests have both pass and fail in recent history — unstable tests or non-deterministic behaviour.
            </div>
            {(summary?.flaky?.length === 0) && <div style={{ fontSize:11, color:"#4caf50" }}>✓ No flaky tests detected</div>}
            {summary?.flaky?.map((f,i) => (
              <div key={i} style={{ border:"0.5px solid #ff8c00", borderRadius:8, padding:"12px 14px", marginBottom:8, background:"#1a0f00" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <div style={{ fontSize:12, fontWeight:500, color:"#ffaa44" }}>{f.name}</div>
                  <div style={{ fontSize:11, color:"#ff8c00" }}>{f.passRate}% pass rate</div>
                </div>
                <div style={{ height:4, background:"#2a1500", borderRadius:2, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${f.passRate}%`, background:"#ff8c00", borderRadius:2 }} />
                </div>
                <div style={{ fontSize:9, color:"#8a5a00", marginTop:5 }}>Inconsistent — review test logic or app behaviour</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "export" && (
          <div style={{ flex:1, overflowY:"auto", padding:"16px 20px", maxWidth:560 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:6 }}>CI/CD Export</div>
            <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:20, lineHeight:1.7 }}>Download results in standard formats to integrate with your CI/CD pipeline.</div>
            <ExportCard title="JUnit XML" desc="GitHub Actions, Jenkins, Azure DevOps, CircleCI" badge="Universal" badgeColor="#4d9de0"
              usage={"- name: Upload results\n  uses: actions/upload-artifact@v4\n  with:\n    path: atp-results.xml"}
              onDownload={() => window.open(exportJUnitURL(), "_blank")} />
            <ExportCard title="JSON Summary" desc="Slack webhooks, custom dashboards, monitoring" badge="Webhook-ready" badgeColor="#4caf50"
              usage={"curl http://localhost:3579/api/results/export/summary\n# Returns: { suite, passed, failed, passRate, status }"}
              onDownload={() => window.open(exportSummaryURL(), "_blank")} />
            <ExportCard title="Allure Report" desc="Rich HTML reports with trends and history" badge="Allure" badgeColor="#c8a0f0"
              usage={"curl http://localhost:3579/api/results/export/allure > allure-results.json\nnpx allure generate"}
              onDownload={() => window.open("http://localhost:3579/api/results/export/allure", "_blank")} />
            <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520", marginTop:8 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:8 }}>GitHub Actions — full example</div>
              <pre style={{ fontSize:10, color:"#a0d0e8", margin:0, whiteSpace:"pre-wrap", lineHeight:1.8, fontFamily:"'IBM Plex Mono',monospace" }}>{GH_ACTIONS_EXAMPLE}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RunDetail({ run, trend, onDelete }) {
  const sc = STATUS_COLORS[run.status] ?? STATUS_COLORS.error;
  return (
    <div className="fi">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:4 }}>{run.name}</div>
          <div style={{ fontSize:10, color:"#4a7fa5" }}>{run.url} · {new Date(run.startedAt).toLocaleString()}</div>
        </div>
        <button onClick={() => onDelete(run.id)} style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:5, color:"#ff6b6b", cursor:"pointer", fontSize:10, padding:"4px 10px", fontFamily:"inherit" }}>✕ Delete</button>
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        <div style={{ background:sc.bg, border:`0.5px solid ${sc.border}`, borderRadius:6, padding:"8px 14px", flex:1 }}>
          <div style={{ fontSize:12, fontWeight:600, color:sc.text, marginBottom:2 }}>{run.status==="pass"?"✓ PASSED":"✗ FAILED"}</div>
          <div style={{ fontSize:10, color:"#4a7fa5" }}>{run.passed}/{run.total} assertions passed · {run.duration ? `${(run.duration/1000).toFixed(1)}s` : ""}</div>
        </div>
      </div>
      {run.steps?.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Steps</div>
          {run.steps.map((s,i) => {
            const ss = STATUS_COLORS[s.status] ?? STATUS_COLORS.error;
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:"0.5px solid #0d1a2a", fontSize:11 }}>
                <div style={{ width:14,height:14,borderRadius:"50%",border:`0.5px solid ${ss.dot}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:ss.dot,flexShrink:0 }}>
                  {s.status==="pass"?"✓":"✗"}
                </div>
                <span style={{ flex:1, color:"#a0c0d8" }}>{s.description||s.name||`Step ${i+1}`}</span>
                {s.error && <span style={{ fontSize:9, color:"#ff6b6b" }}>{s.error.slice(0,40)}</span>}
              </div>
            );
          })}
        </div>
      )}
      {run.assertions?.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Assertions</div>
          {run.assertions.map((a,i) => (
            <div key={i} style={{ display:"flex", gap:8, padding:"4px 0", borderBottom:"0.5px solid #0d1a2a", fontSize:11, color:a.passed?"#7ec87f":"#ff6b6b" }}>
              <span>{a.passed?"✓":"✗"}</span><span style={{ flex:1 }}>{a.assertion}</span>
            </div>
          ))}
        </div>
      )}
      {trend.length > 1 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Trend (last {trend.length} runs)</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:50 }}>
            {trend.map((t,i) => {
              const rate  = t.total > 0 ? t.passed/t.total : 0;
              const color = rate >= 0.8 ? "#4caf50" : rate >= 0.5 ? "#f0c040" : "#ff3b3b";
              return <div key={i} title={`${t.date}: ${Math.round(rate*100)}%`} style={{ flex:1, height:`${Math.max(rate*100,5)}%`, background:color, borderRadius:"2px 2px 0 0" }} />;
            })}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:"#1e3a5f", marginTop:3 }}>
            <span>{trend[0]?.date}</span><span>{trend[trend.length-1]?.date}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ flex:1, background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:6, padding:"6px 8px", textAlign:"center" }}>
      <div style={{ fontSize:16, fontWeight:600, color }}>{value}</div>
      <div style={{ fontSize:9, color:"#2d6aad" }}>{label}</div>
    </div>
  );
}

function ExportCard({ title, desc, badge, badgeColor, usage, onDownload }) {
  const [showUsage, setShowUsage] = useState(false);
  return (
    <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", marginBottom:10, background:"#0d1520" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:"#b0d0f0", marginBottom:2 }}>{title}</div>
          <div style={{ fontSize:10, color:"#4a7fa5" }}>{desc}</div>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <span className="pill" style={{ background:"#0d1520", border:`0.5px solid ${badgeColor}`, color:badgeColor }}>{badge}</span>
          <button className="rb" onClick={onDownload} style={{ fontSize:10, padding:"3px 10px" }}>↓ Download</button>
        </div>
      </div>
      <button onClick={() => setShowUsage(!showUsage)} style={{ background:"none", border:"none", color:"#2d6aad", fontSize:9, cursor:"pointer", padding:0, fontFamily:"inherit" }}>
        {showUsage ? "▾ hide usage" : "▸ show usage"}
      </button>
      {showUsage && (
        <pre style={{ fontSize:10, color:"#a0d0e8", background:"#060a0d", borderRadius:5, padding:10, marginTop:6, whiteSpace:"pre-wrap", lineHeight:1.7, fontFamily:"'IBM Plex Mono',monospace" }}>{usage}</pre>
      )}
    </div>
  );
}
