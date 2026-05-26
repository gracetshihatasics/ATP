import { useState, useRef, useEffect } from "react";

const BACKEND = "http://localhost:3579";

/**
 * One-click "Export as Test Project" modal.
 * Triggered from Discovery after use cases are found.
 * Generates a full runnable test project + optionally pushes to GitHub.
 */
export function ExportProjectModal({ plan, url, onClose }) {
  const [step,      setStep]      = useState("config"); // config | generating | done | push
  const [log,       setLog]       = useState([]);
  const [project,   setProject]   = useState(null);
  const [suites,    setSuites]    = useState([]);
  const [repos,     setRepos]     = useState([]);
  const [pushing,   setPushing]   = useState(false);
  const [pushLog,   setPushLog]   = useState([]);
  const [form,      setForm]      = useState({ suiteId:"", targetRepo:"", targetBranch:"", baseBranch:"main", createPR:true });
  const logRef  = useRef(null);
  const pushRef = useRef(null);

  useEffect(() => { loadSuites(); loadRepos(); }, []);
  useEffect(() => {
    setTimeout(() => logRef.current?.scrollTo({ top:99999, behavior:"smooth" }), 50);
  }, [log.length]);
  useEffect(() => {
    setTimeout(() => pushRef.current?.scrollTo({ top:99999, behavior:"smooth" }), 50);
  }, [pushLog.length]);

  const loadSuites = async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/testbed/suites`);
      const data = await res.json();
      setSuites(data.suites || []);
      if (data.suites?.length) setForm(p => ({ ...p, suiteId: data.suites[0].id }));
    } catch {}
  };

  const loadRepos = async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/testbed/repos/available`);
      const data = await res.json();
      setRepos(data.repos || []);
    } catch {}
  };

  const generate = async () => {
    setStep("generating"); setLog([]);
    const addLog = (msg, level) => setLog(prev => [...prev, { msg, level }]);

    try {
      const res = await fetch(`${BACKEND}/api/testbed/export`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plan, url, suiteId: form.suiteId || undefined }),
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "log")   addLog(evt.msg, evt.level);
            if (evt.type === "done")  { setProject(evt.project); setStep("done"); }
            if (evt.type === "error") addLog(`✗ ${evt.error}`, "error");
          } catch {}
        }
      }
    } catch (e) { addLog(`✗ ${e.message}`, "error"); }
  };

  const downloadProject = async () => {
    if (!project) return;
    const res  = await fetch(`${BACKEND}/api/testbed/projects/${project.id}/download`);
    const data = await res.json();
    if (!data.ok) return;

    // Use JSZip if available, else download files individually
    try {
      const JSZip = (await import("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js")).default;
      const zip = new JSZip();
      data.project.files.forEach(f => zip.file(f.path, f.content));
      const blob = await zip.generateAsync({ type:"blob" });
      const a    = document.createElement("a");
      a.href     = URL.createObjectURL(blob);
      a.download = `${data.project.name}-tests.zip`;
      a.click();
    } catch {
      // Fallback — download each file
      for (const f of data.project.files) {
        const blob = new Blob([f.content], { type:"text/plain" });
        const a    = document.createElement("a");
        a.href     = URL.createObjectURL(blob);
        a.download = f.path.split("/").pop();
        a.click();
        await new Promise(r => setTimeout(r, 150));
      }
    }
  };

  const pushToGitHub = async () => {
    if (!project || !form.targetRepo) return;
    setPushing(true); setPushLog([]);
    setStep("push");
    const addLog = (msg, level) => setPushLog(prev => [...prev, { msg, level }]);

    try {
      const res = await fetch(`${BACKEND}/api/testbed/projects/${project.id}/push`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          targetRepo:   form.targetRepo,
          targetBranch: form.targetBranch || `atp/tests-${project.name}`,
          baseBranch:   form.baseBranch || "main",
          createPR:     form.createPR,
        }),
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "log")  addLog(evt.msg, evt.level);
            if (evt.type === "done" && evt.pr) addLog(`✓ PR: ${evt.pr.html_url}`, "success");
          } catch {}
        }
      }
    } catch (e) { addLog(`✗ ${e.message}`, "error"); }
    setPushing(false);
  };

  const selectedSuite = suites.find(s => s.id === form.suiteId);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, fontFamily:"'IBM Plex Mono',monospace" }}>
      <div style={{ background:"#0a0e12", border:"0.5px solid #2d6aad", borderRadius:12, width:620, maxHeight:"85vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"16px 20px", borderBottom:"0.5px solid #1e3a5f", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>🧪 Export as Test Project</div>
            <div style={{ fontSize:10, color:"#4a7fa5", marginTop:2 }}>
              {plan.useCases?.length || 0} use cases → complete {selectedSuite?.framework || "playwright"} project
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#4a7fa5", cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>

          {/* ── Config ── */}
          {step === "config" && (
            <>
              {/* Suite picker */}
              {suites.length > 0 ? (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, color:"#7ec8ff", fontWeight:600, marginBottom:8 }}>◈ Match style of connected repo</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {suites.map(s => (
                      <div key={s.id} onClick={() => setForm(p => ({ ...p, suiteId: s.id }))}
                        style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:6, cursor:"pointer", border:`0.5px solid ${form.suiteId===s.id?"#4d9de0":"#1e3a5f"}`, background:form.suiteId===s.id?"#1a3050":"#0d1520" }}>
                        <span style={{ fontSize:14 }}>{{ playwright:"🎭", cypress:"🌲", jest:"🃏", pytest:"🐍" }[s.framework]||"📦"}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:11, color:form.suiteId===s.id?"#7ec8ff":"#b0c8e0" }}>{s.name}</div>
                          <div style={{ fontSize:9, color:"#2d6aad" }}>{s.repoFullName} · {s.framework}/{s.language}</div>
                        </div>
                        {form.suiteId===s.id && <span style={{ color:"#4caf50", fontSize:14 }}>✓</span>}
                      </div>
                    ))}
                    <div onClick={() => setForm(p => ({ ...p, suiteId: "" }))}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:6, cursor:"pointer", border:`0.5px solid ${!form.suiteId?"#4d9de0":"#1e3a5f"}`, background:!form.suiteId?"#1a3050":"#0d1520", fontSize:11, color:!form.suiteId?"#7ec8ff":"#4a7fa5" }}>
                      <span>📦</span> Use default (Playwright/TypeScript)
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"12px 14px", marginBottom:16, background:"#0a0e12", fontSize:10, color:"#4a7fa5" }}>
                  💡 No repos connected — will generate a Playwright/TypeScript project.<br/>
                  Connect a repo in <strong style={{ color:"#7ec8ff" }}>🧪 Testbed</strong> to match your existing style.
                </div>
              )}

              {/* Summary */}
              <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"12px 14px", marginBottom:16, background:"#0d1520" }}>
                <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:8 }}>What will be generated</div>
                {[
                  [`${plan.useCases?.length || 0} test files`, "one per category with all use cases"],
                  ["Config file", `playwright.config.ts / cypress.config.ts`],
                  ["Shared helpers", "auth helper, test data fixtures"],
                  ["package.json", "ready to npm install"],
                  ["README.md", "setup and run instructions"],
                  [".gitignore", "node_modules, dist, reports"],
                ].map(([l, d]) => (
                  <div key={l} style={{ display:"flex", gap:8, marginBottom:5, fontSize:10 }}>
                    <span style={{ color:"#4caf50" }}>✓</span>
                    <span style={{ color:"#a0c0d8", minWidth:140 }}>{l}</span>
                    <span style={{ color:"#4a7fa5" }}>{d}</span>
                  </div>
                ))}
              </div>

              <button onClick={generate} className="rb" style={{ width:"100%", padding:"12px 0", fontSize:12 }}>
                ◈ Generate Test Project
              </button>
            </>
          )}

          {/* ── Generating ── */}
          {step === "generating" && (
            <>
              <div style={{ fontSize:11, color:"#c8a0f0", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ display:"flex", gap:3 }}>
                  {[0,.2,.4].map((d,i) => <div key={i} style={{ width:5,height:5,borderRadius:"50%",background:"#c8a0f0",animation:`pulse 0.8s ${d}s infinite` }}/>)}
                </div>
                Generating test project...
              </div>
              <div ref={logRef} style={{ background:"#0a0e12", borderRadius:6, padding:"10px 12px", maxHeight:320, overflowY:"auto" }}>
                {log.map((l,i) => (
                  <div key={i} style={{ fontSize:9, marginBottom:3, lineHeight:1.6, color:l.level==="error"?"#ff6b6b":l.level==="success"?"#7ec87f":l.level==="ai"?"#c8a0f0":l.level==="warn"?"#ffaa44":"#6a8aa8" }}>
                    {l.level==="error"?"✗":l.level==="success"?"✓":l.level==="ai"?"◈":"›"} {l.msg}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Done ── */}
          {(step === "done" || step === "push") && project && (
            <>
              {step === "done" && (
                <div style={{ border:"0.5px solid #4caf50", borderRadius:8, padding:"14px 16px", background:"#0a1a0a", marginBottom:16 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"#4caf50", marginBottom:6 }}>✓ Project generated</div>
                  <div style={{ display:"flex", gap:16, fontSize:10, color:"#4a7fa5" }}>
                    <span>{project.files?.length} files</span>
                    <span>{project.framework}/{project.language}</span>
                    <span>{project.files?.filter(f=>f.path.includes("tests/")).length} test files</span>
                  </div>
                  <div style={{ display:"flex", gap:6, marginTop:12 }}>
                    <button onClick={downloadProject}
                      style={{ flex:1, background:"linear-gradient(135deg,#0a1a30,#0a0a1e)", border:"0.5px solid #4d9de0", borderRadius:6, color:"#7ec8ff", cursor:"pointer", fontSize:11, padding:"9px 0", fontFamily:"inherit" }}>
                      ⬇ Download as ZIP
                    </button>
                    <button onClick={() => setStep("push")}
                      style={{ flex:1, background:"linear-gradient(135deg,#1a0a2e,#0a0a1e)", border:"0.5px solid #c8a0f0", borderRadius:6, color:"#c8a0f0", cursor:"pointer", fontSize:11, padding:"9px 0", fontFamily:"inherit" }}>
                      🐙 Push to GitHub
                    </button>
                  </div>
                </div>
              )}

              {/* Generation log */}
              <div style={{ border:"0.5px solid #1e3a5f", borderRadius:6, background:"#0a0e12", overflow:"hidden", marginBottom:16 }}>
                <div style={{ padding:"5px 12px", fontSize:9, color:"#2d6aad", borderBottom:"0.5px solid #1e3a5f" }}>Generation Log</div>
                <div ref={logRef} style={{ maxHeight:120, overflowY:"auto", padding:"8px 12px" }}>
                  {log.map((l,i) => (
                    <div key={i} style={{ fontSize:9, marginBottom:2, color:l.level==="success"?"#7ec87f":l.level==="ai"?"#c8a0f0":"#4a7fa5" }}>
                      {l.level==="success"?"✓":l.level==="ai"?"◈":"›"} {l.msg}
                    </div>
                  ))}
                </div>
              </div>

              {/* Push form */}
              {step === "push" && (
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:12 }}>🐙 Push to GitHub</div>

                  {/* Repo picker */}
                  {repos.length > 0 && (
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.06em" }}>Pick target repo</div>
                      <select value={form.targetRepo} onChange={e=>setForm(p=>({...p,targetRepo:e.target.value}))} style={{ ...selStyle }}>
                        <option value="">Select repo...</option>
                        {repos.map(r => <option key={r.fullName} value={r.fullName}>{r.fullName}</option>)}
                      </select>
                    </div>
                  )}

                  {repos.length === 0 && (
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4 }}>Target repo (owner/name)</div>
                      <input value={form.targetRepo} onChange={e=>setForm(p=>({...p,targetRepo:e.target.value}))}
                        placeholder="owner/test-repo" style={{ ...selStyle }} />
                    </div>
                  )}

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4 }}>Branch name</div>
                      <input value={form.targetBranch} onChange={e=>setForm(p=>({...p,targetBranch:e.target.value}))}
                        placeholder={`atp/tests-${project.name}`} style={{ ...selStyle }} />
                    </div>
                    <div>
                      <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4 }}>Base branch</div>
                      <input value={form.baseBranch} onChange={e=>setForm(p=>({...p,baseBranch:e.target.value}))}
                        placeholder="main" style={{ ...selStyle }} />
                    </div>
                  </div>

                  <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:12 }}>
                    <input type="checkbox" checked={form.createPR} onChange={e=>setForm(p=>({...p,createPR:e.target.checked}))} />
                    <span style={{ fontSize:10, color:"#a0c0d8" }}>Open a pull request after pushing</span>
                  </label>

                  <button onClick={pushToGitHub} disabled={pushing || !form.targetRepo}
                    style={{ width:"100%", background:"linear-gradient(135deg,#1a0a2e,#0a0a1e)", border:"0.5px solid #c8a0f0", borderRadius:6, color:pushing?"#4a7fa5":"#c8a0f0", cursor:pushing?"default":"pointer", fontSize:11, fontWeight:600, padding:"10px 0", fontFamily:"inherit" }}>
                    {pushing ? "◈ Pushing..." : "Push to GitHub"}
                  </button>

                  {pushLog.length > 0 && (
                    <div style={{ marginTop:10, background:"#0a0e12", borderRadius:6, padding:"8px 12px", maxHeight:160, overflowY:"auto" }} ref={pushRef}>
                      {pushLog.map((l,i) => (
                        <div key={i} style={{ fontSize:9, marginBottom:3, lineHeight:1.6, color:l.level==="error"?"#ff6b6b":l.level==="success"?"#7ec87f":l.level==="ai"?"#c8a0f0":"#6a8aa8" }}>
                          {l.level==="error"?"✗":l.level==="success"?"✓":"›"} {l.msg}
                        </div>
                      ))}
                    </div>
                  )}

                  {step === "done" || (
                    <button onClick={() => { setStep("done"); setPushLog([]); }} style={{ width:"100%", marginTop:8, background:"none", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#4a7fa5", cursor:"pointer", fontSize:10, padding:"7px 0", fontFamily:"inherit" }}>
                      ← Back to download
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const selStyle = {
  width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f",
  borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"7px 9px",
  outline:"none", fontFamily:"'IBM Plex Mono',monospace",
};
