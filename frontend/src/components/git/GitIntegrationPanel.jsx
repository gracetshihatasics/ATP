import { useState, useEffect, useRef } from "react";

const BACKEND = "http://localhost:3579";

const RISK_C = {
  critical: { color:"#ff3b3b", bg:"#1a0808", icon:"🔴" },
  high:     { color:"#ff8c00", bg:"#1a1000", icon:"🟠" },
  medium:   { color:"#f0c040", bg:"#1a1500", icon:"🟡" },
  low:      { color:"#4caf50", bg:"#0a2010", icon:"🟢" },
};

const PHASES = {
  setup:      "Setting up...",
  diff:       "Fetching changes...",
  analysis:   "◈ AI analysing diff...",
  update:     "Reviewing existing tests...",
  generating: "🧪 Generating test files...",
  testing:    "Running tests...",
  reporting:  "Posting to GitHub...",
  done:       "Complete",
  error:      "Error",
};

export function GitIntegrationPanel() {
  const [cfg, setCfg]           = useState(null);
  const [runs, setRuns]         = useState([]);
  const [selected, setSelected] = useState(null);
  const [view, setView]         = useState("setup"); // setup | runs | detail
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [tunnelStatus, setTunnelStatus] = useState(null);
  const [tunnelStarting, setTunnelStarting] = useState(false);
  const [repos, setRepos]       = useState([]);
  const [trigForm, setTrigForm] = useState({ repoFullName:"", prNumber:"1", branchFrom:"feature/my-feature", branchTo:"main" });
  const [triggering, setTrig]   = useState(false);
  const logRef = useRef(null);

  // Form state mirrors config
  const [form, setForm] = useState({
    githubToken: "", webhookSecret: "", atpBaseUrl: "",
    autoRunOnPR: true, maxTestsPerRun: 10,
  });

  useEffect(() => {
    loadConfig();
    loadRuns();
    const iv = setInterval(() => { loadRuns(); loadTunnel(); }, 4000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (selected) setTimeout(() => logRef.current?.scrollTo({ top:99999, behavior:"smooth" }), 50);
  }, [selected?.log?.length]);

  const loadConfig = async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/git/config`);
      const data = await res.json();
      setCfg(data);
      setTunnelStatus(data.tunnel);
      // Don't overwrite form if user is editing
      setForm(prev => ({
        ...prev,
        atpBaseUrl:    data.config?.atpBaseUrl    || prev.atpBaseUrl,
        autoRunOnPR:   data.config?.autoRunOnPR   ?? true,
        maxTestsPerRun: data.config?.maxTestsPerRun || 10,
      }));
    } catch {}
  };

  const loadTunnel = async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/git/tunnel/status`);
      const data = await res.json();
      setTunnelStatus(data);
    } catch {}
  };

  const loadRuns = async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/git/runs`);
      const data = await res.json();
      setRuns(data.runs || []);
      if (selected) {
        const fresh = data.runs?.find(r => r.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch {}
  };

  const saveConfig = async () => {
    setSaving(true); setSaved(false);
    try {
      const payload = { ...form };
      // Don't send masked values back
      if (!payload.githubToken || payload.githubToken.includes("...")) delete payload.githubToken;
      if (!payload.webhookSecret || payload.webhookSecret.includes("•")) delete payload.webhookSecret;
      await fetch(`${BACKEND}/api/git/config`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      loadConfig();
    } catch {} finally { setSaving(false); }
  };

  const verifyToken = async () => {
    if (!form.githubToken || form.githubToken.includes("...")) return;
    setVerifying(true); setVerifyResult(null);
    try {
      const res  = await fetch(`${BACKEND}/api/git/verify-token`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: form.githubToken }),
      });
      const data = await res.json();
      setVerifyResult(data);
      if (data.ok) {
        const repoRes  = await fetch(`${BACKEND}/api/git/repos`);
        const repoData = await repoRes.json();
        setRepos(repoData.repos || []);
        if (repoData.repos?.length) setTrigForm(p => ({ ...p, repoFullName: repoData.repos[0].fullName }));
      }
    } catch {} finally { setVerifying(false); }
  };

  const startTunnel = async (provider) => {
    setTunnelStarting(true);
    try {
      const res  = await fetch(`${BACKEND}/api/git/tunnel/start`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (data.ok) {
        setTunnelStatus({ status: "active", url: data.url });
        setForm(p => ({ ...p, atpBaseUrl: data.url }));
        await fetch(`${BACKEND}/api/git/config`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ atpBaseUrl: data.url, tunnelUrl: data.url }),
        });
      }
    } catch {} finally { setTunnelStarting(false); loadConfig(); }
  };

  const stopTunnel = async () => {
    await fetch(`${BACKEND}/api/git/tunnel/stop`, { method: "POST" });
    setTunnelStatus({ status: "stopped", url: null });
    loadConfig();
  };

  const triggerRun = async () => {
    if (!trigForm.repoFullName) return;
    setTrig(true);
    try {
      const res  = await fetch(`${BACKEND}/api/git/trigger`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(trigForm),
      });
      const data = await res.json();
      if (data.ok) { setTimeout(() => { loadRuns(); setView("runs"); }, 600); }
    } catch {} finally { setTrig(false); }
  };

  const isSetupComplete = cfg?.hasToken && cfg?.hasSecret && cfg?.hasBaseUrl;

  return (
    <div style={{ display:"flex", height:"calc(100vh - 44px)", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* ── Sidebar ── */}
      <div style={{ width:220, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
        <div style={{ padding:"12px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:4 }}>🔗 Git / CI</div>
          <div style={{ fontSize:9, color:"#4a7fa5" }}>Auto-test on every PR</div>
        </div>

        {/* Status dots */}
        <div style={{ padding:"10px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
          {[
            ["GitHub Token",   cfg?.hasToken,   "Connect your account"],
            ["Webhook Secret", cfg?.hasSecret,  "Secure the webhook"],
            ["Public URL",     cfg?.hasBaseUrl, "Expose ATP to GitHub"],
          ].map(([l, ok, hint]) => (
            <div key={l} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:7 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:ok?"#4caf50":"#ff3b3b", flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:ok?"#a0c8a0":"#c8a0a0" }}>{l}</div>
                {!ok && <div style={{ fontSize:8, color:"#4a7fa5" }}>{hint}</div>}
              </div>
            </div>
          ))}
          {isSetupComplete && (
            <div style={{ marginTop:5, fontSize:10, color:"#4caf50", textAlign:"center", background:"#0a2010", borderRadius:4, padding:"4px 0" }}>✓ Ready</div>
          )}
        </div>

        {/* Nav */}
        <div style={{ padding:"8px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
          {[["setup","⚙ Setup"],["runs",`▶ PR Runs (${runs.length})`]].map(([v,l]) => (
            <button key={v} onClick={() => { setView(v); if (v==="runs") setSelected(null); }}
              style={{ display:"block", width:"100%", textAlign:"left", background:view===v&&v!=="detail"?"#1a3050":"none", border:"none", borderRadius:4, color:view===v&&v!=="detail"?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"5px 8px", fontFamily:"inherit", marginBottom:2 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Tunnel status */}
        <div style={{ padding:"10px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6 }}>Tunnel</div>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:tunnelStatus?.status==="active"?"#4caf50":"#ff3b3b", animation:tunnelStatus?.status==="active"?"pulse 2s infinite":"none" }} />
            <span style={{ fontSize:10, color:tunnelStatus?.status==="active"?"#7ec87f":"#6a4a4a" }}>
              {tunnelStatus?.status === "active" ? "Active" : "Inactive"}
            </span>
          </div>
          {tunnelStatus?.url && <div style={{ fontSize:8, color:"#c8a0f0", wordBreak:"break-all", marginBottom:6 }}>{tunnelStatus.url}</div>}
          {tunnelStatus?.status === "active"
            ? <button onClick={stopTunnel} style={{ width:"100%", background:"none", border:"0.5px solid #ff3b3b", borderRadius:4, color:"#ff6b6b", cursor:"pointer", fontSize:9, padding:"4px 0", fontFamily:"inherit" }}>⏹ Stop Tunnel</button>
            : <button onClick={() => startTunnel("localtunnel")} disabled={tunnelStarting}
                style={{ width:"100%", background:"linear-gradient(135deg,#0a1a30,#0a0a20)", border:"0.5px solid #4d9de0", borderRadius:4, color:tunnelStarting?"#2d6aad":"#7ec8ff", cursor:tunnelStarting?"default":"pointer", fontSize:9, padding:"4px 0", fontFamily:"inherit" }}>
                {tunnelStarting ? "◈ Starting..." : "▶ Start Tunnel"}
              </button>
          }
        </div>

        {/* Webhook URL */}
        <div style={{ padding:"10px 14px", flex:1 }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:5 }}>Webhook URL</div>
          <div style={{ fontSize:8, color:"#c8a0f0", wordBreak:"break-all", lineHeight:1.7, cursor:"pointer",
            background:"#0a0a1e", borderRadius:4, padding:"5px 7px", border:"0.5px solid #2d1a5a" }}
            onClick={() => navigator.clipboard?.writeText(cfg?.webhookUrl || "")}
            title="Click to copy">
            {cfg?.webhookUrl || "Configure URL first"}
          </div>
          <div style={{ fontSize:8, color:"#1e3a5f", marginTop:3 }}>Click to copy · paste in GitHub → Settings → Webhooks</div>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, overflowY:"auto" }}>

        {/* ══ SETUP ════════════════════════════════════════════════════════════ */}
        {view === "setup" && (
          <div style={{ padding:"20px 28px", maxWidth:600 }}>
            <div style={{ fontSize:15, fontWeight:600, color:"#e0f0ff", marginBottom:4 }}>GitHub Integration Setup</div>
            <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:24 }}>
              Configure once — ATP auto-tests every PR after that.
            </div>

            {/* Step 1: Token */}
            <SetupCard step={1} title="Connect GitHub Account" done={cfg?.hasToken} icon="🔑">
              <div style={{ fontSize:10, color:"#6a9ab8", marginBottom:10, lineHeight:1.8 }}>
                Generate a token at <span style={{ color:"#c8a0f0" }}>GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens</span><br/>
                Scopes needed: <Tag>repo</Tag> <Tag>pull_requests</Tag> <Tag>statuses</Tag>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <input
                  type="password" placeholder="ghp_xxxxxxxxxxxx"
                  value={form.githubToken}
                  onChange={e => { setForm(p => ({ ...p, githubToken: e.target.value })); setVerifyResult(null); }}
                  style={inp} />
                <button onClick={verifyToken} disabled={verifying || !form.githubToken || form.githubToken.includes("...")}
                  style={{ background:"#0d1520", border:"0.5px solid #4d9de0", borderRadius:5, color:verifying?"#2d6aad":"#7ec8ff", cursor:"pointer", fontSize:10, padding:"0 12px", fontFamily:"inherit", flexShrink:0, whiteSpace:"nowrap" }}>
                  {verifying ? "Checking..." : "Verify →"}
                </button>
              </div>
              {verifyResult?.ok && (
                <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:8, background:"#0a2010", borderRadius:5, padding:"8px 12px" }}>
                  {verifyResult.avatar && <img src={verifyResult.avatar} style={{ width:24, height:24, borderRadius:"50%" }} alt="" />}
                  <div>
                    <div style={{ fontSize:10, color:"#4caf50" }}>✓ Connected as @{verifyResult.login}</div>
                    {verifyResult.name && <div style={{ fontSize:9, color:"#4a7fa5" }}>{verifyResult.name}</div>}
                  </div>
                </div>
              )}
              {verifyResult?.ok === false && (
                <div style={{ marginTop:8, fontSize:10, color:"#ff6b6b", background:"#1a0808", borderRadius:5, padding:"6px 10px" }}>✗ Invalid token — check scopes and try again</div>
              )}
            </SetupCard>

            {/* Step 2: Webhook secret */}
            <SetupCard step={2} title="Set Webhook Secret" done={cfg?.hasSecret} icon="🔐">
              <div style={{ fontSize:10, color:"#6a9ab8", marginBottom:10, lineHeight:1.8 }}>
                Choose any secret string. ATP uses it to verify that webhooks really come from GitHub.
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <input type="password" placeholder="my-super-secret-123"
                  value={form.webhookSecret}
                  onChange={e => setForm(p => ({ ...p, webhookSecret: e.target.value }))}
                  style={inp} />
                <button onClick={() => setForm(p => ({ ...p, webhookSecret: crypto.randomUUID().replace(/-/g,"").slice(0,24) }))}
                  style={{ background:"#0d1520", border:"0.5px solid #2d6aad", borderRadius:5, color:"#4a7fa5", cursor:"pointer", fontSize:10, padding:"0 10px", fontFamily:"inherit", flexShrink:0, whiteSpace:"nowrap" }}>
                  Generate
                </button>
              </div>
              <div style={{ fontSize:9, color:"#2d6aad", marginTop:6 }}>You'll paste this same value in GitHub → Repo Settings → Webhooks</div>
            </SetupCard>

            {/* Step 3: Public URL (tunnel) */}
            <SetupCard step={3} title="Expose ATP to GitHub" done={cfg?.hasBaseUrl} icon="🌐">
              <div style={{ fontSize:10, color:"#6a9ab8", marginBottom:12, lineHeight:1.8 }}>
                GitHub needs a public URL to send webhooks to. Use our one-click tunnel for local development.
              </div>

              {/* Tunnel option */}
              <div style={{ border:"0.5px solid #1e3a5f", borderRadius:7, padding:"12px 14px", marginBottom:10, background:"#0a1520" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:600, color:"#b0d0f0" }}>One-click Tunnel</div>
                    <div style={{ fontSize:9, color:"#4a7fa5" }}>Free · no install needed · powered by localtunnel</div>
                  </div>
                  {tunnelStatus?.status === "active"
                    ? <button onClick={stopTunnel} style={{ background:"#1a0808", border:"0.5px solid #ff3b3b", borderRadius:5, color:"#ff6b6b", cursor:"pointer", fontSize:10, padding:"5px 12px", fontFamily:"inherit" }}>Stop</button>
                    : <button onClick={() => startTunnel("localtunnel")} disabled={tunnelStarting}
                        style={{ background:"linear-gradient(135deg,#0a1a30,#0a0a20)", border:"0.5px solid #4d9de0", borderRadius:5, color:tunnelStarting?"#2d6aad":"#7ec8ff", cursor:tunnelStarting?"default":"pointer", fontSize:10, padding:"5px 12px", fontFamily:"inherit" }}>
                        {tunnelStarting ? "◈ Starting..." : "▶ Start Tunnel"}
                      </button>
                  }
                </div>
                {tunnelStatus?.status === "active" && tunnelStatus?.url && (
                  <div style={{ fontSize:10, color:"#4caf50", background:"#0a2010", borderRadius:4, padding:"5px 8px" }}>
                    ✓ Active: {tunnelStatus.url}
                  </div>
                )}
              </div>

              {/* Manual URL */}
              <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5 }}>Or enter a public URL manually (ngrok, Railway, Render, etc.):</div>
              <input value={form.atpBaseUrl} onChange={e => setForm(p => ({ ...p, atpBaseUrl: e.target.value }))}
                placeholder="https://your-url.ngrok.io" style={inp} />
            </SetupCard>

            {/* Step 4: GitHub webhook */}
            <SetupCard step={4} title="Add Webhook in GitHub" done={false} icon="🪝">
              <div style={{ fontSize:10, color:"#6a9ab8", lineHeight:1.9 }}>
                1. Go to your repo → <span style={{ color:"#7ec8ff" }}>Settings → Webhooks → Add webhook</span><br/>
                2. Payload URL — click to copy:
              </div>
              <div onClick={() => navigator.clipboard?.writeText(cfg?.webhookUrl || "")}
                style={{ margin:"8px 0", fontSize:10, color:"#c8a0f0", background:"#0a0a1e", borderRadius:5, padding:"8px 12px", cursor:"pointer", border:"0.5px solid #2d1a5a", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ wordBreak:"break-all" }}>{cfg?.webhookUrl || "Save config first"}</span>
                <span style={{ fontSize:9, color:"#4a7fa5", flexShrink:0, marginLeft:8 }}>copy</span>
              </div>
              <div style={{ fontSize:10, color:"#6a9ab8", lineHeight:1.9 }}>
                3. Content type: <Tag>application/json</Tag><br/>
                4. Secret: paste your webhook secret from step 2<br/>
                5. Events: select <Tag>Pull requests</Tag>
              </div>
            </SetupCard>

            {/* Settings */}
            <SetupCard step={5} title="Settings" done={true} icon="⚙️">
              <div style={{ display:"flex", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>Max tests per PR run</div>
                  <input type="number" min={1} max={50} value={form.maxTestsPerRun}
                    onChange={e => setForm(p => ({ ...p, maxTestsPerRun: parseInt(e.target.value)||10 }))}
                    style={{ ...inp, width:"100%" }} />
                </div>
                <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
                  <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:6 }}>
                    <input type="checkbox" checked={form.autoRunOnPR} onChange={e => setForm(p => ({ ...p, autoRunOnPR: e.target.checked }))} />
                    <span style={{ fontSize:10, color:"#a0c0d8" }}>Auto-run on PR open/push</span>
                  </label>
                </div>
              </div>
            </SetupCard>

            {/* Save button */}
            <button onClick={saveConfig} disabled={saving}
              style={{ width:"100%", background:"linear-gradient(135deg,#1a3050,#0d1a30)", border:"0.5px solid #4d9de0", borderRadius:6, color:saved?"#4caf50":saving?"#2d6aad":"#7ec8ff", cursor:saving?"default":"pointer", fontSize:12, fontWeight:600, padding:"12px 0", fontFamily:"inherit", letterSpacing:"0.06em", marginTop:8, transition:"color 0.3s" }}>
              {saved ? "✓ Saved" : saving ? "Saving..." : "Save Configuration"}
            </button>

            {/* Quick test */}
            {isSetupComplete && (
              <div style={{ marginTop:20, border:"0.5px solid #4caf5050", borderRadius:8, padding:"14px 16px", background:"#0a1a0a" }}>
                <div style={{ fontSize:11, fontWeight:600, color:"#4caf50", marginBottom:10 }}>✓ Setup complete — test it</div>
                <div style={{ display:"flex", gap:8 }}>
                  {repos.length > 0
                    ? <select value={trigForm.repoFullName} onChange={e => setTrigForm(p => ({ ...p, repoFullName: e.target.value }))}
                        style={{ ...inp, flex:1 }}>
                        {repos.map(r => <option key={r.fullName} value={r.fullName}>{r.fullName}</option>)}
                      </select>
                    : <input value={trigForm.repoFullName} onChange={e => setTrigForm(p => ({ ...p, repoFullName: e.target.value }))}
                        placeholder="owner/repo" style={{ ...inp, flex:1 }} />
                  }
                  <button onClick={triggerRun} disabled={triggering || !trigForm.repoFullName}
                    style={{ background:"linear-gradient(135deg,#0a2010,#0a1a0a)", border:"0.5px solid #4caf50", borderRadius:5, color:triggering?"#2d6aad":"#4caf50", cursor:triggering?"default":"pointer", fontSize:10, padding:"0 14px", fontFamily:"inherit", flexShrink:0 }}>
                    {triggering ? "◈ Running..." : "▶ Test CI Loop"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ PR RUNS ══════════════════════════════════════════════════════════ */}
        {view === "runs" && !selected && (
          <div style={{ padding:"20px 28px" }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:16 }}>PR Run History</div>
            {runs.length === 0 && (
              <div style={{ textAlign:"center", marginTop:60, color:"#1e3a5f", fontSize:11, lineHeight:2 }}>
                No runs yet.<br/>Complete setup and open a PR — or use "Test CI Loop" in Setup.
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:10 }}>
              {runs.map(run => {
                const rc = RISK_C[run.diffAnalysis?.riskLevel] ?? RISK_C.low;
                const sc = run.status==="pass"?"#4caf50":run.status==="fail"?"#ff3b3b":run.status==="running"?"#c8a0f0":"#ff8c00";
                return (
                  <div key={run.id} onClick={() => { setSelected(run); setView("detail"); }}
                    style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520", cursor:"pointer" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor="#4d9de0"}
                    onMouseLeave={e => e.currentTarget.style.borderColor="#1e3a5f"}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:"#b0d0f0" }}>PR #{run.prNumber}</div>
                        <div style={{ fontSize:9, color:"#6a8aa8" }}>{run.branchFrom} → {run.branchTo}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:3, background:`${sc}20`, border:`0.5px solid ${sc}`, color:sc }}>{run.status}</span>
                        {run.diffAnalysis?.riskLevel && <div style={{ fontSize:9, marginTop:4 }}>{rc.icon} {run.diffAnalysis.riskLevel}</div>}
                      </div>
                    </div>
                    <div style={{ fontSize:10, color:"#a0c0d8", marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{run.prTitle}</div>
                    {run.diffAnalysis?.summary && <div style={{ fontSize:9, color:"#4a7fa5", lineHeight:1.6 }}>{run.diffAnalysis.summary.slice(0,90)}</div>}
                    <div style={{ display:"flex", gap:10, marginTop:8, fontSize:9, color:"#2d6aad" }}>
                      {run.changedFiles?.length > 0 && <span>{run.changedFiles.length} files</span>}
                      {run.affectedTests?.length > 0 && <span>{run.affectedTests.length} tests</span>}
                      {run.duration && <span>{(run.duration/1000).toFixed(1)}s</span>}
                      <span style={{ marginLeft:"auto" }}>@{run.author}</span>
                    </div>
                    {run.status === "running" && (
                      <div style={{ marginTop:8 }}>
                        <div style={{ fontSize:9, color:"#c8a0f0", marginBottom:4 }}>{PHASES[run.phase]}</div>
                        <div style={{ height:2, background:"#1e3a5f", borderRadius:1, overflow:"hidden" }}>
                          <div style={{ height:"100%", background:"#c8a0f0", width:"60%", animation:"pulse 1.5s infinite", borderRadius:1 }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ RUN DETAIL ═══════════════════════════════════════════════════════ */}
        {view === "detail" && selected && (
          <div style={{ padding:"20px 28px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <button className="nb" onClick={() => { setView("runs"); setSelected(null); }} style={{ fontSize:10 }}>← Runs</button>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#e0f0ff" }}>PR #{selected.prNumber} — {selected.prTitle}</div>
                <div style={{ fontSize:9, color:"#4a7fa5" }}>{selected.branchFrom} → {selected.branchTo} · @{selected.author}</div>
              </div>
              {selected.htmlUrl && (
                <a href={selected.htmlUrl} target="_blank" rel="noreferrer"
                  style={{ fontSize:10, color:"#4d9de0", textDecoration:"none", border:"0.5px solid #4d9de0", borderRadius:5, padding:"4px 10px" }}>
                  View PR →
                </a>
              )}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>

              {/* AI Analysis */}
              {selected.diffAnalysis && (() => {
                const rc = RISK_C[selected.diffAnalysis.riskLevel] ?? RISK_C.low;
                return (
                  <div style={{ border:`0.5px solid ${rc.color}50`, borderRadius:8, padding:"14px 16px", background:rc.bg }}>
                    <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>◈ AI Analysis</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <span style={{ fontSize:18 }}>{rc.icon}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:rc.color, textTransform:"uppercase" }}>{selected.diffAnalysis.riskLevel}</span>
                      <span style={{ fontSize:9, color:"#4a7fa5" }}>risk</span>
                    </div>
                    <div style={{ fontSize:11, color:"#a0c0d8", lineHeight:1.7, marginBottom:8 }}>{selected.diffAnalysis.summary}</div>
                    {selected.diffAnalysis.affectedFeatures?.map((f,i) => (
                      <div key={i} style={{ fontSize:9, color:"#4a7fa5", padding:"2px 0" }}>• {f.feature} ({f.confidence}) — {f.reason}</div>
                    ))}
                    {selected.diffAnalysis.concerns?.map((c,i) => (
                      <div key={i} style={{ fontSize:9, color:"#ffaa44", padding:"2px 0" }}>⚠ {c}</div>
                    ))}
                  </div>
                );
              })()}

              {/* Changed files */}
              <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Changed Files ({selected.changedFiles?.length || 0})</div>
                {selected.changedFiles?.slice(0,12).map((f,i) => (
                  <div key={i} style={{ display:"flex", gap:8, padding:"3px 0", borderBottom:"0.5px solid #0d1a2a", fontSize:10 }}>
                    <span style={{ fontSize:8, fontWeight:700, padding:"1px 4px", borderRadius:2, flexShrink:0,
                      background:f.status==="added"?"#0a2010":f.status==="removed"?"#1a0808":"#0a1520",
                      color:f.status==="added"?"#4caf50":f.status==="removed"?"#ff6b6b":"#f0c040" }}>
                      {f.status?.slice(0,3).toUpperCase()}
                    </span>
                    <span style={{ flex:1, color:"#a0c0d8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.filename}</span>
                    <span style={{ fontSize:8, color:"#4a7fa5" }}>+{f.additions}/-{f.deletions}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Affected + new tests */}
            {/* Phase B — ATP generated tests */}
            {(selected.atpPrUrl || selected.generatedFiles?.length > 0) && (
              <div style={{ border:"0.5px solid #4caf5050", borderRadius:8, padding:"14px 16px", marginBottom:12, background:"#0a1a0a" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#4caf50", marginBottom:10 }}>🧪 Phase B — ATP Generated Tests</div>
                {selected.atpPrUrl && (
                  <div style={{ marginBottom:10 }}>
                    <a href={selected.atpPrUrl} target="_blank" rel="noreferrer"
                      style={{ fontSize:11, color:"#4caf50", textDecoration:"none", background:"#0a2010", border:"0.5px solid #4caf50", borderRadius:5, padding:"6px 12px", display:"inline-block" }}>
                      View ATP Test PR →
                    </a>
                  </div>
                )}
                {selected.generatedFiles?.length > 0 && selected.generatedFiles.map((f,i) => (
                  <div key={i} style={{ display:"flex", gap:6, padding:"4px 0", borderBottom:"0.5px solid #0d2a0d", fontSize:10 }}>
                    <span style={{ color:f.action==="created"?"#4caf50":"#f0c040" }}>{f.action==="created"?"✅":"🔄"}</span>
                    <span style={{ color:"#a0d0a0" }}>{f.fileName || f.path}</span>
                  </div>
                ))}
                {!selected.atpPrUrl && (
                  <div style={{ fontSize:9, color:"#4a7fa5", marginTop:6 }}>
                    Tests saved locally. Connect a test repo in 🧪 Repos to enable auto-push.
                  </div>
                )}
              </div>
            )}

            {/* Affected + new tests */}
            {(selected.affectedTests?.length > 0 || selected.newTests?.length > 0) && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                {selected.affectedTests?.length > 0 && (
                  <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
                    <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Affected Tests</div>
                    {selected.affectedTests.map((t,i) => (
                      <div key={i} style={{ padding:"4px 0", borderBottom:"0.5px solid #0d1a2a", fontSize:10 }}>
                        <div style={{ display:"flex", gap:6 }}>
                          <span style={{ color:t.isBroken?"#ff6b6b":t.updateStatus==="updated"?"#f0c040":"#4caf50" }}>
                            {t.isBroken?"💔":t.updateStatus==="updated"?"🔄":"✓"}
                          </span>
                          <span style={{ color:"#a0c0d8" }}>{t.name}</span>
                        </div>
                        {t.isBroken && <div style={{ fontSize:9, color:"#ff6b6b", paddingLeft:18 }}>{t.brokenReason}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {selected.newTests?.length > 0 && (
                  <div style={{ border:"0.5px solid #4caf5050", borderRadius:8, padding:"14px 16px", background:"#0a1a0a" }}>
                    <div style={{ fontSize:10, fontWeight:600, color:"#4caf50", marginBottom:10 }}>➕ New Tests Suggested</div>
                    {selected.newTests.map((t,i) => (
                      <div key={i} style={{ padding:"4px 0", borderBottom:"0.5px solid #0d2a0d", fontSize:10 }}>
                        <div style={{ color:"#a0d0a0" }}>{t.title}</div>
                        <div style={{ fontSize:9, color:"#4a7fa5" }}>{t.priority} · {t.reason}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Log */}
            <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, overflow:"hidden" }}>
              <div style={{ padding:"8px 14px", borderBottom:"0.5px solid #1e3a5f", fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", textTransform:"uppercase", display:"flex", justifyContent:"space-between" }}>
                <span>Run Log</span>
                <span style={{ color:selected.status==="running"?"#c8a0f0":selected.status==="pass"?"#4caf50":"#ff6b6b" }}>
                  {selected.status==="running" ? `● ${PHASES[selected.phase]}` : selected.status?.toUpperCase()}
                  {selected.duration ? ` · ${(selected.duration/1000).toFixed(1)}s` : ""}
                </span>
              </div>
              <div ref={logRef} style={{ maxHeight:260, overflowY:"auto", padding:"8px 12px", background:"#0a0e12" }}>
                {(selected.log||[]).map((l,i) => (
                  <div key={i} style={{ fontSize:9, marginBottom:3, lineHeight:1.6,
                    color:l.level==="error"?"#ff6b6b":l.level==="success"?"#7ec87f":l.level==="warn"?"#ffaa44":l.level==="ai"?"#c8a0f0":l.level==="system"?"#4a7fa5":"#6a8aa8" }}>
                    {l.level==="error"?"✗":l.level==="success"?"✓":l.level==="ai"?"◈":"›"} {l.msg}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────
function SetupCard({ step, title, done, icon, children }) {
  return (
    <div style={{ border:`0.5px solid ${done?"#4caf5050":"#1e3a5f"}`, borderRadius:8, padding:"16px 18px", marginBottom:12, background: done?"#0a1a0a":"#0d1520" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div style={{ width:24, height:24, borderRadius:"50%", background:done?"#0a2010":"#1a3050", border:`0.5px solid ${done?"#4caf50":"#4d9de0"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:done?"#4caf50":"#7ec8ff", flexShrink:0 }}>
          {done ? "✓" : step}
        </div>
        <span style={{ fontSize:13, fontWeight:600, color:done?"#a0d0a0":"#b0d0f0" }}>{title}</span>
        <span style={{ marginLeft:"auto" }}>{icon}</span>
      </div>
      {children}
    </div>
  );
}

function Tag({ children }) {
  return <code style={{ background:"#0a0a1e", border:"0.5px solid #2d1a5a", borderRadius:3, padding:"1px 5px", color:"#c8a0f0", fontSize:9 }}>{children}</code>;
}

const inp = {
  flex:1, background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5,
  color:"#c8d8e8", fontSize:12, padding:"7px 9px", outline:"none",
  fontFamily:"'IBM Plex Mono',monospace", width:"100%",
};
