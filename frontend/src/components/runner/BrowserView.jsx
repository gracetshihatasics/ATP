export function BrowserView({ screenshots, runPhase, onClickShot }) {
  const latest = screenshots[screenshots.length - 1] ?? null;

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", borderRight:"0.5px solid #1e3a5f" }}>
      {/* Toolbar */}
      <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"5px 14px", borderBottom:"0.5px solid #1e3a5f", textTransform:"uppercase", display:"flex", alignItems:"center", gap:8 }}>
        Browser View
        {runPhase === "running" && <div style={{ width:6, height:6, borderRadius:"50%", background:"#ffaa44", animation:"pulse 0.6s infinite" }} />}
        {screenshots.length > 0 && <span style={{ fontSize:9, color:"#1e3a5f", marginLeft:"auto" }}>{screenshots.length} screenshots</span>}
      </div>

      {/* Main screenshot */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", background:"#060a0d", overflow:"hidden", position:"relative" }}>
        {!latest ? (
          <div style={{ textAlign:"center", color:"#1e3a5f", fontSize:11, lineHeight:2.2 }}>
            {runPhase === "running" ? "⟳ Browser launching…" : "No screenshots yet"}
          </div>
        ) : (
          <>
            <img src={latest.data} alt="Browser" style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain", cursor:"pointer" }}
              onClick={() => onClickShot(latest.data)} />
            <div style={{ position:"absolute", bottom:8, right:8, fontSize:9, color:"#2d6aad", background:"rgba(6,10,13,0.9)", padding:"2px 7px", borderRadius:3, border:"0.5px solid #1e3a5f", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {latest.label}
            </div>
          </>
        )}
      </div>

      {/* Filmstrip */}
      {screenshots.length > 1 && (
        <div style={{ height:76, borderTop:"0.5px solid #1e3a5f", display:"flex", gap:5, padding:"5px 10px", overflowX:"auto", background:"#0a0e12", alignItems:"center" }}>
          {screenshots.map((s, i) => (
            <div key={i} style={{ flexShrink:0, position:"relative", cursor:"pointer" }} onClick={() => onClickShot(s.data)}>
              <img src={s.data} alt="" style={{ width:88, height:58, objectFit:"cover", borderRadius:4, display:"block",
                border:`0.5px solid ${s.status==="fail"?"#ff3b3b":s.status==="pass"?"#4caf50":"#1e3a5f"}` }} />
              <div style={{ position:"absolute", bottom:2, left:2, fontSize:8, background:"rgba(0,0,0,0.8)", padding:"1px 4px", borderRadius:2, color:"#6a9ab8" }}>{i+1}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Lightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="ov" onClick={onClose}>
      <img src={src} style={{ maxWidth:"92vw", maxHeight:"90vh", borderRadius:8, border:"0.5px solid #2d6aad", cursor:"default" }}
        onClick={e => e.stopPropagation()} alt="Screenshot" />
      <div style={{ position:"absolute", top:14, right:14, color:"#fff", fontSize:20, cursor:"pointer" }} onClick={onClose}>✕</div>
    </div>
  );
}
