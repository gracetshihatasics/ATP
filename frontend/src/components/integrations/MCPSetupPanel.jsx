import { useState, useEffect } from "react";

const BACKEND = "http://localhost:3579";

export function MCPSetupPanel() {
  const [setup, setSetup]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled]   = useState(false);
  const [installError, setInstallError] = useState(null);
  const [copied, setCopied]     = useState(false);

  useEffect(() => { loadSetup(); }, []);

  const loadSetup = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${BACKEND}/api/mcp/setup`);
      const data = await res.json();
      setSetup(data);
    } catch {} finally { setLoading(false); }
  };

  const install = async () => {
    setInstalling(true); setInstallError(null);
    try {
      const res  = await fetch(`${BACKEND}/api/mcp/install`, { method: "POST" });
      const data = await res.json();
      if (data.ok) { setInstalled(true); loadSetup(); }
      else setInstallError(data.error);
    } catch (e) { setInstallError(e.message); }
    setInstalling(false);
  };

  const copyConfig = () => {
    if (!setup?.mcpConfig) return;
    const json = JSON.stringify(setup.mcpConfig, null, 2);
    navigator.clipboard?.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div style={{ padding:24, color:"#2d6aad", fontSize:11 }}>Loading MCP setup...</div>;
  if (!setup)  return <div style={{ padding:24, color:"#ff6b6b", fontSize:11 }}>Could not load MCP setup — is the backend running?</div>;

  const configJson = JSON.stringify(setup.mcpConfig, null, 2);

  return (
    <div style={{ padding:"20px 28px", maxWidth:680, fontFamily:"'IBM Plex Mono',monospace" }}>
      <div style={{ fontSize:15, fontWeight:600, color:"#e0f0ff", marginBottom:4 }}>
        🤖 Claude Desktop MCP Setup
      </div>
      <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:24, lineHeight:1.8 }}>
        Connect ATP to Claude Desktop so you can run tests, check results, and discover use cases
        directly in any Claude conversation — no browser needed.
      </div>

      {/* Status */}
      <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", marginBottom:16, background:"#0d1520" }}>
        <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Configuration Status</div>
        {[
          ["MCP server file",    setup.serverPath, true],
          ["Node.js path",       setup.nodePath,   true],
          ["Config file",        setup.configPath, setup.configExists],
          ["ATP already added",  setup.configExists ? "Yes — restart Claude Desktop" : "Not yet", setup.configExists],
        ].map(([l, v, ok]) => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:ok?"#4caf50":"#f0c040", flexShrink:0 }} />
            <span style={{ fontSize:10, color:"#a0c0d8", minWidth:160 }}>{l}</span>
            <span style={{ fontSize:9, color:"#4a7fa5", fontFamily:"'IBM Plex Mono',monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* One-click install */}
      <div style={{ border:"0.5px solid #4caf5050", borderRadius:8, padding:"16px 18px", marginBottom:16, background:"#0a1a0a" }}>
        <div style={{ fontSize:11, fontWeight:600, color:"#4caf50", marginBottom:8 }}>Option A — One-click install</div>
        <div style={{ fontSize:10, color:"#6a9ab8", marginBottom:12, lineHeight:1.8 }}>
          ATP writes directly to your Claude Desktop config file. Then restart Claude Desktop.
        </div>
        {installed && (
          <div style={{ fontSize:11, color:"#4caf50", background:"#0a2010", borderRadius:5, padding:"8px 12px", marginBottom:10, border:"0.5px solid #4caf50" }}>
            ✓ Installed! Restart Claude Desktop to activate ATP tools.
          </div>
        )}
        {installError && (
          <div style={{ fontSize:10, color:"#ff6b6b", background:"#1a0808", borderRadius:5, padding:"8px 12px", marginBottom:10, border:"0.5px solid #ff3b3b" }}>
            ✗ {installError}
          </div>
        )}
        <button onClick={install} disabled={installing}
          style={{ background:"linear-gradient(135deg,#0a3020,#0a1a0a)", border:"0.5px solid #4caf50", borderRadius:6, color:installing?"#2d6aad":"#7ec87f", cursor:installing?"default":"pointer", fontSize:11, fontWeight:600, padding:"9px 20px", fontFamily:"inherit", letterSpacing:"0.06em" }}>
          {installing ? "◈ Installing..." : installed ? "✓ Re-install" : "▶ Install to Claude Desktop"}
        </button>
      </div>

      {/* Manual config */}
      <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"16px 18px", marginBottom:16, background:"#0d1520" }}>
        <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:8 }}>Option B — Manual config</div>
        <div style={{ fontSize:10, color:"#6a9ab8", marginBottom:10, lineHeight:1.8 }}>
          Open your Claude Desktop config file and add or merge this JSON:
          <br/>
          <code style={{ color:"#c8a0f0", fontSize:9 }}>{setup.configPath}</code>
        </div>
        <div style={{ position:"relative" }}>
          <pre style={{ fontSize:10, color:"#a0d0e8", background:"#060a0d", borderRadius:5, padding:14, margin:0, whiteSpace:"pre", overflowX:"auto", lineHeight:1.7, fontFamily:"'IBM Plex Mono',monospace" }}>
            {configJson}
          </pre>
          <button onClick={copyConfig}
            style={{ position:"absolute", top:8, right:8, background:"#1a3050", border:"0.5px solid #4d9de0", borderRadius:4, color:copied?"#4caf50":"#7ec8ff", cursor:"pointer", fontSize:9, padding:"3px 10px", fontFamily:"inherit" }}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <div style={{ fontSize:9, color:"#2d6aad", marginTop:8 }}>
          After saving the file, fully restart Claude Desktop (Cmd+Q on Mac, not just close).
        </div>
      </div>

      {/* Available tools */}
      <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"16px 18px", marginBottom:16, background:"#0d1520" }}>
        <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Available Tools ({setup.tools?.length})</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
          {[
            ["discover_usecases",      "Discover test cases for any URL"],
            ["run_usecase",            "Run a single test in real browser"],
            ["run_suite",              "Run multiple tests as a suite"],
            ["get_results",            "Get recent test results & summary"],
            ["analyse_failure",        "AI root cause analysis on failure"],
            ["list_credentials",       "List vault credentials"],
            ["get_context",            "Get integration context for a URL"],
            ["update_tests_from_diff", "Update tests from a git diff"],
            ["scan_code_intelligence", "Scan for hidden/dead code"],
          ].map(([tool, desc]) => (
            <div key={tool} style={{ background:"#0a0e12", borderRadius:5, padding:"7px 10px" }}>
              <div style={{ fontSize:9, fontWeight:600, color:"#c8a0f0", marginBottom:2 }}>{tool}</div>
              <div style={{ fontSize:8, color:"#4a7fa5" }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Example prompts */}
      <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"16px 18px", background:"#0d1520" }}>
        <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Example Claude Prompts</div>
        {(setup.examplePrompts || []).map((p, i) => (
          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"5px 0", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer" }}
            onClick={() => navigator.clipboard?.writeText(p)}>
            <span style={{ color:"#c8a0f0", fontSize:12, flexShrink:0 }}>›</span>
            <span style={{ fontSize:11, color:"#a0c8e0", fontStyle:"italic" }}>"{p}"</span>
          </div>
        ))}
        <div style={{ fontSize:8, color:"#2d6aad", marginTop:8 }}>Click any prompt to copy it</div>
      </div>
    </div>
  );
}
