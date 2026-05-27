import { useState, useEffect, useRef } from "react";
import { CredentialPicker } from "../shared/CredentialPicker.jsx";
import { resolveContext }   from "../../services/vault.js";
import { METHOD_COLORS }    from "../../constants/theme.js";

const BACKEND = "http://localhost:3579";

const STATUS_C = {
  pass:  { color:"#4caf50", bg:"#0a1a0a", icon:"✓" },
  fail:  { color:"#ff3b3b", bg:"#1a0808", icon:"✗" },
  error: { color:"#ff8c00", bg:"#1a0f00", icon:"⚠" },
};

export function ApiAgentView() {
  // ── Source selection ──────────────────────────────────────────────────────
  const [sources,       setSources]       = useState([]);
  const [loadingSrc,    setLoadingSrc]    = useState(true);
  const [selectedSrc,   setSelectedSrc]  = useState(null);  // integration source object
  const [collection,    setCollection]   = useState(null);  // { id, name } for Postman
  const [colSearch,     setColSearch]    = useState("");
  const [showColPicker, setShowColPicker] = useState(false);

  // ── Manual fallback ───────────────────────────────────────────────────────
  const [manualMode,   setManualMode]   = useState(false);
  const [swaggerUrl,   setSwaggerUrl]   = useState("");
  const [postmanJson,  setPostmanJson]  = useState("");
  const [manualType,   setManualType]   = useState("swagger");
  const [baseUrl,      setBaseUrl]      = useState("");

  // ── Spec + scenarios ──────────────────────────────────────────────────────
  const [spec,         setSpec]         = useState(null);
  const [scenarios,    setScenarios]    = useState([]);
  const [filter,       setFilter]       = useState("all");
  const [contextUsed,  setContextUsed]  = useState(false);
  const [credentialId, setCredentialId] = useState(null);

  // ── Run state ─────────────────────────────────────────────────────────────
  const [phase,        setPhase]        = useState("idle"); // idle|importing|building|running|done
  const [log,          setLog]          = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [runResults,   setRunResults]   = useState({});  // scenarioName → result
  const [suiteResult,  setSuiteResult]  = useState(null);
  const [activeTab,    setActiveTab]    = useState("scenarios");
  const logRef = useRef(null);

  useEffect(() => { loadSources(); }, []);
  useEffect(() => {
    setTimeout(() => logRef.current?.scrollTo({ top:99999, behavior:"smooth" }), 50);
  }, [log.length]);

  const addLog = (msg, level="info") => setLog(p => [...p, { msg, level, ts:Date.now() }]);

  const loadSources = async () => {
    setLoadingSrc(true);
    try {
      const res  = await fetch(`${BACKEND}/api/agent/sources`);
      const data = await res.json();
      setSources(data.sources || []);
    } catch {} finally { setLoadingSrc(false); }
  };

  // ── Collection typeahead ──────────────────────────────────────────────────
  const filteredCols = (selectedSrc?.collections || []).filter(c =>
    !colSearch || c.name.toLowerCase().includes(colSearch.toLowerCase())
  );

  // ── Import + Build ────────────────────────────────────────────────────────
  const importAndBuild = async () => {
    setPhase("importing"); setLog([]); setSpec(null); setScenarios([]); setSuiteResult(null); setRunResults({});

    try {
      // 1. Import spec
      addLog(selectedSrc
        ? `◈ Loading from ${selectedSrc.name}${collection ? ` → ${collection.name}` : ""}...`
        : "◈ Fetching spec...", "ai");

      const importBody = selectedSrc
        ? { integrationId: selectedSrc.integrationId, collectionId: collection?.id }
        : manualType === "swagger" ? { swaggerUrl, baseUrl } : { postmanJson, baseUrl };

      const impRes  = await fetch(`${BACKEND}/api/agent/import`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(importBody),
      });
      const impData = await impRes.json();
      if (!impData.ok) throw new Error(impData.error);
      const spec = impData.spec;
      setSpec(spec);
      addLog(`✓ Spec loaded — ${spec.endpoints?.length || 0} endpoint(s)`, "success");
      addLog(`Base URL: ${spec.baseUrl}`, "info");

      // 2. Build scenarios with context
      setPhase("building");
      addLog("◈ Building test scenarios with context injection...", "ai");
      addLog("  Pulling Jira stories, Confluence docs, integration context...", "info");

      const buildRes  = await fetch(`${BACKEND}/api/agent/build`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ spec, url: spec.baseUrl, filter }),
      });
      const buildData = await buildRes.json();
      if (!buildData.ok) throw new Error(buildData.error);

      setScenarios(buildData.scenarios || []);
      setContextUsed(buildData.contextUsed || false);
      setPhase("done");
      setActiveTab("scenarios");
      addLog(`✓ ${buildData.scenarios?.length || 0} scenario(s) generated`, "success");
      if (buildData.contextUsed) addLog("  Context from integrations injected ✓", "ai");

    } catch (err) {
      addLog(`✗ ${err.message}`, "error");
      setPhase("idle");
    }
  };

  // ── Run one scenario ──────────────────────────────────────────────────────
  const runOne = async (scenario) => {
    setSelected(scenario);
    setPhase("running");
    setRunResults(p => ({ ...p, [scenario.name]: { status:"running" } }));
    addLog(`▶ Running: ${scenario.name}`, "system");

    let credentials = {};
    if (credentialId) credentials = await resolveContext(credentialId);

    const res     = await fetch(`${BACKEND}/api/agent/run`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ scenario, spec, credentials }),
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
            setRunResults(p => ({ ...p, [scenario.name]: evt.result }));
            setPhase("done");
          }
        } catch {}
      }
    }
  };

  // ── Run all ───────────────────────────────────────────────────────────────
  const runAll = async () => {
    setPhase("running");
    setSuiteResult(null);
    addLog(`▶ Running all ${scenarios.length} scenario(s)...`, "system");

    let credentials = {};
    if (credentialId) credentials = await resolveContext(credentialId);

    const res     = await fetch(`${BACKEND}/api/agent/run-all`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ scenarios, spec, credentials, filter }),
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
            setRunResults(p => ({ ...p, [scenarios[evt.index]?.name]: { status:evt.status, passed:evt.passed, failed:evt.failed } }));
            addLog(`  ${evt.status==="pass"?"✓":"✗"} Done`, evt.status==="pass"?"success":"error");
          }
          if (evt.type === "suite_done") {
            setSuiteResult(evt);
            setPhase("done");
            addLog(`Suite complete — ${evt.passed}/${evt.total} passed`, evt.failed===0?"success":"error");
          }
        } catch {}
      }
    }
  };

  const ready   = phase === "done" && scenarios.length > 0;
  const running = phase === "running";

  const canImport = manualMode
    ? (manualType === "swagger" ? !!swaggerUrl : !!postmanJson)
    : (selectedSrc && (selectedSrc.type !== "postman" || !!collection));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", height:"100%", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* ── Left panel ── */}
      <div style={{ width:300, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
        <div style={{ padding:"14px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.12em", marginBottom:10, textTransform:"uppercase" }}>API Source</div>

          {/* Integration source picker */}
          {!manualMode && (
            <>
              {loadingSrc && <div style={{ fontSize:9, color:"#4a7fa5", marginBottom:8 }}>Loading integrations...</div>}

              {!loadingSrc && sources.length === 0 && (
                <div style={{ border:"0.5px solid #f0c04040", borderRadius:6, padding:"10px 12px", marginBottom:10, background:"#1a1500", fontSize:10, color:"#f0c040", lineHeight:1.8 }}>
                  ⚠ No API integrations connected.<br/>
                  Add Postman or Swagger in<br/>
                  <strong style={{ color:"#7ec8ff" }}>🔗 Context → Integrations</strong>
                </div>
              )}

              {!loadingSrc && sources.length > 0 && (
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5 }}>Connected integrations</div>
                  {sources.map(src => (
                    <div key={src.integrationId}
                      onClick={() => { setSelectedSrc(src); setCollection(null); setColSearch(""); }}
                      style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:6, border:`0.5px solid ${selectedSrc?.integrationId===src.integrationId?"#4d9de0":"#1e3a5f"}`, background:selectedSrc?.integrationId===src.integrationId?"#1a3050":"#0d1520", cursor:"pointer", marginBottom:5 }}>
                      <span style={{ fontSize:14 }}>{src.type==="postman"?"📮":"📄"}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:10, color:selectedSrc?.integrationId===src.integrationId?"#7ec8ff":"#b0c8e0" }}>{src.name}</div>
                        <div style={{ fontSize:8, color:"#2d6aad" }}>
                          {src.type === "postman" ? `${src.collections?.length || 0} collection(s)` : "Swagger / OpenAPI"}
                        </div>
                      </div>
                      {selectedSrc?.integrationId===src.integrationId && <span style={{ color:"#4caf50" }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Collection picker for Postman */}
              {selectedSrc?.type === "postman" && (
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5 }}>Collection</div>
                  <div style={{ position:"relative" }}>
                    <input
                      value={collection ? collection.name : colSearch}
                      onChange={e => { setColSearch(e.target.value); setCollection(null); setShowColPicker(true); }}
                      onFocus={() => setShowColPicker(true)}
                      placeholder="Type to search or pick..."
                      style={{ width:"100%", background:"#0d1520", border:`0.5px solid ${collection?"#4caf50":"#1e3a5f"}`, borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"7px 9px", outline:"none", fontFamily:"inherit" }}
                    />
                    {showColPicker && filteredCols.length > 0 && (
                      <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:100, background:"#0a0e12", border:"0.5px solid #2d6aad", borderRadius:5, maxHeight:160, overflowY:"auto", boxShadow:"0 4px 16px #000a" }}>
                        {filteredCols.map(c => (
                          <div key={c.id}
                            onClick={() => { setCollection(c); setColSearch(""); setShowColPicker(false); }}
                            style={{ padding:"7px 12px", cursor:"pointer", fontSize:10, color:"#b0c8e0", borderBottom:"0.5px solid #0d1a2a" }}
                            onMouseEnter={e => e.currentTarget.style.background="#1a3050"}
                            onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                            {c.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button onClick={() => setManualMode(true)}
                style={{ background:"none", border:"none", color:"#2d6aad", cursor:"pointer", fontSize:9, padding:"2px 0", fontFamily:"inherit", textDecoration:"underline" }}>
                or enter URL / paste JSON manually
              </button>
            </>
          )}

          {/* Manual fallback */}
          {manualMode && (
            <>
              <div style={{ display:"flex", gap:4, marginBottom:8 }}>
                {["swagger","postman"].map(t => (
                  <button key={t} onClick={() => setManualType(t)}
                    style={{ flex:1, background:manualType===t?"#1a3050":"#0d1520", border:`0.5px solid ${manualType===t?"#4d9de0":"#1e3a5f"}`, borderRadius:4, color:manualType===t?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:9, padding:"5px 0", fontFamily:"inherit" }}>
                    {t === "swagger" ? "Swagger URL" : "Postman JSON"}
                  </button>
                ))}
              </div>
              {manualType === "swagger" ? (
                <input value={swaggerUrl} onChange={e=>setSwaggerUrl(e.target.value)}
                  placeholder="https://api.example.com/swagger.json" style={inp} />
              ) : (
                <textarea value={postmanJson} onChange={e=>setPostmanJson(e.target.value)}
                  placeholder="Paste Postman collection JSON..." rows={4} style={{ ...inp, resize:"vertical" }} />
              )}
              <input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)}
                placeholder="Base URL (optional override)" style={{ ...inp, marginTop:6 }} />
              <button onClick={() => { setManualMode(false); setSelectedSrc(null); }}
                style={{ background:"none", border:"none", color:"#2d6aad", cursor:"pointer", fontSize:9, padding:"4px 0", fontFamily:"inherit", textDecoration:"underline" }}>
                ← use connected integration
              </button>
            </>
          )}
        </div>

        {/* Filter + credentials */}
        <div style={{ padding:"12px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5 }}>Scenario Filter</div>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:10 }}>
            {["all","critical","high","medium","low"].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ background:filter===f?"#1a3050":"#0d1520", border:`0.5px solid ${filter===f?"#4d9de0":"#1e3a5f"}`, borderRadius:4, color:filter===f?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:8, padding:"3px 8px", fontFamily:"inherit", textTransform:"capitalize" }}>
                {f}
              </button>
            ))}
          </div>
          <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5 }}>Credentials</div>
          <CredentialPicker value={credentialId} onChange={setCredentialId} />
        </div>

        {/* Actions */}
        <div style={{ padding:"12px 14px" }}>
          <button onClick={importAndBuild} disabled={!canImport || running || phase==="importing" || phase==="building"}
            style={{ width:"100%", background:canImport&&!running?"linear-gradient(135deg,#1a0a2e,#0a1020)":"#0a0e12", border:`0.5px solid ${canImport&&!running?"#c8a0f0":"#1e3a5f"}`, borderRadius:6, color:canImport&&!running?"#c8a0f0":"#2d6aad", cursor:canImport&&!running?"pointer":"default", fontSize:11, fontWeight:600, padding:"9px 0", fontFamily:"inherit", letterSpacing:"0.06em", marginBottom:8 }}>
            {phase==="importing" ? "◈ Importing..." : phase==="building" ? "◈ Building scenarios..." : "◈ Load & Build Scenarios"}
          </button>

          {ready && (
            <button onClick={runAll} disabled={running}
              style={{ width:"100%", background:running?"#0a0e12":"linear-gradient(135deg,#0a1a0a,#0a0e12)", border:`0.5px solid ${running?"#1e3a5f":"#4caf50"}`, borderRadius:6, color:running?"#2d6aad":"#4caf50", cursor:running?"default":"pointer", fontSize:11, fontWeight:600, padding:"9px 0", fontFamily:"inherit", letterSpacing:"0.06em" }}>
              {running ? "◈ Running..." : `▶ Run All (${filter==="all"?scenarios.length:scenarios.filter(s=>s.priority?.toLowerCase()===filter).length})`}
            </button>
          )}
        </div>

        {/* Suite result summary */}
        {suiteResult && (
          <div style={{ margin:"0 14px 14px", border:`0.5px solid ${suiteResult.failed===0?"#4caf50":"#ff3b3b"}`, borderRadius:6, padding:"10px 12px", background:suiteResult.failed===0?"#0a1a0a":"#1a0808" }}>
            <div style={{ fontSize:12, fontWeight:700, color:suiteResult.failed===0?"#4caf50":"#ff3b3b", marginBottom:4 }}>
              {suiteResult.failed===0?"✓ All Passed":"✗ Some Failed"}
            </div>
            <div style={{ fontSize:10, color:"#6a8aa8" }}>{suiteResult.passed}/{suiteResult.total} scenarios passed</div>
          </div>
        )}

        {/* Context indicator */}
        {contextUsed && (
          <div style={{ margin:"0 14px 10px", fontSize:9, color:"#c8a0f0", background:"#1a0a2e", borderRadius:4, padding:"5px 8px", border:"0.5px solid #5b3a8a" }}>
            ◈ Context from integrations injected
          </div>
        )}

        {/* Log */}
        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", borderTop:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:8, color:"#1e3a5f", padding:"4px 12px", textTransform:"uppercase", letterSpacing:"0.1em" }}>Log</div>
          <div ref={logRef} style={{ flex:1, overflowY:"auto", padding:"4px 10px" }}>
            {log.map((l,i) => (
              <div key={i} style={{ fontSize:9, marginBottom:2, lineHeight:1.6,
                color:l.level==="error"?"#ff6b6b":l.level==="success"?"#7ec87f":l.level==="ai"?"#c8a0f0":l.level==="system"?"#7ec8ff":"#6a8aa8" }}>
                {l.level==="error"?"✗":l.level==="success"?"✓":l.level==="ai"?"◈":l.level==="system"?"▶":"›"} {l.msg}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main panel ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Sub-tabs */}
        {ready && (
          <div style={{ background:"#090d11", borderBottom:"0.5px solid #1e3a5f", padding:"0 14px", display:"flex", alignItems:"stretch", height:36, flexShrink:0 }}>
            {[
              ["scenarios", `Scenarios (${scenarios.length})`],
              ["results",   `Results (${Object.keys(runResults).length})`],
            ].map(([t,l]) => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{ background:"none", border:"none", borderBottom:activeTab===t?"2px solid #4d9de0":"2px solid transparent", color:activeTab===t?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"0 14px", fontFamily:"inherit", fontWeight:activeTab===t?600:400 }}>
                {l}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex:1, overflowY:"auto" }}>
          {/* Empty state */}
          {!ready && phase === "idle" && (
            <div style={{ textAlign:"center", marginTop:80 }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🔌</div>
              <div style={{ fontSize:12, color:"#2d6aad", marginBottom:8 }}>
                {sources.length > 0
                  ? "Select a source and click Load & Build Scenarios"
                  : "Connect Postman or Swagger in 🔗 Context → Integrations"}
              </div>
              <div style={{ fontSize:10, color:"#1e3a5f", lineHeight:2 }}>
                ATP will pull your API spec, inject context from Jira<br/>
                and Confluence, and build intelligent test scenarios.
              </div>
            </div>
          )}

          {/* Scenarios tab */}
          {ready && activeTab === "scenarios" && (
            <div style={{ padding:"14px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <div style={{ fontSize:11, color:"#7ec8ff" }}>
                  {scenarios.length} scenario(s)
                  {spec && <span style={{ color:"#4a7fa5" }}> · {spec.baseUrl}</span>}
                </div>
              </div>

              {scenarios.map((sc, i) => {
                const res = runResults[sc.name];
                const sc2 = res ? (STATUS_C[res.status] || STATUS_C.error) : null;
                return (
                  <div key={i}
                    style={{ border:`0.5px solid ${selected?.name===sc.name?"#4d9de0":res?"#1e3a5f":"#1a2a3a"}`, borderRadius:8, padding:"12px 14px", marginBottom:8, background:"#0d1520", cursor:"pointer" }}
                    onClick={() => setSelected(selected?.name===sc.name ? null : sc)}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      {res && <span style={{ fontSize:14, flexShrink:0 }}>{sc2.icon}</span>}
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:"#b0d0f0" }}>{sc.name}</div>
                        <div style={{ fontSize:9, color:"#4a7fa5" }}>{sc.description?.slice(0,60)}</div>
                      </div>
                      <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                        {sc.priority && (
                          <span style={{ fontSize:8, padding:"1px 6px", borderRadius:3, background:"#0a0e12", border:"0.5px solid #1e3a5f", color:"#4a7fa5" }}>
                            {sc.priority}
                          </span>
                        )}
                        {res && (
                          <span style={{ fontSize:8, padding:"1px 6px", borderRadius:3, background:sc2.bg, border:`0.5px solid ${sc2.color}`, color:sc2.color }}>
                            {res.status}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Steps preview */}
                    {selected?.name === sc.name && (
                      <div style={{ marginTop:8, borderTop:"0.5px solid #1e3a5f", paddingTop:8 }}>
                        <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5 }}>Steps</div>
                        {sc.steps?.map((step, j) => (
                          <div key={j} style={{ display:"flex", gap:6, padding:"3px 0", fontSize:9 }}>
                            <span style={{ color:"#2d6aad", flexShrink:0 }}>{j+1}.</span>
                            <span style={{ color:"#6a8aa8" }}>{step.description}</span>
                            {step.method && (
                              <span style={{ color:METHOD_COLORS[step.method]||"#4a7fa5", fontWeight:600, flexShrink:0 }}>{step.method}</span>
                            )}
                          </div>
                        ))}
                        <button onClick={e => { e.stopPropagation(); runOne(sc); }} disabled={running}
                          style={{ marginTop:8, width:"100%", background:"#0a1a0a", border:"0.5px solid #4caf50", borderRadius:5, color:running?"#2d6aad":"#4caf50", cursor:running?"default":"pointer", fontSize:10, padding:"6px 0", fontFamily:"inherit" }}>
                          {running && res?.status==="running" ? "◈ Running..." : "▶ Run this scenario"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Results tab */}
          {ready && activeTab === "results" && (
            <div style={{ padding:"14px" }}>
              {Object.keys(runResults).length === 0 && (
                <div style={{ textAlign:"center", marginTop:40, color:"#1e3a5f", fontSize:11 }}>
                  No results yet — run some scenarios.
                </div>
              )}
              {Object.entries(runResults).map(([name, result]) => {
                const sc2 = STATUS_C[result.status] || STATUS_C.error;
                return (
                  <div key={name} style={{ border:`0.5px solid ${sc2.color}40`, borderRadius:8, padding:"12px 14px", marginBottom:8, background:sc2.bg }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <span style={{ fontSize:14 }}>{sc2.icon}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:"#b0d0f0" }}>{name}</div>
                        <div style={{ fontSize:9, color:sc2.color }}>{result.status?.toUpperCase()}</div>
                      </div>
                      {result.passed !== undefined && (
                        <span style={{ fontSize:9, color:"#4a7fa5" }}>{result.passed}/{(result.passed||0)+(result.failed||0)} steps</span>
                      )}
                    </div>
                    {result.steps?.map((step, i) => (
                      <div key={i} style={{ display:"flex", gap:6, padding:"2px 0", fontSize:9 }}>
                        <span style={{ color:step.status==="pass"?"#4caf50":"#ff3b3b", flexShrink:0 }}>{step.status==="pass"?"✓":"✗"}</span>
                        <span style={{ color:"#6a8aa8" }}>{step.description}</span>
                        {step.statusCode && <span style={{ color:"#2d6aad", flexShrink:0 }}>{step.statusCode}</span>}
                      </div>
                    ))}
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

const inp = {
  width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f",
  borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"7px 9px",
  outline:"none", fontFamily:"'IBM Plex Mono',monospace",
};
