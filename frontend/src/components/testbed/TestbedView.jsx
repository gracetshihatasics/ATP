import { useState, useEffect, useRef } from "react";

const BACKEND = "http://localhost:3579";

const FW_ICONS  = { playwright:"🎭", cypress:"🌲", jest:"🃏", vitest:"⚡", mocha:"☕", pytest:"🐍", unknown:"📦" };
const QUAL_C    = { excellent:"#4caf50", good:"#7ec8ff", fair:"#f0c040", poor:"#ff6b6b", unknown:"#4a7fa5" };

// Repo purpose tags
const PURPOSES = [
  { id:"tests",   label:"Test Suite",    icon:"🧪", desc:"ATP reads test files — learns your patterns and style" },
  { id:"context", label:"Code Context",  icon:"📦", desc:"ATP reads README, issues, PRs — understands the app" },
  { id:"push",    label:"Push Target",   icon:"🚀", desc:"ATP can push generated tests back to this repo" },
];

export function TestbedView() {
  const [repos,      setRepos]      = useState([]); // connected repos
  const [ghRepos,    setGhRepos]    = useState([]); // available from GitHub
  const [generated,  setGenerated]  = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [view,       setView]       = useState("repos"); // repos | add | detail | generated | generate
  const [loading,    setLoading]    = useState(false);
  const [loadingGh,  setLoadingGh]  = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectLog, setConnectLog] = useState([]);
  const [syncing,    setSyncing]    = useState({});
  const [form,       setForm]       = useState({ repoFullName:"", branch:"", name:"", purposes:["tests","context"] });
  const [generating, setGenerating] = useState(false);
  const [genForm,    setGenForm]    = useState({ title:"", category:"Core Workflow", priority:"High", steps:"", assertions:"", url:"", suiteId:"" });
  const logRef = useRef(null);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    setTimeout(() => logRef.current?.scrollTo({ top:99999, behavior:"smooth" }), 50);
  }, [connectLog.length]);

  const load = async () => {
    setLoading(true);
    try {
      const [sr, gr] = await Promise.all([
        fetch(`${BACKEND}/api/testbed/suites`).then(r => r.json()),
        fetch(`${BACKEND}/api/testbed/generated`).then(r => r.json()),
      ]);
      setRepos(sr.suites || []);
      setGenerated(gr.tests || []);
    } catch {} finally { setLoading(false); }
  };

  const loadGhRepos = async () => {
    setLoadingGh(true);
    try {
      const res  = await fetch(`${BACKEND}/api/testbed/repos/available`);
      const data = await res.json();
      setGhRepos(data.repos || []);
    } catch {} finally { setLoadingGh(false); }
  };

  const connect = async () => {
    if (!form.repoFullName) return;
    setConnecting(true); setConnectLog([]);
    const log = (msg, level = "info") => setConnectLog(p => [...p, { msg, level }]);

    try {
      const res     = await fetch(`${BACKEND}/api/testbed/suites/connect`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ repoFullName: form.repoFullName, branch: form.branch || undefined, name: form.name || undefined }),
      });
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream:true });
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "log")   log(evt.msg, evt.level);
            if (evt.type === "done")  {
              await load();
              setTimeout(() => { setView("repos"); setForm({ repoFullName:"", branch:"", name:"", purposes:["tests","context"] }); }, 1200);
            }
            if (evt.type === "error") log(`✗ ${evt.error}`, "error");
          } catch {}
        }
      }
    } catch (e) { log(`✗ ${e.message}`, "error"); }
    setConnecting(false);
  };

  const sync = async (repo) => {
    setSyncing(p => ({ ...p, [repo.id]:true }));
    try {
      await fetch(`${BACKEND}/api/testbed/suites/${repo.id}/sync`, { method:"POST" });
      await load();
    } catch {} finally { setSyncing(p => ({ ...p, [repo.id]:false })); }
  };

  const remove = async (id) => {
    if (!confirm("Disconnect this repo?")) return;
    await fetch(`${BACKEND}/api/testbed/suites/${id}`, { method:"DELETE" });
    if (selected?.id === id) setSelected(null);
    load();
  };

  const generateTest = async () => {
    setGenerating(true);
    try {
      const useCase = {
        id: `gen-${Date.now()}`, title: genForm.title,
        category: genForm.category, priority: genForm.priority,
        steps:      genForm.steps.split("\n").filter(Boolean),
        assertions: genForm.assertions.split("\n").filter(Boolean),
      };
      const res  = await fetch(`${BACKEND}/api/testbed/generate`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ useCase, suiteId: genForm.suiteId || repos[0]?.id, url: genForm.url }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await load(); setView("generated");
    } catch (e) { alert(e.message); }
    setGenerating(false);
  };

  const downloadTest = (test) => {
    const a = document.createElement("a");
    a.href = `${BACKEND}/api/testbed/generated/${test.id}/download`;
    a.download = test.fileName; a.click();
  };

  const downloadAll = async () => {
    const res  = await fetch(`${BACKEND}/api/testbed/generated/download-all`);
    const data = await res.json();
    if (!data.ok) return;
    for (const t of data.tests) {
      const blob = new Blob([t.content], { type:"text/plain" });
      const a    = document.createElement("a");
      a.href     = URL.createObjectURL(blob); a.download = t.fileName; a.click();
      await new Promise(r => setTimeout(r, 200));
    }
  };

  const testRepos  = repos.filter(r => r.framework && r.framework !== "unknown");
  const contextRepos = repos;

  return (
    <div style={{ display:"flex", height:"calc(100vh - 44px)", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* ── Sidebar ── */}
      <div style={{ width:240, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
        <div style={{ padding:"12px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:2 }}>🧪 Repos & Testbed</div>
          <div style={{ fontSize:9, color:"#4a7fa5", lineHeight:1.6 }}>
            Connect GitHub repos for test context,<br/>style matching, and push-back.
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding:"6px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
          {[
            ["repos",     `Connected (${repos.length})`],
            ["add",       "+ Connect Repo"],
            ["generate",  "Generate Test"],
            ["generated", `Generated (${generated.length})`],
          ].map(([v, l]) => (
            <button key={v} onClick={() => { setView(v); if (v === "add") loadGhRepos(); }}
              style={{ display:"block", width:"100%", textAlign:"left", background:view===v&&view!=="detail"?"#1a3050":"none", border:"none", borderRadius:4, color:view===v&&view!=="detail"?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"5px 8px", fontFamily:"inherit", marginBottom:2 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Connected repos list */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {loading && <div style={{ fontSize:9, color:"#2d6aad", padding:"10px 12px" }}>Loading...</div>}
          {!loading && repos.length === 0 && (
            <div style={{ fontSize:9, color:"#1e3a5f", textAlign:"center", marginTop:20, lineHeight:2 }}>
              No repos connected yet.<br/>Click "+ Connect Repo".
            </div>
          )}
          {repos.map(r => (
            <div key={r.id} onClick={() => { setSelected(r); setView("detail"); }}
              style={{ padding:"8px 12px", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer", background:selected?.id===r.id&&view==="detail"?"#0f1c2e":"transparent" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                <span style={{ fontSize:11 }}>{FW_ICONS[r.framework] || "📦"}</span>
                <span style={{ fontSize:10, color:"#b0c8e0", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</span>
                <span style={{ fontSize:7, color:QUAL_C[r.analysis?.quality||"unknown"] }}>●</span>
              </div>
              <div style={{ fontSize:8, color:"#2d6aad", paddingLeft:18, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.repoFullName}</div>
              <div style={{ fontSize:8, color:"#1e3a5f", paddingLeft:18 }}>{r.testCount||0} files · {r.fileCount||0} tests</div>
            </div>
          ))}
        </div>

        {/* Context summary */}
        {repos.length > 0 && (
          <div style={{ padding:"8px 12px", borderTop:"0.5px solid #1e3a5f", background:"#080c0f" }}>
            <div style={{ fontSize:8, color:"#2d6aad", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>Active Context</div>
            <div style={{ fontSize:9, color:"#4a7fa5", lineHeight:1.7 }}>
              {repos.length} repo(s) injected into<br/>all discovery & generation prompts
            </div>
          </div>
        )}
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, overflowY:"auto" }}>

        {/* ══ REPOS LIST ══ */}
        {view === "repos" && (
          <div style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:4 }}>Connected Repos</div>
                <div style={{ fontSize:11, color:"#4a7fa5", lineHeight:1.8 }}>
                  Each connected repo gives ATP richer context.<br/>
                  Test repos teach ATP your style. Code repos give ATP understanding of your app.<br/>
                  Connect as many as you need — one per service, team, or purpose.
                </div>
              </div>
              <button className="rb" onClick={() => { setView("add"); loadGhRepos(); }} style={{ flexShrink:0, marginLeft:16 }}>
                + Connect Repo
              </button>
            </div>

            {repos.length === 0 ? (
              <div style={{ textAlign:"center", marginTop:60 }}>
                <div style={{ fontSize:36, marginBottom:12 }}>🐙</div>
                <div style={{ fontSize:12, color:"#2d6aad", marginBottom:8 }}>No repos connected</div>
                <div style={{ fontSize:10, color:"#1e3a5f", marginBottom:24, lineHeight:2 }}>
                  Connect your test repos so ATP learns your patterns.<br/>
                  Connect your app repos so ATP understands your codebase.
                </div>
                <button className="rb" onClick={() => { setView("add"); loadGhRepos(); }}>+ Connect First Repo</button>
              </div>
            ) : (
              <>
                {/* What ATP knows */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
                  {[
                    ["🧪", "Test Suites",    `${testRepos.length} repo(s)`,   "Style, patterns, page objects, helpers"],
                    ["📦", "Code Context",   `${contextRepos.length} repo(s)`, "README, issues, PRs, open bugs"],
                    ["🚀", "Push Targets",   `${repos.length} repo(s)`,        "ATP can open PRs back to these"],
                  ].map(([icon, title, count, desc]) => (
                    <div key={title} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"12px 14px", background:"#0d1520" }}>
                      <div style={{ fontSize:18, marginBottom:6 }}>{icon}</div>
                      <div style={{ fontSize:11, fontWeight:600, color:"#b0d0f0", marginBottom:2 }}>{title}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#7ec8ff", marginBottom:4 }}>{count}</div>
                      <div style={{ fontSize:9, color:"#4a7fa5" }}>{desc}</div>
                    </div>
                  ))}
                </div>

                {/* Repo cards */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:10 }}>
                  {repos.map(r => (
                    <div key={r.id} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520", cursor:"pointer" }}
                      onClick={() => { setSelected(r); setView("detail"); }}
                      onMouseEnter={e => e.currentTarget.style.borderColor="#4d9de0"}
                      onMouseLeave={e => e.currentTarget.style.borderColor="#1e3a5f"}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                        <span style={{ fontSize:20 }}>{FW_ICONS[r.framework] || "📦"}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, fontWeight:600, color:"#b0d0f0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.name}</div>
                          <a href={r.repoUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                            style={{ fontSize:8, color:"#4d9de0", textDecoration:"none" }}>{r.repoFullName}</a>
                        </div>
                        {r.analysis?.quality && (
                          <span style={{ fontSize:8, color:QUAL_C[r.analysis.quality], background:`${QUAL_C[r.analysis.quality]}15`, borderRadius:3, padding:"2px 5px", border:`0.5px solid ${QUAL_C[r.analysis.quality]}40`, flexShrink:0 }}>
                            {r.analysis.quality}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize:9, color:"#4a7fa5", marginBottom:6 }}>
                        {r.framework && r.framework !== "unknown" ? `${r.framework} · ` : ""}{r.language} · branch: {r.branch || "main"}
                      </div>

                      <div style={{ display:"flex", gap:8, fontSize:9, color:"#2d6aad", marginBottom:10 }}>
                        {r.testCount > 0 && <span>🧪 {r.testCount} test files</span>}
                        {r.pageObjects?.length > 0 && <span>📄 {r.pageObjects.length} page objects</span>}
                      </div>

                      {r.analysis?.generationGuidance && (
                        <div style={{ fontSize:9, color:"#4a7fa5", background:"#0a0e12", borderRadius:4, padding:"5px 8px", marginBottom:10, lineHeight:1.6 }}>
                          ◈ {r.analysis.generationGuidance.slice(0, 80)}...
                        </div>
                      )}

                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={e => { e.stopPropagation(); sync(r); }} disabled={syncing[r.id]}
                          style={{ background:"none", border:"0.5px solid #2d6aad", borderRadius:4, color:syncing[r.id]?"#2d6aad":"#4d9de0", cursor:"pointer", fontSize:9, padding:"3px 8px", fontFamily:"inherit" }}>
                          {syncing[r.id] ? "◈ Syncing..." : "↻ Sync"}
                        </button>
                        <button onClick={e => { e.stopPropagation(); setGenForm(p => ({ ...p, suiteId:r.id })); setView("generate"); }}
                          style={{ background:"linear-gradient(135deg,#1a3050,#0d1a30)", border:"0.5px solid #4d9de0", borderRadius:4, color:"#7ec8ff", cursor:"pointer", fontSize:9, padding:"3px 10px", fontFamily:"inherit" }}>
                          + Generate
                        </button>
                        <button onClick={e => { e.stopPropagation(); remove(r.id); }}
                          style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:4, color:"#ff6b6b", cursor:"pointer", fontSize:9, padding:"3px 8px", fontFamily:"inherit", marginLeft:"auto" }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add more card */}
                  <div onClick={() => { setView("add"); loadGhRepos(); }}
                    style={{ border:"0.5px dashed #1e3a5f", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#2d6aad", fontSize:11, minHeight:160 }}
                    onMouseEnter={e => e.currentTarget.style.borderColor="#4d9de0"}
                    onMouseLeave={e => e.currentTarget.style.borderColor="#1e3a5f"}>
                    + Connect another repo
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══ ADD REPO ══ */}
        {view === "add" && (
          <div style={{ padding:"20px 24px", maxWidth:600 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <button className="nb" onClick={() => setView("repos")} style={{ fontSize:10 }}>← Back</button>
              <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>Connect GitHub Repo</div>
            </div>

            <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:20, lineHeight:1.9 }}>
              ATP reads directly from GitHub — no local clone needed.<br/>
              Uses the token configured in <strong style={{ color:"#7ec8ff" }}>⚙ Git CI</strong>.
              Connect your test repo, your app repo, or both.
            </div>

            {/* GitHub repo picker */}
            {loadingGh && (
              <div style={{ fontSize:10, color:"#4a7fa5", marginBottom:12 }}>◈ Loading your GitHub repos...</div>
            )}

            {ghRepos.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:9, color:"#2d6aad", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.08em" }}>
                  Pick from your GitHub repos
                </div>
                <div style={{ maxHeight:220, overflowY:"auto", border:"0.5px solid #1e3a5f", borderRadius:6, background:"#0a0e12" }}>
                  {ghRepos.map(r => {
                    const alreadyConnected = repos.some(s => s.repoFullName === r.fullName);
                    return (
                      <div key={r.fullName}
                        onClick={() => !alreadyConnected && setForm(p => ({ ...p, repoFullName:r.fullName, name:r.name }))}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderBottom:"0.5px solid #0d1a2a", cursor:alreadyConnected?"default":"pointer", background:form.repoFullName===r.fullName?"#1a3050":"transparent", opacity:alreadyConnected?0.4:1 }}>
                        <span style={{ fontSize:10 }}>{r.private ? "🔒" : "📦"}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:10, color:form.repoFullName===r.fullName?"#7ec8ff":"#b0c8e0" }}>{r.fullName}</div>
                          {r.description && <div style={{ fontSize:8, color:"#2d6aad" }}>{r.description.slice(0,55)}</div>}
                        </div>
                        <span style={{ fontSize:9, color:"#2d6aad", flexShrink:0 }}>{r.language}</span>
                        {alreadyConnected && <span style={{ fontSize:8, color:"#4caf50", flexShrink:0 }}>✓ connected</span>}
                        {form.repoFullName === r.fullName && !alreadyConnected && <span style={{ color:"#4caf50", flexShrink:0 }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ghRepos.length === 0 && !loadingGh && (
              <div style={{ border:"0.5px solid #f0c04040", borderRadius:6, padding:"10px 14px", marginBottom:14, background:"#1a1500", fontSize:10, color:"#f0c040" }}>
                ⚠ Could not load repos — make sure GitHub token is set in <strong>⚙ Git CI</strong> settings.
              </div>
            )}

            {/* Manual input */}
            <Fl label="Repo (owner/name)">
              <input value={form.repoFullName} onChange={e => setForm(p => ({ ...p, repoFullName:e.target.value }))}
                placeholder="owner/repo-name" style={inp} />
            </Fl>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
              <Fl label="Branch (optional — defaults to main)">
                <input value={form.branch} onChange={e => setForm(p => ({ ...p, branch:e.target.value }))}
                  placeholder="main" style={inp} />
              </Fl>
              <Fl label="Name (optional)">
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name:e.target.value }))}
                  placeholder="My App Tests" style={inp} />
              </Fl>
            </div>

            <button className="rb" onClick={connect} disabled={connecting || !form.repoFullName}
              style={{ width:"100%", padding:"11px 0", fontSize:12, marginBottom:14 }}>
              {connecting ? "◈ Connecting & analysing..." : "Connect Repo"}
            </button>

            {/* Log */}
            {connectLog.length > 0 && (
              <div style={{ border:"0.5px solid #1e3a5f", borderRadius:6, background:"#0a0e12", overflow:"hidden" }}>
                <div style={{ padding:"5px 12px", fontSize:9, color:"#2d6aad", borderBottom:"0.5px solid #1e3a5f" }}>Connection Log</div>
                <div ref={logRef} style={{ maxHeight:200, overflowY:"auto", padding:"8px 12px" }}>
                  {connectLog.map((l, i) => (
                    <div key={i} style={{ fontSize:9, marginBottom:3, lineHeight:1.6,
                      color:l.level==="error"?"#ff6b6b":l.level==="success"?"#7ec87f":l.level==="ai"?"#c8a0f0":l.level==="warn"?"#ffaa44":"#6a8aa8" }}>
                      {l.level==="error"?"✗":l.level==="success"?"✓":l.level==="ai"?"◈":"›"} {l.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ REPO DETAIL ══ */}
        {view === "detail" && selected && (
          <div style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <button className="nb" onClick={() => setView("repos")} style={{ fontSize:10 }}>← Repos</button>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>{FW_ICONS[selected.framework] || "📦"} {selected.name}</div>
                <a href={selected.repoUrl} target="_blank" rel="noreferrer" style={{ fontSize:9, color:"#4d9de0", textDecoration:"none" }}>
                  {selected.repoFullName} · branch: {selected.branch || "main"}
                </a>
              </div>
              <button onClick={() => { setGenForm(p => ({ ...p, suiteId:selected.id })); setView("generate"); }} className="rb" style={{ fontSize:10 }}>
                + Generate Test
              </button>
              <button onClick={() => sync(selected)} disabled={syncing[selected.id]}
                style={{ background:"none", border:"0.5px solid #2d6aad", borderRadius:5, color:"#4d9de0", cursor:"pointer", fontSize:10, padding:"6px 12px", fontFamily:"inherit" }}>
                {syncing[selected.id] ? "◈ Syncing..." : "↻ Sync from GitHub"}
              </button>
            </div>

            {/* Stats */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
              {[
                ["Framework",  selected.framework || "—"],
                ["Language",   selected.language  || "—"],
                ["Test Files", selected.testCount  || 0],
                ["Test Cases", selected.fileCount  || 0],
                ["Quality",    selected.analysis?.quality || "—"],
                ["Coverage",   selected.analysis?.coverage?.estimatedCoverage || "—"],
              ].map(([l, v]) => (
                <div key={l} style={{ border:"0.5px solid #1e3a5f", borderRadius:6, padding:"10px 12px", background:"#0d1520", textAlign:"center" }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#7ec8ff" }}>{v}</div>
                  <div style={{ fontSize:8, color:"#2d6aad" }}>{l}</div>
                </div>
              ))}
            </div>

            {/* Conventions + Gaps */}
            {selected.analysis && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
                  <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>◈ Detected Conventions</div>
                  {Object.entries(selected.analysis.conventions || {}).filter(([, v]) => v && typeof v === "string").map(([k, v]) => (
                    <div key={k} style={{ display:"flex", gap:8, marginBottom:5, fontSize:10 }}>
                      <span style={{ color:"#2d6aad", minWidth:140, flexShrink:0 }}>{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                      <span style={{ color:"#a0c0d8" }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
                  <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Coverage</div>
                  {(selected.analysis.gaps || []).map((g, i) => <div key={i} style={{ fontSize:10, color:"#ffaa44", marginBottom:4 }}>⚠ {g}</div>)}
                  {(selected.analysis.strengths || []).map((s, i) => <div key={i} style={{ fontSize:10, color:"#7ec87f", marginBottom:4 }}>✓ {s}</div>)}
                </div>
              </div>
            )}

            {/* Generation guidance */}
            {selected.analysis?.generationGuidance && (
              <div style={{ border:"0.5px solid #4caf5050", borderRadius:8, padding:"12px 14px", background:"#0a1a0a", marginBottom:16 }}>
                <div style={{ fontSize:9, color:"#4caf50", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>◈ Context injected into all ATP prompts</div>
                <div style={{ fontSize:11, color:"#a0d0a0", lineHeight:1.7 }}>{selected.analysis.generationGuidance}</div>
              </div>
            )}

            {/* Test files */}
            {(selected.testFiles?.length > 0) && (
              <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, overflow:"hidden" }}>
                <div style={{ padding:"8px 14px", borderBottom:"0.5px solid #1e3a5f", fontSize:9, color:"#2d6aad", textTransform:"uppercase", letterSpacing:"0.08em" }}>
                  Test Files ({selected.testCount})
                </div>
                <div style={{ maxHeight:240, overflowY:"auto" }}>
                  {selected.testFiles.map((f, i) => (
                    <div key={i} style={{ display:"flex", gap:10, padding:"6px 14px", borderBottom:"0.5px solid #0d1a2a", fontSize:10 }}>
                      <span style={{ color:"#c8a0f0", flexShrink:0 }}>📄</span>
                      <span style={{ flex:1, color:"#a0c0d8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.path}</span>
                      <span style={{ color:"#2d6aad", flexShrink:0 }}>{f.tests?.length || 0} tests</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ GENERATE ══ */}
        {view === "generate" && (
          <div style={{ padding:"20px 24px", maxWidth:560 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <button className="nb" onClick={() => setView(selected ? "detail" : "repos")} style={{ fontSize:10 }}>← Back</button>
              <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>Generate Test File</div>
            </div>

            {repos.length > 1 && (
              <Fl label="Match style of">
                <select value={genForm.suiteId || repos[0]?.id || ""} onChange={e => setGenForm(p => ({ ...p, suiteId:e.target.value }))} style={{ ...inp, cursor:"pointer" }}>
                  <option value="">Auto (most recent)</option>
                  {repos.map(r => <option key={r.id} value={r.id}>{r.name} ({r.framework || "unknown"})</option>)}
                </select>
              </Fl>
            )}

            {repos.length === 1 && (
              <div style={{ border:"0.5px solid #4caf5050", borderRadius:6, padding:"7px 12px", marginBottom:12, background:"#0a1a0a", fontSize:10, color:"#7ec87f" }}>
                ◈ Matching style of: {repos[0].repoFullName} ({repos[0].framework}/{repos[0].language})
              </div>
            )}

            <Fl label="Test title">
              <input value={genForm.title} onChange={e => setGenForm(p => ({ ...p, title:e.target.value }))}
                placeholder="e.g. User checkout with loyalty points" style={inp} />
            </Fl>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Fl label="Category">
                <select value={genForm.category} onChange={e => setGenForm(p => ({ ...p, category:e.target.value }))} style={{ ...inp, cursor:"pointer" }}>
                  {["Authentication","Core Workflow","Data Management","Integration","Edge Case","Performance","Accessibility"].map(c => <option key={c}>{c}</option>)}
                </select>
              </Fl>
              <Fl label="Priority">
                <select value={genForm.priority} onChange={e => setGenForm(p => ({ ...p, priority:e.target.value }))} style={{ ...inp, cursor:"pointer" }}>
                  {["Critical","High","Medium","Low"].map(c => <option key={c}>{c}</option>)}
                </select>
              </Fl>
            </div>
            <Fl label="App URL (optional)">
              <input value={genForm.url} onChange={e => setGenForm(p => ({ ...p, url:e.target.value }))}
                placeholder="https://myapp.com" style={inp} />
            </Fl>
            <Fl label="Steps (one per line)">
              <textarea value={genForm.steps} onChange={e => setGenForm(p => ({ ...p, steps:e.target.value }))}
                placeholder={"Navigate to checkout\nAdd item to cart\nComplete payment"} rows={4} style={{ ...inp, resize:"vertical" }} />
            </Fl>
            <Fl label="Assertions (one per line)">
              <textarea value={genForm.assertions} onChange={e => setGenForm(p => ({ ...p, assertions:e.target.value }))}
                placeholder={"Order confirmation visible\nEmail receipt sent"} rows={3} style={{ ...inp, resize:"vertical" }} />
            </Fl>
            <button className="rb" onClick={generateTest} disabled={generating || !genForm.title}>
              {generating ? "◈ Generating..." : "Generate Test File"}
            </button>
          </div>
        )}

        {/* ══ GENERATED ══ */}
        {view === "generated" && (
          <div style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:3 }}>Generated Tests</div>
                <div style={{ fontSize:11, color:"#4a7fa5" }}>Download and add to your repo, or push via ⚙ Git CI</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                {generated.length > 0 && (
                  <button onClick={downloadAll}
                    style={{ background:"linear-gradient(135deg,#1a3050,#0d1a30)", border:"0.5px solid #4d9de0", borderRadius:5, color:"#7ec8ff", cursor:"pointer", fontSize:10, padding:"7px 14px", fontFamily:"inherit" }}>
                    ⬇ Download All ({generated.length})
                  </button>
                )}
                <button onClick={() => setView("generate")} className="rb" style={{ fontSize:10 }}>+ Generate</button>
              </div>
            </div>

            {generated.length === 0 && (
              <div style={{ textAlign:"center", marginTop:60, color:"#1e3a5f", fontSize:11, lineHeight:2 }}>
                No generated tests yet.<br/>Connect a repo and click Generate.
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:10 }}>
              {generated.map(t => (
                <div key={t.id} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
                  <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:16 }}>{FW_ICONS[t.framework] || "📄"}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:"#b0d0f0" }}>{t.fileName}</div>
                      <div style={{ fontSize:9, color:"#4a7fa5" }}>{t.framework} · {t.language}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:10, color:"#6a8aa8", marginBottom:8 }}>{t.useCase?.title}</div>
                  <pre style={{ fontSize:8, color:"#4a7fa5", background:"#0a0e12", borderRadius:4, padding:"6px 8px", maxHeight:70, overflowY:"auto", margin:0, whiteSpace:"pre-wrap", fontFamily:"'IBM Plex Mono',monospace" }}>
                    {t.content?.slice(0, 200)}...
                  </pre>
                  <div style={{ display:"flex", gap:6, marginTop:10 }}>
                    <button onClick={() => downloadTest(t)}
                      style={{ flex:1, background:"linear-gradient(135deg,#0a1a30,#0a0a1e)", border:"0.5px solid #4d9de0", borderRadius:4, color:"#7ec8ff", cursor:"pointer", fontSize:9, padding:"5px 0", fontFamily:"inherit" }}>
                      ⬇ Download
                    </button>
                    <button onClick={async () => { await fetch(`${BACKEND}/api/testbed/generated/${t.id}`, { method:"DELETE" }); load(); }}
                      style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:4, color:"#ff6b6b", cursor:"pointer", fontSize:9, padding:"5px 10px", fontFamily:"inherit" }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Fl({ label, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, letterSpacing:"0.08em" }}>{label}</div>
      {children}
    </div>
  );
}

const inp = {
  width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f",
  borderRadius:5, color:"#c8d8e8", fontSize:12, padding:"7px 9px",
  outline:"none", fontFamily:"'IBM Plex Mono',monospace",
};
