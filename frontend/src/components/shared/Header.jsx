export function Header({ wsStatus, onConnect, mainView, setMainView, savedSuiteCount }) {
  const wsColor = wsStatus === "connected" ? "#4caf50" : wsStatus === "connecting" ? "#ff8c00" : "#ff3b3b";
  const wsLabel = wsStatus === "connected" ? "backend live" : wsStatus === "connecting" ? "connecting…" : wsStatus === "error" ? "backend error" : "backend offline";

  return (
    <div style={{ background:"#0a0e12", borderBottom:"0.5px solid #1e3a5f", padding:"9px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:7, height:7, borderRadius:"50%", background:"#4d9de0", boxShadow:"0 0 8px #4d9de0", animation:"pulse 2s infinite" }} />
        <span style={{ fontSize:12, fontWeight:600, color:"#7ec8ff", letterSpacing:"0.14em" }}>AUTONOMOUS TEST PLATFORM</span>
        <span style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em" }}>v0.2</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:wsColor }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:wsColor, animation:wsStatus==="connecting"?"pulse 0.8s infinite":"none" }} />
          {wsLabel}
        </div>
        {wsStatus !== "connected" && (
          <button className="nb" onClick={onConnect} style={{ fontSize:9, padding:"3px 9px" }}>connect</button>
        )}
        <div style={{ width:1, height:14, background:"#1e3a5f" }} />
        <button className={`nb ${mainView==="discovery"?"on":""}`} onClick={() => setMainView("discovery")}>◈ Discovery</button>
        <button className={`nb ${mainView==="runner"?"on":""}`}    onClick={() => setMainView("runner")}>▶ Runner</button>
      </div>
    </div>
  );
}
