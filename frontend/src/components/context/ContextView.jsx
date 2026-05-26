import { TestbedView }        from "../testbed/TestbedView.jsx";
import { IntegrationsPanel }  from "../integrations/IntegrationsPanel.jsx";

export function ContextView({ activeTab, setActiveTab, url }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 44px)" }}>
      {/* Sub-tabs */}
      <div style={{ background:"#090d11", borderBottom:"0.5px solid #1e3a5f", padding:"0 18px", display:"flex", alignItems:"stretch", height:38, flexShrink:0 }}>
        {[
          ["repos",        "🐙 GitHub Repos",    "Test suites · code context · push target"],
          ["integrations", "🔗 Integrations",    "Jira · Confluence · DB · Notion · REST · Miro"],
        ].map(([t, l, hint]) => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ background:"none", border:"none", borderBottom:activeTab===t?"2px solid #4d9de0":"2px solid transparent", color:activeTab===t?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"0 16px", fontFamily:"inherit", fontWeight:activeTab===t?600:400, display:"flex", flexDirection:"column", justifyContent:"center", gap:2 }}>
            <span>{l}</span>
            {activeTab === t && <span style={{ fontSize:8, color:"#2d6aad", fontWeight:400 }}>{hint}</span>}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ fontSize:9, color:"#2d6aad", alignSelf:"center", paddingRight:4 }}>
          All sources feed context into Discovery &amp; Generation
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:"hidden" }}>
        {activeTab === "repos"        && <TestbedView />}
        {activeTab === "integrations" && <IntegrationsPanel url={url} />}
      </div>
    </div>
  );
}
