import { useState } from "react";
import { useApiAgent } from "../../hooks/useApiAgent.js";
import { LogPanel }    from "../shared/LogPanel.jsx";
import { METHOD_COLORS, PRIORITY_COLORS } from "../../constants/theme.js";

export function ApiAgentView() {
  const agent = useApiAgent();
  const [swaggerUrl, setSwaggerUrl]   = useState("");
  const [postmanText, setPostmanText] = useState("");
  const [baseUrl, setBaseUrl]         = useState("");
  const [inputMode, setInputMode]     = useState("swagger"); // swagger | postman
  const [username, setUsername]       = useState("");
  const [password, setPassword]       = useState("");
  const [showCreds, setShowCreds]     = useState(false);
  const [activeTab, setActiveTab]     = useState("scenarios"); // scenarios | endpoints

  const { phase, log, logRef, spec, scenarios, selectedScenario,
    setSelectedScenario, runResults, activeStep, captures, suiteResult,
    doImport, doBuild, doRunScenario, doRunAll } = agent;

  const handleImport = () => {
    doImport({
      swaggerUrl:  inputMode === "swagger" ? swaggerUrl : undefined,
      postmanJson: inputMode === "postman" ? postmanText : undefined,
      baseUrl,
    });
  };

  const handleBuild = () => doBuild({ username, password });

  const running = phase === "running";
  const ready   = phase === "ready";

  return (
    <div style={{ display:"flex", height:"calc(100vh - 44px)" }}>

      {/* ── Left panel ── */}
      <div style={{ width:290, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>

        {/* Import section */}
        <div style={{ padding:"14px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.12em", marginBottom:10, textTransform:"uppercase" }}>API Source</div>

          {/* Mode toggle */}
          <div style={{ display:"flex", gap:4, marginBottom:10 }}>
            {["swagger","postman"].map(m => (
              <button key={m} className={`fb ${inputMode===m?"on":""}`} onClick={() => setInputMode(m)} style={{ flex:1, textAlign:"center" }}>
                {m === "swagger" ? "Swagger / OpenAPI" : "Postman JSON"}
              </button>
            ))}
          </div>

          {inputMode === "swagger" ? (
            <input value={swaggerUrl} onChange={e => setSwaggerUrl(e.target.value)}
              placeholder="https://api.example.com/swagger.json"
              style={{ width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"7px 9px", outline:"none", marginBottom:8, fontFamily:"inherit" }}
            />
          ) : (
            <textarea value={postmanText} onChange={e => setPostmanText(e.target.value)}
              placeholder='Paste Postman collection JSON here...'
              style={{ width:"100%", height:80, background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#c8d8e8", fontSize:10, padding:"7px 9px", outline:"none", marginBottom:8, fontFamily:"'IBM Plex Mono',monospace", resize:"vertical" }}
            />
          )}

          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
            placeholder="Base URL (e.g. https://api.example.com)"
            style={{ width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"7px 9px", outline:"none", marginBottom:8, fontFamily:"inherit" }}
          />

          <button onClick={() => setShowCreds(!showCreds)} style={{ background:"none", border:"none", color:"#2d6aad", fontSize:10, cursor:"pointer", padding:0, marginBottom:showCreds?7:0, fontFamily:"inherit" }}>
            {showCreds ? "▾" : "▸"} Credentials
          </button>
          {showCreds && (
            <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:8 }}>
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username / API key"
                style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"6px 9px", outline:"none", fontFamily:"inherit" }} />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password / Secret"
                style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"6px 9px", outline:"none", fontFamily:"inherit" }} />
            </div>
          )}

          <div style={{ display:"flex", gap:6 }}>
            <button className="disc" onClick={handleImport}
              disabled={phase === "importing" || (!swaggerUrl && !postmanText)}
              style={{ fontSize:12, padding:"8px 0" }}>
              {phase === "importing" ? "IMPORTING..." : "⬆ IMPORT"}
            </button>
          </div>

          {spec && phase !== "importing" && (
            <button className="rb" onClick={handleBuild}
              disabled={phase === "building" || running}
              style={{ width:"100%", marginTop:8, textAlign:"center" }}>
              {phase === "building" ? "◈ BUILDING..." : "◈ BUILD SCENARIOS"}
            </button>
          )}

          {ready && scenarios.length > 0 && (
            <button onClick={() => doRunAll(baseUrl, { username, password })}
              disabled={running}
              style={{ width:"100%", marginTop:6, background:"linear-gradient(135deg,#1a4a8a,#0d2a5a)", border:"0.5px solid #4d9de0", borderRadius:5, color:"#7ec8ff", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, padding:"7px 0", letterSpacing:"0.06em" }}>
              ▶ RUN ALL SCENARIOS
            </button>
          )}
        </div>

        {/* Spec info */}
        {spec && (
          <div style={{ padding:"10px 14px", borderBottom:"0.5px solid #1e3a5f", background:"#0a0e12" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#7ec8ff", marginBottom:2 }}>{spec.title}</div>
            <div style={{ fontSize:9, color:"#2d6aad", marginBottom:3, letterSpacing:"0.06em" }}>{spec.source} · v{spec.version}</div>
            <div style={{ fontSize:10, color:"#4a7fa5" }}>{spec.endpointCount} endpoints · {scenarios.length} scenarios</div>
            {spec.baseUrl && <div style={{ fontSize:9, color:"#1e3a5f", marginTop:3, wordBreak:"break-all" }}>{spec.baseUrl}</div>}
          </div>
        )}

        {/* Suite result */}
        {suiteResult && (
          <div style={{ padding:"10px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
            <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Suite Result</div>
            <div style={{ display:"flex", gap:6 }}>
              <div style={{ flex:1, background:"#0a2010", border:"0.5px solid #4caf50", borderRadius:5, padding:"5px 0", textAlign:"center", fontSize:11, color:"#7ec87f" }}>{suiteResult.passed} passed</div>
              <div style={{ flex:1, background:"#1a0808", border:"0.5px solid #ff3b3b", borderRadius:5, padding:"5px 0", textAlign:"center", fontSize:11, color:"#ff6b6b" }}>{suiteResult.failed} failed</div>
            </div>
          </div>
        )}

        {/* Captures */}
        {Object.keys(captures).length > 0 && (
          <div style={{ padding:"8px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
            <div style={{ fontSize:9, color:"#c8a0f0", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 }}>◈ Captured Variables</div>
            {Object.entries(captures).map(([k, v]) => (
              <div key={k} style={{ display:"flex", gap:6, fontSize:10, marginBottom:3 }}>
                <span style={{ color:"#c8a0f0" }}>{`{{${k}}}`}</span>
                <span style={{ color:"#6a9ab8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{String(v).slice(0, 30)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Log */}
        <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"5px 14px", borderBottom:"0.5px solid #1e3a5f", textTransform:"uppercase" }}>Log</div>
        <LogPanel log={log} logRef={logRef} isLoading={["importing","building","running"].includes(phase)} emptyText={"Import a Swagger URL\nor Postman collection"} />
      </div>

      {/* ── Main panel ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {!spec ? (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:28 }}>🔌</div>
            <div style={{ fontSize:12, color:"#2d6aad", letterSpacing:"0.08em" }}>API Automation Agent</div>
            <div style={{ fontSize:10, color:"#1e3a5f", maxWidth:300, textAlign:"center", lineHeight:1.9 }}>
              Import a Swagger/OpenAPI spec or Postman collection.<br/>
              AI will build multi-step business transaction scenarios<br/>
              and execute them with automatic data chaining.
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ background:"#0a0e12", borderBottom:"0.5px solid #1e3a5f", padding:"0 14px", display:"flex", alignItems:"center" }}>
              {[["scenarios", `SCENARIOS (${scenarios.length})`], ["endpoints", `ENDPOINTS (${spec.endpointCount})`]].map(([t, l]) => (
                <button key={t} className={`tab ${activeTab===t?"on":""}`} onClick={() => setActiveTab(t)}>{l}</button>
              ))}
            </div>

            {activeTab === "scenarios" && (
              <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
                {/* Scenario list */}
                <div style={{ width:300, flexShrink:0, borderRight:"0.5px solid #1e3a5f", overflowY:"auto", padding:"8px 10px" }}>
                  {scenarios.length === 0 && phase !== "building" && (
                    <div style={{ fontSize:10, color:"#1e3a5f", textAlign:"center", marginTop:30, lineHeight:1.9 }}>
                      Click ◈ BUILD SCENARIOS<br/>to generate test scenarios
                    </div>
                  )}
                  {phase === "building" && (
                    <div style={{ fontSize:10, color:"#c8a0f0", textAlign:"center", marginTop:30 }}>
                      <div style={{ display:"flex", justifyContent:"center", gap:3, marginBottom:8 }}>
                        {[0,.2,.4].map((d,i) => <div key={i} style={{ width:5, height:5, borderRadius:"50%", background:"#c8a0f0", animation:`pulse 0.8s ${d}s infinite` }} />)}
                      </div>
                      AI building scenarios...
                    </div>
                  )}
                  {scenarios.map(sc => {
                    const result = runResults[sc.id];
                    const pc = PRIORITY_COLORS[sc.priority] ?? PRIORITY_COLORS.Medium;
                    const isActive = selectedScenario?.id === sc.id;
                    const isRunning = running && activeStep && selectedScenario?.id === sc.id;
                    return (
                      <div key={sc.id} className={`uc-card ${isActive?"sel":""}`} onClick={() => setSelectedScenario(sc)}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <span style={{ fontSize:9, color:"#2d6aad" }}>{sc.id}</span>
                            {result && (
                              <span style={{ fontSize:10, color: result.status==="pass"?"#4caf50":"#ff3b3b" }}>
                                {result.status==="pass"?"✓":"✗"}
                              </span>
                            )}
                            {isRunning && <div style={{ width:6, height:6, borderRadius:"50%", background:"#ffaa44", animation:"pulse 0.6s infinite" }} />}
                          </div>
                          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                            <span className="pill" style={{ background:pc.bg, border:`0.5px solid ${pc.border}`, color:pc.text }}>{sc.priority}</span>
                            <button className="rb" style={{ fontSize:9, padding:"2px 7px" }}
                              onClick={e => { e.stopPropagation(); setSelectedScenario(sc); doRunScenario(sc, baseUrl, { username, password }); }}>
                              ▶
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize:11, fontWeight:500, color:"#b0c8e0", marginBottom:3, lineHeight:1.4 }}>{sc.name}</div>
                        <div style={{ fontSize:10, color:"#4a7fa5", lineHeight:1.5 }}>{sc.description}</div>
                        <div style={{ marginTop:5, fontSize:9, color:"#2d6aad" }}>{sc.steps?.length ?? 0} steps · {sc.category}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Scenario detail */}
                <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>
                  {!selectedScenario ? (
                    <div style={{ textAlign:"center", marginTop:60, color:"#2d6aad", fontSize:11 }}>
                      ← Select a scenario · click ▶ to run it
                    </div>
                  ) : (
                    <ScenarioDetail
                      scenario={selectedScenario}
                      result={runResults[selectedScenario.id]}
                      activeStep={activeStep}
                      onRun={() => doRunScenario(selectedScenario, baseUrl, { username, password })}
                      running={running}
                    />
                  )}
                </div>
              </div>
            )}

            {activeTab === "endpoints" && (
              <div style={{ flex:1, overflowY:"auto", padding:"12px 16px" }}>
                {spec.endpoints?.map((ep, i) => {
                  const c = METHOD_COLORS[ep.method] ?? METHOD_COLORS.GET;
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 10px", borderBottom:"0.5px solid #0d1a2a", fontSize:11 }}>
                      <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:3, background:c.bg, border:`0.5px solid ${c.border}`, color:c.text, minWidth:48, textAlign:"center", flexShrink:0 }}>{ep.method}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ color:"#a0d0e8", fontWeight:500, marginBottom:2 }}>{ep.path}</div>
                        {ep.summary && <div style={{ fontSize:10, color:"#4a7fa5" }}>{ep.summary}</div>}
                      </div>
                      {ep.tags?.[0] && <span className="pill" style={{ background:"#0d1a2a", border:"0.5px solid #1e3a5f", color:"#4a7fa5", fontSize:9, flexShrink:0 }}>{ep.tags[0]}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Scenario detail panel ─────────────────────────────────────────────────────
function ScenarioDetail({ scenario, result, activeStep, onRun, running }) {
  const pc = PRIORITY_COLORS[scenario.priority] ?? PRIORITY_COLORS.Medium;
  return (
    <div className="fi">
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ display:"flex", gap:7, alignItems:"center" }}>
          <span style={{ fontSize:9, color:"#2d6aad" }}>{scenario.id}</span>
          <span className="pill" style={{ background:pc.bg, border:`0.5px solid ${pc.border}`, color:pc.text }}>{scenario.priority}</span>
          <span style={{ fontSize:9, color:"#4a7fa5" }}>{scenario.category}</span>
        </div>
        <button className="rb" onClick={onRun} disabled={running}>
          {running ? "⟳ RUNNING..." : "▶ RUN"}
        </button>
      </div>

      <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:5 }}>{scenario.name}</div>
      <div style={{ fontSize:11, color:"#6a9ab8", lineHeight:1.7, marginBottom:14 }}>{scenario.description}</div>

      {/* Result summary */}
      {result && result.status && (
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <div style={{ flex:1, background: result.status==="pass"?"#0a2010":"#1a0808", border:`0.5px solid ${result.status==="pass"?"#4caf50":"#ff3b3b"}`, borderRadius:6, padding:"8px 12px" }}>
            <div style={{ fontSize:11, color: result.status==="pass"?"#7ec87f":"#ff6b6b", fontWeight:600 }}>
              {result.status==="pass" ? "✓ ALL PASSED" : "✗ SOME FAILED"}
            </div>
            <div style={{ fontSize:10, color:"#4a7fa5", marginTop:2 }}>
              {result.passed}/{result.total} steps passed
            </div>
          </div>
        </div>
      )}

      {/* Steps */}
      <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>
        Steps ({scenario.steps?.length ?? 0})
      </div>
      {scenario.steps?.map((step, i) => {
        const stepResult = result?.steps?.find(s => s.stepId === step.id);
        const isActive   = activeStep === step.id;
        const sc = stepResult?.status === "pass" ? "#4caf50" : stepResult?.status === "fail" ? "#ff3b3b" : isActive ? "#ffaa44" : "#2d6aad";
        const mc = METHOD_COLORS[step.method] ?? METHOD_COLORS.GET;

        return (
          <div key={step.id} style={{ border:`0.5px solid ${isActive?"#ffaa44":"#1e3a5f"}`, borderRadius:7, padding:"10px 12px", marginBottom:8, background: isActive?"#1a1800":stepResult?.status==="fail"?"#1a0808":"#0d1520", transition:"all 0.2s" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
              <div style={{ width:16, height:16, borderRadius:"50%", border:`0.5px solid ${sc}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, color:sc, flexShrink:0 }}>
                {stepResult?.status==="pass"?"✓":stepResult?.status==="fail"?"✗":isActive?"●":i+1}
              </div>
              <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, background:mc.bg, border:`0.5px solid ${mc.border}`, color:mc.text }}>{step.method}</span>
              <span style={{ fontSize:11, color:"#a0d0e8", fontWeight:500, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{step.path}</span>
              {stepResult?.duration && <span style={{ fontSize:9, color:"#4a7fa5" }}>{stepResult.duration}ms</span>}
              {stepResult?.statusCode && (
                <span style={{ fontSize:9, fontWeight:700, color: stepResult.statusCode < 300?"#4caf50":stepResult.statusCode < 400?"#f0c040":"#ff6b6b" }}>
                  {stepResult.statusCode}
                </span>
              )}
            </div>
            <div style={{ fontSize:10, color:"#4a7fa5", marginBottom: step.assertions?.length ? 6 : 0 }}>{step.name}</div>

            {/* Assertions */}
            {step.assertions?.map((a, j) => {
              const ar = stepResult?.assertions?.[j];
              return (
                <div key={j} style={{ display:"flex", gap:5, fontSize:9, padding:"2px 0", color: ar ? (ar.passed?"#7ec87f":"#ff6b6b") : "#2d6aad" }}>
                  <span>{ar ? (ar.passed?"✓":"✗") : "·"}</span>
                  <span>{a.type === "status" ? `status = ${a.expected}` : a.type === "jsonpath" ? `${a.path} exists` : a.type === "schema" ? `${a.field} is ${a.dataType}` : JSON.stringify(a)}</span>
                  {ar?.actual !== undefined && <span style={{ color:"#1e3a5f" }}>→ {String(ar.actual).slice(0,30)}</span>}
                </div>
              );
            })}

            {/* Capture vars */}
            {step.captureFrom && Object.keys(step.captureFrom).length > 0 && (
              <div style={{ marginTop:5, fontSize:9, color:"#c8a0f0" }}>
                captures: {Object.keys(step.captureFrom).map(k => `{{${k}}}`).join(", ")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
