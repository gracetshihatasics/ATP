import { useState, useRef } from "react";

const BACKEND = "http://localhost:3579";

const SEV_COLORS = {
  critical: { bg:"#1a0808", border:"#ff3b3b", text:"#ff6b6b", icon:"🔴" },
  warning:  { bg:"#1a1000", border:"#ff8c00", text:"#ffaa44", icon:"🟡" },
  info:     { bg:"#0a1520", border:"#4d9de0", text:"#7ec8ff", icon:"🔵" },
};

const DECISION_CONFIG = {
  "skip":               { color:"#4a7fa5", icon:"⏭", label:"Skip in tests" },
  "ignore-always":      { color:"#2d6aad", icon:"🚫", label:"Always ignore" },
  "test-when-enabled":  { color:"#f0c040", icon:"⏸", label:"Test when enabled" },
  "investigate":        { color:"#ff8c00", icon:"🔍", label:"Investigate" },
  "remove-from-tests":  { color:"#ff6b6b", icon:"✕",  label:"Remove from tests" },
};

const TYPE_LABELS = {
  "hidden-feature":        "Hidden Feature",
  "dead-route":            "Dead Route",
  "orphaned-component":    "Orphaned Component",
  "feature-flag-disabled": "Disabled Feature Flag",
  "permission-locked":     "Permission Locked",
  "css-hidden":            "CSS Hidden",
  "display-none":          "display:none",
  "unreachable-element":   "Unreachable Element",
};

export function CodeIntelligencePanel({ url, navLinks = [] }) {
  const [running, setRunning]       = useState(false);
  const [log, setLog]               = useState([]);
  const [results, setResults]       = useState([]);
  const [summary, setSummary]       = useState(null);
  const [ignored, setIgnored]       = useState(new Set());
  const [selected, setSelected]     = useState(null);
  const [activeFilter, setFilter]   = useState("all");
  const [selectedPages, setSelPages] = useState([]);
  const logRef  = useRef(null);

  const addLog = (msg, level = "info") => {
    setLog(prev => [...prev, { msg, level, ts: Date.now() }]);
    setTimeout(() => logRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
  };

  const run = async () => {
    setRunning(true); setLog([]); setResults([]); setSummary(null); setSelected(null);

    const pages = selectedPages.length ? selectedPages : [];
    const res   = await fetch(`${BACKEND}/api/code-intelligence`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url, pages }),
    });

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "log")          addLog(event.msg, event.level);
          if (event.type === "page_result")  setResults(prev => [...prev, { url: event.url, ...event.result }]);
          if (event.type === "scan_complete") setSummary(event);
        } catch {}
      }
    }
    setRunning(false);
  };

  const toggleIgnore = (id) => setIgnored(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // All findings across all pages
  const allFindings = results.flatMap(r =>
    (r.findings || []).map(f => ({ ...f, pageUrl: r.url }))
  ).filter(f => {
    if (ignored.has(f.id)) return false;
    if (activeFilter === "all") return true;
    if (activeFilter === "critical") return f.severity === "critical";
    if (activeFilter === "warning")  return f.severity === "warning";
    if (activeFilter === "skip")     return f.testDecision === "skip" || f.testDecision === "ignore-always";
    return true;
  });

  const critCount = allFindings.filter(f => f.severity === "critical").length;
  const warnCount = allFindings.filter(f => f.severity === "warning").length;
  const infoCount = allFindings.filter(f => f.severity === "info").length;

  return (
    <div style={{ display:"flex", height:"100%", flexDirection:"column" }}>

      {/* Header */}
      <div style={{ padding:"14px 16px", borderBottom:"0.5px solid #1e3a5f", background:"#090d11" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:"#7ec8ff", marginBottom:2 }}>🔬 Code Intelligence Scanner</div>
            <div style={{ fontSize:10, color:"#4a7fa5" }}>Detects hidden features, dead code, unreachable elements and flags them for engineers</div>
          </div>
          <button
            onClick={run} disabled={running || !url}
            style={{ background:running?"#0a0e12":"linear-gradient(135deg,#1a0a2e,#0a1020)", border:`0.5px solid ${running?"#2d6aad":"#c8a0f0"}`, borderRadius:6, color:running?"#4a7fa5":"#c8a0f0", cursor:running?"default":"pointer", fontSize:11, fontWeight:600, padding:"8px 16px", fontFamily:"inherit", letterSpacing:"0.06em" }}>
            {running ? "◈ Scanning..." : "◈ Scan for Hidden Code"}
          </button>
        </div>

        {/* Page selector */}
        {navLinks.length > 0 && (
          <div style={{ marginTop:6 }}>
            <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5, letterSpacing:"0.08em", textTransform:"uppercase" }}>Also scan pages:</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {navLinks.slice(0, 12).map(link => (
                <button key={link.href} onClick={() => setSelPages(prev =>
                  prev.includes(link.href) ? prev.filter(p => p !== link.href) : [...prev, link.href]
                )}
                  style={{ background:selectedPages.includes(link.href)?"#1a3050":"#0d1520", border:`0.5px solid ${selectedPages.includes(link.href)?"#4d9de0":"#1e3a5f"}`, borderRadius:4, color:selectedPages.includes(link.href)?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:9, padding:"3px 8px", fontFamily:"inherit" }}>
                  {link.text?.slice(0, 20) || link.href?.slice(-15)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* Left: log + summary */}
        <div style={{ width:240, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column" }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"5px 12px", borderBottom:"0.5px solid #1e3a5f", textTransform:"uppercase" }}>
            Scan Log {running && <span style={{ color:"#c8a0f0" }}>● live</span>}
          </div>
          <div ref={logRef} style={{ flex:1, overflowY:"auto", padding:"6px 10px" }}>
            {log.length === 0 && !running && (
              <div style={{ fontSize:9, color:"#1e3a5f", textAlign:"center", marginTop:20, lineHeight:2 }}>
                Click "Scan for Hidden Code"<br/>to analyse the page DOM
              </div>
            )}
            {log.map((l, i) => (
              <div key={i} style={{ fontSize:9, marginBottom:3, lineHeight:1.6,
                color:l.level==="error"?"#ff6b6b":l.level==="success"?"#7ec87f":l.level==="warn"?"#ffaa44":l.level==="ai"?"#c8a0f0":l.level==="system"?"#4a7fa5":"#6a8aa8" }}>
                {l.level==="error"?"✗":l.level==="success"?"✓":l.level==="ai"?"◈":"›"} {l.msg}
              </div>
            ))}
          </div>

          {/* Summary */}
          {summary && (
            <div style={{ padding:"10px 12px", borderTop:"0.5px solid #1e3a5f", background:"#0a0e12" }}>
              <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:7 }}>Scan Summary</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, marginBottom:8 }}>
                {[["Pages",summary.totalPages,"#4a7fa5"],["Issues",summary.totalFindings,"#ff8c00"],["Critical",summary.criticalCount,"#ff3b3b"],["Ignorable",summary.ignorableCount,"#4caf50"]].map(([l,v,c]) => (
                  <div key={l} style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:4, padding:"5px 6px", textAlign:"center" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:c }}>{v}</div>
                    <div style={{ fontSize:8, color:"#2d6aad" }}>{l}</div>
                  </div>
                ))}
              </div>
              {ignored.size > 0 && (
                <div style={{ fontSize:9, color:"#4caf50", textAlign:"center" }}>{ignored.size} issue(s) marked to ignore</div>
              )}
            </div>
          )}
        </div>

        {/* Main: findings */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Filter bar */}
          {allFindings.length > 0 || ignored.size > 0 ? (
            <div style={{ padding:"8px 14px", borderBottom:"0.5px solid #1e3a5f", display:"flex", gap:6, alignItems:"center" }}>
              {[
                ["all",      `All (${results.flatMap(r=>r.findings||[]).length})`],
                ["critical", `🔴 Critical (${critCount})`],
                ["warning",  `🟡 Warning (${warnCount})`],
                ["skip",     `⏭ Skip (${allFindings.filter(f=>f.testDecision==="skip"||f.testDecision==="ignore-always").length})`],
              ].map(([f, l]) => (
                <button key={f} className={`fb ${activeFilter===f?"on":""}`} onClick={() => setFilter(f)} style={{ fontSize:9 }}>{l}</button>
              ))}
              {ignored.size > 0 && (
                <button onClick={() => setIgnored(new Set())} style={{ marginLeft:"auto", background:"none", border:"0.5px solid #1e3a5f", borderRadius:4, color:"#4a7fa5", cursor:"pointer", fontSize:9, padding:"3px 8px", fontFamily:"inherit" }}>
                  Clear {ignored.size} ignored
                </button>
              )}
            </div>
          ) : null}

          <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
            {/* Findings list */}
            <div style={{ width:320, flexShrink:0, borderRight:"0.5px solid #1e3a5f", overflowY:"auto", padding:"8px 10px" }}>
              {!running && allFindings.length === 0 && !summary && (
                <div style={{ textAlign:"center", marginTop:40, color:"#1e3a5f", fontSize:10, lineHeight:2 }}>
                  No scan results yet.<br/>Run a scan to detect hidden code.
                </div>
              )}

              {!running && summary && allFindings.length === 0 && (
                <div style={{ textAlign:"center", marginTop:40 }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>✓</div>
                  <div style={{ fontSize:12, color:"#4caf50" }}>All clear</div>
                  <div style={{ fontSize:10, color:"#4a7fa5", marginTop:4 }}>No hidden or dead code detected</div>
                </div>
              )}

              {allFindings.map((f, i) => {
                const sc  = SEV_COLORS[f.severity] ?? SEV_COLORS.info;
                const dc  = DECISION_CONFIG[f.testDecision];
                const isSel = selected?.id === f.id;
                return (
                  <div key={`${f.id}-${i}`} onClick={() => setSelected(isSel ? null : f)}
                    style={{ border:`0.5px solid ${isSel ? sc.border : "#1e3a5f"}`, borderRadius:7, padding:"10px 11px", marginBottom:7, background:isSel ? sc.bg : "#0d1520", cursor:"pointer", transition:"all 0.15s" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:7, marginBottom:5 }}>
                      <span style={{ fontSize:13, flexShrink:0 }}>{sc.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:500, color:"#b0c8e0", marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {TYPE_LABELS[f.type] || f.type}
                        </div>
                        <div style={{ fontSize:10, color:sc.text }}>
                          {f.element?.slice(0, 50)}
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); toggleIgnore(f.id); }}
                        style={{ background:"none", border:"0.5px solid #1e3a5f", borderRadius:3, color:"#2d6aad", cursor:"pointer", fontSize:8, padding:"2px 6px", fontFamily:"inherit", flexShrink:0 }}>
                        {ignored.has(f.id) ? "unignore" : "ignore"}
                      </button>
                    </div>
                    <div style={{ fontSize:9, color:"#4a7fa5", marginBottom:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {f.pageUrl?.replace(/^https?:\/\//,"").slice(0, 35)}
                    </div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                      <span className="pill" style={{ background:sc.bg, border:`0.5px solid ${sc.border}`, color:sc.text, fontSize:8 }}>{f.severity}</span>
                      {dc && <span className="pill" style={{ background:"#0d1520", border:`0.5px solid ${dc.color}40`, color:dc.color, fontSize:8 }}>{dc.icon} {dc.label}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail panel */}
            <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>
              {!selected ? (
                <div style={{ textAlign:"center", marginTop:60, color:"#2d6aad", fontSize:11 }}>
                  ← Select a finding to see details and recommendations
                </div>
              ) : (
                <FindingDetail finding={selected} onIgnore={() => toggleIgnore(selected.id)} isIgnored={ignored.has(selected.id)} />
              )}

              {/* Per-page summary */}
              {results.length > 0 && !selected && (
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:14 }}>Pages Scanned</div>
                  {results.map((r, i) => {
                    const health = r.overallHealth || "clean";
                    const hc = health==="clean"?"#4caf50":health==="minor-issues"?"#f0c040":health==="needs-attention"?"#ff8c00":"#ff3b3b";
                    return (
                      <div key={i} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"12px 14px", marginBottom:10, background:"#0d1520" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                          <div style={{ fontSize:11, color:"#b0d0f0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
                            {r.url?.replace(/^https?:\/\//,"").slice(0, 45)}
                          </div>
                          <span className="pill" style={{ background:"#0a0e12", border:`0.5px solid ${hc}`, color:hc, marginLeft:8, flexShrink:0 }}>
                            {health}
                          </span>
                        </div>
                        <div style={{ fontSize:10, color:"#6a9ab8", marginBottom:6 }}>{r.summary}</div>
                        <div style={{ fontSize:9, color:"#4a7fa5" }}>
                          {r.findings?.length || 0} issues · quality score: {r.codeQualityScore ?? "?"}%
                        </div>
                        {r.codeQualityScore != null && (
                          <div style={{ height:3, background:"#1e3a5f", borderRadius:2, overflow:"hidden", marginTop:6 }}>
                            <div style={{ height:"100%", width:`${r.codeQualityScore}%`, background:hc, borderRadius:2 }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Finding Detail ────────────────────────────────────────────────────────────
function FindingDetail({ finding: f, onIgnore, isIgnored }) {
  const sc = SEV_COLORS[f.severity] ?? SEV_COLORS.info;
  const dc = DECISION_CONFIG[f.testDecision];

  return (
    <div className="fi">
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{ fontSize:18 }}>{sc.icon}</span>
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
        <span className="pill" style={{ background:sc.bg, border:`0.5px solid ${sc.border}`, color:sc.text }}>{f.severity}</span>
        <span className="pill" style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", color:"#4a7fa5" }}>{f.priority} priority</span>
        {dc && <span className="pill" style={{ background:"#0d1520", border:`0.5px solid ${dc.color}`, color:dc.color }}>{dc.icon} {dc.label}</span>}
        {f.isIntentional && <span className="pill" style={{ background:"#0a1520", border:"0.5px solid #4d9de0", color:"#4d9de0" }}>intentional</span>}
      </div>

      {/* Element */}
      <InfoBlock label="Element Detected" value={f.element} />

      {/* Selector */}
      {f.selector && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, letterSpacing:"0.08em", textTransform:"uppercase" }}>Selector</div>
          <code style={{ fontSize:10, color:"#c8a0f0", background:"#0a0a1e", borderRadius:4, padding:"4px 8px", display:"block" }}>{f.selector}</code>
        </div>
      )}

      {/* Reason */}
      <InfoBlock label="Why This Is a Problem" value={f.reason} />

      {/* Business impact */}
      {f.businessImpact && <InfoBlock label="Business Impact" value={f.businessImpact} color="#f0c040" />}

      {/* Code recommendation */}
      {f.codeRecommendation && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:9, color:"#2d6aad", marginBottom:6, letterSpacing:"0.08em", textTransform:"uppercase" }}>Engineering Recommendation</div>
          <div style={{ background:"#0a1200", border:"0.5px solid #4caf5050", borderRadius:6, padding:"10px 12px", fontSize:11, color:"#a0d0a0", lineHeight:1.7 }}>
            {f.codeRecommendation}
          </div>
        </div>
      )}

      {/* Test decision */}
      <div style={{ border:`0.5px solid ${dc?.color || "#1e3a5f"}`, borderRadius:8, padding:"12px 14px", background:"#0d1520" }}>
        <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>ATP Test Decision</div>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
          <span style={{ fontSize:14 }}>{dc?.icon}</span>
          <span style={{ fontSize:12, fontWeight:600, color:dc?.color || "#4a7fa5" }}>{dc?.label || f.testDecision}</span>
        </div>
        {f.testDecision === "skip" && (
          <div style={{ fontSize:10, color:"#4a7fa5" }}>ATP will skip testing this element in future runs.</div>
        )}
        {f.testDecision === "ignore-always" && (
          <div style={{ fontSize:10, color:"#4a7fa5" }}>ATP will permanently ignore this element — it's not reachable by users.</div>
        )}
        {f.testDecision === "test-when-enabled" && (
          <div style={{ fontSize:10, color:"#f0c040" }}>ATP will test this when the feature flag is enabled.</div>
        )}
        {f.testDecision === "investigate" && (
          <div style={{ fontSize:10, color:"#ff8c00" }}>ATP cannot determine intent — requires manual review.</div>
        )}
      </div>
    </div>
  );
}

function InfoBlock({ label, value, color = "#a0c0d8" }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, letterSpacing:"0.08em", textTransform:"uppercase" }}>{label}</div>
      <div style={{ fontSize:11, color, lineHeight:1.7 }}>{value}</div>
    </div>
  );
}
