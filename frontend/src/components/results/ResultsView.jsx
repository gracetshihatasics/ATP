import { useState, useEffect, useCallback, useRef } from "react";
import {
  getResults, getSummary, getTrend, deleteRun, clearAll,
  exportJUnitURL, exportSummaryURL, analyseRun, analyseSuiteRuns, validateTest,
} from "../../services/results.js";

// ── Constants ──────────────────────────────────────────────────────────────────
const S = {
  pass:  { bg:"#0a2010", border:"#4caf50", text:"#7ec87f", dot:"#4caf50", light:"#4caf5030" },
  fail:  { bg:"#1a0808", border:"#ff3b3b", text:"#ff6b6b", dot:"#ff3b3b", light:"#ff3b3b30" },
  error: { bg:"#1a0f00", border:"#ff8c00", text:"#ffaa44", dot:"#ff8c00", light:"#ff8c0030" },
};
const TYPE_ICONS  = { usecase:"🖥", suite:"📦", api:"🔌" };
const TYPE_LABELS = { usecase:"Browser", suite:"Suite", api:"API" };
const SEV_COLORS  = { critical:"#ff3b3b", high:"#ff8c00", medium:"#f0c040", low:"#4d9de0", none:"#4a7fa5" };
const PALETTE     = ["#4d9de0","#4caf50","#f0c040","#c8a0f0","#ff8c00","#5a8aaa","#7ec87f","#ff6b6b"];

const GH = `name: ATP Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start ATP
        run: cd backend && npm install && npx playwright install chromium && npm start &
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
      - name: Export results
        run: curl http://localhost:3579/api/results/export/junit > results.xml
      - name: Upload
        uses: actions/upload-artifact@v4
        with: { name: atp-results, path: results.xml }`;

export function ResultsView({ onRunComplete, onRerun }) {
  const [summary, setSummary]   = useState(null);
  const [records, setRecords]   = useState([]);
  const [allRecords, setAllRecords] = useState([]); // unfiltered for charts
  const [selected, setSelected] = useState(null);
  const [trend, setTrend]       = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analysing, setAnalysing] = useState(false);
  const [suiteInsight, setSuiteInsight] = useState(null);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [audience, setAudience] = useState("engineering");
  const [view, setView]         = useState("dashboard"); // dashboard | list | detail | export
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType]     = useState("all");
  const [page, setPage]         = useState(0);
  const [loading, setLoading]   = useState(false);
  const [liveMode, setLiveMode] = useState(true);
  const liveRef = useRef(null);
  const LIMIT = 100;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [sum, all, filtered] = await Promise.all([
        getSummary(),
        getResults({ limit: 200 }),                          // all for charts
        getResults({ limit: LIMIT, offset: page * LIMIT,    // filtered for list
          status: filterStatus, type: filterType }),
      ]);
      setSummary(sum);
      setAllRecords(all.records ?? []);
      setRecords(filtered.records ?? []);
    } catch(e) { console.error(e); }
    if (!silent) setLoading(false);
  }, [page, filterStatus, filterType]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (onRunComplete) load(true); }, [onRunComplete]);

  // Live refresh every 5s when enabled
  useEffect(() => {
    if (!liveMode) { clearInterval(liveRef.current); return; }
    liveRef.current = setInterval(() => load(true), 5000);
    return () => clearInterval(liveRef.current);
  }, [liveMode, load]);

  const handleSelect = async (run) => {
    setSelected(run); setAnalysis(null); setSuiteInsight(null); setValidation(null);
    setView("detail");
    const t = await getTrend(run.name).catch(() => []);
    setTrend(t);
  };

  const handleValidate = async () => {
    if (!selected) return;
    setValidating(true); setValidation(null);
    try { setValidation(await validateTest(selected)); } catch {}
    setValidating(false);
  };

  const handleAnalyse = async () => {
    if (!selected) return;
    setAnalysing(true); setAnalysis(null);
    try { setAnalysis(await analyseRun(selected.id)); } catch {}
    setAnalysing(false);
  };

  const handleSuiteInsight = async () => {
    if (!selected?.ucRunIds?.length) return;
    setAnalysing(true); setSuiteInsight(null);
    try { setSuiteInsight(await analyseSuiteRuns(selected.ucRunIds)); } catch {}
    setAnalysing(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this run?")) return;
    await deleteRun(id); setSelected(null); setView("dashboard"); load();
  };

  const handleClear = async () => {
    if (!confirm("Delete ALL results?")) return;
    await clearAll(); setSelected(null); setView("dashboard"); load();
  };

  // ── Derived data ────────────────────────────────────────────────────────────
  const r = allRecords;
  const passRate    = summary?.passRate ?? 0;
  const passColor   = passRate >= 80 ? "#4caf50" : passRate >= 50 ? "#f0c040" : "#ff3b3b";
  const byType      = groupBy(r, x => x.type || "usecase");
  const byUrl       = groupBy(r, x => x.url  || "unknown");
  const byName      = groupBy(r, x => x.name);
  const recentFails = r.filter(x => x.status !== "pass").slice(0, 8);
  const trendByDay  = buildDailyTrend(r);
  const avgDur      = r.length ? +(r.reduce((s,x) => s+(x.duration||0),0)/r.length/1000).toFixed(1) : 0;
  const totalSteps  = r.reduce((s,x) => s+(x.steps?.length||0), 0);

  return (
    <div style={{ display:"flex", height:"calc(100vh - 44px)", background:"#080c0f", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* ── Sidebar ── */}
      <div style={{ width:200, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>

        {/* Logo / title */}
        <div style={{ padding:"14px 14px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", letterSpacing:"0.1em" }}>RESULTS</div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:liveMode?"#4caf50":"#2d6aad", animation:liveMode?"pulse 1.5s infinite":"none" }} />
            <span style={{ fontSize:9, color:liveMode?"#4caf50":"#2d6aad", cursor:"pointer" }} onClick={() => setLiveMode(!liveMode)}>
              {liveMode?"LIVE":"PAUSED"} — click to toggle
            </span>
          </div>
        </div>

        {/* Audience */}
        <div style={{ padding:"8px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:8, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 }}>Audience</div>
          {[["engineering","⚙️ Engineering"],["product","📦 Product"],["executive","📈 Executive"]].map(([a,l]) => (
            <button key={a} onClick={() => setAudience(a)}
              style={{ display:"block", width:"100%", textAlign:"left", background:audience===a?"#1a3050":"none", border:"none", borderRadius:4, color:audience===a?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"5px 8px", fontFamily:"inherit", marginBottom:2 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Views */}
        <div style={{ padding:"8px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:8, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 }}>Views</div>
          {[["dashboard","📊 Dashboard"],["list","≡ All Runs"],["export","↓ CI Export"]].map(([v,l]) => (
            <button key={v} onClick={() => setView(v)}
              style={{ display:"block", width:"100%", textAlign:"left", background:view===v?"#1a3050":"none", border:"none", borderRadius:4, color:view===v?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"5px 8px", fontFamily:"inherit", marginBottom:2 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Quick stats */}
        {summary && (
          <div style={{ padding:"8px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, marginBottom:6 }}>
              {[["Total",summary.total,"#4a7fa5"],["Rate",`${passRate}%`,passColor],["Pass",summary.passed,"#4caf50"],["Fail",summary.failed,"#ff3b3b"]].map(([l,v,c]) => (
                <div key={l} style={{ background:"#0a0e12", border:"0.5px solid #1e3a5f", borderRadius:4, padding:"5px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:12, fontWeight:700, color:c }}>{v}</div>
                  <div style={{ fontSize:8, color:"#2d6aad" }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ height:3, background:"#1e3a5f", borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${passRate}%`, background:passColor, borderRadius:2, transition:"width 0.8s" }} />
            </div>
          </div>
        )}

        {/* Recent runs mini list */}
        <div style={{ flex:1, overflowY:"auto" }}>
          <div style={{ fontSize:8, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", padding:"6px 12px 3px" }}>Recent Runs</div>
          {allRecords.slice(0, 20).map(run => {
            const sc = S[run.status] ?? S.error;
            return (
              <div key={run.id} onClick={() => handleSelect(run)}
                style={{ padding:"5px 12px", borderBottom:"0.5px solid #0a0e12", cursor:"pointer", background:selected?.id===run.id?"#0f1c2e":"transparent", display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:sc.dot, flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:9, color:"#a0c0d8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{run.name}</div>
                  <div style={{ fontSize:7, color:"#2d6aad" }}>{TYPE_ICONS[run.type]} {new Date(run.startedAt).toLocaleTimeString()}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding:"6px 10px", borderTop:"0.5px solid #1e3a5f", display:"flex", gap:4 }}>
          <button className="nb" onClick={() => load()} style={{ flex:1, fontSize:9 }}>↻</button>
          <button onClick={handleClear} style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:4, color:"#ff6b6b", cursor:"pointer", fontSize:9, padding:"4px 7px", fontFamily:"inherit" }}>Clear</button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex:1, overflowY:"auto" }}>

        {/* ═══════════ DASHBOARD ═══════════════════════════════════════════════ */}
        {view === "dashboard" && (
          <div style={{ padding:"20px 24px" }}>

            {/* Header row */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:600, color:"#e0f0ff" }}>
                  {audience==="executive"?"Executive Health Report":audience==="product"?"Quality Dashboard":"Test Results Dashboard"}
                </div>
                <div style={{ fontSize:10, color:"#4a7fa5", marginTop:2 }}>
                  {summary?.total??0} total runs · {r.length} in view · {liveMode?"🟢 live":"⏸ paused"}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:36, fontWeight:800, color:passColor, lineHeight:1 }}>{passRate}%</div>
                <div style={{ fontSize:10, color:"#4a7fa5" }}>pass rate</div>
              </div>
            </div>

            {/* ── KPI Row ── */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8, marginBottom:16 }}>
              {[
                { icon:"✓", label:"Passed",    value:summary?.passed??0,  color:"#4caf50", sub:`of ${summary?.total??0}` },
                { icon:"✗", label:"Failed",    value:summary?.failed??0,  color:"#ff6b6b", sub:"need fix" },
                { icon:"⏱", label:"Avg Time",  value:`${avgDur}s`,        color:"#4d9de0", sub:"per run" },
                { icon:"≡", label:"Steps Run", value:totalSteps,          color:"#c8a0f0", sub:"total actions" },
                { icon:"⚡", label:"Flaky",     value:summary?.flaky?.length??0, color:"#f0c040", sub:"unstable" },
                { icon:"📊", label:"Runs",      value:summary?.total??0,   color:"#7ec8ff", sub:"all time" },
              ].map(k => (
                <div key={k.label} style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:8, padding:"12px 14px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                    <span style={{ color:k.color, fontSize:12 }}>{k.icon}</span>
                    <span style={{ fontSize:8, color:"#4a7fa5", textTransform:"uppercase", letterSpacing:"0.08em" }}>{k.label}</span>
                  </div>
                  <div style={{ fontSize:20, fontWeight:700, color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:8, color:"#2d6aad", marginTop:2 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── Chart row ── */}
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:12, marginBottom:12 }}>

              {/* Daily trend — line-style bar chart */}
              <div style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff" }}>Pass Rate Trend</div>
                  <div style={{ display:"flex", gap:10, fontSize:9, color:"#4a7fa5" }}>
                    <span style={{ color:"#4caf50" }}>■ pass</span>
                    <span style={{ color:"#ff3b3b" }}>■ fail</span>
                  </div>
                </div>
                {trendByDay.length === 0 ? (
                  <div style={{ height:100, display:"flex", alignItems:"center", justifyContent:"center", color:"#1e3a5f", fontSize:10 }}>No trend data yet — run more tests</div>
                ) : (
                  <>
                    <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:100, marginBottom:6 }}>
                      {trendByDay.map((d,i) => {
                        const rate  = d.total>0?d.passed/d.total:0;
                        const failH = d.total>0?(d.total-d.passed)/d.total*100:0;
                        const passH = rate*100;
                        return (
                          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", gap:1, cursor:"default" }} title={`${d.date}: ${d.passed}/${d.total} (${Math.round(rate*100)}%)`}>
                            <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"flex-end", gap:1, height:100 }}>
                              <div style={{ height:`${failH}%`, background:"#ff3b3b", borderRadius:"1px", minHeight:failH>0?2:0, opacity:0.8 }} />
                              <div style={{ height:`${passH}%`, background:"#4caf50", borderRadius:"2px 2px 0 0", minHeight:passH>0?2:0 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:"#1e3a5f" }}>
                      <span>{trendByDay[0]?.date}</span>
                      <span>{trendByDay[Math.floor(trendByDay.length/2)]?.date}</span>
                      <span>{trendByDay[trendByDay.length-1]?.date}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Pass/fail donut (CSS-based) */}
              <div style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", display:"flex", flexDirection:"column" }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:14 }}>Distribution</div>
                <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:20 }}>
                  <DonutChart passed={summary?.passed??0} failed={summary?.failed??0} total={summary?.total??0} />
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {[["#4caf50","Pass",summary?.passed??0],["#ff3b3b","Fail",summary?.failed??0]].map(([c,l,v]) => (
                      <div key={l} style={{ display:"flex", alignItems:"center", gap:7 }}>
                        <div style={{ width:10, height:10, borderRadius:2, background:c }} />
                        <span style={{ fontSize:10, color:"#a0c0d8" }}>{l}</span>
                        <span style={{ fontSize:11, fontWeight:600, color:c, marginLeft:4 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Second chart row ── */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>

              {/* By type */}
              <div style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px" }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:12 }}>By Type</div>
                {Object.keys(byType).length === 0 && <div style={{ fontSize:10, color:"#1e3a5f" }}>No data</div>}
                {Object.entries(byType).map(([type, runs], i) => {
                  const p    = runs.filter(r => r.status==="pass").length;
                  const rate = runs.length>0?Math.round(p/runs.length*100):0;
                  const c    = rate>=80?"#4caf50":rate>=50?"#f0c040":"#ff3b3b";
                  return (
                    <div key={type} style={{ marginBottom:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:10, color:"#b0c8e0" }}>{TYPE_ICONS[type]} {TYPE_LABELS[type]||type}</span>
                        <span style={{ fontSize:10, color:c, fontWeight:600 }}>{rate}%</span>
                      </div>
                      <div style={{ height:6, background:"#1e3a5f", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${rate}%`, background:c, borderRadius:3, transition:"width 0.5s" }} />
                      </div>
                      <div style={{ fontSize:8, color:"#2d6aad", marginTop:3 }}>{runs.length} runs · {p} pass · {runs.length-p} fail</div>
                    </div>
                  );
                })}
              </div>

              {/* By app */}
              <div style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px" }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:12 }}>By Application</div>
                {Object.keys(byUrl).length === 0 && <div style={{ fontSize:10, color:"#1e3a5f" }}>No data</div>}
                {Object.entries(byUrl).slice(0,5).map(([url, runs]) => {
                  const p    = runs.filter(r => r.status==="pass").length;
                  const rate = Math.round(p/runs.length*100);
                  const c    = rate>=80?"#4caf50":rate>=50?"#f0c040":"#ff3b3b";
                  const label = url.replace(/^https?:\/\//,"").replace(/\/$/,"").slice(0,22);
                  return (
                    <div key={url} style={{ marginBottom:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:9, color:"#a0c0d8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{label}</span>
                        <span style={{ fontSize:9, color:c, fontWeight:600, flexShrink:0, marginLeft:8 }}>{rate}%</span>
                      </div>
                      <div style={{ height:6, background:"#1e3a5f", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${rate}%`, background:c, borderRadius:3 }} />
                      </div>
                      <div style={{ fontSize:8, color:"#2d6aad", marginTop:3 }}>{runs.length} runs</div>
                    </div>
                  );
                })}
              </div>

              {/* Duration histogram */}
              <div style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px" }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:12 }}>Duration Distribution</div>
                <DurationHistogram records={r} />
              </div>
            </div>

            {/* ── Bottom row ── */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>

              {/* Recent failures */}
              <div style={{ background:"#0d1520", border:"0.5px solid #ff3b3b30", borderRadius:8, padding:"14px 16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#ff6b6b" }}>✗ Recent Failures</div>
                  {recentFails.length>0 && (
                    <button className="nb" onClick={() => { setFilterStatus("fail"); setView("list"); }} style={{ fontSize:8, padding:"2px 8px" }}>View all →</button>
                  )}
                </div>
                {recentFails.length===0 && (
                  <div style={{ textAlign:"center", padding:"20px 0", color:"#4caf50", fontSize:11 }}>✓ No failures — all tests passing</div>
                )}
                {recentFails.map((run,i) => {
                  const failedSteps = (run.steps||[]).filter(s => s.status!=="pass");
                  return (
                    <div key={run.id} onClick={() => handleSelect(run)}
                      style={{ padding:"8px 0", borderBottom:`0.5px solid #1e3a5f`, cursor:"pointer", display:"flex", gap:10, alignItems:"flex-start" }}>
                      <span style={{ fontSize:11 }}>{TYPE_ICONS[run.type]||"·"}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:10, color:"#b0c8e0", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{run.name}</div>
                        {failedSteps[0] && <div style={{ fontSize:9, color:"#ff6b6b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>✗ {failedSteps[0].error || failedSteps[0].description}</div>}
                        <div style={{ fontSize:8, color:"#4a7fa5", marginTop:2 }}>{new Date(run.startedAt).toLocaleString()} · {run.duration?`${(run.duration/1000).toFixed(1)}s`:""}</div>
                      </div>
                      <span style={{ fontSize:9, color:"#ff6b6b", flexShrink:0 }}>{run.passed}/{run.total}</span>
                    </div>
                  );
                })}
              </div>

              {/* Top tests by frequency */}
              <div style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px" }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:12 }}>
                  {audience==="executive"?"Coverage Summary":"Most Run Tests"}
                </div>
                {Object.keys(byName).length===0 && <div style={{ fontSize:10, color:"#1e3a5f" }}>No data yet</div>}
                {Object.entries(byName).slice(0,8).sort((a,b) => b[1].length-a[1].length).map(([name, runs],i) => {
                  const p    = runs.filter(r => r.status==="pass").length;
                  const rate = Math.round(p/runs.length*100);
                  const c    = rate>=80?"#4caf50":rate>=50?"#f0c040":"#ff3b3b";
                  const lastRun = runs[0];
                  return (
                    <div key={name} onClick={() => handleSelect(lastRun)}
                      style={{ padding:"6px 0", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:9 }}>{TYPE_ICONS[lastRun?.type]||"·"}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:10, color:"#b0c8e0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
                          <div style={{ width:60, height:3, background:"#1e3a5f", borderRadius:2 }}>
                            <div style={{ height:"100%", width:`${rate}%`, background:c, borderRadius:2 }} />
                          </div>
                          <span style={{ fontSize:8, color:c }}>{rate}%</span>
                        </div>
                      </div>
                      <span style={{ fontSize:9, color:"#2d6aad" }}>{runs.length}×</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Flaky alert */}
            {summary?.flaky?.length > 0 && (
              <div style={{ border:"0.5px solid #ff8c00", borderRadius:8, padding:"14px 16px", background:"#1a0f00", marginTop:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#ffaa44", marginBottom:10 }}>⚡ Flaky Tests — Unstable</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:8 }}>
                  {summary.flaky.map((f,i) => (
                    <div key={i} style={{ background:"#0a0800", borderRadius:5, padding:"8px 10px" }}>
                      <div style={{ fontSize:9, color:"#ffaa44", marginBottom:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ flex:1, height:4, background:"#2a1500", borderRadius:2 }}>
                          <div style={{ height:"100%", width:`${f.passRate}%`, background:"#ff8c00", borderRadius:2 }} />
                        </div>
                        <span style={{ fontSize:9, color:"#ff8c00", fontWeight:600 }}>{f.passRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Executive summary */}
            {audience==="executive" && summary && (
              <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"16px 20px", background:"#0d1520", marginTop:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Executive Summary</div>
                <div style={{ fontSize:11, color:"#6a9ab8", lineHeight:2.2 }}>
                  <span style={{ color:passColor }}>●</span> Overall health: <strong style={{ color:passColor }}>{passRate>=80?"GOOD":passRate>=50?"NEEDS ATTENTION":"CRITICAL"}</strong> — {passRate}% pass rate across {summary.total} test runs.<br/>
                  <span style={{ color:"#4a7fa5" }}>●</span> {summary.failed} test{summary.failed!==1?"s":""} currently failing{summary.failed>0?" and need immediate attention":""}.<br/>
                  {summary.flaky?.length>0?<><span style={{ color:"#f0c040" }}>●</span> {summary.flaky.length} flaky test{summary.flaky.length!==1?"s":""} detected — inconsistent results risk user experience.<br/></>:null}
                  <span style={{ color:"#4a7fa5" }}>●</span> Average test execution time: {avgDur}s per run.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ ALL RUNS LIST ══════════════════════════════════════════ */}
        {view === "list" && (
          <div style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>All Runs</div>
              <div style={{ display:"flex", gap:4 }}>
                {["all","pass","fail"].map(s => (
                  <button key={s} className={`fb ${filterStatus===s?"on":""}`} onClick={() => { setFilterStatus(s); setPage(0); }} style={{ fontSize:9 }}>{s}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:4 }}>
                {["all","usecase","suite","api"].map(t => (
                  <button key={t} className={`fb ${filterType===t?"on":""}`} onClick={() => { setFilterType(t); setPage(0); }} style={{ fontSize:9 }}>{TYPE_ICONS[t]||""} {t}</button>
                ))}
              </div>
              <span style={{ fontSize:10, color:"#4a7fa5", marginLeft:"auto" }}>{records.length} results</span>
            </div>

            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:"0.5px solid #1e3a5f" }}>
                  {["","Status","Name","App / URL","Duration","Passed","Date",""].map((h,i) => (
                    <th key={i} style={{ textAlign:"left", padding:"6px 8px", fontSize:9, color:"#2d6aad", letterSpacing:"0.06em", textTransform:"uppercase", fontWeight:600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.length===0 && (
                  <tr><td colSpan={8} style={{ textAlign:"center", padding:"40px", color:"#1e3a5f", fontSize:11 }}>No runs match the current filter</td></tr>
                )}
                {records.map(run => {
                  const sc = S[run.status] ?? S.error;
                  return (
                    <tr key={run.id} onClick={() => handleSelect(run)}
                      style={{ borderBottom:"0.5px solid #0d1a2a", cursor:"pointer", transition:"background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background="#0d1520"}
                      onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                      <td style={{ padding:"8px 8px", fontSize:13 }}>{TYPE_ICONS[run.type]||"·"}</td>
                      <td style={{ padding:"8px 8px" }}>
                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:3, background:sc.bg, border:`0.5px solid ${sc.border}`, color:sc.text }}>{run.status}</span>
                      </td>
                      <td style={{ padding:"8px 8px", color:"#b0c8e0", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{run.name}</td>
                      <td style={{ padding:"8px 8px", color:"#4a7fa5", fontSize:9, maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {(run.apiTitle||run.url||"").replace(/^https?:\/\//,"").slice(0,22)}
                      </td>
                      <td style={{ padding:"8px 8px", color:"#4a7fa5" }}>{run.duration?`${(run.duration/1000).toFixed(1)}s`:"—"}</td>
                      <td style={{ padding:"8px 8px" }}>
                        <span style={{ color:run.failed>0?"#ff6b6b":"#7ec87f" }}>{run.passed}</span>
                        <span style={{ color:"#2d6aad" }}>/{run.total}</span>
                      </td>
                      <td style={{ padding:"8px 8px", color:"#2d6aad", fontSize:8 }}>{new Date(run.startedAt).toLocaleString()}</td>
                      <td style={{ padding:"8px 8px" }}>
                        <div style={{ display:"flex", gap:4 }}>
                          {onRerun&&<button className="rb" onClick={e=>{e.stopPropagation();onRerun(run);}} style={{ fontSize:8,padding:"2px 5px" }}>▶</button>}
                          <button onClick={e=>{e.stopPropagation();handleDelete(run.id);}} style={{ background:"none",border:"0.5px solid #3a1a1a",borderRadius:3,color:"#ff6b6b",cursor:"pointer",fontSize:8,padding:"2px 5px",fontFamily:"inherit" }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ═══════════ DETAIL ══════════════════════════════════════════════════ */}
        {view === "detail" && selected && (
          <div style={{ padding:"20px 24px" }}>
            <RunDetail run={selected} trend={trend} analysis={analysis} analysing={analysing}
              suiteInsight={suiteInsight} onAnalyse={handleAnalyse} onSuiteInsight={handleSuiteInsight}
              validation={validation} validating={validating} onValidate={handleValidate}
              onDelete={handleDelete} onRerun={onRerun} onBack={() => setView("dashboard")} />
          </div>
        )}

        {/* ═══════════ CI EXPORT ═══════════════════════════════════════════════ */}
        {view === "export" && (
          <div style={{ padding:"20px 24px", maxWidth:620 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:6 }}>CI/CD Export</div>
            <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:20 }}>Integrate ATP results with your pipeline.</div>
            <ECard title="JUnit XML" desc="GitHub Actions · Jenkins · Azure DevOps · CircleCI" badge="Universal" bc="#4d9de0"
              usage={"- uses: actions/upload-artifact@v4\n  with:\n    name: atp-results\n    path: atp-results.xml"}
              onDownload={() => window.open(exportJUnitURL(), "_blank")} />
            <ECard title="JSON Summary" desc="Slack webhooks · custom dashboards · monitoring" badge="Webhook-ready" bc="#4caf50"
              usage={"curl http://localhost:3579/api/results/export/summary\n# { suite, passed, failed, passRate, status }"}
              onDownload={() => window.open(exportSummaryURL(), "_blank")} />
            <ECard title="Allure JSON" desc="Rich HTML reports with history and trends" badge="Allure" bc="#c8a0f0"
              usage={"curl http://localhost:3579/api/results/export/allure > allure-results.json\nnpx allure generate && npx allure open"}
              onDownload={() => window.open("http://localhost:3579/api/results/export/allure", "_blank")} />
            <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520", marginTop:8 }}>
              <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:8 }}>GitHub Actions Workflow</div>
              <pre style={{ fontSize:9, color:"#a0d0e8", margin:0, whiteSpace:"pre-wrap", lineHeight:1.8, fontFamily:"'IBM Plex Mono',monospace" }}>{GH}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Run Detail ────────────────────────────────────────────────────────────────
function RunDetail({ run, trend, analysis, analysing, suiteInsight, onAnalyse, onSuiteInsight, validation, validating, onValidate, onDelete, onRerun, onBack }) {
  const sc = S[run.status] ?? S.error;
  return (
    <div className="fi">
      <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:16 }}>
        <button className="nb" onClick={onBack} style={{ fontSize:10, padding:"3px 10px", flexShrink:0 }}>← Back</button>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
            <span style={{ fontSize:16 }}>{TYPE_ICONS[run.type]||"·"}</span>
            <div style={{ fontSize:15, fontWeight:600, color:"#e0f0ff" }}>{run.name}</div>
          </div>
          <div style={{ fontSize:9, color:"#4a7fa5" }}>
            {run.url} · {new Date(run.startedAt).toLocaleString()} · {run.duration?`${(run.duration/1000).toFixed(1)}s`:""} · ID: {run.id}
          </div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {onRerun&&<button className="rb" onClick={()=>onRerun(run)} style={{ fontSize:10 }}>▶ Re-run</button>}
          <button onClick={()=>onDelete(run.id)} style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:5, color:"#ff6b6b", cursor:"pointer", fontSize:10, padding:"4px 10px", fontFamily:"inherit" }}>✕</button>
        </div>
      </div>

      {/* Status card */}
      <div style={{ background:sc.bg, border:`0.5px solid ${sc.border}`, borderRadius:8, padding:"12px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:sc.text, marginBottom:3 }}>
            {run.status==="pass"?"✓ PASSED":run.status==="error"?"⚠ ERROR":"✗ FAILED"}
          </div>
          <div style={{ fontSize:10, color:"#4a7fa5" }}>
            {run.passed}/{run.total} passed · {run.failed} failed · {run.duration?`${(run.duration/1000).toFixed(1)}s`:""}
          </div>
        </div>
        {run.status!=="pass" && (
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={run.type==="suite"?onSuiteInsight:onAnalyse} disabled={analysing}
              style={{ background:"linear-gradient(135deg,#1a0a2e,#0a0a1e)", border:"0.5px solid #c8a0f0", borderRadius:5, color:analysing?"#4a7fa5":"#c8a0f0", cursor:analysing?"default":"pointer", fontSize:10, fontWeight:600, padding:"7px 12px", fontFamily:"inherit", letterSpacing:"0.06em" }}>
              {analysing?"◈ Analysing...":"◈ AI Analyse"}
            </button>
            <button onClick={onValidate} disabled={validating}
              style={{ background:"linear-gradient(135deg,#001a10,#000a08)", border:"0.5px solid #4caf50", borderRadius:5, color:validating?"#4a7fa5":"#7ec87f", cursor:validating?"default":"pointer", fontSize:10, fontWeight:600, padding:"7px 12px", fontFamily:"inherit", letterSpacing:"0.06em" }}>
              {validating?"◈ Validating...":"🔍 Validate vs Context"}
            </button>
          </div>
        )}
      </div>

      {/* Context Validation */}
      {validation && (
        <div style={{ border:`0.5px solid ${validation.testStillValid?"#4caf50":"#ff8c00"}`, borderRadius:8, padding:"14px 16px", marginBottom:16, background: validation.testStillValid?"#0a1a0a":"#1a0f00" }} className="fi">
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <span style={{ fontSize:12 }}>🔍</span>
            <div style={{ fontSize:11, fontWeight:600, color: validation.testStillValid?"#7ec87f":"#ffaa44" }}>
              Context Validation — {validation.testStillValid ? "Test is Current" : "Test May Be Stale"}
            </div>
            <span className="pill" style={{ background:"#0d1520", border:`0.5px solid ${SEV_COLORS[validation.priority]?.border||"#1e3a5f"}`, color:SEV_COLORS[validation.priority]?.text||"#4a7fa5" }}>{validation.priority}</span>
            <span className="pill" style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", color:"#4a7fa5" }}>{validation.verdict?.replace(/-/g," ")}</span>
            <span className="pill" style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", color:"#2d6aad" }}>{validation.confidence} confidence</span>
          </div>
          <div style={{ fontSize:11, color:"#a0c0a0", lineHeight:1.7, marginBottom:8 }}>{validation.explanation}</div>
          {validation.contextMismatch && (
            <div style={{ fontSize:10, color:"#f0c040", marginBottom:8 }}>
              ⚠ Context mismatch: {validation.contextMismatch}
            </div>
          )}
          {validation.suggestedTestFix && (
            <div style={{ background:"#0a1520", borderRadius:5, padding:"8px 10px", marginBottom:8 }}>
              <div style={{ fontSize:9, color:"#2d6aad", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.06em" }}>Fix the test</div>
              <div style={{ fontSize:11, color:"#a0d0f0" }}>{validation.suggestedTestFix}</div>
            </div>
          )}
          {validation.suggestedAppFix && (
            <div style={{ background:"#1a0808", borderRadius:5, padding:"8px 10px", marginBottom:8 }}>
              <div style={{ fontSize:9, color:"#ff3b3b", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.06em" }}>Fix the app</div>
              <div style={{ fontSize:11, color:"#ffaaaa" }}>{validation.suggestedAppFix}</div>
            </div>
          )}
          {validation.shouldSkip && (
            <div style={{ fontSize:10, color:"#4d9de0", background:"#0a1520", borderRadius:4, padding:"5px 8px" }}>
              ⏭ Suggested: skip this test — {validation.skipReason}
            </div>
          )}
        </div>
      )}

      {/* AI Analysis */}
      {(analysis||suiteInsight) && (
        <div style={{ border:`0.5px solid ${analysis?SEV_COLORS[analysis?.severity]:"#c8a0f0"}`, borderRadius:8, padding:"14px 16px", marginBottom:16, background:"#08080e" }} className="fi">
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <span style={{ fontSize:13 }}>◈</span>
            <div style={{ fontSize:11, fontWeight:600, color:"#c8a0f0" }}>AI {suiteInsight?"Suite Insight":"Failure Analysis"}</div>
            {analysis && <>
              <span className="pill" style={{ background:"#0d1520", border:`0.5px solid ${SEV_COLORS[analysis.severity]}`, color:SEV_COLORS[analysis.severity] }}>{analysis.severity}</span>
              <span className="pill" style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", color:"#4a7fa5" }}>{analysis.category}</span>
              {analysis.isAppBug&&<span className="pill" style={{ background:"#1a0808", border:"0.5px solid #ff3b3b", color:"#ff6b6b" }}>app bug</span>}
              {analysis.isFlakyTest&&<span className="pill" style={{ background:"#1a0f00", border:"0.5px solid #ff8c00", color:"#ffaa44" }}>flaky</span>}
            </>}
            {suiteInsight&&<span className="pill" style={{ background:"#0d1520", border:`0.5px solid ${suiteInsight.overallHealth==="healthy"?"#4caf50":suiteInsight.overallHealth==="degraded"?"#ff8c00":"#ff3b3b"}`, color:suiteInsight.overallHealth==="healthy"?"#7ec87f":suiteInsight.overallHealth==="degraded"?"#ffaa44":"#ff6b6b" }}>{suiteInsight?.overallHealth}</span>}
          </div>
          <div style={{ fontSize:12, fontWeight:600, color:"#e0d0ff", marginBottom:8 }}>{analysis?.rootCause||suiteInsight?.topPriority}</div>
          <div style={{ fontSize:11, color:"#a0a0c0", lineHeight:1.7, marginBottom:analysis?.recommendations?.length?10:0 }}>{analysis?.explanation||suiteInsight?.summary}</div>
          {analysis?.businessImpact&&<div style={{ fontSize:10, color:"#6a5a80", marginBottom:8, fontStyle:"italic" }}>Impact: {analysis.businessImpact}</div>}
          {suiteInsight?.commonPattern&&<div style={{ fontSize:10, color:"#f0c040", marginBottom:8 }}>Pattern: {suiteInsight.commonPattern}</div>}
          {(analysis?.recommendations||suiteInsight?.recommendations)?.map((rec,i)=>(
            <div key={i} style={{ display:"flex", gap:8, padding:"3px 0", fontSize:11, color:"#a0d0a0" }}>
              <span style={{ color:"#4caf50", flexShrink:0 }}>{i+1}.</span><span>{rec}</span>
            </div>
          ))}
        </div>
      )}

      {/* Steps */}
      {run.steps?.length>0&&(
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Steps ({run.steps.length})</div>
          {run.steps.map((s,i)=>{
            const ss=S[s.status]??S.error;
            return (
              <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"7px 0", borderBottom:"0.5px solid #0d1a2a" }}>
                <div style={{ width:15,height:15,borderRadius:"50%",border:`0.5px solid ${ss.dot}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:ss.dot,flexShrink:0,marginTop:1 }}>
                  {s.status==="pass"?"✓":"✗"}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:"#a0c0d8", marginBottom:2 }}>
                    {s.method&&<span style={{ fontSize:9, color:"#4d9de0", marginRight:6, fontWeight:700 }}>{s.method}</span>}
                    {s.description||s.name||`Step ${i+1}`}
                    {s.statusCode&&<span style={{ fontSize:9, marginLeft:8, color:s.statusCode<300?"#4caf50":s.statusCode<400?"#f0c040":"#ff6b6b" }}>HTTP {s.statusCode}</span>}
                  </div>
                  {s.error&&<div style={{ fontSize:9,color:"#ff6b6b",marginTop:2 }}>✗ {s.error}</div>}
                  {s.assertions?.length>0&&(
                    <div style={{ marginTop:4, paddingLeft:4 }}>
                      {s.assertions.map((a,j)=>(
                        <div key={j} style={{ fontSize:8, color:a.passed?"#7ec87f":"#ff6b6b" }}>
                          {a.passed?"✓":"✗"} {a.type} {a.expected||a.path||a.field||""}
                          {a.actual!==undefined&&<span style={{ color:"#2d6aad" }}> → {String(a.actual).slice(0,30)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {s.duration&&<div style={{ fontSize:8,color:"#2d6aad",flexShrink:0 }}>{s.duration}ms</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Assertions */}
      {run.assertions?.length>0&&(
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Assertions</div>
          {run.assertions.map((a,i)=>(
            <div key={i} style={{ display:"flex", gap:8, padding:"4px 0", borderBottom:"0.5px solid #0d1a2a", fontSize:11, color:a.passed?"#7ec87f":"#ff6b6b" }}>
              <span>{a.passed?"✓":"✗"}</span><span style={{ flex:1 }}>{a.assertion}</span>
            </div>
          ))}
        </div>
      )}

      {/* Trend */}
      {trend.length>1&&(
        <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
          <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Trend — This Test ({trend.length} runs)</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:60 }}>
            {trend.map((t,i)=>{
              const rate=t.total>0?t.passed/t.total:0;
              const color=rate>=0.8?"#4caf50":rate>=0.5?"#f0c040":"#ff3b3b";
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

// ── Donut chart (CSS conic-gradient) ─────────────────────────────────────────
function DonutChart({ passed, failed, total }) {
  if (total === 0) return <div style={{ width:80, height:80, borderRadius:"50%", background:"#1e3a5f", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"#4a7fa5" }}>No data</div>;
  const passP = passed/total*100;
  return (
    <div style={{ position:"relative", width:80, height:80 }}>
      <div style={{ width:80, height:80, borderRadius:"50%",
        background:`conic-gradient(#4caf50 0% ${passP}%, #ff3b3b ${passP}% 100%)`,
      }} />
      <div style={{ position:"absolute", inset:15, borderRadius:"50%", background:"#0d1520", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#e0f0ff" }}>{Math.round(passP)}%</div>
      </div>
    </div>
  );
}

// ── Duration histogram ────────────────────────────────────────────────────────
function DurationHistogram({ records }) {
  if (!records.length) return <div style={{ fontSize:10, color:"#1e3a5f", textAlign:"center", marginTop:20 }}>No data</div>;
  const durations = records.map(r => (r.duration||0)/1000).filter(d => d>0);
  if (!durations.length) return <div style={{ fontSize:10, color:"#1e3a5f" }}>No duration data</div>;
  const max  = Math.max(...durations);
  const buckets = [0,1,2,5,10,20,60];
  const counts = buckets.slice(0,-1).map((_,i) => ({
    label: `${buckets[i]}-${buckets[i+1]}s`,
    count: durations.filter(d => d>=buckets[i] && d<buckets[i+1]).length,
  })).filter(b => b.count>0);
  const maxCount = Math.max(...counts.map(b => b.count), 1);
  return (
    <div>
      {counts.map((b,i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
          <div style={{ fontSize:8, color:"#4a7fa5", width:40, flexShrink:0 }}>{b.label}</div>
          <div style={{ flex:1, height:12, background:"#1e3a5f", borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${b.count/maxCount*100}%`, background:PALETTE[i%PALETTE.length], borderRadius:2, transition:"width 0.5s" }} />
          </div>
          <div style={{ fontSize:8, color:"#a0c0d8", width:20, textAlign:"right" }}>{b.count}</div>
        </div>
      ))}
      <div style={{ fontSize:8, color:"#2d6aad", marginTop:6 }}>avg: {(durations.reduce((s,d)=>s+d,0)/durations.length).toFixed(1)}s · max: {max.toFixed(1)}s</div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupBy(arr, fn) {
  return arr.reduce((a,i) => { const k=fn(i); if(!a[k])a[k]=[]; a[k].push(i); return a; }, {});
}
function buildDailyTrend(records) {
  const byDay = {};
  records.forEach(r => {
    const d = r.startedAt?.slice(0,10); if(!d) return;
    if(!byDay[d])byDay[d]={date:d,passed:0,total:0};
    byDay[d].total++;
    if(r.status==="pass")byDay[d].passed++;
  });
  return Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date)).slice(-14);
}
function ECard({ title, desc, badge, bc, usage, onDownload }) {
  const [show,setShow] = useState(false);
  return (
    <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", marginBottom:10, background:"#0d1520" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:"#b0d0f0", marginBottom:2 }}>{title}</div>
          <div style={{ fontSize:10, color:"#4a7fa5" }}>{desc}</div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <span className="pill" style={{ background:"#0d1520", border:`0.5px solid ${bc}`, color:bc }}>{badge}</span>
          <button className="rb" onClick={onDownload} style={{ fontSize:10, padding:"3px 10px" }}>↓ Download</button>
        </div>
      </div>
      <button onClick={()=>setShow(!show)} style={{ background:"none", border:"none", color:"#2d6aad", fontSize:9, cursor:"pointer", padding:0, fontFamily:"inherit" }}>
        {show?"▾ hide":"▸ usage"}
      </button>
      {show&&<pre style={{ fontSize:9, color:"#a0d0e8", background:"#060a0d", borderRadius:5, padding:10, marginTop:6, whiteSpace:"pre-wrap", lineHeight:1.7, fontFamily:"'IBM Plex Mono',monospace" }}>{usage}</pre>}
    </div>
  );
}
