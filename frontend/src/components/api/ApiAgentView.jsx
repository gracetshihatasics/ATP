import { useState, useEffect, useRef } from "react";
import { CredentialPicker }     from "../shared/CredentialPicker.jsx";
import { resolveContext }        from "../../services/vault.js";
import { METHOD_COLORS }         from "../../constants/theme.js";
import { ScenarioDetailPanel }   from "./ScenarioDetailPanel.jsx";

const BACKEND = "http://localhost:3579";

const STATUS_C = {
  pass:    { color:"#4caf50", bg:"#0a1a0a", icon:"✓" },
  fail:    { color:"#ff3b3b", bg:"#1a0808", icon:"✗" },
  error:   { color:"#ff8c00", bg:"#1a0f00", icon:"⚠" },
  running: { color:"#c8a0f0", bg:"#1a0a2e", icon:"●" },
};

const PRIORITY_C = { Critical:"#ff3b3b", High:"#ff8c00", Medium:"#f0c040", Low:"#4a7fa5" };

export function ApiAgentView() {
  // ── Sources ───────────────────────────────────────────────────────────────
  const [sources,       setSources]      = useState([]);
  const [loadingSrc,    setLoadingSrc]   = useState(true);
  const [selectedSrc,   setSelectedSrc] = useState(null);
  const [collection,    setCollection]  = useState(null);
  const [colSearch,     setColSearch]   = useState("");
  const [showColPicker, setShowColPicker] = useState(false);

  // ── Saved suites ──────────────────────────────────────────────────────────
  const [savedSuites,  setSavedSuites]  = useState([]);
  const [sideTab,      setSideTab]      = useState("new"); // new | saved

  // ── Manual fallback ───────────────────────────────────────────────────────
  const [manualMode,   setManualMode]   = useState(false);
  const [swaggerUrl,   setSwaggerUrl]   = useState("");
  const [postmanJson,  setPostmanJson]  = useState("");
  const [manualType,   setManualType]   = useState("swagger");
  const [baseUrl,      setBaseUrl]      = useState("");

  // ── Spec + scenarios ──────────────────────────────────────────────────────
  const [spec,         setSpec]         = useState(null);
  const [scenarios,    setScenarios]    = useState([]);
  const [suiteId,      setSuiteId]      = useState(null);
  const [mode,         setMode]         = useState("quick"); // quick | deep
  const [filter,       setFilter]       = useState("all");
  const [contextUsed,  setContextUsed]  = useState(false);
  const [credentialId, setCredentialId] = useState(null);

  // ── Run state ─────────────────────────────────────────────────────────────
  const [phase,        setPhase]        = useState("idle");
  const [log,          setLog]          = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [openDetail,   setOpenDetail]   = useState(null); // scenario open in detail panel
  const [runResults,   setRunResults]   = useState({});
  const [suiteResult,  setSuiteResult]  = useState(null);
  const [activeTab,    setActiveTab]    = useState("scenarios");
  const logRef = useRef(null);

  useEffect(() => { loadSources(); loadSuites(); }, []);
  useEffect(() => {
    setTimeout(() => logRef.current?.scrollTo({ top:99999, behavior:"smooth" }), 50);
  }, [log.length]);

  const addLog = (msg, level="info") => setLog(p => [...p, { msg, level }]);

  const loadSources = async () => {
    setLoadingSrc(true);
    try {
      const res  = await fetch(`${BACKEND}/api/agent/sources`);
      const data = await res.json();
      setSources(data.sources || []);
    } catch {} finally { setLoadingSrc(false); }
  };

  const loadSuites = async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/agent/suites`);
      const data = await res.json();
      setSavedSuites(data.suites || []);
    } catch {}
  };

  const loadSuite = async (suite) => {
    try {
      const res  = await fetch(`${BACKEND}/api/agent/suites/${suite.id}`);
      const data = await res.json();
      if (data.ok) {
        setSpec(data.suite.spec);
        setScenarios(data.suite.scenarios || []);
        setSuiteId(data.suite.id);
        setMode(data.suite.mode || "quick");
        setRunResults({});
        setSuiteResult(null);
        setLog([{ msg:`Loaded saved suite: ${data.suite.name}`, level:"system" }]);
        setPhase("done");
        setActiveTab("scenarios");
        setSideTab("new");
      }
    } catch (e) { addLog(`Failed to load suite: ${e.message}`, "error"); }
  };

  const deleteSuite = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this suite?")) return;
    await fetch(`${BACKEND}/api/agent/suites/${id}`, { method:"DELETE" });
    loadSuites();
  };

  const exportSuite = (id, format) => {
    window.open(`${BACKEND}/api/agent/suites/${id}/export?format=${format}`, "_blank");
  };

  const filteredCols = (selectedSrc?.collections || []).filter(c =>
    !colSearch || c.name.toLowerCase().includes(colSearch.toLowerCase())
  );

  // ── Import ────────────────────────────────────────────────────────────────
  const importSpec = async () => {
    setPhase("importing"); setLog([]); setSpec(null); setScenarios([]); setSuiteResult(null); setRunResults({});
    try {
      addLog(selectedSrc
        ? `◈ Loading from ${selectedSrc.name}${collection ? ` → ${collection.name}` : ""}...`
        : "◈ Fetching spec...", "ai");

      const importBody = selectedSrc
        ? { integrationId:selectedSrc.integrationId, collectionId:collection?.id }
        : manualType === "swagger" ? { swaggerUrl, baseUrl } : { postmanJson, baseUrl };

      const r    = await fetch(`${BACKEND}/api/agent/import`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(importBody),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error);
      setSpec(data.spec);
      addLog(`✓ ${data.spec.endpoints?.length || 0} endpoint(s) loaded from ${data.spec.title}`, "success");
      addLog(`  Source: ${data.spec.source} · Base URL: ${data.spec.baseUrl || "manual"}`, "info");
      setPhase("ready");
    } catch (err) {
      addLog(`✗ ${err.message}`, "error");
      setPhase("idle");
    }
  };

  // ── Build scenarios — SSE ─────────────────────────────────────────────────
  const buildScenarios = async () => {
    if (!spec) return;
    setPhase("building"); setScenarios([]); setSuiteResult(null); setRunResults({});

    let credentials = {};
    if (credentialId) credentials = await resolveContext(credentialId);

    const res     = await fetch(`${BACKEND}/api/agent/build`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        spec, url: spec.baseUrl, mode, credentials,
        integrationId: selectedSrc?.integrationId,
        collectionId:  collection?.id,
      }),
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
          if (evt.type === "log")   addLog(evt.msg, evt.level);
          if (evt.type === "done")  {
            setScenarios(evt.scenarios || []);
            setSuiteId(evt.suiteId);
            setContextUsed(evt.contextUsed || false);
            setPhase("done");
            setActiveTab("scenarios");
            await loadSuites();
          }
          if (evt.type === "error") {
            addLog(`✗ Error: ${evt.msg}`, "error");
            addLog("Check backend terminal for details", "warn");
            setPhase("ready");
          }
        } catch {}
      }
    }
  };

  // ── Run one scenario ──────────────────────────────────────────────────────
  const runOne = async (scenario) => {
    setSelected(scenario);
    setPhase("running");
    setRunResults(p => ({ ...p, [scenario.id]: { status:"running" } }));
    addLog(`▶ Running: ${scenario.name}`, "system");

    let credentials = {};
    if (credentialId) credentials = await resolveContext(credentialId);

    const res     = await fetch(`${BACKEND}/api/agent/run`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ scenario, spec, credentials, suiteId }),
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
          if (evt.type === "log")  addLog(evt.msg, evt.level);
          if (evt.type === "step") addLog(`  ${evt.status==="pass"?"✓":"✗"} ${evt.description}`, evt.status==="pass"?"success":"error");
          if (evt.type === "done") {
            setRunResults(p => ({ ...p, [scenario.id]: evt.result }));
            setPhase("done");
          }
        } catch {}
      }
    }
  };

  // ── Run all ───────────────────────────────────────────────────────────────
  const runAll = async () => {
    setPhase("running"); setSuiteResult(null);
    let toRun = scenarios;
    if (filter !== "all") toRun = toRun.filter(s => s.priority?.toLowerCase() === filter);
    addLog(`▶ Running ${toRun.length} scenario(s) [${filter}]...`, "system");

    let credentials = {};
    if (credentialId) credentials = await resolveContext(credentialId);

    const res     = await fetch(`${BACKEND}/api/agent/run-all`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ scenarios:toRun, spec, credentials, filter, suiteId }),
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
          if (evt.type === "log")            addLog(evt.msg, evt.level);
          if (evt.type === "scenario_start") addLog(`▶ [${evt.index+1}/${evt.total}] ${evt.name}`, "system");
          if (evt.type === "scenario_done")  {
            setRunResults(p => ({ ...p, [scenarios[evt.index]?.id]: { status:evt.status, passed:evt.passed, failed:evt.failed } }));
            addLog(`  ${evt.status==="pass"?"✓":"✗"}`, evt.status==="pass"?"success":"error");
          }
          if (evt.type === "suite_done") { setSuiteResult(evt); setPhase("done"); }
        } catch {}
      }
    }
  };

  const ready   = scenarios.length > 0;
  const canBuild = !!spec && phase !== "building" && phase !== "importing" && phase !== "running";
  const running  = phase === "running";
  const canImport = manualMode
    ? (manualType === "swagger" ? !!swaggerUrl : !!postmanJson)
    : (selectedSrc && (selectedSrc.type !== "postman" || !!collection));

  const visibleScenarios = filter === "all" ? scenarios
    : scenarios.filter(s => s.priority?.toLowerCase() === filter);

  return (
    <div style={{ display:"flex", height:"100%", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* ── Left panel ── */}
      <div style={{ width:300, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>

        {/* Side tabs */}
        <div style={{ display:"flex", borderBottom:"0.5px solid #1e3a5f" }}>
          {[["new","New Suite"],["saved",`Saved (${savedSuites.length})`]].map(([t,l]) => (
            <button key={t} onClick={() => setSideTab(t)}
              style={{ flex:1, background:"none", border:"none", borderBottom:sideTab===t?"2px solid #4d9de0":"2px solid transparent", color:sideTab===t?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"9px 0", fontFamily:"inherit", fontWeight:sideTab===t?600:400 }}>
              {l}
            </button>
          ))}
        </div>

        {/* ── New suite panel ── */}
        {sideTab === "new" && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflowY:"auto" }}>

            {/* Source */}
            <div style={{ padding:"12px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
              <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", marginBottom:8, textTransform:"uppercase" }}>API Source</div>

              {!manualMode && (
                <>
                  {loadingSrc && <div style={{ fontSize:9, color:"#4a7fa5" }}>Loading integrations...</div>}
                  {!loadingSrc && sources.length === 0 && (
                    <div style={{ border:"0.5px solid #f0c04040", borderRadius:6, padding:"9px 11px", background:"#1a1500", fontSize:9, color:"#f0c040", lineHeight:1.8 }}>
                      ⚠ No Postman or Swagger integrations.<br/>Add one in <strong style={{ color:"#7ec8ff" }}>🔗 Context → Integrations</strong>
                    </div>
                  )}
                  {sources.map(src => (
                    <div key={src.integrationId}
                      onClick={() => { setSelectedSrc(src); setCollection(null); setColSearch(""); }}
                      style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:6, border:`0.5px solid ${selectedSrc?.integrationId===src.integrationId?"#4d9de0":"#1e3a5f"}`, background:selectedSrc?.integrationId===src.integrationId?"#1a3050":"#0d1520", cursor:"pointer", marginBottom:5 }}>
                      <span style={{ fontSize:13 }}>{src.type==="postman"?"📮":"📄"}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:10, color:selectedSrc?.integrationId===src.integrationId?"#7ec8ff":"#b0c8e0" }}>{src.name}</div>
                        <div style={{ fontSize:8, color:"#2d6aad" }}>{src.type==="postman"?`${src.collections?.length||0} collection(s)`:"Swagger/OpenAPI"}</div>
                      </div>
                      {selectedSrc?.integrationId===src.integrationId && <span style={{ color:"#4caf50" }}>✓</span>}
                    </div>
                  ))}

                  {/* Collection picker */}
                  {selectedSrc?.type === "postman" && (
                    <div style={{ marginTop:8, position:"relative" }}>
                      <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4 }}>Collection</div>
                      <input
                        value={collection ? collection.name : colSearch}
                        onChange={e => { setColSearch(e.target.value); setCollection(null); setShowColPicker(true); }}
                        onFocus={() => setShowColPicker(true)}
                        placeholder="Type to search..."
                        style={{ width:"100%", background:"#0d1520", border:`0.5px solid ${collection?"#4caf50":"#1e3a5f"}`, borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"6px 8px", outline:"none", fontFamily:"inherit" }}
                      />
                      {showColPicker && filteredCols.length > 0 && (
                        <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:100, background:"#0a0e12", border:"0.5px solid #2d6aad", borderRadius:5, maxHeight:150, overflowY:"auto", boxShadow:"0 4px 16px #000a" }}>
                          {filteredCols.map(c => (
                            <div key={c.id} onClick={() => { setCollection(c); setColSearch(""); setShowColPicker(false); }}
                              style={{ padding:"7px 12px", cursor:"pointer", fontSize:10, color:"#b0c8e0", borderBottom:"0.5px solid #0d1a2a" }}
                              onMouseEnter={e=>e.currentTarget.style.background="#1a3050"}
                              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                              {c.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button onClick={() => setManualMode(true)}
                    style={{ background:"none", border:"none", color:"#2d6aad", cursor:"pointer", fontSize:9, padding:"6px 0 0", fontFamily:"inherit", textDecoration:"underline" }}>
                    or enter manually →
                  </button>
                </>
              )}

              {manualMode && (
                <>
                  <div style={{ display:"flex", gap:4, marginBottom:7 }}>
                    {["swagger","postman"].map(t => (
                      <button key={t} onClick={() => setManualType(t)}
                        style={{ flex:1, background:manualType===t?"#1a3050":"#0d1520", border:`0.5px solid ${manualType===t?"#4d9de0":"#1e3a5f"}`, borderRadius:4, color:manualType===t?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:9, padding:"5px 0", fontFamily:"inherit" }}>
                        {t==="swagger"?"Swagger URL":"Postman JSON"}
                      </button>
                    ))}
                  </div>
                  {manualType === "swagger"
                    ? <input value={swaggerUrl} onChange={e=>setSwaggerUrl(e.target.value)} placeholder="https://api.example.com/swagger.json" style={inp} />
                    : <textarea value={postmanJson} onChange={e=>setPostmanJson(e.target.value)} placeholder="Paste Postman JSON..." rows={3} style={{ ...inp, resize:"vertical" }} />
                  }
                  <input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="Base URL override" style={{ ...inp, marginTop:5 }} />
                  <button onClick={() => setManualMode(false)}
                    style={{ background:"none", border:"none", color:"#2d6aad", cursor:"pointer", fontSize:9, padding:"4px 0 0", fontFamily:"inherit", textDecoration:"underline" }}>
                    ← use integration
                  </button>
                </>
              )}
            </div>

            {/* Mode */}
            <div style={{ padding:"10px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
              <div style={{ fontSize:9, color:"#2d6aad", marginBottom:7, textTransform:"uppercase", letterSpacing:"0.1em" }}>Generation Mode</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                <button onClick={() => setMode("quick")}
                  style={{ background:mode==="quick"?"#0a1a0a":"#0d1520", border:`0.5px solid ${mode==="quick"?"#4caf50":"#1e3a5f"}`, borderRadius:6, color:mode==="quick"?"#4caf50":"#4a7fa5", cursor:"pointer", padding:"8px 6px", fontFamily:"inherit", textAlign:"left" }}>
                  <div style={{ fontSize:11, fontWeight:600, marginBottom:2 }}>⚡ Quick</div>
                  <div style={{ fontSize:8, lineHeight:1.5, color:mode==="quick"?"#7ec87f":"#1e3a5f" }}>7 critical scenarios<br/>CI-ready · Fast</div>
                </button>
                <button onClick={() => setMode("deep")}
                  style={{ background:mode==="deep"?"#1a0a2e":"#0d1520", border:`0.5px solid ${mode==="deep"?"#c8a0f0":"#1e3a5f"}`, borderRadius:6, color:mode==="deep"?"#c8a0f0":"#4a7fa5", cursor:"pointer", padding:"8px 6px", fontFamily:"inherit", textAlign:"left" }}>
                  <div style={{ fontSize:11, fontWeight:600, marginBottom:2 }}>🔬 Deep</div>
                  <div style={{ fontSize:8, lineHeight:1.5, color:mode==="deep"?"#a080d0":"#1e3a5f" }}>Full coverage<br/>All endpoints · 30-60s</div>
                </button>
              </div>
            </div>

            {/* Filter + Credentials */}
            <div style={{ padding:"10px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
              <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5 }}>Run Filter</div>
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:10 }}>
                {["all","critical","high","medium","low"].map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    style={{ background:filter===f?"#1a3050":"#0d1520", border:`0.5px solid ${filter===f?"#4d9de0":"#1e3a5f"}`, borderRadius:4, color:filter===f?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:8, padding:"3px 7px", fontFamily:"inherit", textTransform:"capitalize" }}>
                    {f}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5 }}>Credentials</div>
              <CredentialPicker value={credentialId} onChange={setCredentialId} />
            </div>

            {/* Actions */}
            <div style={{ padding:"10px 14px" }}>

              {/* Always show load button when no spec yet */}
              {!spec && (
                <button onClick={importSpec} disabled={!canImport || phase==="importing"}
                  style={{ width:"100%", background:canImport?"linear-gradient(135deg,#1a3050,#0d1a30)":"#0a0e12", border:`0.5px solid ${canImport?"#4d9de0":"#1e3a5f"}`, borderRadius:6, color:canImport?"#7ec8ff":"#2d6aad", cursor:canImport?"pointer":"default", fontSize:11, fontWeight:600, padding:"9px 0", fontFamily:"inherit", letterSpacing:"0.05em", marginBottom:6 }}>
                  {phase==="importing" ? "◈ Loading spec..." : "① Load API Spec"}
                </button>
              )}

              {/* Spec loaded — show card + build button */}
              {spec && (
                <>
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"#0a0e12", borderRadius:5, marginBottom:8, border:"0.5px solid #1e3a5f" }}>
                    <span style={{ fontSize:10, color:"#4caf50" }}>✓</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:10, color:"#b0d0f0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{spec.title}</div>
                      <div style={{ fontSize:8, color:"#2d6aad" }}>{spec.endpoints?.length} endpoints · {spec.source}</div>
                    </div>
                    <button onClick={() => { setSpec(null); setScenarios([]); setSuiteId(null); setPhase("idle"); setLog([]); setRunResults({}); }}
                      style={{ background:"none", border:"none", color:"#4a7fa5", cursor:"pointer", fontSize:13, padding:"0", lineHeight:1, fontFamily:"inherit" }}>×</button>
                  </div>

                  <button onClick={buildScenarios} disabled={phase==="building" || phase==="importing" || phase==="running"}
                    style={{ width:"100%", background:phase==="building"?"#0a0e12":`linear-gradient(135deg,${mode==="deep"?"#1a0a2e,#0a0a1e":"#1a0a2e,#0a1020"})`, border:`0.5px solid ${phase==="building"?"#1e3a5f":mode==="deep"?"#c8a0f0":"#5b3a8a"}`, borderRadius:6, color:phase==="building"?"#4a7fa5":mode==="deep"?"#c8a0f0":"#a080d0", cursor:phase==="building"?"default":"pointer", fontSize:11, fontWeight:600, padding:"9px 0", fontFamily:"inherit", letterSpacing:"0.05em", marginBottom:6 }}>
                    {phase==="building"
                      ? `◈ ${mode==="deep"?"Deep scan (30-60s)...":"Building 7 scenarios..."}`
                      : `② ${mode==="deep"?"🔬 Deep — Full Coverage":"⚡ Quick — 7 CI Scenarios"}`
                    }
                  </button>
                </>
              )}

              {/* Run button — only when scenarios exist */}
              {scenarios.length > 0 && phase !== "building" && (
                <button onClick={runAll} disabled={phase==="running"}
                  style={{ width:"100%", background:phase==="running"?"#0a0e12":"linear-gradient(135deg,#0a1a0a,#0a0e12)", border:`0.5px solid ${phase==="running"?"#1e3a5f":"#4caf50"}`, borderRadius:6, color:phase==="running"?"#2d6aad":"#4caf50", cursor:phase==="running"?"default":"pointer", fontSize:11, fontWeight:600, padding:"9px 0", fontFamily:"inherit" }}>
                  {phase==="running" ? "◈ Running..." : `③ Run ${filter==="all"?scenarios.length:visibleScenarios.length} Scenario(s)`}
                </button>
              )}

              {/* Suite result */}
              {suiteResult && (
                <div style={{ marginTop:8, border:`0.5px solid ${suiteResult.failed===0?"#4caf50":"#ff3b3b"}`, borderRadius:6, padding:"8px 10px", background:suiteResult.failed===0?"#0a1a0a":"#1a0808", textAlign:"center" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:suiteResult.failed===0?"#4caf50":"#ff3b3b" }}>
                    {suiteResult.failed===0?"✓ All passed":"✗ Some failed"}
                  </div>
                  <div style={{ fontSize:9, color:"#6a8aa8" }}>{suiteResult.passed}/{suiteResult.total} passed</div>
                </div>
              )}

              {/* Export */}
              {suiteId && scenarios.length > 0 && (
                <div style={{ marginTop:8 }}>
                  <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5 }}>Export suite</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:4 }}>
                    {[["json","JSON"],["postman","Postman"],["jest","Jest"]].map(([fmt,lbl]) => (
                      <button key={fmt} onClick={() => exportSuite(suiteId, fmt)}
                        style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:4, color:"#4a7fa5", cursor:"pointer", fontSize:9, padding:"5px 0", fontFamily:"inherit" }}>
                        ⬇ {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Context indicator */}
              {contextUsed && (
                <div style={{ marginTop:8, fontSize:9, color:"#c8a0f0", background:"#1a0a2e", borderRadius:4, padding:"5px 8px", border:"0.5px solid #5b3a8a" }}>
                  ◈ Integration context injected
                </div>
              )}
            </div>

            {/* Log */}
            <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", borderTop:"0.5px solid #1e3a5f", minHeight: phase === "building" ? 160 : 80 }}>
              <div style={{ fontSize:8, color:"#1e3a5f", padding:"3px 12px", textTransform:"uppercase", letterSpacing:"0.1em", display:"flex", justifyContent:"space-between" }}>
                <span>Log {phase==="building"&&<span style={{ color:"#c8a0f0" }}>● live</span>}</span>
                {log.length > 0 && <button onClick={() => setLog([])} style={{ background:"none", border:"none", color:"#1e3a5f", cursor:"pointer", fontSize:8, padding:0, fontFamily:"inherit" }}>clear</button>}
              </div>
              <div ref={logRef} style={{ flex:1, overflowY:"auto", padding:"2px 10px 8px" }}>
                {log.map((l,i) => (
                  <div key={i} style={{ fontSize:9, marginBottom:2, lineHeight:1.5,
                    color:l.level==="error"?"#ff6b6b":l.level==="success"?"#7ec87f":l.level==="ai"?"#c8a0f0":l.level==="system"?"#7ec8ff":"#6a8aa8" }}>
                    {l.level==="error"?"✗":l.level==="success"?"✓":l.level==="ai"?"◈":"›"} {l.msg}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Saved suites panel ── */}
        {sideTab === "saved" && (
          <div style={{ flex:1, overflowY:"auto" }}>
            {savedSuites.length === 0 && (
              <div style={{ fontSize:9, color:"#1e3a5f", textAlign:"center", marginTop:24, lineHeight:2 }}>
                No saved suites yet.<br/>Build one to save it.
              </div>
            )}
            {savedSuites.map(s => (
              <div key={s.id} onClick={() => loadSuite(s)}
                style={{ padding:"10px 12px", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer" }}
                onMouseEnter={e=>e.currentTarget.style.background="#0d1520"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:6 }}>
                  <span style={{ fontSize:9, marginTop:1 }}>{s.mode==="deep"?"🔬":"⚡"}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, color:"#b0c8e0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.specTitle}</div>
                    <div style={{ fontSize:8, color:"#2d6aad" }}>{s.scenarioCount} scenarios · {s.mode}</div>
                    <div style={{ fontSize:8, color:"#1e3a5f" }}>{new Date(s.createdAt).toLocaleString()}</div>
                  </div>
                  <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                    {["json","postman","jest"].map(fmt => (
                      <button key={fmt} onClick={e=>{ e.stopPropagation(); exportSuite(s.id,fmt); }}
                        title={`Export as ${fmt}`}
                        style={{ background:"none", border:"0.5px solid #1e3a5f", borderRadius:3, color:"#2d6aad", cursor:"pointer", fontSize:7, padding:"2px 4px", fontFamily:"inherit" }}>
                        {fmt[0].toUpperCase()}
                      </button>
                    ))}
                    <button onClick={e=>deleteSuite(s.id,e)}
                      style={{ background:"none", border:"none", color:"#3a1a1a", cursor:"pointer", fontSize:11, padding:"0 2px", fontFamily:"inherit" }}
                      onMouseEnter={e=>e.currentTarget.style.color="#ff6b6b"}
                      onMouseLeave={e=>e.currentTarget.style.color="#3a1a1a"}>
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Main panel ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Sub-tabs */}
        {ready && (
          <div style={{ background:"#090d11", borderBottom:"0.5px solid #1e3a5f", padding:"0 14px", display:"flex", alignItems:"stretch", height:36, flexShrink:0 }}>
            {[["scenarios",`Scenarios (${visibleScenarios.length}${filter!=="all"?"/"+scenarios.length:""})`],["results",`Results (${Object.keys(runResults).length})`]].map(([t,l]) => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{ background:"none", border:"none", borderBottom:activeTab===t?"2px solid #4d9de0":"2px solid transparent", color:activeTab===t?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"0 14px", fontFamily:"inherit", fontWeight:activeTab===t?600:400 }}>
                {l}
              </button>
            ))}
            {spec && <div style={{ marginLeft:"auto", fontSize:9, color:"#2d6aad", alignSelf:"center" }}>{spec.baseUrl}</div>}
          </div>
        )}

        <div style={{ flex:1, overflowY:"auto" }}>
          {/* Empty state */}
          {!ready && phase === "idle" && (
            <div style={{ textAlign:"center", marginTop:80 }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🔌</div>
              <div style={{ fontSize:12, color:"#2d6aad", marginBottom:8 }}>
                {sources.length > 0 ? "Select a source and load the spec" : "Connect Postman or Swagger in 🔗 Context → Integrations"}
              </div>
              <div style={{ fontSize:10, color:"#1e3a5f", lineHeight:2 }}>
                Quick: 7 critical CI scenarios in seconds<br/>
                Deep: full endpoint coverage + error cases + security
              </div>
            </div>
          )}

          {/* Scenarios tab — list + detail panel side by side */}
          {ready && activeTab === "scenarios" && (
            <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>

              {/* Scenario list */}
              <div style={{ width: openDetail ? 260 : "100%", flexShrink:0, overflowY:"auto", padding:"10px", borderRight: openDetail?"0.5px solid #1e3a5f":"none", transition:"width 0.2s" }}>
                {visibleScenarios.map((sc, i) => {
                  const res    = runResults[sc.id];
                  const rc     = res ? (STATUS_C[res.status] || STATUS_C.error) : null;
                  const isOpen = openDetail?.id === sc.id;
                  return (
                    <div key={sc.id || i}
                      style={{ border:`0.5px solid ${isOpen?"#4d9de0":rc?rc.color+"40":"#1a2a3a"}`, borderRadius:7, padding:"10px 12px", marginBottom:7, background:isOpen?"#0f1c2e":"#0d1520", cursor:"pointer" }}
                      onClick={() => setOpenDetail(isOpen ? null : sc)}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                        {rc && <span style={{ fontSize:12, flexShrink:0 }}>{rc.icon}</span>}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:10, fontWeight:600, color: isOpen?"#7ec8ff":"#b0d0f0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sc.name}</div>
                          {!openDetail && <div style={{ fontSize:8, color:"#4a7fa5", marginTop:1 }}>{sc.description?.slice(0,60)}</div>}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {sc.priority && <span style={{ fontSize:7, padding:"1px 5px", borderRadius:3, color:PRIORITY_C[sc.priority]||"#4a7fa5", background:`${PRIORITY_C[sc.priority]||"#4a7fa5"}15`, border:`0.5px solid ${PRIORITY_C[sc.priority]||"#4a7fa5"}30` }}>{sc.priority}</span>}
                        <span style={{ fontSize:7, color:"#2d6aad" }}>{sc.steps?.length||0} steps</span>
                        {rc && <span style={{ fontSize:7, padding:"1px 5px", borderRadius:3, background:rc.bg, border:`0.5px solid ${rc.color}`, color:rc.color }}>{res.status}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Detail panel */}
              {openDetail && (
                <div style={{ flex:1, overflow:"hidden" }}>
                  <ScenarioDetailPanel
                    scenario={openDetail}
                    runResult={runResults[openDetail.id] || null}
                    onRunScenario={() => runOne(openDetail)}
                    onClose={() => setOpenDetail(null)}
                    running={running}
                  />
                </div>
              )}

              {/* No scenario open — hint */}
              {!openDetail && visibleScenarios.length === 0 && (
                <div style={{ textAlign:"center", marginTop:60, color:"#1e3a5f", fontSize:11, padding:20 }}>
                  No scenarios match the current filter.
                </div>
              )}
            </div>
          )}

          {/* Results tab */}
          {ready && activeTab === "results" && (
            <div style={{ overflowY:"auto", height:"100%" }}>
              {Object.keys(runResults).length === 0 && (
                <div style={{ textAlign:"center", marginTop:40, color:"#1e3a5f", fontSize:11, padding:20 }}>
                  No results yet — run some scenarios.
                </div>
              )}
              {Object.entries(runResults).map(([id, result]) => {
                const sc  = scenarios.find(s => s.id === id);
                const rc  = STATUS_C[result.status] || STATUS_C.error;
                return (
                  <div key={id} style={{ borderBottom:"0.5px solid #0d1a2a" }}>
                    {/* Click to open full detail */}
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", cursor:"pointer", background:openDetail?.id===id?"#0f1c2e":"transparent" }}
                      onClick={() => { setOpenDetail(sc||null); setActiveTab("scenarios"); }}>
                      <span style={{ fontSize:13 }}>{rc.icon}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:"#b0d0f0" }}>{sc?.name || id}</div>
                        <div style={{ fontSize:9, color:rc.color }}>{result.status?.toUpperCase()} · {result.passed||0}/{(result.passed||0)+(result.failed||0)} steps · {result.duration||0}ms</div>
                      </div>
                      <span style={{ fontSize:9, color:"#2d6aad" }}>view →</span>
                    </div>
                    {/* Step summary */}
                    <div style={{ padding:"0 14px 8px" }}>
                      {result.steps?.map((step, i) => (
                        <div key={i} style={{ display:"flex", gap:8, padding:"3px 0", fontSize:9, borderBottom:"0.5px solid #0d1a2a" }}>
                          <span style={{ color:step.status==="pass"?"#4caf50":"#ff3b3b", flexShrink:0 }}>{step.status==="pass"?"✓":"✗"}</span>
                          <span style={{ color:"#6a8aa8", flex:1 }}>{step.name}</span>
                          {step.statusCode && <span style={{ color:"#4d9de0", flexShrink:0 }}>{step.statusCode}</span>}
                          {step.duration  && <span style={{ color:"#2d6aad",  flexShrink:0 }}>{step.duration}ms</span>}
                          {step.error     && <span style={{ color:"#ff8c00",  flexShrink:0 }}>{step.error.slice(0,40)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inp = { width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"7px 9px", outline:"none", fontFamily:"'IBM Plex Mono',monospace" };
