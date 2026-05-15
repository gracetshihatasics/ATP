export function Header({ wsStatus, onConnect, mainView, setMainView, resultsBadge }) {
  const wc = wsStatus==="connected"?"#4caf50":wsStatus==="connecting"?"#ff8c00":"#ff3b3b";
  const wl = wsStatus==="connected"?"backend live":wsStatus==="connecting"?"connecting…":wsStatus==="error"?"backend error":"backend offline";

  return (
    <div style={{ background:"#0a0e12", borderBottom:"0.5px solid #1e3a5f", padding:"9px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <div style={{ width:7, height:7, borderRadius:"50%", background:"#4d9de0", boxShadow:"0 0 8px #4d9de0", animation:"pulse 2s infinite" }} />
        <span style={{ fontSize:12, fontWeight:600, color:"#7ec8ff", letterSpacing:"0.14em" }}>AUTONOMOUS TEST PLATFORM</span>
        <span style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em" }}>v0.4</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:wc }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:wc, animation:wsStatus==="connecting"?"pulse 0.8s infinite":"none" }} />
          {wl}
        </div>
        {wsStatus !== "connected" && <button className="nb" onClick={onConnect} style={{ fontSize:9, padding:"3px 9px" }}>connect</button>}
        <div style={{ width:1, height:14, background:"#1e3a5f" }} />
        <button className={`nb ${mainView==="discovery"?"on":""}`} onClick={() => setMainView("discovery")}>◈ Discovery</button>
        <button className={`nb ${mainView==="api"?"on":""}`}       onClick={() => setMainView("api")}>🔌 API Agent</button>
        <button className={`nb ${mainView==="runner"?"on":""}`}    onClick={() => setMainView("runner")}>▶ Runner</button>
        <button className={`nb ${mainView==="vault"?"on":""}`}     onClick={() => setMainView("vault")}>🔐 Vault</button>

        {/* Connection 3: Results badge shows failure count */}
        <button className={`nb ${mainView==="results"?"on":""}`} onClick={() => setMainView("results")}
          style={{ position:"relative" }}>
          📊 Results
          {resultsBadge > 0 && (
            <span style={{
              position:"absolute", top:-4, right:-4,
              background:"#ff3b3b", color:"#fff",
              fontSize:8, fontWeight:700,
              width:14, height:14, borderRadius:"50%",
              display:"flex", alignItems:"center", justifyContent:"center",
              border:"1px solid #080c0f",
            }}>{resultsBadge > 9 ? "9+" : resultsBadge}</span>
          )}
        </button>
      </div>
    </div>
  );
}
