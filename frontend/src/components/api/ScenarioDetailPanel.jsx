/**
 * ScenarioDetailPanel
 * Shows full scenario details before AND after execution.
 * - Before: shows what each step will do, what it expects, what it will capture
 * - After:  shows what actually happened, pass/fail per step, masked sensitive data
 */

const METHOD_C = { GET:"#4caf50", POST:"#7ec8ff", PUT:"#f0c040", PATCH:"#ff8c00", DELETE:"#ff3b3b" };
const STATUS_C = { pass:{ c:"#4caf50", bg:"#0a1a0a", icon:"✓" }, fail:{ c:"#ff3b3b", bg:"#1a0808", icon:"✗" }, error:{ c:"#ff8c00", bg:"#1a0f00", icon:"⚠" }, running:{ c:"#c8a0f0", bg:"#1a0a2e", icon:"●" } };
const PRIORITY_C = { Critical:"#ff3b3b", High:"#ff8c00", Medium:"#f0c040", Low:"#4a7fa5" };

function mask(val) {
  if (typeof val === "string" && val.length > 6) return "••••" + val.slice(-3);
  return "••••••••";
}

function isSensitive(key) {
  return /password|secret|token|apikey|api_key|auth|bearer|credential/i.test(key);
}

function renderValue(key, val) {
  if (isSensitive(key)) return <span style={{ color:"#4a7fa5", fontStyle:"italic" }}>{"••••••••"}</span>;
  if (val === null || val === undefined) return <span style={{ color:"#2d6aad" }}>null</span>;
  if (typeof val === "object") return <span style={{ color:"#c8a0f0" }}>{JSON.stringify(val).slice(0,80)}</span>;
  return <span style={{ color:"#a0d0a0" }}>{String(val)}</span>;
}

export function ScenarioDetailPanel({ scenario, runResult, stepResults = {}, onRunScenario, onClose, running }) {
  const steps = scenario.steps || [];
  const allCaptures = {}; // varName → stepName that captures it

  steps.forEach(step => {
    Object.keys(step.captureFrom || {}).forEach(varName => {
      allCaptures[varName] = step.name;
    });
  });

  return (
    <div style={{ fontFamily:"'IBM Plex Mono',monospace", height:"100%", display:"flex", flexDirection:"column" }}>

      {/* Header */}
      <div style={{ padding:"14px 18px", borderBottom:"0.5px solid #1e3a5f", background:"#090d11", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <span style={{ fontSize:14, fontWeight:700, color:"#e0f0ff" }}>{scenario.name}</span>
              {scenario.priority && (
                <span style={{ fontSize:9, padding:"2px 7px", borderRadius:3, color:PRIORITY_C[scenario.priority]||"#4a7fa5", background:`${PRIORITY_C[scenario.priority]||"#4a7fa5"}15`, border:`0.5px solid ${PRIORITY_C[scenario.priority]||"#4a7fa5"}40` }}>
                  {scenario.priority}
                </span>
              )}
              {scenario.category && (
                <span style={{ fontSize:9, padding:"2px 7px", borderRadius:3, color:"#4a7fa5", background:"#0d1520", border:"0.5px solid #1e3a5f" }}>
                  {scenario.category}
                </span>
              )}
            </div>
            <div style={{ fontSize:11, color:"#6a8aa8", lineHeight:1.7, marginBottom:6 }}>{scenario.description}</div>
            <div style={{ display:"flex", gap:14, fontSize:9, color:"#2d6aad" }}>
              <span>{steps.length} endpoint{steps.length!==1?"s":""}</span>
              <span>{Object.keys(allCaptures).length} value{Object.keys(allCaptures).length!==1?"s":""} chained</span>
              {scenario.tags?.length > 0 && <span>{scenario.tags.join(", ")}</span>}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexShrink:0 }}>
            {runResult && (
              <div style={{ padding:"6px 12px", borderRadius:6, background:STATUS_C[runResult.status]?.bg||"#0a0e12", border:`0.5px solid ${STATUS_C[runResult.status]?.c||"#1e3a5f"}`, textAlign:"center" }}>
                <div style={{ fontSize:14, fontWeight:700, color:STATUS_C[runResult.status]?.c||"#7ec8ff" }}>
                  {STATUS_C[runResult.status]?.icon} {runResult.status?.toUpperCase()}
                </div>
                <div style={{ fontSize:9, color:"#4a7fa5" }}>{runResult.passed}/{runResult.total} passed · {runResult.duration}ms</div>
              </div>
            )}
            <button onClick={onRunScenario} disabled={running}
              style={{ background:running?"#0a0e12":"linear-gradient(135deg,#0a1a0a,#0a0e12)", border:`0.5px solid ${running?"#1e3a5f":"#4caf50"}`, borderRadius:6, color:running?"#2d6aad":"#4caf50", cursor:running?"default":"pointer", fontSize:11, fontWeight:600, padding:"8px 16px", fontFamily:"inherit" }}>
              {running ? "◈ Running..." : "▶ Run Scenario"}
            </button>
            {onClose && (
              <button onClick={onClose} style={{ background:"none", border:"0.5px solid #1e3a5f", borderRadius:6, color:"#4a7fa5", cursor:"pointer", fontSize:13, padding:"0 10px", fontFamily:"inherit" }}>×</button>
            )}
          </div>
        </div>
      </div>

      {/* Chain overview */}
      <div style={{ padding:"10px 18px", borderBottom:"0.5px solid #1e3a5f", background:"#080c0f", flexShrink:0, overflowX:"auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:0, minWidth:"max-content" }}>
          {steps.map((step, i) => {
            const res    = stepResults[step.id] || (runResult?.steps?.[i]);
            const sc     = res ? (STATUS_C[res.status] || STATUS_C.error) : null;
            const hasOut = Object.keys(step.captureFrom || {}).length > 0;
            return (
              <div key={step.id || i} style={{ display:"flex", alignItems:"center" }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                  <div style={{ padding:"5px 10px", borderRadius:5, border:`0.5px solid ${sc?sc.c:METHOD_C[step.method]||"#4a7fa5"}`, background:sc?sc.bg:"#0d1520", minWidth:100, textAlign:"center" }}>
                    <div style={{ fontSize:9, fontWeight:700, color:METHOD_C[step.method]||"#4a7fa5" }}>{step.method}</div>
                    <div style={{ fontSize:8, color:"#b0c8e0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:100 }}>{step.name}</div>
                    {sc && <div style={{ fontSize:8, color:sc.c }}>{sc.icon}</div>}
                  </div>
                  {hasOut && (
                    <div style={{ fontSize:7, color:"#c8a0f0", textAlign:"center" }}>
                      {Object.keys(step.captureFrom).join(", ")}
                    </div>
                  )}
                </div>
                {i < steps.length-1 && (
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", margin:"0 4px" }}>
                    <div style={{ fontSize:14, color:Object.keys(step.captureFrom||{}).length?"#c8a0f0":"#1e3a5f" }}>→</div>
                    {Object.keys(step.captureFrom||{}).length > 0 && (
                      <div style={{ fontSize:7, color:"#c8a0f0", whiteSpace:"nowrap" }}>
                        {Object.keys(step.captureFrom).map(v=>`{{${v}}}`).join(" ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Steps detail */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>
        {steps.map((step, i) => {
          const res     = runResult?.steps?.[i];
          const sc      = res ? (STATUS_C[res.status] || STATUS_C.error) : null;
          const usedVars = findUsedVars(step);
          const captures = Object.entries(step.captureFrom || {});

          return (
            <div key={step.id || i} style={{ marginBottom:16, border:`0.5px solid ${sc?sc.c+"60":"#1e3a5f"}`, borderRadius:8, overflow:"hidden", background:"#0d1520" }}>

              {/* Step header */}
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:sc?sc.bg:"#090d11", borderBottom:"0.5px solid #1e3a5f" }}>
                <span style={{ fontSize:11, fontWeight:700, color:"#2d6aad", minWidth:20 }}>{i+1}</span>
                <span style={{ fontSize:12, fontWeight:700, color:METHOD_C[step.method]||"#4a7fa5", minWidth:52 }}>{step.method}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#b0d0f0" }}>{step.name}</div>
                  <div style={{ fontSize:9, color:"#4a7fa5", fontFamily:"monospace" }}>
                    {res?.url || step.path}
                    {res?.statusCode && <span style={{ marginLeft:8, color:sc?.c }}>{res.statusCode}</span>}
                    {res?.duration && <span style={{ marginLeft:8, color:"#2d6aad" }}>{res.duration}ms</span>}
                  </div>
                </div>
                {sc && (
                  <span style={{ fontSize:12, color:sc.c, fontWeight:700 }}>{sc.icon} {res.status?.toUpperCase()}</span>
                )}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:0 }}>

                {/* Left: Request */}
                <div style={{ padding:"10px 14px", borderRight:"0.5px solid #1e3a5f" }}>
                  <div style={{ fontSize:9, color:"#2d6aad", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Request</div>

                  {/* Variables used from previous steps */}
                  {usedVars.length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:8, color:"#c8a0f0", marginBottom:3 }}>Uses from previous steps</div>
                      {usedVars.map(v => (
                        <div key={v} style={{ display:"flex", gap:6, fontSize:9, marginBottom:2 }}>
                          <span style={{ color:"#c8a0f0", fontFamily:"monospace" }}>{`{{${v}}}`}</span>
                          <span style={{ color:"#4a7fa5" }}>← captured by: {allCaptures[v] || "environment"}</span>
                          {res && <span style={{ color:"#7ec87f", marginLeft:"auto" }}>✓ resolved</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Auth requirements */}
                  {step.headers?.Authorization !== undefined && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:8, color:"#f0c040", marginBottom:3 }}>Auth Required</div>
                      <div style={{ fontSize:9, color:"#f0c040", background:"#1a1500", borderRadius:4, padding:"3px 7px", display:"inline-block" }}>
                        🔑 {step.headers.Authorization?.includes("Bearer") ? "Bearer Token" : "Auth header"}
                      </div>
                    </div>
                  )}

                  {/* Headers */}
                  {step.headers && Object.keys(step.headers).length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:8, color:"#2d6aad", marginBottom:3 }}>Headers</div>
                      {Object.entries(step.headers).map(([k,v]) => (
                        <div key={k} style={{ display:"flex", gap:6, fontSize:9, marginBottom:2 }}>
                          <span style={{ color:"#6a8aa8", minWidth:120, flexShrink:0 }}>{k}</span>
                          {isSensitive(k)
                            ? <span style={{ color:"#4a7fa5", fontStyle:"italic" }}>••••••••</span>
                            : <span style={{ color:"#a0c0d8" }}>{String(v).slice(0,50)}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Params */}
                  {step.params && Object.keys(step.params).length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:8, color:"#2d6aad", marginBottom:3 }}>Query Params</div>
                      {Object.entries(step.params).map(([k,v]) => (
                        <div key={k} style={{ display:"flex", gap:6, fontSize:9, marginBottom:2 }}>
                          <span style={{ color:"#6a8aa8" }}>{k}=</span>
                          <span style={{ color:"#a0c0d8", fontFamily:"monospace" }}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Body */}
                  {step.body && Object.keys(step.body).length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:8, color:"#2d6aad", marginBottom:3 }}>Request Body</div>
                      <pre style={{ fontSize:8, color:"#a0c0d8", background:"#0a0e12", borderRadius:4, padding:"6px 8px", margin:0, overflowX:"auto", maxHeight:120, fontFamily:"'IBM Plex Mono',monospace", whiteSpace:"pre-wrap" }}>
                        {JSON.stringify(maskBodySensitive(step.body), null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Actual request (post-run) */}
                  {res?.requestBody && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:8, color:"#4caf50", marginBottom:3 }}>Actual Request Body (sent)</div>
                      <pre style={{ fontSize:8, color:"#7ec87f", background:"#0a1a0a", borderRadius:4, padding:"6px 8px", margin:0, overflowX:"auto", maxHeight:100, fontFamily:"'IBM Plex Mono',monospace", whiteSpace:"pre-wrap" }}>
                        {JSON.stringify(res.requestBody, null, 2).slice(0,400)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Right: Response */}
                <div style={{ padding:"10px 14px" }}>
                  <div style={{ fontSize:9, color:"#2d6aad", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>
                    {res ? "Actual Response" : "Expected Response"}
                  </div>

                  {/* Assertions */}
                  {step.assertions?.length > 0 && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:8, color:"#2d6aad", marginBottom:3 }}>
                        {res ? "Assertions" : "Expected"}
                      </div>
                      {step.assertions.map((a, j) => {
                        const actual = res?.assertions?.[j];
                        return (
                          <div key={j} style={{ display:"flex", gap:6, fontSize:9, marginBottom:3, padding:"3px 6px", borderRadius:4, background:actual?(actual.passed?"#0a1a0a":"#1a0808"):"#0a0e12" }}>
                            {actual && <span style={{ color:actual.passed?"#4caf50":"#ff3b3b", flexShrink:0 }}>{actual.passed?"✓":"✗"}</span>}
                            <span style={{ color:"#6a8aa8", flexShrink:0 }}>{a.type}</span>
                            <span style={{ color:"#a0c0d8" }}>
                              {a.type==="status" && `= ${a.expected}`}
                              {a.type==="jsonpath" && `${a.path} ${a.exists!==undefined?`exists=${a.exists}`:a.expected!==undefined?`= ${a.expected}`:""}`}
                              {a.type==="duration" && `< ${a.max}ms`}
                              {a.type==="schema" && `${a.field} is ${a.dataType}`}
                            </span>
                            {actual?.message && <span style={{ color:"#ff8c00", fontSize:8, marginLeft:"auto" }}>{actual.message.slice(0,40)}</span>}
                            {actual?.actual !== undefined && !actual.passed && (
                              <span style={{ color:"#ff6b6b", fontSize:8 }}>got: {String(actual.actual).slice(0,30)}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Response body (post-run) */}
                  {res?.responseBody && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ fontSize:8, color:sc?.c||"#2d6aad", marginBottom:3 }}>
                        Response Body <span style={{ color:"#2d6aad" }}>({res.statusCode})</span>
                      </div>
                      <pre style={{ fontSize:8, color:sc?.c==="pass"?"#7ec87f":"#a0c0d8", background:sc?.bg||"#0a0e12", borderRadius:4, padding:"6px 8px", margin:0, overflowX:"auto", maxHeight:150, fontFamily:"'IBM Plex Mono',monospace", whiteSpace:"pre-wrap" }}>
                        {JSON.stringify(res.responseBody, null, 2).slice(0, 600)}
                      </pre>
                    </div>
                  )}

                  {/* Error */}
                  {res?.error && (
                    <div style={{ padding:"8px 10px", background:"#1a0808", borderRadius:5, border:"0.5px solid #ff3b3b" }}>
                      <div style={{ fontSize:9, color:"#ff6b6b", fontWeight:600, marginBottom:2 }}>Step Failed</div>
                      <div style={{ fontSize:10, color:"#ff8c00" }}>{res.error}</div>
                    </div>
                  )}

                  {/* Captures */}
                  {captures.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ fontSize:8, color:"#c8a0f0", marginBottom:3 }}>Values extracted for next steps</div>
                      {captures.map(([varName, jsonPath]) => {
                        const captured = res?.captures?.find(c => c.varName === varName);
                        return (
                          <div key={varName} style={{ display:"flex", gap:6, fontSize:9, marginBottom:3, padding:"3px 7px", background:"#1a0a2e", borderRadius:4, border:"0.5px solid #5b3a8a" }}>
                            <span style={{ color:"#c8a0f0", fontFamily:"monospace" }}>{`{{${varName}}}`}</span>
                            <span style={{ color:"#4a7fa5" }}>from {jsonPath}</span>
                            {captured && (
                              <span style={{ marginLeft:"auto", color: captured.sensitive?"#4a7fa5":"#7ec87f" }}>
                                {captured.sensitive ? "••••••••" : captured.value}
                              </span>
                            )}
                            {!captured && res && <span style={{ marginLeft:"auto", color:"#ff8c00" }}>not captured</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function findUsedVars(step) {
  const str = JSON.stringify({ path:step.path, headers:step.headers, body:step.body, params:step.params });
  return [...new Set([...str.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))]
    .filter(v => !["username","password"].includes(v));
}

function maskBodySensitive(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = /password|secret|token|apikey|api_key|auth|bearer|credential/i.test(k)
      ? "••••••••"
      : (typeof v === "object" ? maskBodySensitive(v) : v);
  }
  return out;
}
