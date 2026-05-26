import { RunnerView }   from "../runner/RunnerView.jsx";
import { ApiAgentView } from "../api/ApiAgentView.jsx";

export function RunView({ runner, disc, activeTab, setActiveTab, onBack, onGoToResults }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 44px)" }}>
      {/* Sub-tabs */}
      <div style={{ background:"#090d11", borderBottom:"0.5px solid #1e3a5f", padding:"0 18px", display:"flex", alignItems:"stretch", height:38, flexShrink:0 }}>
        {[["runner","▶ Browser Runner"],["api","🔌 API Agent"]].map(([t, l]) => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ background:"none", border:"none", borderBottom:activeTab===t?"2px solid #4d9de0":"2px solid transparent", color:activeTab===t?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"0 14px", fontFamily:"inherit", fontWeight:activeTab===t?600:400 }}>
            {l}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <button className="nb" onClick={onBack} style={{ fontSize:9, alignSelf:"center", padding:"3px 10px" }}>← Discovery</button>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:"hidden" }}>
        {activeTab === "runner" && (
          <RunnerView runner={runner} onBack={onBack} onGoToResults={onGoToResults} hideHeader />
        )}
        {activeTab === "api" && <ApiAgentView />}
      </div>
    </div>
  );
}
