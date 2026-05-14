export function SuiteList({ suites = [], useCases = [], savedSuite = [], onRunSuite, onSelectUC }) {
  return (
    <div style={{ flex:1, overflowY:"auto", padding:"12px 16px" }}>
      {suites.map((suite, i) => (
        <div key={i} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"11px 13px", marginBottom:8, background:"#0d1520" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:5 }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#b0d0f0" }}>{suite.name}</div>
            <button className="rb" style={{ fontSize:9, padding:"3px 9px" }} onClick={() => onRunSuite(suite)}>▶ RUN</button>
          </div>
          <div style={{ fontSize:10, color:"#4a7fa5", marginBottom:7, lineHeight:1.6 }}>{suite.description}</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
            {suite.useCaseIds?.map(id => {
              const uc = useCases.find(u => u.id === id);
              return uc ? (
                <div key={id} className="pill"
                  style={{ background:"#0d1a2a", border:"0.5px solid #1e3a5f", color:"#6a9ab8", fontSize:9, cursor:"pointer" }}
                  onClick={() => onSelectUC(uc)}>
                  {id} · {uc.title}
                </div>
              ) : null;
            })}
          </div>
        </div>
      ))}

      {/* Custom suite from saved selections */}
      {savedSuite.length > 0 && (
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:9, color:"#4caf50", letterSpacing:"0.1em", marginBottom:8, textTransform:"uppercase" }}>✓ Your custom suite</div>
          <div style={{ border:"0.5px solid #4caf50", borderRadius:8, padding:"11px 13px", background:"#0d1520" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {savedSuite.map(id => {
                const uc = useCases.find(u => u.id === id);
                return uc ? (
                  <div key={id} className="pill" style={{ background:"#0a2010", border:"0.5px solid #4caf50", color:"#7ec87f", fontSize:9 }}>{id} · {uc.title}</div>
                ) : null;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
