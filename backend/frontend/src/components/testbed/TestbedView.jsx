import { useState, useEffect, useRef } from "react";

const BACKEND = "http://localhost:3579";
const FW_ICONS = { playwright:"🎭", cypress:"🌲", jest:"🃏", vitest:"⚡", mocha:"☕", pytest:"🐍", unknown:"📦" };
const QUALITY_C = { excellent:"#4caf50", good:"#7ec8ff", fair:"#f0c040", poor:"#ff6b6b", unknown:"#4a7fa5" };

export function TestbedView() {
  const [suites,     setSuites]     = useState([]);
  const [generated,  setGenerated]  = useState([]);
  const [repos,      setRepos]      = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selected,   setSelected]   = useState(null);
  const [view,       setView]       = useState("suites");
  const [connecting, setConnecting] = useState(false);
  const [connectLog, setConnectLog] = useState([]);
  const [connectForm, setConForm]   = useState({ repoFullName:"", branch:"", name:"" });
  const [generating, setGenerating] = useState(false);
  const [syncing,    setSyncing]    = useState({});
  const [genForm,    setGenForm]    = useState({ title:"", category:"Core Workflow", priority:"High", steps:"", assertions:"", url:"", suiteId:"" });
  const logRef = useRef(null);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    setTimeout(() => logRef.current?.scrollTo({ top:99999, behavior:"smooth" }), 50);
  }, [connectLog.length]);

  const load = async () => {
    try {
      const [sr, gr] = await Promise.all([
        fetch(`${BACKEND}/api/testbed/suites`).then(r=>r.json()),
        fetch(`${BACKEND}/api/testbed/generated`).then(r=>r.json()),
      ]);
      setSuites(sr.suites || []);
      setGenerated(gr.tests || []);
    } catch {}
  };

  const loadRepos = async () => {
    setLoadingRepos(true);
    try {
      const res  = await fetch(`${BACKEND}/api/testbed/repos/available`);
      const data = await res.json();
      setRepos(data.repos || []);
    } catch {} finally { setLoadingRepos(false); }
  };

  const connectRepo = async () => {
    if (!connectForm.repoFullName) return;
    setConnecting(true); setConnectLog([]);
    const log = (msg, level="info") => setConnectLog(prev => [...prev, { msg, level }]);

    try {
      const res = await fetch(`${BACKEND}/api/testbed/suites/connect`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(connectForm),
      });
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream:true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "log")  log(evt.msg, evt.level);
            if (evt.type === "done") { await load(); setTimeout(() => { setView("suites"); setConForm({repoFullName:"",branch:"",name:""}); }, 1500); }
            if (evt.type === "error") log(`✗ ${evt.error}`, "error");
          } catch {}
        }
      }
    } catch (e) { log(`✗ ${e.message}`, "error"); }
    setConnecting(false);
  };

  const syncSuite = async (suite) => {
    setSyncing(p => ({ ...p, [suite.id]:true }));
    try {
      await fetch(`${BACKEND}/api/testbed/suites/${suite.id}/sync`, { method:"POST" });
      await load();
    } catch {} finally { setSyncing(p => ({ ...p, [suite.id]:false })); }
  };

  const deleteSuite = async (id) => {
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
        body: JSON.stringify({ useCase, suiteId: genForm.suiteId || selected?.id, url: genForm.url }),
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
      a.href     = URL.createObjectURL(blob);
      a.download = t.fileName; a.click();
      await new Promise(r => setTimeout(r, 200));
    }
  };

  return (
    <div style={{ display:"flex", height:"calc(100vh - 44px)", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* ── Sidebar ── */}
      <div style={{ width:240, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
        <div style={{ padding:"12px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:3 }}>🧪 Testbed</div>
          <div style={{ fontSize:9, color:"#4a7fa5" }}>Connect repos · Generate tests · Download</div>
        </div>
        <div style={{ padding:"6px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
          {[["suites",`Repos (${suites.length})`],["connect","Connect Repo"],["generated",`Generated (${generated.length})`]].map(([v,l]) => (
            <button key={v} onClick={() => { setView(v); if (v==="connect") loadRepos(); }}
              style={{ display:"block", width:"100%", textAlign:"left", background:view===v?"#1a3050":"none", border:"none", borderRadius:4, color:view===v?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"5px 8px", fontFamily:"inherit", marginBottom:2 }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ flex:1, overflowY:"auto" }}>
          {suites.length === 0 && (
            <div style={{ fontSize:9, color:"#1e3a5f", textAlign:"center", marginTop:20, lineHeight:2 }}>No repos connected.<br/>Connect a GitHub repo.
            </div>
          )}
          {suites.map(s => (
            <div key={s.id} onClick={() => { setSelected(s); setView("detail"); }}
              style={{ padding:"8px 12px", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer", background:selected?.id===s.id?"#0f1c2e":"transparent" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                <span style={{ fontSize:11 }}>{FW_ICONS[s.framework]||"📦"}</span>
                <span style={{ fontSize:10, color:"#b0c8e0", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</span>
                <span style={{ fontSize:8, color:QUALITY_C[s.analysis?.quality||"unknown"] }}>●</span>
              </div>
              <div style={{ fontSize:8, color:"#2d6aad", paddingLeft:18 }}>{s.repoFullName}</div>
              <div style={{ fontSize:8, color:"#1e3a5f", paddingLeft:18 }}>{s.testCount} files · {s.fileCount} tests</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, overflowY:"auto" }}>

        {/* ══ SUITES ══ */}
        {view === "suites" && (
          <div style={{ padding:"20px 24px" }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:4 }}>Connected Test Repos</div>
            <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:20, lineHeight:1.9 }}>
              Connect your GitHub test repos. ATP reads them as context when generating new tests —<br/>
              matching your framework, patterns, page objects, helpers, and naming conventions.<br/>
              Multiple repos supported — one per service, frontend, backend, etc.
            </div>
            {suites.length === 0 ? (
              <div style={{ textAlign:"center", marginTop:60 }}>
                <div style={{ fontSize:32, marginBottom:12 }}>🧪</div>
                <div style={{ fontSize:12, color:"#2d6aad", marginBottom:20 }}>No repos connected yet</div>
                <button className="rb" onClick={() => { setView("connect"); loadRepos(); }}>+ Connect GitHub Repo</button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))", gap:10 }}>
                {suites.map(s => (
                  <div key={s.id} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520", cursor:"pointer" }}
                    onClick={() => { setSelected(s); setView("detail"); }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="#4d9de0"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="#1e3a5f"}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <span style={{ fontSize:22 }}>{FW_ICONS[s.framework]||"📦"}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:"#b0d0f0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</div>
                        <a href={s.repoUrl} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                          style={{ fontSize:9, color:"#4d9de0", textDecoration:"none" }}>{s.repoFullName}</a>
                      </div>
                      {s.analysis?.quality && (
                        <span style={{ fontSize:9, color:QUALITY_C[s.analysis.quality], background:`${QUALITY_C[s.analysis.quality]}15`, borderRadius:3, padding:"2px 5px", border:`0.5px solid ${QUALITY_C[s.analysis.quality]}50`, flexShrink:0 }}>
                          {s.analysis.quality}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:9, color:"#4a7fa5", marginBottom:6 }}>{s.framework} · {s.language} · branch: {s.branch}</div>
                    <div style={{ fontSize:9, color:"#2d6aad", marginBottom:10 }}>{s.testCount} test files · {s.fileCount} tests{s.pageObjects?.length ? ` · ${s.pageObjects.length} page objects` : ""}</div>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={e=>{e.stopPropagation();syncSuite(s);}} disabled={syncing[s.id]}
                        style={{ background:"none", border:"0.5px solid #2d6aad", borderRadius:4, color:syncing[s.id]?"#2d6aad":"#4d9de0", cursor:"pointer", fontSize:9, padding:"3px 8px", fontFamily:"inherit" }}>
                        {syncing[s.id]?"◈ Syncing...":"↻ Sync"}
                      </button>
                      <button onClick={e=>{e.stopPropagation();setSelected(s);setGenForm(p=>({...p,suiteId:s.id}));setView("generate");}}
                        style={{ background:"linear-gradient(135deg,#1a3050,#0d1a30)", border:"0.5px solid #4d9de0", borderRadius:4, color:"#7ec8ff", cursor:"pointer", fontSize:9, padding:"3px 10px", fontFamily:"inherit" }}>
                        + Generate
                      </button>
                      <button onClick={e=>{e.stopPropagation();deleteSuite(s.id);}}
                        style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:4, color:"#ff6b6b", cursor:"pointer", fontSize:9, padding:"3px 8px", fontFamily:"inherit", marginLeft:"auto" }}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ border:"0.5px dashed #1e3a5f", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#2d6aad", fontSize:11, minHeight:140 }}
                  onClick={() => { setView("connect"); loadRepos(); }}>
                  + Connect another repo
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ CONNECT ══ */}
        {view === "connect" && (
          <div style={{ padding:"20px 24px", maxWidth:580 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <button className="nb" onClick={() => setView("suites")} style={{ fontSize:10 }}>← Back</button>
              <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>Connect GitHub Repo</div>
            </div>
            <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:20, lineHeight:1.9 }}>
              ATP reads your test files directly from GitHub. No local clone needed.<br/>
              Uses the token from <strong style={{ color:"#7ec8ff" }}>⚙ Git CI</strong> settings.
            </div>

            {/* Repo picker */}
            {repos.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:9, color:"#2d6aad", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.08em" }}>Pick from your repos</div>
                <div style={{ maxHeight:200, overflowY:"auto", border:"0.5px solid #1e3a5f", borderRadius:6, background:"#0a0e12" }}>
                  {repos.map(r => (
                    <div key={r.fullName} onClick={() => setConForm(p => ({ ...p, repoFullName: r.fullName, name: r.fullName.split("/")[1] }))}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 12px", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer", background:connectForm.repoFullName===r.fullName?"#1a3050":"transparent" }}>
                      <span style={{ fontSize:10 }}>{r.private?"🔒":"📦"}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:10, color:connectForm.repoFullName===r.fullName?"#7ec8ff":"#b0c8e0" }}>{r.fullName}</div>
                        {r.description && <div style={{ fontSize:8, color:"#2d6aad" }}>{r.description.slice(0,50)}</div>}
                      </div>
                      <span style={{ fontSize:9, color:"#2d6aad" }}>{r.language}</span>
                      {connectForm.repoFullName===r.fullName && <span style={{ color:"#4caf50" }}>✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadingRepos && <div style={{ fontSize:10, color:"#4a7fa5", marginBottom:12 }}>◈ Loading repos...</div>}

            <Fl label="Repo (owner/name)">
              <input value={connectForm.repoFullName} onChange={e=>setConForm(p=>({...p,repoFullName:e.target.value}))}
                placeholder="gracetshihatasics/my-app-tests" style={inp} />
            </Fl>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Fl label="Branch (optional)">
                <input value={connectForm.branch} onChange={e=>setConForm(p=>({...p,branch:e.target.value}))}
                  placeholder="main" style={inp} />
              </Fl>
              <Fl label="Name (optional)">
                <input value={connectForm.name} onChange={e=>setConForm(p=>({...p,name:e.target.value}))}
                  placeholder="Frontend E2E Tests" style={inp} />
              </Fl>
            </div>

            <button className="rb" onClick={connectRepo} disabled={connecting || !connectForm.repoFullName}>
              {connecting ? "◈ Connecting..." : "Connect & Analyse Repo"}
            </button>

            {connectLog.length > 0 && (
              <div style={{ marginTop:14, border:"0.5px solid #1e3a5f", borderRadius:6, background:"#0a0e12", overflow:"hidden" }}>
                <div style={{ padding:"5px 12px", fontSize:9, color:"#2d6aad", borderBottom:"0.5px solid #1e3a5f" }}>Connection Log</div>
                <div ref={logRef} style={{ maxHeight:220, overflowY:"auto", padding:"8px 12px" }}>
                  {connectLog.map((l,i) => (
                    <div key={i} style={{ fontSize:9, marginBottom:3, lineHeight:1.6, color:l.level==="error"?"#ff6b6b":l.level==="success"?"#7ec87f":l.level==="ai"?"#c8a0f0":l.level==="warn"?"#ffaa44":"#6a8aa8" }}>
                      {l.level==="error"?"✗":l.level==="success"?"✓":l.level==="ai"?"◈":"›"} {l.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ DETAIL ══ */}
        {view === "detail" && selected && (
          <div style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <button className="nb" onClick={() => setView("suites")} style={{ fontSize:10 }}>← Repos</button>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>{FW_ICONS[selected.framework]} {selected.name}</div>
                <a href={selected.repoUrl} target="_blank" rel="noreferrer" style={{ fontSize:9, color:"#4d9de0", textDecoration:"none" }}>{selected.repoFullName} · {selected.branch}</a>
              </div>
              <button onClick={() => { setGenForm(p=>({...p,suiteId:selected.id})); setView("generate"); }} className="rb" style={{ fontSize:10 }}>+ Generate Test</button>
              <button onClick={() => syncSuite(selected)} disabled={syncing[selected.id]}
                style={{ background:"none", border:"0.5px solid #2d6aad", borderRadius:5, color:"#4d9de0", cursor:"pointer", fontSize:10, padding:"6px 12px", fontFamily:"inherit" }}>
                {syncing[selected.id]?"◈ Syncing...":"↻ Sync from GitHub"}
              </button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
              {[["Framework",selected.framework],["Language",selected.language],["Test Files",selected.testCount],
                ["Test Cases",selected.fileCount],["Quality",selected.analysis?.quality||"—"],
                ["Coverage",selected.analysis?.coverage?.estimatedCoverage||"—"]].map(([l,v]) => (
                <div key={l} style={{ border:"0.5px solid #1e3a5f", borderRadius:6, padding:"10px 12px", background:"#0d1520", textAlign:"center" }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#7ec8ff" }}>{v}</div>
                  <div style={{ fontSize:8, color:"#2d6aad" }}>{l}</div>
                </div>
              ))}
            </div>

            {selected.analysis && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
                  <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>◈ Detected Conventions</div>
                  {Object.entries(selected.analysis.conventions||{}).filter(([,v])=>v&&typeof v==="string").map(([k,v]) => (
                    <div key={k} style={{ display:"flex", gap:8, marginBottom:5, fontSize:10 }}>
                      <span style={{ color:"#2d6aad", minWidth:130, flexShrink:0 }}>{k.replace(/([A-Z])/g," $1").toLowerCase()}</span>
                      <span style={{ color:"#a0c0d8" }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
                  <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>Gaps & Strengths</div>
                  {(selected.analysis.gaps||[]).map((g,i) => <div key={i} style={{ fontSize:10, color:"#ffaa44", marginBottom:4 }}>⚠ {g}</div>)}
                  {(selected.analysis.strengths||[]).map((s,i) => <div key={i} style={{ fontSize:10, color:"#7ec87f", marginBottom:4 }}>✓ {s}</div>)}
                </div>
              </div>
            )}

            {selected.analysis?.generationGuidance && (
              <div style={{ border:"0.5px solid #4caf5050", borderRadius:8, padding:"12px 14px", background:"#0a1a0a", marginBottom:16 }}>
                <div style={{ fontSize:9, color:"#4caf50", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>◈ Generation Guidance (injected into all prompts)</div>
                <div style={{ fontSize:11, color:"#a0d0a0", lineHeight:1.7 }}>{selected.analysis.generationGuidance}</div>
              </div>
            )}

            <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, overflow:"hidden" }}>
              <div style={{ padding:"8px 14px", borderBottom:"0.5px solid #1e3a5f", fontSize:9, color:"#2d6aad", textTransform:"uppercase", letterSpacing:"0.08em" }}>
                Test Files ({selected.testCount})
              </div>
              <div style={{ maxHeight:280, overflowY:"auto" }}>
                {(selected.testFiles||[]).map((f,i) => (
                  <div key={i} style={{ display:"flex", gap:10, padding:"6px 14px", borderBottom:"0.5px solid #0d1a2a", fontSize:10 }}>
                    <span style={{ color:"#c8a0f0", flexShrink:0 }}>📄</span>
                    <span style={{ flex:1, color:"#a0c0d8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.path}</span>
                    <span style={{ color:"#2d6aad", flexShrink:0 }}>{f.tests?.length||0} tests</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ GENERATE ══ */}
        {view === "generate" && (
          <div style={{ padding:"20px 24px", maxWidth:560 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <button className="nb" onClick={() => setView(selected?"detail":"suites")} style={{ fontSize:10 }}>← Back</button>
              <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>Generate Test File</div>
            </div>

            {suites.length > 1 && (
              <Fl label="Target repo (style to match)">
                <select value={genForm.suiteId||selected?.id||""} onChange={e=>setGenForm(p=>({...p,suiteId:e.target.value}))} style={{ ...inp, cursor:"pointer" }}>
                  <option value="">Auto (most recent)</option>
                  {suites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.framework})</option>)}
                </select>
              </Fl>
            )}

            {(genForm.suiteId||selected) && (() => {
              const s = suites.find(s=>s.id===(genForm.suiteId||selected?.id));
              return s && <div style={{ border:"0.5px solid #4caf5050", borderRadius:6, padding:"7px 12px", marginBottom:12, background:"#0a1a0a", fontSize:10, color:"#7ec87f" }}>
                ◈ Matching style of: {s.repoFullName} ({s.framework}/{s.language})
              </div>;
            })()}

            <Fl label="Test title"><input value={genForm.title} onChange={e=>setGenForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Loyalty points redemption at checkout" style={inp} /></Fl>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Fl label="Category">
                <select value={genForm.category} onChange={e=>setGenForm(p=>({...p,category:e.target.value}))} style={{ ...inp, cursor:"pointer" }}>
                  {["Authentication","Core Workflow","Data Management","Integration","Edge Case","Performance","Accessibility"].map(c=><option key={c}>{c}</option>)}
                </select>
              </Fl>
              <Fl label="Priority">
                <select value={genForm.priority} onChange={e=>setGenForm(p=>({...p,priority:e.target.value}))} style={{ ...inp, cursor:"pointer" }}>
                  {["Critical","High","Medium","Low"].map(c=><option key={c}>{c}</option>)}
                </select>
              </Fl>
            </div>
            <Fl label="App URL (optional)"><input value={genForm.url} onChange={e=>setGenForm(p=>({...p,url:e.target.value}))} placeholder="https://myapp.com" style={inp} /></Fl>
            <Fl label="Steps (one per line)"><textarea value={genForm.steps} onChange={e=>setGenForm(p=>({...p,steps:e.target.value}))} placeholder={"Navigate to checkout\nAdd item to cart\nApply loyalty points\nComplete payment"} rows={4} style={{ ...inp, resize:"vertical" }} /></Fl>
            <Fl label="Assertions (one per line)"><textarea value={genForm.assertions} onChange={e=>setGenForm(p=>({...p,assertions:e.target.value}))} placeholder={"Order confirmation visible\nLoyalty points deducted correctly"} rows={3} style={{ ...inp, resize:"vertical" }} /></Fl>
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
                <div style={{ fontSize:11, color:"#4a7fa5" }}>Download and add to your repo, or push directly via Git CI</div>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                {generated.length > 0 && <button onClick={downloadAll} style={{ background:"linear-gradient(135deg,#1a3050,#0d1a30)", border:"0.5px solid #4d9de0", borderRadius:5, color:"#7ec8ff", cursor:"pointer", fontSize:10, padding:"7px 14px", fontFamily:"inherit" }}>⬇ Download All ({generated.length})</button>}
                <button onClick={() => setView("generate")} className="rb" style={{ fontSize:10 }}>+ Generate</button>
              </div>
            </div>
            {generated.length === 0 && <div style={{ textAlign:"center", marginTop:60, color:"#1e3a5f", fontSize:11, lineHeight:2 }}>No generated tests yet.<br/>Connect a repo and click Generate.</div>}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:10 }}>
              {generated.map(t => (
                <div key={t.id} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
                  <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:16 }}>{FW_ICONS[t.framework]||"📄"}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:"#b0d0f0" }}>{t.fileName}</div>
                      <div style={{ fontSize:9, color:"#4a7fa5" }}>{t.framework} · {t.language}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:10, color:"#6a8aa8", marginBottom:8 }}>{t.useCase?.title}</div>
                  <pre style={{ fontSize:8, color:"#4a7fa5", background:"#0a0e12", borderRadius:4, padding:"6px 8px", maxHeight:70, overflowY:"auto", margin:0, whiteSpace:"pre-wrap", fontFamily:"'IBM Plex Mono',monospace" }}>
                    {t.content?.slice(0,200)}...
                  </pre>
                  <div style={{ display:"flex", gap:6, marginTop:10 }}>
                    <button onClick={() => downloadTest(t)} style={{ flex:1, background:"linear-gradient(135deg,#0a1a30,#0a0a1e)", border:"0.5px solid #4d9de0", borderRadius:4, color:"#7ec8ff", cursor:"pointer", fontSize:9, padding:"5px 0", fontFamily:"inherit" }}>⬇ Download</button>
                    <button onClick={async () => { await fetch(`${BACKEND}/api/testbed/generated/${t.id}`,{method:"DELETE"}); load(); }} style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:4, color:"#ff6b6b", cursor:"pointer", fontSize:9, padding:"5px 10px", fontFamily:"inherit" }}>✕</button>
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

function Fl({ label, hint, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, letterSpacing:"0.08em" }}>
        {label}{hint && <span style={{ color:"#1e3a5f", marginLeft:6 }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
const inp = { width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#c8d8e8", fontSize:12, padding:"7px 9px", outline:"none", fontFamily:"'IBM Plex Mono',monospace" };
