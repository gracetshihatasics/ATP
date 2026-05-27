import { useState, useRef } from "react";

const BACKEND = "http://localhost:3579";

const LAYER_CONFIG = {
  dom:           { icon:"🏗", label:"DOM",          color:"#7ec8ff" },
  javascript:    { icon:"⚡", label:"JavaScript",   color:"#f0c040" },
  network:       { icon:"📡", label:"Network",      color:"#4caf50" },
  navigation:    { icon:"🧭", label:"Navigation",   color:"#c8a0f0" },
  accessibility: { icon:"♿", label:"Accessibility", color:"#ff8c00" },
};

const SEV_C = {
  critical: { bg:"#1a0808", border:"#ff3b3b", text:"#ff6b6b", icon:"🔴" },
  warning:  { bg:"#1a1000", border:"#ff8c00", text:"#ffaa44", icon:"🟡" },
  info:     { bg:"#0a1520", border:"#4d9de0", text:"#7ec8ff", icon:"🔵" },
};

const TYPE_LABELS = {
  "hidden-feature":        "Hidden Feature",
  "dead-route":            "Dead Route",
  "orphaned-component":    "Orphaned Component",
  "feature-flag-disabled": "Feature Flag Off",
  "js-error":              "JS Error",
  "failed-request":        "Failed Request",
  "unused-resource":       "Unused Resource",
  "duplicate-request":     "Duplicate Request",
  "missing-aria":          "Missing ARIA",
  "keyboard-trap":         "Keyboard Trap",
  "missing-alt":           "Missing Alt Text",
  "dead-nav-link":         "Dead Nav Link",
  "revealed-section":      "Hidden Section (via interaction)",
  "disabled-handler":      "Disabled Handler",
  "input-missing-label":   "Input Missing Label",
  "missing-h1":            "Missing H1",
  "multiple-h1":           "Multiple H1",
  "missing-lang":          "Missing Lang Attr",
  "positive-tabindex":     "Positive Tabindex",
  "hydration-error":       "Hydration Error",
  "error-boundary":        "Error Boundary",
  "performance-issue":     "Performance Issue",
  "display-none":          "display:none",
  "css-hidden":            "CSS Hidden",
  "unreachable-element":   "Unreachable",
};

export function CodeIntelligencePanel({ url, navLinks = [] }) {
  const [running,  setRunning]  = useState(false);
  const [log,      setLog]      = useState([]);
  const [results,  setResults]  = useState([]);
  const [summary,  setSummary]  = useState(null);
  const [ignored,  setIgnored]  = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [filter,   setFilter]   = useState("all");
  const [layerFilter, setLayerFilter] = useState("all");
  const [extraPages, setExtra]  = useState([]);
  const logRef = useRef(null);

  const addLog = (msg, level = "info") => {
    setLog(prev => [...prev, { msg, level, ts: Date.now() }]);
    setTimeout(() => logRef.current?.scrollTo({ top:99999, behavior:"smooth" }), 50);
  };

  const run = async () => {
    setRunning(true); setLog([]); setResults([]); setSummary(null); setSelected(null);

    const res     = await fetch(`${BACKEND}/api/code-intelligence`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ url, pages: extraPages }),
    });

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream:true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "log")           addLog(evt.msg, evt.level);
          if (evt.type === "page_result")   setResults(prev => [...prev, { url: evt.url, ...evt.result }]);
          if (evt.type === "scan_complete") setSummary(evt);
        } catch {}
      }
    }
    setRunning(false);
  };

  const toggleIgnore = (id) => setIgnored(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });

  // All findings
  const allFindings = results.flatMap(r =>
    (r.findings || []).map(f => ({ ...f, pageUrl: r.url }))
  ).filter(f => {
    if (ignored.has(f.id)) return false;
    if (filter === "critical" && f.severity !== "critical") return false;
    if (filter === "warning"  && f.severity !== "warning")  return false;
    if (layerFilter !== "all" && f.layer !== layerFilter)   return false;
    return true;
  });

  const totalByLayer = summary ? summary.byLayer || {} : {};

  return (
    <div style={{ display:"flex", height:"100%", flexDirection:"column", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* Header */}
      <div style={{ padding:"12px 16px", borderBottom:"0.5px solid #1e3a5f", background:"#090d11", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:"#7ec8ff", marginBottom:2 }}>🔬 Deep Code Intelligence Scanner</div>
            <div style={{ fontSize:9, color:"#4a7fa5" }}>
              5 layers: DOM · JavaScript runtime · Network · Navigation · Accessibility
            </div>
          </div>
          <button onClick={run} disabled={running || !url}
            style={{ background:running?"#0a0e12":"linear-gradient(135deg,#1a0a2e,#0a1020)", border:`0.5px solid ${running?"#2d6aad":"#c8a0f0"}`, borderRadius:6, color:running?"#4a7fa5":"#c8a0f0", cursor:running?"default":"pointer", fontSize:11, fontWeight:600, padding:"8px 16px", fontFamily:"inherit", letterSpacing:"0.06em" }}>
            {running ? "◈ Scanning..." : "◈ Deep Scan"}
          </button>
        </div>

        {/* Layer indicators */}
        {summary && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {Object.entries(LAYER_CONFIG).map(([key, cfg]) => {
              const count = totalByLayer[key] || 0;
              return (
                <button key={key} onClick={() => setLayerFilter(layerFilter === key ? "all" : key)}
                  style={{ display:"flex", alignItems:"center", gap:5, background:layerFilter===key?`${cfg.color}20`:"#0d1520", border:`0.5px solid ${count>0?cfg.color:layerFilter===key?cfg.color:"#1e3a5f"}`, borderRadius:5, color:count>0?cfg.color:"#4a7fa5", cursor:"pointer", fontSize:9, padding:"3px 9px", fontFamily:"inherit" }}>
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                  {count > 0 && <span style={{ background:`${cfg.color}30`, borderRadius:3, padding:"1px 5px", fontWeight:700 }}>{count}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* Left: log */}
        <div style={{ width:230, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column" }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"5px 12px", borderBottom:"0.5px solid #1e3a5f", textTransform:"uppercase" }}>
            Scan Log {running && <span style={{ color:"#c8a0f0" }}>● live</span>}
          </div>
          <div ref={logRef} style={{ flex:1, overflowY:"auto", padding:"6px 10px" }}>
            {log.length === 0 && !running && (
              <div style={{ fontSize:9, color:"#1e3a5f", textAlign:"center", marginTop:20, lineHeight:2 }}>
                Click "Deep Scan" to analyse<br/>5 layers of your page.
              </div>
            )}
            {log.map((l,i) => (
              <div key={i} style={{ fontSize:9, marginBottom:3, lineHeight:1.6,
                color:l.level==="error"?"#ff6b6b":l.level==="success"?"#7ec87f":l.level==="warn"?"#ffaa44":l.level==="ai"?"#c8a0f0":l.level==="system"?"#4a7fa5":"#6a8aa8" }}>
                {l.level==="error"?"✗":l.level==="success"?"✓":l.level==="ai"?"◈":"›"} {l.msg}
              </div>
            ))}
          </div>

          {/* Summary stats */}
          {summary && (
            <div style={{ padding:"10px 12px", borderTop:"0.5px solid #1e3a5f", background:"#0a0e12" }}>
              <div style={{ fontSize:9, color:"#2d6aad", marginBottom:7, textTransform:"uppercase", letterSpacing:"0.06em" }}>Scan Summary</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, marginBottom:8 }}>
                {[["Pages",summary.totalPages,"#4a7fa5"],["Issues",summary.totalFindings,"#ff8c00"],["Critical",summary.criticalCount,"#ff3b3b"],["Score",`${summary.avgScore}%`,"#4caf50"]].map(([l,v,c]) => (
                  <div key={l} style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:4, padding:"5px 6px", textAlign:"center" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:c }}>{v}</div>
                    <div style={{ fontSize:8, color:"#2d6aad" }}>{l}</div>
                  </div>
                ))}
              </div>
              {/* Quality bar */}
              <div style={{ height:3, background:"#1e3a5f", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${summary.avgScore||0}%`, background:summary.avgScore>80?"#4caf50":summary.avgScore>60?"#f0c040":"#ff3b3b", borderRadius:2 }} />
              </div>
              <div style={{ fontSize:8, color:"#2d6aad", marginTop:3 }}>code quality</div>
            </div>
          )}
        </div>

        {/* Main: findings */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Filter bar */}
          {allFindings.length > 0 && (
            <div style={{ padding:"6px 12px", borderBottom:"0.5px solid #1e3a5f", display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
              {[["all","All"],["critical","🔴 Critical"],["warning","🟡 Warning"],["info","🔵 Info"]].map(([f,l]) => (
                <button key={f} className={`fb ${filter===f?"on":""}`} onClick={() => setFilter(f)} style={{ fontSize:9 }}>{l}</button>
              ))}
              {ignored.size > 0 && (
                <button onClick={() => setIgnored(new Set())} style={{ marginLeft:"auto", background:"none", border:"0.5px solid #1e3a5f", borderRadius:4, color:"#4a7fa5", cursor:"pointer", fontSize:9, padding:"3px 8px", fontFamily:"inherit" }}>
                  Clear {ignored.size} ignored
                </button>
              )}
              <span style={{ fontSize:9, color:"#1e3a5f", marginLeft:"auto" }}>{allFindings.length} findings</span>
            </div>
          )}

          <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
            {/* Findings list */}
            <div style={{ width:310, flexShrink:0, borderRight:"0.5px solid #1e3a5f", overflowY:"auto", padding:"8px 8px" }}>

              {!running && allFindings.length === 0 && !summary && (
                <div style={{ textAlign:"center", marginTop:40, color:"#1e3a5f", fontSize:10, lineHeight:2 }}>
                  No scan results yet.
                </div>
              )}

              {!running && summary && allFindings.length === 0 && (
                <div style={{ textAlign:"center", marginTop:40 }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>✓</div>
                  <div style={{ fontSize:12, color:"#4caf50" }}>All clear</div>
                  <div style={{ fontSize:10, color:"#4a7fa5", marginTop:4 }}>No issues detected across all 5 layers</div>
                </div>
              )}

              {allFindings.map((f, i) => {
                const sc  = SEV_C[f.severity] ?? SEV_C.info;
                const lc  = LAYER_CONFIG[f.layer] || { icon:"?", color:"#4a7fa5" };
                const isSel = selected?.id === f.id;
                return (
                  <div key={`${f.id}-${i}`} onClick={() => setSelected(isSel ? null : f)}
                    style={{ border:`0.5px solid ${isSel?sc.border:"#1e3a5f"}`, borderRadius:6, padding:"8px 10px", marginBottom:6, background:isSel?sc.bg:"#0d1520", cursor:"pointer", transition:"all 0.12s" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:6, marginBottom:4 }}>
                      <span style={{ fontSize:11, flexShrink:0 }}>{sc.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:10, fontWeight:500, color:"#b0c8e0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {TYPE_LABELS[f.type] || f.type}
                        </div>
                        <div style={{ fontSize:9, color:sc.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.element?.slice(0,45)}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); toggleIgnore(f.id); }}
                        style={{ background:"none", border:"0.5px solid #1e3a5f", borderRadius:3, color:"#2d6aad", cursor:"pointer", fontSize:7, padding:"2px 5px", fontFamily:"inherit", flexShrink:0 }}>
                        {ignored.has(f.id) ? "unignore" : "ignore"}
                      </button>
                    </div>
                    <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                      <span style={{ fontSize:8, color:lc.color, background:`${lc.color}15`, borderRadius:3, padding:"1px 5px", border:`0.5px solid ${lc.color}40` }}>
                        {lc.icon} {lc.label}
                      </span>
                      <span style={{ fontSize:8, color:sc.text, background:sc.bg, borderRadius:3, padding:"1px 5px", border:`0.5px solid ${sc.border}40` }}>{f.severity}</span>
                      {f.priority === "high" && <span style={{ fontSize:8, color:"#ff8c00" }}>↑ high</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail panel */}
            <div style={{ flex:1, overflowY:"auto", padding:"14px 16px" }}>
              {!selected ? (
                <>
                  {/* Per-page summary cards */}
                  {results.length > 0 && (
                    <div>
                      <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:12 }}>Pages Scanned</div>
                      {results.map((r, i) => {
                        const health = r.overallHealth || "clean";
                        const hc = health==="clean"?"#4caf50":health==="minor-issues"?"#f0c040":health==="needs-attention"?"#ff8c00":"#ff3b3b";
                        const scores = r.layerScores || {};
                        return (
                          <div key={i} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", marginBottom:10, background:"#0d1520" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                              <div style={{ fontSize:11, color:"#b0d0f0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{r.url?.replace(/^https?:\/\//,"").slice(0,45)}</div>
                              <span style={{ fontSize:9, padding:"2px 7px", borderRadius:3, background:`${hc}15`, border:`0.5px solid ${hc}`, color:hc, flexShrink:0, marginLeft:8 }}>{health}</span>
                            </div>
                            <div style={{ fontSize:10, color:"#6a9ab8", marginBottom:8 }}>{r.summary}</div>
                            {/* Layer scores */}
                            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
                              {Object.entries(LAYER_CONFIG).map(([key, cfg]) => {
                                const score = scores[key];
                                const count = r.issuesByLayer?.[key] || 0;
                                return score !== undefined ? (
                                  <div key={key} style={{ fontSize:8, color:count>0?cfg.color:"#2d6aad", display:"flex", gap:3, alignItems:"center" }}>
                                    <span>{cfg.icon}</span>
                                    <span>{score}%</span>
                                    {count > 0 && <span style={{ color:cfg.color }}>({count})</span>}
                                  </div>
                                ) : null;
                              })}
                            </div>
                            {r.topIssues?.length > 0 && (
                              <div>
                                <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>Top Issues</div>
                                {r.topIssues.map((issue, j) => (
                                  <div key={j} style={{ fontSize:9, color:"#ff8c00", marginBottom:3 }}>• {issue}</div>
                                ))}
                              </div>
                            )}
                            {/* Quality bar */}
                            <div style={{ height:2, background:"#1e3a5f", borderRadius:1, marginTop:8, overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${r.codeQualityScore||80}%`, background:hc, borderRadius:1 }} />
                            </div>
                            <div style={{ fontSize:8, color:"#2d6aad", marginTop:2 }}>quality: {r.codeQualityScore || "—"}%</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!results.length && (
                    <div style={{ textAlign:"center", marginTop:60, color:"#2d6aad", fontSize:11 }}>
                      ← Select a finding to see details
                    </div>
                  )}
                </>
              ) : (
                <FindingDetail finding={selected} onIgnore={() => toggleIgnore(selected.id)} isIgnored={ignored.has(selected.id)} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FindingDetail({ finding: f, onIgnore, isIgnored }) {
  const sc = SEV_C[f.severity] ?? SEV_C.info;
  const lc = LAYER_CONFIG[f.layer] || { icon:"?", label:"Unknown", color:"#4a7fa5" };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{ fontSize:16 }}>{sc.icon}</span>
            <span style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>{TYPE_LABELS[f.type] || f.type}</span>
          </div>
          <div style={{ fontSize:9, color:"#4a7fa5" }}>{f.pageUrl?.replace(/^https?:\/\//,"")}</div>
        </div>
        <button onClick={onIgnore} style={{ background:isIgnored?"#0a2010":"none", border:`0.5px solid ${isIgnored?"#4caf50":"#1e3a5f"}`, borderRadius:5, color:isIgnored?"#4caf50":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"5px 10px", fontFamily:"inherit" }}>
          {isIgnored ? "✓ Ignored" : "Ignore"}
        </button>
      </div>

      {/* Badges */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
        <span style={{ fontSize:9, padding:"2px 7px", borderRadius:3, background:`${lc.color}15`, border:`0.5px solid ${lc.color}`, color:lc.color }}>{lc.icon} {lc.label} layer</span>
        <span style={{ fontSize:9, padding:"2px 7px", borderRadius:3, background:sc.bg, border:`0.5px solid ${sc.border}`, color:sc.text }}>{f.severity}</span>
        <span style={{ fontSize:9, padding:"2px 7px", borderRadius:3, background:"#0d1520", border:"0.5px solid #1e3a5f", color:"#4a7fa5" }}>{f.priority} priority</span>
        {f.isIntentional && <span style={{ fontSize:9, padding:"2px 7px", borderRadius:3, background:"#0a1520", border:"0.5px solid #4d9de0", color:"#4d9de0" }}>intentional</span>}
      </div>

      {f.element && <InfoBlock label="Element" value={f.element} />}
      {f.selector && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>Selector</div>
          <code style={{ fontSize:10, color:"#c8a0f0", background:"#0a0a1e", borderRadius:4, padding:"4px 8px", display:"block" }}>{f.selector}</code>
        </div>
      )}
      <InfoBlock label="Why this is a problem" value={f.reason} />
      {f.evidence && <InfoBlock label="Evidence" value={f.evidence} color="#c8a0f0" />}
      {f.businessImpact && <InfoBlock label="Business Impact" value={f.businessImpact} color="#f0c040" />}
      {f.codeRecommendation && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:9, color:"#2d6aad", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.06em" }}>Engineering Fix</div>
          <div style={{ background:"#0a1200", border:"0.5px solid #4caf5040", borderRadius:6, padding:"10px 12px", fontSize:11, color:"#a0d0a0", lineHeight:1.7 }}>{f.codeRecommendation}</div>
        </div>
      )}

      {/* Test decision */}
      <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"12px 14px", background:"#0d1520" }}>
        <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>ATP Test Decision</div>
        <div style={{ fontSize:12, fontWeight:600, color:"#7ec8ff", marginBottom:4 }}>{f.testDecision?.replace(/-/g," ")}</div>
        <div style={{ fontSize:10, color:"#4a7fa5" }}>
          {f.testDecision === "skip"              && "ATP will skip this element — currently unreachable."}
          {f.testDecision === "ignore-always"     && "ATP will permanently ignore this — not accessible to users."}
          {f.testDecision === "test-when-enabled" && "ATP will test this when the feature flag is enabled."}
          {f.testDecision === "investigate"       && "Requires manual review — ATP cannot determine intent."}
          {f.testDecision === "add-test"          && "ATP recommends adding a new test for this."}
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value, color = "#a0c0d8" }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
      <div style={{ fontSize:11, color, lineHeight:1.7 }}>{value}</div>
    </div>
  );
}
