export function InputPanel({ url, setUrl, username, setUsername, password, setPassword, showCreds, setShowCreds, phase, onDiscover, onCancel }) {
  const discovering = phase === "discovering";
  return (
    <div style={{ padding:"14px 14px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
      <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.12em", marginBottom:9, textTransform:"uppercase" }}>Target Application</div>

      <input
        value={url} onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === "Enter" && !discovering && onDiscover()}
        placeholder="https://app.example.com"
        disabled={discovering}
        style={{ width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#c8d8e8", fontSize:12, padding:"7px 9px", outline:"none", marginBottom:7 }}
      />

      <button onClick={() => setShowCreds(!showCreds)}
        style={{ background:"none", border:"none", color:"#2d6aad", fontSize:10, cursor:"pointer", padding:0, marginBottom:showCreds?7:0, fontFamily:"inherit" }}>
        {showCreds ? "▾" : "▸"} Credentials
      </button>

      {showCreds && (
        <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:7 }}>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username / Email"
            style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"6px 9px", outline:"none", fontFamily:"inherit" }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
            style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"6px 9px", outline:"none", fontFamily:"inherit" }} />
        </div>
      )}

      <div style={{ display:"flex", gap:6 }}>
        <button className="disc" onClick={onDiscover} disabled={discovering || !url.trim()}>
          {discovering ? "DISCOVERING..." : "▶ DISCOVER"}
        </button>
        {discovering && (
          <button onClick={onCancel}
            style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:6, color:"#ff6b6b", fontSize:11, cursor:"pointer", padding:"0 10px", fontFamily:"inherit", flexShrink:0 }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
