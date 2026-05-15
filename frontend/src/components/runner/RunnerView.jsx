import { StepsPanel }           from "./StepsPanel.jsx";
import { BrowserView, Lightbox } from "./BrowserView.jsx";
import { LogPanel }             from "../shared/LogPanel.jsx";

export function RunnerView({ runner, onBack, onGoToResults }) {
  const {
    runLog, runLogRef,
    runPhase, steps, currentStep,
    screenshots, viewShot, setViewShot,
    assertions, suiteProgress, runTarget,
    lastRunId, stopRun,
  } = runner;

  return (
    <>
      <div style={{ display:"flex", height:"calc(100vh - 44px)" }}>
        <StepsPanel
          steps={steps} currentStep={currentStep}
          runPhase={runPhase} runTarget={runTarget}
          suiteProgress={suiteProgress} assertions={assertions}
          onStopRun={stopRun} onBack={onBack}
        />

        <BrowserView screenshots={screenshots} runPhase={runPhase} onClickShot={setViewShot} />

        {/* Run log + result link */}
        <div style={{ width:260, flexShrink:0, display:"flex", flexDirection:"column", background:"#090d11" }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"5px 12px", borderBottom:"0.5px solid #1e3a5f", textTransform:"uppercase" }}>Run Log</div>
          <LogPanel log={runLog} logRef={runLogRef} isLoading={runPhase==="running"} emptyText="Run log will appear here" />

          {/* Connection 4: show run ID + link to Results after completion */}
          {runPhase === "done" && (
            <div style={{ padding:"10px 12px", borderTop:"0.5px solid #1e3a5f", background:"#0a0e12" }}>
              {lastRunId && (
                <div style={{ fontSize:9, color:"#2d6aad", marginBottom:7, fontFamily:"'IBM Plex Mono',monospace" }}>
                  Run ID: <span style={{ color:"#4a7fa5" }}>{lastRunId}</span>
                </div>
              )}
              <button className="rb" onClick={onGoToResults} style={{ width:"100%", textAlign:"center", fontSize:11 }}>
                📊 View in Results →
              </button>
              <div style={{ display:"flex", gap:6, marginTop:6 }}>
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
      </div>

      <Lightbox src={viewShot} onClose={() => setViewShot(null)} />
    </>
  );
}
