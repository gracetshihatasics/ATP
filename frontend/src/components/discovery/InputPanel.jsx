import { CredentialPicker } from "../shared/CredentialPicker.jsx";

export function InputPanel({ url, setUrl, credentialId, onCredentialChange, phase, onDiscover, onCancel, onAdvancedDiscover, advancedPhase }) {
  const discovering = phase === "discovering";
  const advRunning  = advancedPhase === "running";

  return (
    <div style={{ padding:"14px 14px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
      <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.12em", marginBottom:9, textTransform:"uppercase" }}>Target Application</div>

      <input
        value={url} onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === "Enter" && !discovering && !advRunning && onDiscover()}
        placeholder="https://asics.com"
        disabled={discovering || advRunning}
        style={{ width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#c8d8e8", fontSize:12, padding:"7px 9px", outline:"none", marginBottom:10, fontFamily:"inherit" }}
      />

      <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", marginBottom:5 }}>Credentials</div>
      <div style={{ marginBottom:10 }}>
        <CredentialPicker value={credentialId} onChange={onCredentialChange} />
      </div>

      {/* Quick discover */}
      <div style={{ display:"flex", gap:6, marginBottom:6 }}>
        <button className="disc" onClick={onDiscover} disabled={discovering || advRunning || !url.trim()} style={{ fontSize:12, padding:"8px 0" }}>
          {discovering ? "DISCOVERING..." : "▶ QUICK DISCOVER"}
        </button>
        {discovering && (
          <button onClick={onCancel} style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:6, color:"#ff6b6b", fontSize:11, cursor:"pointer", padding:"0 10px", fontFamily:"inherit", flexShrink:0 }}>✕</button>
        )}
      </div>

      {/* Advanced discover */}
      <button
        onClick={onAdvancedDiscover}
        disabled={discovering || advRunning || !url.trim()}
        style={{
          width:"100%", background: advRunning?"#0a1520":"linear-gradient(135deg,#1a0a2e,#0a0a1e)",
          border:`0.5px solid ${advRunning?"#c8a0f0":"#5b3a8a"}`, borderRadius:6,
          color: advRunning?"#c8a0f0":"#a080d0", cursor: advRunning?"default":"pointer",
          fontFamily:"inherit", fontSize:11, fontWeight:600, padding:"8px 0",
          letterSpacing:"0.06em", transition:"all 0.2s",
        }}>
        {advRunning ? "◈ DISCOVERING..." : "🔬 ADVANCED DISCOVER"}
      </button>

      {/* Hint */}
      <div style={{ fontSize:9, color:"#1e3a5f", marginTop:7, lineHeight:1.7 }}>
        Advanced: navigates the app, maps all features, auto-registers if no credential — generates unlimited use cases.
      </div>
    </div>
  );
}
