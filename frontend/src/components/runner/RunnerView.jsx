import { StepsPanel } from "./StepsPanel.jsx";
import { BrowserView, Lightbox } from "./BrowserView.jsx";
import { LogPanel }  from "../shared/LogPanel.jsx";

export function RunnerView({ runner, onBack }) {
  const {
    runLog, runLogRef,
    runPhase, steps, currentStep,
    screenshots, viewShot, setViewShot,
    assertions, suiteProgress, runTarget,
    stopRun,
  } = runner;

  return (
    <>
      <div style={{ display:"flex", height:"calc(100vh - 44px)" }}>
        <StepsPanel
          steps={steps}
          currentStep={currentStep}
          runPhase={runPhase}
          runTarget={runTarget}
          suiteProgress={suiteProgress}
          assertions={assertions}
          onStopRun={stopRun}
          onBack={onBack}
        />

        <BrowserView
          screenshots={screenshots}
          runPhase={runPhase}
          onClickShot={setViewShot}
        />

        {/* Run log */}
        <div style={{ width:260, flexShrink:0, display:"flex", flexDirection:"column", background:"#090d11" }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"5px 12px", borderBottom:"0.5px solid #1e3a5f", textTransform:"uppercase" }}>Run Log</div>
          <LogPanel log={runLog} logRef={runLogRef} isLoading={runPhase==="running"} emptyText="Run log will appear here" />
        </div>
      </div>

      <Lightbox src={viewShot} onClose={() => setViewShot(null)} />
    </>
  );
}
