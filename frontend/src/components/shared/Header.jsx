export function Header({ wsStatus, onConnect, mainView, setMainView, resultsBadge, apiHealth }) {
  const wc = wsStatus==="connected"?"#4caf50":wsStatus==="connecting"?"#ff8c00":"#ff3b3b";
  const wl = wsStatus==="connected"?"live":wsStatus==="connecting"?"connecting…":"offline";

  // API key status dot
  const apiOk   = !apiHealth || apiHealth.status === "ok" || apiHealth.status === "checking";
  const apiColor = apiHealth?.status === "ok"      ? "#4caf50"
                 : apiHealth?.status === "checking" ? "#2d6aad"
                 : apiHealth?.status === "quota"    ? "#ff8c00"
                 : "#ff3b3b";
  const apiLabel = apiHealth?.status === "ok"       ? apiHealth.model || "API ok"
                 : apiHealth?.status === "checking"  ? "checking API..."
                 : apiHealth?.status === "no-key"    ? "no API key"
                 : apiHealth?.status === "invalid-key"? "key revoked"
                 : apiHealth?.status === "quota"      ? "quota exceeded"
                 : apiHealth?.status === "network"    ? "API unreachable"
                 : "API error";

  return (
    <div style={{ background:"#0a0e12", borderBottom:"0.5px solid #1e3a5f", padding:"8px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:7, height:7, borderRadius:"50%", background:"#4d9de0", boxShadow:"0 0 8px #4d9de0", animation:"pulse 2s infinite" }} />
        <span style={{ fontSize:12, fontWeight:600, color:"#7ec8ff", letterSpacing:"0.14em" }}>AUTONOMOUS TEST PLATFORM</span>
        <span style={{ fontSize:9, color:"#2d6aad" }}>v0.5</span>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {/* API key status */}
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:9, color:apiColor, background:"#0d1520", borderRadius:4, padding:"3px 8px", border:`0.5px solid ${apiColor}40` }}
          title={apiHealth?.error || apiLabel}>
          <div style={{ width:5, height:5, borderRadius:"50%", background:apiColor, flexShrink:0 }} />
          <span style={{ maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{apiLabel}</span>
        </div>

        <div style={{ width:1, height:12, background:"#1e3a5f" }} />

        {/* WS status */}
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:9, color:wc }}>
          <div style={{ width:5, height:5, borderRadius:"50%", background:wc }} />
          {wl}
        </div>
        {wsStatus !== "connected" && <button className="nb" onClick={onConnect} style={{ fontSize:9, padding:"2px 8px" }}>connect</button>}

        <div style={{ width:1, height:12, background:"#1e3a5f" }} />

        {[
          ["discovery","◈ Discover"],
          ["api","🔌 API"],
          ["runner","▶ Runner"],
          ["vault","🔐 Vault"],
          ["integrations","🔗 Integrations"],
          ["git","⚙ Git CI"],
        ].map(([v,l]) => (
          <button key={v} className={`nb ${mainView===v?"on":""}`} onClick={() => setMainView(v)} style={{ fontSize:10 }}>{l}</button>
        ))}

        <button className={`nb ${mainView==="results"?"on":""}`} onClick={() => setMainView("results")} style={{ position:"relative", fontSize:10 }}>
          📊 Results
          {resultsBadge > 0 && (
            <span style={{ position:"absolute", top:-4, right:-4, background:"#ff3b3b", color:"#fff", fontSize:8, fontWeight:700, width:13, height:13, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid #080c0f" }}>
              {resultsBadge > 9 ? "9+" : resultsBadge}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
