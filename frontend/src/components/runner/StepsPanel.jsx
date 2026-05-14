export function StepsPanel({ steps, currentStep, runPhase, runTarget, suiteProgress, assertions, onStopRun, onBack }) {
  return (
    <div style={{ width:260, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
      {/* Controls */}
      <div style={{ padding:"10px 12px", borderBottom:"0.5px solid #1e3a5f" }}>
        <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7 }}>
          {runTarget?.title ?? "Test Runner"}
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {runPhase === "running"
            ? <button className="sb" onClick={onStopRun} style={{ flex:1 }}>⏹ STOP</button>
            : <button className="nb" onClick={onBack} style={{ flex:1, fontSize:10 }}>← Discovery</button>
          }
        </div>
        {suiteProgress && (
          <div style={{ marginTop:7 }}>
            <div style={{ fontSize:9, color:"#4a7fa5", marginBottom:3 }}>Suite: {suiteProgress.done}/{suiteProgress.total}</div>
            <div style={{ height:2, background:"#1e3a5f", borderRadius:1 }}>
              <div style={{ height:"100%", background:"#4caf50", width:`${(suiteProgress.done / suiteProgress.total) * 100}%`, transition:"width 0.4s" }} />
            </div>
          </div>
        )}
      </div>

      {/* Step list */}
      <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"5px 12px", borderBottom:"0.5px solid #1e3a5f", textTransform:"uppercase" }}>
        Steps ({steps.length})
      </div>
      <div style={{ flex:1, overflowY:"auto" }}>
        {steps.length === 0 && runPhase === "idle" && (
          <div style={{ fontSize:9, color:"#1e3a5f", textAlign:"center", marginTop:20, lineHeight:2 }}>
            No run in progress.<br/>Go back to Discovery<br/>and click ▶ on a use case.
          </div>
        )}
        {steps.map((step, i) => {
          const isActive = i === currentStep;
          const sc = step.status==="pass"?"#4caf50":step.status==="fail"?"#ff3b3b":step.status==="running"?"#ffaa44":"#2d6aad";
          return (
            <div key={i} className="srow"
              style={{ background: isActive?"#0d1f30":step.status==="fail"?"#1a0808":"transparent" }}>
              <div style={{ width:15, height:15, borderRadius:"50%", border:`0.5px solid ${sc}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, color:sc, flexShrink:0 }}>
                {step.status==="pass"?"✓":step.status==="fail"?"✗":step.status==="running"?"●":i+1}
              </div>
              <div style={{ flex:1, color:isActive?"#c8d8e8":"#6a8aa0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {step.description || `Step ${i+1}`}
              </div>
              {step.screenshot && <span style={{ fontSize:9, color:"#2d6aad", flexShrink:0 }}>📷</span>}
            </div>
          );
        })}
        {runPhase === "running" && steps.length > 0 && (
          <div style={{ display:"flex", gap:3, padding:"5px 12px" }}>
            {[0, 0.2, 0.4].map((d, i) => (
              <div key={i} style={{ width:4, height:4, borderRadius:"50%", background:"#ffaa44", animation:`pulse 0.8s ${d}s infinite` }} />
            ))}
          </div>
        )}
      </div>

      {/* Assertions */}
      {assertions.length > 0 && (
        <>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"5px 12px", borderTop:"0.5px solid #1e3a5f", textTransform:"uppercase" }}>Assertions</div>
          <div style={{ maxHeight:100, overflowY:"auto" }}>
            {assertions.map((a, i) => (
              <div key={i} style={{ display:"flex", gap:5, padding:"3px 12px", fontSize:9, color:a.passed?"#7ec87f":"#ff6b6b" }}>
                <span>{a.passed?"✓":"✗"}</span><span style={{ flex:1 }}>{a.assertion}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Summary */}
      {runPhase === "done" && (
        <div style={{ padding:"10px 12px", borderTop:"0.5px solid #1e3a5f" }}>
          <div style={{ display:"flex", gap:6 }}>
            <div style={{ flex:1, background:"#0a2010", border:"0.5px solid #4caf50", borderRadius:5, padding:"5px 0", textAlign:"center", fontSize:11, color:"#7ec87f" }}>
              {assertions.filter(a => a.passed).length} passed
            </div>
            <div style={{ flex:1, background:"#1a0808", border:"0.5px solid #ff3b3b", borderRadius:5, padding:"5px 0", textAlign:"center", fontSize:11, color:"#ff6b6b" }}>
              {assertions.filter(a => !a.passed).length} failed
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
