export function StepsPanel({ steps, currentStep, runPhase, runTarget, suiteProgress, assertions, onStopRun, onBack }) {

  const statusConfig = {
    "pass":          { color:"#4caf50", icon:"✓", label:"passed" },
    "pass-deferred": { color:"#7ec8ff", icon:"✓", label:"confirmed later" },
    "fail":          { color:"#ff3b3b", icon:"✗", label:"failed" },
    "recovered":     { color:"#f0c040", icon:"↺", label:"recovered" },
    "running":       { color:"#ffaa44", icon:"●", label:"running" },
    "pending":       { color:"#2d6aad", icon:"○", label:"pending" },
    "error":         { color:"#ff8c00", icon:"⚠", label:"error" },
  };

  const getStatus = (step) => {
    if (!step) return statusConfig.pending;
    return statusConfig[step.status] || statusConfig.pending;
  };

  const passed    = steps.filter(s => s.status === "pass" || s.status === "pass-deferred").length;
  const failed    = steps.filter(s => s.status === "fail").length;
  const recovered = steps.filter(s => s.status === "recovered").length;
  const uncertain = steps.filter(s => s.uncertain).length;

  return (
    <div style={{ width:280, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>

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

        {/* Suite progress */}
        {suiteProgress && (
          <div style={{ marginTop:7 }}>
            <div style={{ fontSize:9, color:"#4a7fa5", marginBottom:3 }}>Suite: {suiteProgress.done}/{suiteProgress.total}</div>
            <div style={{ height:2, background:"#1e3a5f", borderRadius:1 }}>
              <div style={{ height:"100%", background:"#4caf50", width:`${(suiteProgress.done/suiteProgress.total)*100}%`, transition:"width 0.4s" }} />
            </div>
          </div>
        )}

        {/* Step summary when running */}
        {steps.length > 0 && (
          <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
            {passed > 0    && <Badge label={`${passed} pass`}     color="#4caf50" />}
            {failed > 0    && <Badge label={`${failed} fail`}     color="#ff3b3b" />}
            {recovered > 0 && <Badge label={`${recovered} recovered`} color="#f0c040" />}
            {uncertain > 0 && <Badge label={`${uncertain} uncertain`} color="#4d9de0" />}
          </div>
        )}
      </div>

      {/* Step count header */}
      <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"5px 12px", borderBottom:"0.5px solid #1e3a5f", textTransform:"uppercase", display:"flex", justifyContent:"space-between" }}>
        <span>Steps ({steps.length})</span>
        {runPhase === "running" && currentStep >= 0 && (
          <span style={{ color:"#ffaa44" }}>{currentStep + 1}/{steps.length}</span>
        )}
      </div>

      {/* Step list */}
      <div style={{ flex:1, overflowY:"auto" }}>
        {steps.length === 0 && runPhase === "idle" && (
          <div style={{ fontSize:9, color:"#1e3a5f", textAlign:"center", marginTop:20, lineHeight:2 }}>
            No run in progress.<br/>Go back to Discovery<br/>and click ▶ on a use case.
          </div>
        )}

        {steps.map((step, i) => {
          const isActive = i === currentStep;
          const sc       = getStatus(step);

          return (
            <div key={i} style={{
              padding:"6px 12px", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer",
              background: isActive ? "#0d1f30" : step.status === "fail" ? "#1a0808" : step.status === "recovered" ? "#1a1500" : step.status === "pass-deferred" ? "#0a1520" : "transparent",
              transition:"background 0.15s",
            }}>
              {/* Step header */}
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:step.error||step.observation||step.recheckEvidence?4:0 }}>
                {/* Status indicator */}
                <div style={{
                  width:16, height:16, borderRadius:"50%",
                  border:`0.5px solid ${sc.color}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:9, color:sc.color, flexShrink:0,
                  background: isActive ? `${sc.color}20` : "transparent",
                  animation: isActive ? "pulse 1s infinite" : "none",
                }}>
                  {step.status === "pending" && !isActive ? i+1 : sc.icon}
                </div>

                {/* Description */}
                <div style={{ flex:1, fontSize:10, color:isActive?"#e0f0ff":step.status==="fail"?"#ff8888":step.status==="recovered"?"#f0e060":step.status==="pass-deferred"?"#88d0ff":"#8ab4c8",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {step.description || `Step ${i+1}`}
                </div>

                {/* Right side indicators */}
                <div style={{ display:"flex", gap:3, flexShrink:0 }}>
                  {step.attempts > 1 && (
                    <span style={{ fontSize:8, color:"#f0c040", background:"#1a1000", border:"0.5px solid #ff8c0060", borderRadius:3, padding:"1px 4px" }}>
                      {step.attempts}×
                    </span>
                  )}
                  {step.uncertain && (
                    <span style={{ fontSize:8, color:"#4d9de0", background:"#0a1520", border:"0.5px solid #4d9de060", borderRadius:3, padding:"1px 4px" }}>
                      ?
                    </span>
                  )}
                  {step.screenshot && <span style={{ fontSize:9, color:"#2d6aad" }}>📷</span>}
                </div>
              </div>

              {/* Error message */}
              {step.error && step.status === "fail" && (
                <div style={{ fontSize:9, color:"#ff6b6b", paddingLeft:23, lineHeight:1.5, marginTop:2 }}>
                  ✗ {step.error.slice(0, 80)}
                </div>
              )}

              {/* Observation from AI vision */}
              {step.observation && step.status !== "fail" && !step.error && (
                <div style={{ fontSize:9, color:"#4a7fa5", paddingLeft:23, lineHeight:1.5, marginTop:2, fontStyle:"italic" }}>
                  {step.observation.slice(0, 80)}
                </div>
              )}

              {/* Recovery action */}
              {step.recoveryAction && (
                <div style={{ fontSize:9, color:"#f0c040", paddingLeft:23, lineHeight:1.5, marginTop:2 }}>
                  ↺ recovered via: {step.recoveryAction.slice(0, 60)}
                </div>
              )}

              {/* Deferred recheck evidence */}
              {step.recheckEvidence && (
                <div style={{ fontSize:9, color:"#7ec8ff", paddingLeft:23, lineHeight:1.5, marginTop:2 }}>
                  ◈ confirmed later: {step.recheckEvidence.slice(0, 60)}
                </div>
              )}

              {/* Running animation */}
              {isActive && (
                <div style={{ display:"flex", gap:3, paddingLeft:23, marginTop:4 }}>
                  {[0,.15,.3].map((d,j) => (
                    <div key={j} style={{ width:4, height:4, borderRadius:"50%", background:"#ffaa44", animation:`pulse 0.8s ${d}s infinite` }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {runPhase === "running" && steps.length === 0 && (
          <div style={{ display:"flex", gap:3, padding:"8px 14px" }}>
            {[0,.2,.4].map((d,i) => <div key={i} style={{ width:4,height:4,borderRadius:"50%",background:"#ffaa44",animation:`pulse 0.8s ${d}s infinite` }}/>)}
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
                <span>{a.passed?"✓":"✗"}</span>
                <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.assertion}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Final summary */}
      {runPhase === "done" && (
        <div style={{ padding:"10px 12px", borderTop:"0.5px solid #1e3a5f" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5 }}>
            <div style={{ background:"#0a2010", border:"0.5px solid #4caf50", borderRadius:5, padding:"5px 0", textAlign:"center", fontSize:10, color:"#7ec87f" }}>
              {assertions.filter(a => a.passed).length} passed
            </div>
            <div style={{ background:"#1a0808", border:"0.5px solid #ff3b3b", borderRadius:5, padding:"5px 0", textAlign:"center", fontSize:10, color:"#ff6b6b" }}>
              {assertions.filter(a => !a.passed).length} failed
            </div>
          </div>
          {recovered > 0 && (
            <div style={{ marginTop:5, background:"#1a1500", border:"0.5px solid #f0c040", borderRadius:5, padding:"4px 8px", textAlign:"center", fontSize:9, color:"#f0c040" }}>
              ↺ {recovered} step(s) auto-recovered
            </div>
          )}
          {uncertain > 0 && (
            <div style={{ marginTop:5, background:"#0a1520", border:"0.5px solid #4d9de0", borderRadius:5, padding:"4px 8px", textAlign:"center", fontSize:9, color:"#4d9de0" }}>
              ◈ {uncertain} step(s) uncertain — ran but unconfirmed
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{ fontSize:8, fontWeight:600, padding:"2px 6px", borderRadius:3, background:`${color}15`, border:`0.5px solid ${color}60`, color }}>
      {label}
    </span>
  );
}
