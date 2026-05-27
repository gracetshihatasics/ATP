import { useState } from "react";
import { CredentialPicker } from "../shared/CredentialPicker.jsx";
import { useUrls }          from "../../hooks/useUrls.js";

export function InputPanel({ url, setUrl, credentialId, onCredentialChange, phase, onDiscover, onCancel, onAdvancedDiscover, advancedPhase }) {
  const discovering = phase === "discovering";
  const advRunning  = advancedPhase === "running";
  const { urls, activeId, add, activate, remove } = useUrls();
  const [adding,   setAdding]   = useState(false);
  const [newUrl,   setNewUrl]   = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showList, setShowList] = useState(false);

  // Sync active URL into parent whenever it changes
  const handleActivate = (u) => {
    activate(u.id);
    setUrl(u.url);
    setShowList(false);
  };

  const handleAdd = async () => {
    const val = (newUrl || url).trim();
    if (!val) return;
    await add(val, newLabel || val);
    // Also set it in parent immediately
    setUrl(val);
    setNewUrl(""); setNewLabel(""); setAdding(false);
  };

  const handleUrlChange = (val) => {
    setUrl(val);
    // If matches a saved URL, show the list
    if (val && urls.some(u => u.url === val.trim())) setShowList(false);
  };

  return (
    <div style={{ padding:"14px 14px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.12em", textTransform:"uppercase" }}>Target Application</div>
        <button onClick={() => setShowList(p => !p)}
          style={{ background:"none", border:"0.5px solid #1e3a5f", borderRadius:4, color:"#4a7fa5", cursor:"pointer", fontSize:8, padding:"2px 7px", fontFamily:"inherit" }}>
          {showList ? "▲ hide" : `▼ saved (${urls.length})`}
        </button>
      </div>

      {/* Saved URLs dropdown */}
      {showList && (
        <div style={{ marginBottom:8, border:"0.5px solid #1e3a5f", borderRadius:6, background:"#090d11", overflow:"hidden" }}>
          {urls.length === 0 && (
            <div style={{ fontSize:9, color:"#1e3a5f", padding:"8px 10px" }}>No saved URLs yet — type one below and save it.</div>
          )}
          {urls.map(u => (
            <div key={u.id}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 10px", borderBottom:"0.5px solid #0d1a2a",
                background:u.id===activeId?"#0f2a1a":"transparent",
                cursor:"pointer" }}
              onClick={() => handleActivate(u)}>
              <div style={{ width:6, height:6, borderRadius:"50%", flexShrink:0, background:u.id===activeId?"#4caf50":"#1e3a5f" }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10, color:u.id===activeId?"#7ec87f":"#a0c0d8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {u.label !== u.url ? u.label : u.url.replace(/^https?:\/\//,"").slice(0,35)}
                </div>
                {u.label !== u.url && <div style={{ fontSize:8, color:"#2d6aad", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.url}</div>}
              </div>
              {u.id === activeId && <span style={{ fontSize:8, color:"#4caf50", flexShrink:0 }}>active</span>}
              <button onClick={e => { e.stopPropagation(); remove(u.id); }}
                style={{ background:"none", border:"none", color:"#3a2020", cursor:"pointer", fontSize:11, padding:"0 2px", fontFamily:"inherit", flexShrink:0 }}
                onMouseEnter={e => e.currentTarget.style.color="#ff6b6b"}
                onMouseLeave={e => e.currentTarget.style.color="#3a2020"}>
                ✕
              </button>
            </div>
          ))}
          {/* Add new */}
          {!adding ? (
            <button onClick={() => setAdding(true)}
              style={{ display:"block", width:"100%", background:"none", border:"none", borderTop:"0.5px solid #0d1a2a", color:"#2d6aad", cursor:"pointer", fontSize:9, padding:"6px 10px", fontFamily:"inherit", textAlign:"left" }}>
              + Save current URL
            </button>
          ) : (
            <div style={{ padding:"8px 10px", borderTop:"0.5px solid #0d1a2a" }}>
              <input value={newUrl || url} onChange={e => setNewUrl(e.target.value)}
                placeholder="https://..." style={{ ...iStyle, marginBottom:5 }} />
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="Label (optional — e.g. Golden Glow Staging)" style={{ ...iStyle, marginBottom:6 }} />
              <div style={{ display:"flex", gap:5 }}>
                <button onClick={handleAdd} style={{ flex:1, background:"#0a2010", border:"0.5px solid #4caf50", borderRadius:4, color:"#7ec87f", cursor:"pointer", fontSize:9, padding:"4px 0", fontFamily:"inherit" }}>
                  Save
                </button>
                <button onClick={() => { setAdding(false); setNewUrl(""); setNewLabel(""); }}
                  style={{ background:"none", border:"0.5px solid #1e3a5f", borderRadius:4, color:"#4a7fa5", cursor:"pointer", fontSize:9, padding:"4px 8px", fontFamily:"inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* URL input */}
      <div style={{ position:"relative", marginBottom:10 }}>
        <input
          value={url} onChange={e => handleUrlChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !discovering && !advRunning && url && onDiscover()}
          placeholder="https://goldenglowdaycare.com"
          disabled={discovering || advRunning}
          style={{ width:"100%", background:"#0d1520", border:`0.5px solid ${urls.some(u=>u.url===url.trim())?"#4caf5060":"#1e3a5f"}`, borderRadius:5, color:"#c8d8e8", fontSize:12, padding:"7px 9px", outline:"none", fontFamily:"inherit" }}
        />
        {/* Save quick-button — shows when URL is typed but not saved */}
        {url && !urls.some(u => u.url === url.trim()) && (
          <button
            onClick={() => { setNewUrl(url); setAdding(true); setShowList(true); }}
            title="Save this URL"
            style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)", background:"none", border:"0.5px solid #2d6aad", borderRadius:3, color:"#2d6aad", cursor:"pointer", fontSize:8, padding:"2px 6px", fontFamily:"inherit" }}>
            save
          </button>
        )}
      </div>

      {/* Credentials */}
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
      <button onClick={onAdvancedDiscover} disabled={discovering || advRunning || !url.trim()}
        style={{ width:"100%", background:advRunning?"#0a1520":"linear-gradient(135deg,#1a0a2e,#0a0a1e)", border:`0.5px solid ${advRunning?"#c8a0f0":"#5b3a8a"}`, borderRadius:6, color:advRunning?"#c8a0f0":"#a080d0", cursor:advRunning?"default":"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, padding:"8px 0", letterSpacing:"0.06em" }}>
        {advRunning ? "◈ DISCOVERING..." : "🔬 ADVANCED DISCOVER"}
      </button>

      <div style={{ fontSize:9, color:"#1e3a5f", marginTop:7, lineHeight:1.7 }}>
        Advanced: navigates the app, maps all features, generates unlimited use cases.
      </div>
    </div>
  );
}

const iStyle = {
  width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:4,
  color:"#c8d8e8", fontSize:10, padding:"5px 7px", outline:"none", fontFamily:"inherit",
};
