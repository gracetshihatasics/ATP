import { useState, useEffect, useCallback } from "react";
import { getResults, getSummary, getTrend, deleteRun, clearAll, exportJUnitURL, exportSummaryURL } from "../../services/results.js";

const STATUS_COLORS = {
  pass:  { bg:"#0a2010", border:"#4caf50", text:"#7ec87f", dot:"#4caf50" },
  fail:  { bg:"#1a0808", border:"#ff3b3b", text:"#ff6b6b", dot:"#ff3b3b" },
  error: { bg:"#1a0f00", border:"#ff8c00", text:"#ffaa44", dot:"#ff8c00" },
};

const GH_EXAMPLE = `name: ATP Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start ATP backend
        run: cd backend && npm install && npx playwright install chromium && npm start &
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
      - name: Download JUnit results
        run: curl http://localhost:3579/api/results/export/junit > results.xml
      - name: Publish results
        uses: actions/upload-artifact@v4
        with:
          name: atp-results
          path: results.xml`;

export function ResultsView({ onRunComplete, onRerun }) {
  const [summary, setSummary]           = useState(null);
  const [records, setRecords]           = useState([]);
  const [total, setTotal]               = useState(0);
  const [selected, setSelected]         = useState(null);
  const [trend, setTrend]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [audience, setAudience]         = useState("engineering"); // engineering | product | executive
  const [activeTab, setActiveTab]       = useState("overview");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage]                 = useState(0);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, res] = await Promise.all([
        getSummary(),
        getResults({ limit: LIMIT, offset: page * LIMIT,
          status: filterStatus === "all" ? undefined : filterStatus }),
      ]);
      setSummary(sum);
      setRecords(res.records);
      setTotal(res.total);
    } catch {}
    setLoading(false);
  }, [page, filterStatus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (onRunComplete) load(); }, [onRunComplete, load]);

  const handleSelect = async (run) => {
    setSelected(run);
    setActiveTab("detail");
    const t = await getTrend(run.name).catch(() => []);
    setTrend(t);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this run?")) return;
    await deleteRun(id);
    setSelected(null);
    setActiveTab("overview");
    load();
  };

  const handleClear = async () => {
    if (!confirm("Clear all results?")) return;
    await clearAll(); setSelected(null); setActiveTab("overview"); load();
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const passRate      = summary?.passRate ?? 0;
  const passColor     = passRate >= 80 ? "#4caf50" : passRate >= 50 ? "#f0c040" : "#ff3b3b";
  const byUrl         = groupBy(records, r => r.url || "unknown");
  const byName        = groupBy(records, r => r.name);
  const recentFails   = records.filter(r => r.status !== "pass").slice(0, 5);
  const recentPasses  = records.filter(r => r.status === "pass").slice(0, 5);
  const avgDuration   = records.length ? Math.round(records.reduce((s,r) => s+(r.duration||0),0)/records.length/1000*10)/10 : 0;

  // Trend data from records (last 14 days by date)
  const trendByDay = buildDailyTrend(records);

  const tabs = audience === "engineering"
    ? [["overview","Overview"],["runs","All Runs"],["flaky","Flaky"],["export","CI Export"]]
    : audience === "product"
    ? [["overview","Overview"],["coverage","Coverage"],["runs","Run History"]]
    : [["overview","Executive Summary"],["export","Export"]];

  return (
    <div style={{ display:"flex", height:"calc(100vh - 44px)", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* ── Left sidebar ── */}
      <div style={{ width:220, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>

        {/* Audience switcher */}
        <div style={{ padding:"10px 12px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7 }}>View as</div>
          {[["engineering","⚙️ Engineering"],["product","📦 Product"],["executive","📈 Executive"]].map(([a,l]) => (
            <button key={a} onClick={() => { setAudience(a); setActiveTab("overview"); }}
              style={{ display:"block", width:"100%", textAlign:"left", background: audience===a?"#1a3050":"none", border:`0.5px solid ${audience===a?"#4d9de0":"transparent"}`, borderRadius:5, color: audience===a?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:11, padding:"5px 9px", fontFamily:"inherit", marginBottom:3, transition:"all 0.15s" }}>
              {l}
            </button>
          ))}
        </div>

        {/* Quick stats */}
        {summary && (
          <div style={{ padding:"10px 12px", borderBottom:"0.5px solid #1e3a5f" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
              <MiniStat label="Total" value={summary.total} color="#4a7fa5" />
              <MiniStat label="Pass rate" value={`${passRate}%`} color={passColor} />
              <MiniStat label="Passed" value={summary.passed} color="#4caf50" />
              <MiniStat label="Failed" value={summary.failed} color="#ff3b3b" />
            </div>
            {/* Pass rate bar */}
            <div style={{ height:4, background:"#1e3a5f", borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${passRate}%`, background:passColor, borderRadius:2, transition:"width 0.6s" }} />
            </div>
            {avgDuration > 0 && <div style={{ fontSize:9, color:"#2d6aad", marginTop:5 }}>avg {avgDuration}s · {records.length} runs loaded</div>}
          </div>
        )}

        {/* Tabs */}
        <div style={{ padding:"6px 8px", borderBottom:"0.5px solid #1e3a5f" }}>
          {tabs.map(([t,l]) => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ display:"block", width:"100%", textAlign:"left", background: activeTab===t?"#1a3050":"none", border:"none", borderRadius:4, color: activeTab===t?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"5px 9px", fontFamily:"inherit", marginBottom:2 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Filter */}
        {(activeTab === "runs" || activeTab === "overview") && (
          <div style={{ padding:"6px 10px", borderBottom:"0.5px solid #0d1a2a", display:"flex", gap:3 }}>
            {["all","pass","fail"].map(s => (
              <button key={s} className={`fb ${filterStatus===s?"on":""}`} onClick={() => { setFilterStatus(s); setPage(0); }} style={{ fontSize:9, flex:1, textAlign:"center" }}>{s}</button>
            ))}
          </div>
        )}

        {/* Mini run list */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {records.length === 0 && !loading && (
            <div style={{ fontSize:9, color:"#1e3a5f", textAlign:"center", marginTop:20, lineHeight:1.9 }}>No results yet.<br/>Run some tests.</div>
          )}
          {records.slice(0, 30).map(run => {
            const sc = STATUS_COLORS[run.status] ?? STATUS_COLORS.error;
            return (
              <div key={run.id} onClick={() => handleSelect(run)}
                style={{ padding:"7px 12px", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer", background: selected?.id===run.id?"#0f1c2e":"transparent", transition:"background 0.1s" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:sc.dot, flexShrink:0 }} />
                  <div style={{ fontSize:10, color:"#b0c8e0", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{run.name}</div>
                </div>
                <div style={{ fontSize:8, color:"#2d6aad", paddingLeft:12 }}>
                  {new Date(run.startedAt).toLocaleString()} · {run.duration ? `${(run.duration/1000).toFixed(1)}s` : ""}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding:"8px 10px", borderTop:"0.5px solid #1e3a5f", display:"flex", gap:5 }}>
          <button className="nb" onClick={load} style={{ flex:1, fontSize:9 }}>↻</button>
          <button onClick={handleClear} style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:4, color:"#ff6b6b", cursor:"pointer", fontSize:9, padding:"4px 8px", fontFamily:"inherit" }}>Clear</button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>

        {/* ═══ OVERVIEW ═══════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:600, color:"#e0f0ff", marginBottom:3 }}>
                  {audience === "executive" ? "Test Health Summary" : audience === "product" ? "Quality Dashboard" : "Test Results Dashboard"}
                </div>
                <div style={{ fontSize:11, color:"#4a7fa5" }}>
                  {summary?.total ?? 0} total runs · last updated {new Date().toLocaleTimeString()}
                </div>
              </div>
              <div style={{ fontSize:32, fontWeight:700, color:passColor }}>{passRate}%</div>
            </div>

            {/* KPI row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
              <KPICard label="Pass Rate" value={`${passRate}%`} sub={`${summary?.passed ?? 0} passed`} color={passColor} icon="✓" />
              <KPICard label="Failed" value={summary?.failed ?? 0} sub="need attention" color="#ff6b6b" icon="✗" />
              <KPICard label="Avg Duration" value={`${avgDuration}s`} sub="per run" color="#4d9de0" icon="⏱" />
              <KPICard label="Flaky Tests" value={summary?.flaky?.length ?? 0} sub="unstable" color="#f0c040" icon="⚡" />
            </div>

            {/* Daily trend chart */}
            {trendByDay.length > 1 && (
              <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", marginBottom:16, background:"#0d1520" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:12 }}>Pass Rate — Last {trendByDay.length} Days</div>
                <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:80 }}>
                  {trendByDay.map((d,i) => {
                    const rate  = d.total > 0 ? d.passed/d.total : 0;
                    const color = rate >= 0.8 ? "#4caf50" : rate >= 0.5 ? "#f0c040" : "#ff3b3b";
                    return (
                      <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                        <div style={{ fontSize:8, color:"#2d6aad" }}>{Math.round(rate*100)}%</div>
                        <div style={{ width:"100%", height:`${Math.max(rate*100,4)}%`, background:color, borderRadius:"3px 3px 0 0", minHeight:4 }}
                          title={`${d.date}: ${d.passed}/${d.total} passed`} />
                        <div style={{ fontSize:7, color:"#1e3a5f", transform:"rotate(-45deg)", transformOrigin:"right", whiteSpace:"nowrap" }}>{d.date.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Two columns: recent failures + by URL */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>

              {/* Recent failures */}
              <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#ff6b6b", marginBottom:10 }}>✗ Recent Failures</div>
                {recentFails.length === 0 && <div style={{ fontSize:10, color:"#4caf50" }}>✓ No failures</div>}
                {recentFails.map((r,i) => (
                  <div key={i} onClick={() => handleSelect(r)}
                    style={{ padding:"6px 0", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer", display:"flex", gap:8, alignItems:"center" }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:"#ff3b3b", flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:10, color:"#b0c8e0", marginBottom:1 }}>{r.name}</div>
                      <div style={{ fontSize:8, color:"#4a7fa5" }}>{new Date(r.startedAt).toLocaleString()}</div>
                    </div>
                    <div style={{ fontSize:9, color:"#ff6b6b" }}>{r.passed}/{r.total}</div>
                  </div>
                ))}
              </div>

              {/* By URL / app */}
              <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>📊 By Application</div>
                {Object.entries(byUrl).slice(0,6).map(([url, runs]) => {
                  const p    = runs.filter(r => r.status==="pass").length;
                  const rate = Math.round(p/runs.length*100);
                  const c    = rate >= 80?"#4caf50":rate>=50?"#f0c040":"#ff3b3b";
                  const shortUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0,30);
                  return (
                    <div key={url} style={{ marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                        <div style={{ fontSize:10, color:"#a0c0d8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{shortUrl}</div>
                        <div style={{ fontSize:10, color:c, flexShrink:0, marginLeft:8 }}>{rate}% · {runs.length} runs</div>
                      </div>
                      <div style={{ height:4, background:"#1e3a5f", borderRadius:2, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${rate}%`, background:c, borderRadius:2 }} />
                      </div>
                    </div>
                  );
                })}
                {Object.keys(byUrl).length === 0 && <div style={{ fontSize:10, color:"#1e3a5f" }}>No data yet</div>}
              </div>
            </div>

            {/* Top failing tests */}
            {audience !== "executive" && (
              <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520", marginBottom:16 }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Most Frequent Tests</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                  {Object.entries(byName).slice(0,8).map(([name, runs]) => {
                    const p    = runs.filter(r => r.status==="pass").length;
                    const rate = Math.round(p/runs.length*100);
                    const c    = rate>=80?"#4caf50":rate>=50?"#f0c040":"#ff3b3b";
                    return (
                      <div key={name} style={{ background:"#0a1520", borderRadius:5, padding:"8px 10px", border:`0.5px solid ${c}30`, cursor:"pointer" }}
                        onClick={() => handleSelect(runs[0])}>
                        <div style={{ fontSize:10, color:"#b0c8e0", marginBottom:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ flex:1, height:3, background:"#1e3a5f", borderRadius:2 }}>
                            <div style={{ height:"100%", width:`${rate}%`, background:c, borderRadius:2 }} />
                          </div>
                          <span style={{ fontSize:9, color:c, flexShrink:0 }}>{rate}%</span>
                          <span style={{ fontSize:9, color:"#2d6aad" }}>{runs.length}x</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Flaky tests */}
            {summary?.flaky?.length > 0 && (
              <div style={{ border:"0.5px solid #ff8c00", borderRadius:8, padding:"14px 16px", background:"#1a0f00" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#ffaa44", marginBottom:10 }}>⚡ Flaky Tests — Need Attention</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
                  {summary.flaky.map((f,i) => (
                    <div key={i} style={{ background:"#0a0800", borderRadius:5, padding:"8px 10px" }}>
                      <div style={{ fontSize:10, color:"#ffaa44", marginBottom:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ flex:1, height:3, background:"#2a1500", borderRadius:2 }}>
                          <div style={{ height:"100%", width:`${f.passRate}%`, background:"#ff8c00", borderRadius:2 }} />
                        </div>
                        <span style={{ fontSize:9, color:"#ff8c00" }}>{f.passRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ RUN DETAIL ═════════════════════════════════════════════════════ */}
        {activeTab === "detail" && selected && (
          <RunDetail run={selected} trend={trend} onDelete={handleDelete} onRerun={onRerun} onBack={() => setActiveTab("overview")} />
        )}

        {/* ═══ ALL RUNS TABLE ══════════════════════════════════════════════════ */}
        {activeTab === "runs" && (
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:14 }}>All Runs</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:"0.5px solid #1e3a5f" }}>
                  {["Status","Test Name","URL","Duration","Passed","Date",""].map(h => (
                    <th key={h} style={{ textAlign:"left", padding:"6px 10px", fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map(run => {
                  const sc = STATUS_COLORS[run.status] ?? STATUS_COLORS.error;
                  return (
                    <tr key={run.id} onClick={() => handleSelect(run)}
                      style={{ borderBottom:"0.5px solid #0d1a2a", cursor:"pointer", transition:"background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background="#0d1520"}
                      onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                      <td style={{ padding:"8px 10px" }}>
                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:3, background:sc.bg, border:`0.5px solid ${sc.border}`, color:sc.text }}>{run.status}</span>
                      </td>
                      <td style={{ padding:"8px 10px", color:"#b0c8e0", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{run.name}</td>
                      <td style={{ padding:"8px 10px", color:"#4a7fa5", fontSize:10, maxWidth:150, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {(run.url||"").replace(/^https?:\/\//,"").slice(0,25)}
                      </td>
                      <td style={{ padding:"8px 10px", color:"#4a7fa5" }}>{run.duration ? `${(run.duration/1000).toFixed(1)}s` : "—"}</td>
                      <td style={{ padding:"8px 10px", color: run.failed>0?"#ff6b6b":"#7ec87f" }}>{run.passed}/{run.total}</td>
                      <td style={{ padding:"8px 10px", color:"#2d6aad", fontSize:9 }}>{new Date(run.startedAt).toLocaleString()}</td>
                      <td style={{ padding:"8px 10px" }}>
                        <div style={{ display:"flex", gap:5 }}>
                          {onRerun && <button className="rb" onClick={e=>{e.stopPropagation();onRerun(run);}} style={{ fontSize:8, padding:"2px 6px" }}>▶</button>}
                          <button onClick={e=>{e.stopPropagation();handleDelete(run.id);}} style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:3, color:"#ff6b6b", cursor:"pointer", fontSize:8, padding:"2px 6px", fontFamily:"inherit" }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {total > LIMIT && (
              <div style={{ display:"flex", gap:6, justifyContent:"center", padding:"14px 0" }}>
                <button className="nb" onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} style={{ fontSize:10 }}>← Prev</button>
                <span style={{ fontSize:10, color:"#4a7fa5", padding:"5px 10px" }}>{page+1} / {Math.ceil(total/LIMIT)}</span>
                <button className="nb" onClick={() => setPage(p => p+1)} disabled={(page+1)*LIMIT>=total} style={{ fontSize:10 }}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ COVERAGE (product view) ════════════════════════════════════════ */}
        {activeTab === "coverage" && (
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:6 }}>Feature Coverage</div>
            <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:16 }}>How well each application area is tested.</div>
            {Object.entries(byUrl).map(([url, runs]) => {
              const p    = runs.filter(r => r.status==="pass").length;
              const rate = Math.round(p/runs.length*100);
              const c    = rate>=80?"#4caf50":rate>=50?"#f0c040":"#ff3b3b";
              const names = [...new Set(runs.map(r => r.name))];
              return (
                <div key={url} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", marginBottom:12, background:"#0d1520" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"#b0d0f0" }}>{url.replace(/^https?:\/\//,"")}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:11, color:c, fontWeight:600 }}>{rate}% pass rate</span>
                      <span style={{ fontSize:10, color:"#4a7fa5" }}>{runs.length} runs · {names.length} tests</span>
                    </div>
                  </div>
                  <div style={{ height:6, background:"#1e3a5f", borderRadius:3, overflow:"hidden", marginBottom:10 }}>
                    <div style={{ height:"100%", width:`${rate}%`, background:c, borderRadius:3 }} />
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                    {names.map(name => {
                      const nr   = runs.filter(r => r.name===name);
                      const np   = nr.filter(r => r.status==="pass").length;
                      const nrate = Math.round(np/nr.length*100);
                      const nc   = nrate>=80?"#4caf50":nrate>=50?"#f0c040":"#ff3b3b";
                      return (
                        <div key={name} className="pill" style={{ background:"#0a1520", border:`0.5px solid ${nc}40`, color:nc, fontSize:9, cursor:"pointer" }}
                          onClick={() => handleSelect(nr[0])}>
                          {name.slice(0,25)} {nrate}%
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {Object.keys(byUrl).length === 0 && <div style={{ color:"#1e3a5f", fontSize:11 }}>No runs yet.</div>}
          </div>
        )}

        {/* ═══ FLAKY ══════════════════════════════════════════════════════════ */}
        {activeTab === "flaky" && (
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:6 }}>Flaky Tests</div>
            <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:16, lineHeight:1.7 }}>
              Tests with inconsistent results — both pass and fail in recent history. These indicate unstable tests or non-deterministic app behaviour.
            </div>
            {summary?.flaky?.length === 0 && (
              <div style={{ border:"0.5px solid #4caf50", borderRadius:8, padding:"20px", textAlign:"center", background:"#0a2010" }}>
                <div style={{ fontSize:24, marginBottom:8 }}>✓</div>
                <div style={{ fontSize:13, color:"#7ec87f" }}>No flaky tests detected</div>
                <div style={{ fontSize:10, color:"#4a7fa5", marginTop:4 }}>All tests have consistent results</div>
              </div>
            )}
            {summary?.flaky?.map((f,i) => (
              <div key={i} style={{ border:"0.5px solid #ff8c00", borderRadius:8, padding:"14px 16px", marginBottom:10, background:"#1a0f00" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ fontSize:12, fontWeight:500, color:"#ffaa44" }}>{f.name}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#ff8c00" }}>{f.passRate}%</div>
                </div>
                <div style={{ height:6, background:"#2a1500", borderRadius:3, overflow:"hidden", marginBottom:8 }}>
                  <div style={{ height:"100%", width:`${f.passRate}%`, background:"#ff8c00", borderRadius:3 }} />
                </div>
                <div style={{ fontSize:10, color:"#8a5a00" }}>
                  ⚠ Inconsistent — review test selectors, timing, or app state management
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ CI EXPORT ══════════════════════════════════════════════════════ */}
        {activeTab === "export" && (
          <div style={{ maxWidth:600 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:6 }}>CI/CD Export</div>
            <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:20, lineHeight:1.7 }}>Download results in standard formats.</div>
            <ExportCard title="JUnit XML" desc="GitHub Actions · Jenkins · Azure DevOps · CircleCI" badge="Universal" badgeColor="#4d9de0"
              usage={"- uses: actions/upload-artifact@v4\n  with:\n    name: atp-results\n    path: atp-results.xml"}
              onDownload={() => window.open(exportJUnitURL(), "_blank")} />
            <ExportCard title="JSON Summary" desc="Slack webhooks · dashboards · monitoring" badge="Webhook-ready" badgeColor="#4caf50"
              usage={"curl http://localhost:3579/api/results/export/summary"}
              onDownload={() => window.open(exportSummaryURL(), "_blank")} />
            <ExportCard title="Allure Report" desc="Rich HTML reports with trends and screenshots" badge="Allure" badgeColor="#c8a0f0"
              usage={"curl http://localhost:3579/api/results/export/allure > allure-results.json\nnpx allure generate"}
              onDownload={() => window.open("http://localhost:3579/api/results/export/allure", "_blank")} />
            <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520", marginTop:8 }}>
              <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:8 }}>GitHub Actions — full example</div>
              <pre style={{ fontSize:10, color:"#a0d0e8", margin:0, whiteSpace:"pre-wrap", lineHeight:1.8, fontFamily:"'IBM Plex Mono',monospace" }}>{GH_EXAMPLE}</pre>
            </div>
          </div>
        )}

        {/* ═══ EXECUTIVE SUMMARY ══════════════════════════════════════════════ */}
        {activeTab === "overview" && audience === "executive" && records.length > 0 && (
          <div style={{ marginTop:20, border:"0.5px solid #1e3a5f", borderRadius:8, padding:"16px 20px", background:"#0d1520" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Key Takeaways</div>
            <div style={{ fontSize:11, color:"#6a9ab8", lineHeight:2 }}>
              {passRate >= 80
                ? `✓ Test suite is healthy with a ${passRate}% pass rate across ${summary?.total} runs.`
                : passRate >= 50
                ? `⚠ Test suite needs attention — ${passRate}% pass rate with ${summary?.failed} failures.`
                : `✗ Critical: only ${passRate}% of tests passing. ${summary?.failed} failures require immediate attention.`
              }<br/>
              {summary?.flaky?.length > 0
                ? `⚡ ${summary.flaky.length} flaky test${summary.flaky.length>1?"s":""} detected — inconsistent results.`
                : `✓ No flaky tests detected — suite is stable.`
              }<br/>
              {avgDuration > 0 && `⏱ Average test duration: ${avgDuration}s.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Run detail ────────────────────────────────────────────────────────────────
function RunDetail({ run, trend, onDelete, onRerun, onBack }) {
  const sc = STATUS_COLORS[run.status] ?? STATUS_COLORS.error;
  return (
    <div className="fi">
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <button className="nb" onClick={onBack} style={{ fontSize:10, padding:"3px 10px" }}>← Back</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>{run.name}</div>
          <div style={{ fontSize:9, color:"#4a7fa5" }}>{run.url} · {new Date(run.startedAt).toLocaleString()} · ID: {run.id}</div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {onRerun && <button className="rb" onClick={() => onRerun(run)} style={{ fontSize:10 }}>▶ Re-run</button>}
          <button onClick={() => onDelete(run.id)} style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:5, color:"#ff6b6b", cursor:"pointer", fontSize:10, padding:"4px 10px", fontFamily:"inherit" }}>✕ Delete</button>
        </div>
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:16 }}>
        <div style={{ background:sc.bg, border:`0.5px solid ${sc.border}`, borderRadius:6, padding:"10px 16px", flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, color:sc.text, marginBottom:3 }}>{run.status==="pass"?"✓ PASSED":"✗ FAILED"}</div>
          <div style={{ fontSize:10, color:"#4a7fa5" }}>{run.passed}/{run.total} assertions · {run.duration ? `${(run.duration/1000).toFixed(1)}s` : ""}</div>
        </div>
      </div>

      {run.steps?.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Steps</div>
          {run.steps.map((s,i) => {
            const ss = STATUS_COLORS[s.status] ?? STATUS_COLORS.error;
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"0.5px solid #0d1a2a" }}>
                <div style={{ width:15,height:15,borderRadius:"50%",border:`0.5px solid ${ss.dot}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:ss.dot,flexShrink:0 }}>
                  {s.status==="pass"?"✓":"✗"}
                </div>
                <span style={{ flex:1, fontSize:11, color:"#a0c0d8" }}>{s.description||s.name||`Step ${i+1}`}</span>
                {s.error && <span style={{ fontSize:9, color:"#ff6b6b", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.error}</span>}
              </div>
            );
          })}
        </div>
      )}

      {run.assertions?.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Assertions</div>
          {run.assertions.map((a,i) => (
            <div key={i} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:"0.5px solid #0d1a2a", fontSize:11, color:a.passed?"#7ec87f":"#ff6b6b" }}>
              <span>{a.passed?"✓":"✗"}</span><span style={{ flex:1 }}>{a.assertion}</span>
            </div>
          ))}
        </div>
      )}

      {trend.length > 1 && (
        <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
          <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Trend — This Test</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:60 }}>
            {trend.map((t,i) => {
              const rate  = t.total>0?t.passed/t.total:0;
              const color = rate>=0.8?"#4caf50":rate>=0.5?"#f0c040":"#ff3b3b";
              return <div key={i} title={`${t.date}: ${Math.round(rate*100)}%`}
                style={{ flex:1, height:`${Math.max(rate*100,4)}%`, background:color, borderRadius:"2px 2px 0 0", minHeight:4 }} />;
            })}
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:"#1e3a5f", marginTop:4 }}>
            <span>{trend[0]?.date}</span><span>{trend[trend.length-1]?.date}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function buildDailyTrend(records) {
  const byDay = {};
  records.forEach(r => {
    const day = r.startedAt?.slice(0, 10);
    if (!day) return;
    if (!byDay[day]) byDay[day] = { date:day, passed:0, total:0 };
    byDay[day].total++;
    if (r.status === "pass") byDay[day].passed++;
  });
  return Object.values(byDay).sort((a,b) => a.date.localeCompare(b.date)).slice(-14);
}

function KPICard({ label, value, sub, color, icon }) {
  return (
    <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
        <span style={{ fontSize:16, color }}>{icon}</span>
        <span style={{ fontSize:9, color:"#4a7fa5", textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</span>
      </div>
      <div style={{ fontSize:22, fontWeight:700, color, marginBottom:2 }}>{value}</div>
      <div style={{ fontSize:9, color:"#2d6aad" }}>{sub}</div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, padding:"6px 8px", textAlign:"center" }}>
      <div style={{ fontSize:14, fontWeight:600, color }}>{value}</div>
      <div style={{ fontSize:8, color:"#2d6aad" }}>{label}</div>
    </div>
  );
}

function ExportCard({ title, desc, badge, badgeColor, usage, onDownload }) {
  const [show, setShow] = useState(false);
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
      <button onClick={() => setShow(!show)} style={{ background:"none", border:"none", color:"#2d6aad", fontSize:9, cursor:"pointer", padding:0, fontFamily:"inherit" }}>
        {show?"▾ hide":"▸ show usage"}
      </button>
      {show && <pre style={{ fontSize:10, color:"#a0d0e8", background:"#060a0d", borderRadius:5, padding:10, marginTop:6, whiteSpace:"pre-wrap", lineHeight:1.7, fontFamily:"'IBM Plex Mono',monospace" }}>{usage}</pre>}
    </div>
  );
}
