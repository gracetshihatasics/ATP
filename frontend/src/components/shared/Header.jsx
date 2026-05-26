export function Header({ nav, setNav, wsStatus, onConnect, resultsBadge, apiHealth }) {
  const wc = wsStatus === "connected" ? "#4caf50" : wsStatus === "connecting" ? "#ff8c00" : "#ff3b3b";

  const apiColor =
    apiHealth?.status === "ok"         ? "#4caf50" :
    apiHealth?.status === "checking"   ? "#2d6aad" :
    apiHealth?.status === "network"    ? "#f0c040" :
    apiHealth?.status === "quota"      ? "#ff8c00" : "#ff3b3b";

  const apiLabel =
    apiHealth?.status === "ok"          ? (apiHealth.model || "API ok") :
    apiHealth?.status === "checking"    ? "checking..." :
    apiHealth?.status === "no-key"      ? "no API key" :
    apiHealth?.status === "invalid-key" ? "key revoked" :
    apiHealth?.status === "quota"       ? "quota exceeded" :
    apiHealth?.status === "network"     ? "API unreachable" : "API error";

  const apiTitle =
    apiHealth?.status === "network"
      ? "Cannot reach api.anthropic.com — check VPN/firewall"
      : apiHealth?.error || apiLabel;

  const NAV = [
    { id:"discover", label:"◈ Discover" },
    { id:"run",      label:"▶ Run" },
    { id:"results",  label:"📊 Results", badge: resultsBadge },
    { id:"context",  label:"🔗 Context" },
    { id:"settings", label:"⚙ Settings" },
  ];

  return (
    <div style={{ background:"#0a0e12", borderBottom:"0.5px solid #1e3a5f", padding:"0 18px", display:"flex", alignItems:"stretch", height:44 }}>

      {/* Brand */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginRight:24, flexShrink:0 }}>
        <div style={{ width:7, height:7, borderRadius:"50%", background:"#4d9de0", boxShadow:"0 0 8px #4d9de0", animation:"pulse 2s infinite" }} />
        <span style={{ fontSize:11, fontWeight:700, color:"#7ec8ff", letterSpacing:"0.12em" }}>ATP</span>
        <span style={{ fontSize:8, color:"#1e3a5f", letterSpacing:"0.06em" }}>v0.5</span>
      </div>

      {/* Nav tabs */}
      <div style={{ display:"flex", alignItems:"stretch", flex:1 }}>
        {NAV.map(item => (
          <button key={item.id} onClick={() => setNav(item.id)}
            style={{
              background:  "none",
              border:      "none",
              borderBottom: nav === item.id ? "2px solid #4d9de0" : "2px solid transparent",
              color:        nav === item.id ? "#7ec8ff" : "#4a7fa5",
              cursor:       "pointer",
              fontSize:     11,
              fontWeight:   nav === item.id ? 600 : 400,
              padding:      "0 16px",
              fontFamily:   "inherit",
              letterSpacing: "0.04em",
              position:     "relative",
              transition:   "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => { if (nav !== item.id) e.currentTarget.style.color = "#7ec8ff"; }}
            onMouseLeave={e => { if (nav !== item.id) e.currentTarget.style.color = "#4a7fa5"; }}>
            {item.label}
            {item.badge > 0 && (
              <span style={{ position:"absolute", top:8, right:6, background:"#ff3b3b", color:"#fff", fontSize:8, fontWeight:700, width:14, height:14, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid #080c0f" }}>
                {item.badge > 9 ? "9+" : item.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Status indicators */}
      <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        {/* API status */}
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:9, color:apiColor, background:"#0d1520", borderRadius:4, padding:"3px 8px", border:`0.5px solid ${apiColor}30` }}
          title={apiTitle}>
          <div style={{ width:5, height:5, borderRadius:"50%", background:apiColor, flexShrink:0 }} />
          <span style={{ maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{apiLabel}</span>
        </div>

        {/* WS status */}
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:9, color:wc }}>
          <div style={{ width:5, height:5, borderRadius:"50%", background:wc, animation:wsStatus==="connecting"?"pulse 0.8s infinite":"none" }} />
          {wsStatus === "connected" ? "live" : wsStatus === "connecting" ? "connecting" : "offline"}
        </div>
        {wsStatus !== "connected" && (
          <button className="nb" onClick={onConnect} style={{ fontSize:9, padding:"2px 8px" }}>connect</button>
        )}
      </div>
    </div>
  );
}
