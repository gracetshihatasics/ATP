import { VaultView }           from "../vault/VaultView.jsx";
import { GitIntegrationPanel } from "../git/GitIntegrationPanel.jsx";
import { MCPSetupPanel }       from "../integrations/MCPSetupPanel.jsx";

export function SettingsView({ activeTab, setActiveTab }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 44px)" }}>
      {/* Sub-tabs */}
      <div style={{ background:"#090d11", borderBottom:"0.5px solid #1e3a5f", padding:"0 18px", display:"flex", alignItems:"stretch", height:38, flexShrink:0 }}>
        {[
          ["vault", "🔐 Vault",          "Credentials &amp; test users"],
          ["git",   "⚙ Git / CI",        "GitHub webhook · PR automation"],
          ["mcp",   "🤖 Claude Desktop", "MCP server config"],
        ].map(([t, l, hint]) => (
          <button key={t} onClick={() => setActiveTab(t)}
            style={{ background:"none", border:"none", borderBottom:activeTab===t?"2px solid #4d9de0":"2px solid transparent", color:activeTab===t?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"0 16px", fontFamily:"inherit", fontWeight:activeTab===t?600:400, display:"flex", flexDirection:"column", justifyContent:"center", gap:2 }}>
            <span dangerouslySetInnerHTML={{ __html:l }} />
            {activeTab === t && <span style={{ fontSize:8, color:"#2d6aad", fontWeight:400 }} dangerouslySetInnerHTML={{ __html:hint }} />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:"hidden" }}>
        {activeTab === "vault" && <VaultView />}
        {activeTab === "git"   && <GitIntegrationPanel />}
        {activeTab === "mcp"   && <div style={{ overflowY:"auto", height:"100%" }}><MCPSetupPanel /></div>}
      </div>
    </div>
  );
}
