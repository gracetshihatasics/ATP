import { PRIORITY_COLORS, CATEGORY_ICONS } from "../../constants/theme.js";

export function UseCaseList({ useCases, selectedId, savedSuite, filterPriority, setFilterPriority, filterCategory, setFilterCategory, categories, onSelect, onToggleSuite, onRun }) {
  return (
    <div style={{ width:330, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Priority filters */}
      <div style={{ padding:"7px 12px", borderBottom:"0.5px solid #1e3a5f", display:"flex", flexWrap:"wrap", gap:4 }}>
        {["All","Critical","High","Medium","Low"].map(p => (
          <button key={p} className={`fb ${filterPriority===p?"on":""}`} onClick={() => setFilterPriority(p)}>{p}</button>
        ))}
      </div>
      {/* Category filters */}
      <div style={{ padding:"5px 12px", borderBottom:"0.5px solid #0d1a2a", display:"flex", flexWrap:"wrap", gap:3 }}>
        {["All", ...categories].map(c => (
          <button key={c} className={`fb ${filterCategory===c?"on":""}`} onClick={() => setFilterCategory(c)} style={{ fontSize:9 }}>{c}</button>
        ))}
      </div>
      {/* List */}
      <div style={{ flex:1, overflowY:"auto", padding:"8px 10px" }}>
        {useCases.map(uc => {
          const pc    = PRIORITY_COLORS[uc.priority] ?? PRIORITY_COLORS.Medium;
          const saved = savedSuite.includes(uc.id);
          return (
            <div key={uc.id} className={`uc-card ${selectedId===uc.id?"sel":""}`} onClick={() => onSelect(uc)}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ fontSize:9, color:"#2d6aad" }}>{uc.id}</span>
                  <span style={{ fontSize:10 }}>{CATEGORY_ICONS[uc.category] ?? "📋"}</span>
                </div>
                <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                  <span className="pill" style={{ background:pc.bg, border:`0.5px solid ${pc.border}`, color:pc.text }}>{uc.priority}</span>
                  {uc.evalScore !== undefined && (
                    <span style={{
                      fontSize:8, padding:"1px 5px", borderRadius:3,
                      color:      uc.evalScore >= 85 ? "#4caf50" : uc.evalScore >= 70 ? "#f0c040" : "#ff3b3b",
                      background: uc.evalScore >= 85 ? "#0a2010" : uc.evalScore >= 70 ? "#1a1500" : "#1a0808",
                      border:     `0.5px solid ${uc.evalScore >= 85 ? "#4caf5060" : uc.evalScore >= 70 ? "#f0c04060" : "#ff3b3b60"}`,
                    }}>{uc.evalScore}</span>
                  )}
                  {uc.prodReady && (
                    <span style={{ fontSize:8, padding:"1px 5px", borderRadius:3, color:"#4caf50", background:"#0a2010", border:"0.5px solid #4caf5060" }}>✓ Prod</span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); onToggleSuite(uc.id); }}
                    style={{ background:saved?"#0a2510":"none", border:`0.5px solid ${saved?"#4caf50":"#1e3a5f"}`, borderRadius:4, color:saved?"#7ec87f":"#4a7fa5", cursor:"pointer", fontSize:9, padding:"2px 6px", fontFamily:"inherit", transition:"all 0.1s" }}>
                    {saved ? "✓" : "+ suite"}
                  </button>
                  <button className="rb" onClick={e => { e.stopPropagation(); onRun(uc); }} style={{ fontSize:9, padding:"2px 7px" }}>▶</button>
                </div>
              </div>
              <div style={{ fontSize:11, fontWeight:500, color:"#b0c8e0", marginBottom:3, lineHeight:1.4 }}>{uc.title}</div>
              <div style={{ fontSize:10, color:"#4a7fa5", lineHeight:1.5 }}>{uc.description}</div>
              {uc.evalIssues?.length > 0 && (
                <details style={{ marginTop:4 }}>
                  <summary style={{ fontSize:9, color:"#4a7fa5", cursor:"pointer", userSelect:"none" }}>
                    {uc.evalIssues.length} quality issue{uc.evalIssues.length > 1 ? "s" : ""}
                  </summary>
                  {uc.evalIssues.map((issue, i) => (
                    <div key={i} style={{ fontSize:9, color:"#ff8888", paddingLeft:8, lineHeight:1.6 }}>⚠ {issue}</div>
                  ))}
                  {uc.evalSuggestions?.map((s, i) => (
                    <div key={i} style={{ fontSize:9, color:"#4d9de0", paddingLeft:8, lineHeight:1.6 }}>◈ {s}</div>
                  ))}
                </details>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
