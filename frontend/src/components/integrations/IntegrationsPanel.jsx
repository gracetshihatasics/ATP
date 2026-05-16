import { useState, useEffect } from "react";

const BACKEND = "http://localhost:3579";

const INTEGRATION_TYPES = {
  confluence: { label:"Confluence",  icon:"📄", color:"#4d9de0", desc:"Docs, specs, feature requirements", fields:[
    { key:"baseUrl",  label:"Base URL",   placeholder:"https://yourco.atlassian.net" },
    { key:"email",    label:"Email",      placeholder:"you@company.com" },
    { key:"apiToken", label:"API Token",  placeholder:"your-api-token", secret:true },
    { key:"spaceKeys",label:"Space Keys", placeholder:"DEV,PROD (optional)" },
  ]},
  jira: { label:"Jira", icon:"🎯", color:"#f0c040", desc:"Tickets, sprints, acceptance criteria", fields:[
    { key:"baseUrl",     label:"Base URL",     placeholder:"https://yourco.atlassian.net" },
    { key:"email",       label:"Email",        placeholder:"you@company.com" },
    { key:"apiToken",    label:"API Token",    placeholder:"your-api-token", secret:true },
    { key:"projectKeys", label:"Project Keys", placeholder:"ATP,DEV (optional)" },
  ]},
  github: { label:"GitHub", icon:"🐙", color:"#c8d8f0", desc:"Repos, issues, PRs, README for code context", fields:[
    { key:"token",          label:"Personal Access Token", placeholder:"ghp_...", secret:true },
    { key:"repos",          label:"Repos",                 placeholder:"owner/repo1,owner/repo2" },
    { key:"includeReadme",  label:"Include README",        placeholder:"true", type:"checkbox" },
    { key:"includeIssues",  label:"Include Issues",        placeholder:"true", type:"checkbox" },
    { key:"includePRs",     label:"Include Open PRs",      placeholder:"true", type:"checkbox" },
  ]},
  postman: { label:"Postman", icon:"📮", color:"#ff8c00", desc:"Collections, environments, existing API tests", fields:[
    { key:"apiKey",      label:"Postman API Key",  placeholder:"PMAK-...", secret:true },
    { key:"workspaceId", label:"Workspace ID",     placeholder:"optional — leave blank for all" },
  ]},
  swagger: { label:"Swagger / OpenAPI", icon:"📐", color:"#4caf50", desc:"Live API spec — endpoints, schemas, operations", fields:[
    { key:"specUrl",   label:"Spec URL",   placeholder:"https://api.example.com/openapi.json" },
    { key:"authType",  label:"Auth Type",  placeholder:"none", type:"select", options:["none","bearer","basic","api-key"] },
    { key:"authValue", label:"Auth Value", placeholder:"token if required", secret:true },
  ]},
  miro: { label:"Miro", icon:"🎨", color:"#f0c840", desc:"Boards, wireframes, user journey maps, flowcharts", fields:[
    { key:"accessToken", label:"Access Token", placeholder:"your-miro-token", secret:true },
    { key:"boardIds",    label:"Board IDs",    placeholder:"uXjVK...,uXjVM... (optional)" },
  ]},
  postgres: { label:"PostgreSQL", icon:"🐘", color:"#7ec8ff", desc:"Real test data, schema context", fields:[
    { key:"host",       label:"Host",     placeholder:"localhost" },
    { key:"port",       label:"Port",     placeholder:"5432" },
    { key:"database",   label:"Database", placeholder:"myapp" },
    { key:"username",   label:"Username", placeholder:"postgres" },
    { key:"password",   label:"Password", placeholder:"••••••••", secret:true },
    { key:"ssl",        label:"Use SSL",  placeholder:"false", type:"checkbox" },
  ]},
  mysql: { label:"MySQL", icon:"🐬", color:"#f0a040", desc:"Real test data from MySQL", fields:[
    { key:"host",     label:"Host",     placeholder:"localhost" },
    { key:"port",     label:"Port",     placeholder:"3306" },
    { key:"database", label:"Database", placeholder:"myapp" },
    { key:"username", label:"Username", placeholder:"root" },
    { key:"password", label:"Password", placeholder:"••••••••", secret:true },
  ]},
  mongodb: { label:"MongoDB", icon:"🍃", color:"#4caf50", desc:"Collections and documents", fields:[
    { key:"connectionString", label:"Connection String", placeholder:"mongodb://localhost:27017/mydb", secret:true },
    { key:"database",         label:"Database",          placeholder:"myapp" },
  ]},
  notion: { label:"Notion", icon:"📝", color:"#c8a0f0", desc:"Pages, databases, documentation", fields:[
    { key:"apiToken",     label:"Integration Token", placeholder:"secret_...", secret:true },
    { key:"databaseIds",  label:"Database IDs",      placeholder:"abc123,def456 (optional)" },
  ]},
  rest: { label:"REST API", icon:"🔌", color:"#ff8c00", desc:"Custom API endpoints for test data", fields:[
    { key:"baseUrl",   label:"Base URL",  placeholder:"https://api.example.com" },
    { key:"authType",  label:"Auth Type", placeholder:"bearer|basic|api-key|header", type:"select", options:["none","bearer","basic","api-key","header"] },
    { key:"authValue", label:"Auth Value",placeholder:"your-token-or-key", secret:true },
    { key:"endpoints", label:"Endpoints (JSON)", placeholder:'[{"path":"/users","label":"Users"}]', type:"textarea" },
  ]},
};

const STATUS_COLORS = {
  connected: { color:"#4caf50", bg:"#0a2010", icon:"✓" },
  error:     { color:"#ff3b3b", bg:"#1a0808", icon:"✗" },
  pending:   { color:"#f0c040", bg:"#1a1500", icon:"○" },
};

export function IntegrationsPanel({ url = "" }) {
  const [integrations, setIntegrations] = useState([]);
  const [editing, setEditing]           = useState(null); // null | "new" | id
  const [newType, setNewType]           = useState("confluence");
  const [form, setForm]                 = useState({ name:"", enabled:true, config:{} });
  const [syncing, setSyncing]           = useState({});
  const [syncResults, setSyncResults]   = useState({});
  const [context, setContext]           = useState(null);
  const [loadingCtx, setLoadingCtx]     = useState(false);
  const [activeTab, setActiveTab]       = useState("integrations");
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/integrations`);
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch {}
  };

  const loadContext = async () => {
    setLoadingCtx(true);
    try {
      const res  = await fetch(`${BACKEND}/api/integrations/context?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      setContext(data.context);
    } catch {} finally { setLoadingCtx(false); }
  };

  const startNew = (type) => {
    setNewType(type);
    setForm({ name: INTEGRATION_TYPES[type].label, enabled: true, config: {} });
    setEditing("new");
    setError(null);
  };

  const startEdit = async (int) => {
    try {
      const res  = await fetch(`${BACKEND}/api/integrations/${int.id}`);
      const data = await res.json();
      setForm({ name: data.integration.name, enabled: data.integration.enabled, config: data.integration.config });
      setNewType(data.integration.type);
      setEditing(int.id);
      setError(null);
    } catch {}
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const method  = editing === "new" ? "POST" : "PUT";
      const endpoint = editing === "new" ? `${BACKEND}/api/integrations` : `${BACKEND}/api/integrations/${editing}`;
      const res  = await fetch(endpoint, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, type: newType }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setEditing(null); await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const deleteInt = async (id) => {
    if (!confirm("Delete this integration?")) return;
    await fetch(`${BACKEND}/api/integrations/${id}`, { method: "DELETE" });
    load();
  };

  const sync = async (id) => {
    setSyncing(p => ({ ...p, [id]: true }));
    try {
      const res  = await fetch(`${BACKEND}/api/integrations/${id}/sync`, { method: "POST" });
      const data = await res.json();
      setSyncResults(p => ({ ...p, [id]: data }));
      load();
    } catch (e) {
      setSyncResults(p => ({ ...p, [id]: { ok: false, error: e.message } }));
    } finally { setSyncing(p => ({ ...p, [id]: false })); }
  };

  const toggle = async (id) => {
    await fetch(`${BACKEND}/api/integrations/${id}/toggle`, { method: "POST" });
    load();
  };

  const setField = (key, val) => setForm(p => ({ ...p, config: { ...p.config, [key]: val } }));
  const typeDef  = INTEGRATION_TYPES[newType];

  return (
    <div style={{ display:"flex", height:"calc(100vh - 44px)", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* ── Left sidebar ── */}
      <div style={{ width:220, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
        <div style={{ padding:"12px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:3 }}>🔗 Integrations</div>
          <div style={{ fontSize:9, color:"#4a7fa5" }}>Connect data sources for richer test context</div>
        </div>

        {/* Tabs */}
        <div style={{ padding:"6px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
          {[["integrations","Connections"],["context","Context Preview"]].map(([t,l]) => (
            <button key={t} onClick={() => { setActiveTab(t); if(t==="context") loadContext(); }}
              style={{ display:"block", width:"100%", textAlign:"left", background:activeTab===t?"#1a3050":"none", border:"none", borderRadius:4, color:activeTab===t?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"5px 8px", fontFamily:"inherit", marginBottom:2 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Connected list */}
        <div style={{ flex:1, overflowY:"auto", padding:"6px 8px" }}>
          {integrations.length === 0 && (
            <div style={{ fontSize:9, color:"#1e3a5f", textAlign:"center", marginTop:16, lineHeight:2 }}>No integrations yet</div>
          )}
          {integrations.map(int => {
            const td = INTEGRATION_TYPES[int.type];
            const sc = STATUS_COLORS[int.status] ?? STATUS_COLORS.pending;
            return (
              <div key={int.id} style={{ padding:"7px 8px", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer" }}
                onClick={() => startEdit(int)}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                  <span style={{ fontSize:12 }}>{td?.icon}</span>
                  <span style={{ fontSize:10, color:"#b0c8e0", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{int.name}</span>
                  <span style={{ fontSize:9, color:sc.color }}>{sc.icon}</span>
                  <button onClick={e => { e.stopPropagation(); toggle(int.id); }}
                    style={{ background:"none", border:`0.5px solid ${int.enabled?"#4caf5060":"#ff3b3b60"}`, borderRadius:3, color:int.enabled?"#4caf50":"#ff6b6b", cursor:"pointer", fontSize:7, padding:"1px 5px", fontFamily:"inherit" }}>
                    {int.enabled?"ON":"OFF"}
                  </button>
                </div>
                {int.lastSync && <div style={{ fontSize:7, color:"#2d6aad", paddingLeft:20 }}>synced {new Date(int.lastSync).toLocaleTimeString()}</div>}
                {int.error && <div style={{ fontSize:7, color:"#ff6b6b", paddingLeft:20 }}>{int.error.slice(0,40)}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, overflowY:"auto" }}>

        {/* Integrations tab */}
        {activeTab === "integrations" && !editing && (
          <div style={{ padding:"20px 24px" }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:4 }}>Connect Data Sources</div>
            <div style={{ fontSize:11, color:"#4a7fa5", marginBottom:24, lineHeight:1.8 }}>
              Connect ATP to your tools so Claude has full context when discovering and running tests.<br/>
              Jira tickets become test requirements. Confluence docs become test specs. DB data becomes test fixtures.
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:10 }}>
              {Object.entries(INTEGRATION_TYPES).map(([type, td]) => {
                const existing = integrations.filter(i => i.type === type);
                return (
                  <div key={type} style={{ border:`0.5px solid ${td.color}40`, borderRadius:8, padding:"14px 16px", background:"#0d1520" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <span style={{ fontSize:22 }}>{td.icon}</span>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:"#b0d0f0" }}>{td.label}</div>
                        <div style={{ fontSize:9, color:"#4a7fa5" }}>{td.desc}</div>
                      </div>
                    </div>
                    {existing.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        {existing.map(int => {
                          const sc = STATUS_COLORS[int.status] ?? STATUS_COLORS.pending;
                          return (
                            <div key={int.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 6px", background:sc.bg, borderRadius:4, marginBottom:4, border:`0.5px solid ${sc.color}40` }}>
                              <span style={{ fontSize:10, color:sc.color }}>{sc.icon}</span>
                              <span style={{ fontSize:10, color:"#a0c0d8", flex:1 }}>{int.name}</span>
                              <button onClick={() => sync(int.id)} disabled={syncing[int.id]}
                                style={{ background:"none", border:"0.5px solid #2d6aad", borderRadius:3, color:syncing[int.id]?"#2d6aad":"#4d9de0", cursor:"pointer", fontSize:8, padding:"1px 6px", fontFamily:"inherit" }}>
                                {syncing[int.id]?"...":"↻"}
                              </button>
                              <button onClick={() => startEdit(int)}
                                style={{ background:"none", border:"0.5px solid #1e3a5f", borderRadius:3, color:"#4a7fa5", cursor:"pointer", fontSize:8, padding:"1px 6px", fontFamily:"inherit" }}>
                                ✎
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button onClick={() => startNew(type)}
                      style={{ width:"100%", background:"none", border:`0.5px solid ${td.color}60`, borderRadius:5, color:td.color, cursor:"pointer", fontSize:10, padding:"6px 0", fontFamily:"inherit", transition:"all 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background=`${td.color}15`}
                      onMouseLeave={e => e.currentTarget.style.background="none"}>
                      + Add {td.label}
                    </button>
                    {syncResults[integrations.find(i=>i.type===type)?.id] && (
                      <div style={{ fontSize:9, color:"#4caf50", marginTop:6 }}>
                        ✓ {syncResults[integrations.find(i=>i.type===type)?.id]?.summary}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Edit / new form */}
        {activeTab === "integrations" && editing && (
          <div style={{ padding:"20px 24px", maxWidth:540 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <button className="nb" onClick={() => { setEditing(null); setError(null); }} style={{ fontSize:10 }}>← Back</button>
              <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>
                {typeDef?.icon} {editing === "new" ? `New ${typeDef?.label}` : `Edit ${form.name}`}
              </div>
            </div>

            {error && <div style={{ fontSize:11, color:"#ff6b6b", background:"#1a0808", borderRadius:5, padding:"8px 12px", marginBottom:14, border:"0.5px solid #ff3b3b" }}>{error}</div>}

            <F label="Name" required>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder={`My ${typeDef?.label}`} style={inp} />
            </F>

            <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>
              {typeDef?.label} Settings
            </div>

            {typeDef?.fields.map(field => (
              <F key={field.key} label={field.label}>
                {field.type === "textarea"
                  ? <textarea value={form.config[field.key] || ""} onChange={e => setField(field.key, e.target.value)}
                      placeholder={field.placeholder} rows={3}
                      style={{ ...inp, resize:"vertical", height:"auto" }} />
                  : field.type === "select"
                  ? <select value={form.config[field.key] || "none"} onChange={e => setField(field.key, e.target.value)} style={{ ...inp, cursor:"pointer" }}>
                      {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  : field.type === "checkbox"
                  ? <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                      <input type="checkbox" checked={form.config[field.key] === "true" || form.config[field.key] === true} onChange={e => setField(field.key, e.target.checked)} />
                      <span style={{ fontSize:10, color:"#a0c0d8" }}>{field.placeholder}</span>
                    </label>
                  : <input type={field.secret ? "password" : "text"}
                      value={form.config[field.key] || ""}
                      onChange={e => setField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      style={inp} />
                }
              </F>
            ))}

            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:16 }}>
              <input type="checkbox" checked={form.enabled} onChange={e => setForm(p => ({ ...p, enabled: e.target.checked }))} />
              <span style={{ fontSize:10, color:"#a0c0d8" }}>Enable this integration</span>
            </label>

            <div style={{ display:"flex", gap:8 }}>
              <button className="rb" onClick={save} disabled={saving || !form.name}>
                {saving ? "Saving..." : editing === "new" ? "Save & Connect" : "Update"}
              </button>
              {editing !== "new" && (
                <button onClick={() => sync(editing)} disabled={syncing[editing]}
                  style={{ background:"#0d1520", border:"0.5px solid #4d9de0", borderRadius:5, color:syncing[editing]?"#2d6aad":"#7ec8ff", cursor:"pointer", fontSize:11, padding:"0 14px", fontFamily:"inherit" }}>
                  {syncing[editing] ? "◈ Syncing..." : "↻ Test & Sync"}
                </button>
              )}
              {editing !== "new" && (
                <button onClick={() => deleteInt(editing)}
                  style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:5, color:"#ff6b6b", cursor:"pointer", fontSize:11, padding:"0 12px", fontFamily:"inherit" }}>
                  Delete
                </button>
              )}
            </div>

            {editing !== "new" && syncResults[editing] && (
              <div style={{ marginTop:12, padding:"10px 12px", borderRadius:6, background:syncResults[editing].ok?"#0a2010":"#1a0808", border:`0.5px solid ${syncResults[editing].ok?"#4caf50":"#ff3b3b"}`, fontSize:10, color:syncResults[editing].ok?"#7ec87f":"#ff6b6b" }}>
                {syncResults[editing].ok ? `✓ ${syncResults[editing].summary}` : `✗ ${syncResults[editing].error}`}
              </div>
            )}
          </div>
        )}

        {/* Context preview tab */}
        {activeTab === "context" && (
          <div style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:3 }}>Context Preview</div>
                <div style={{ fontSize:11, color:"#4a7fa5" }}>
                  This is what ATP feeds to Claude before every discovery and test run.
                </div>
              </div>
              <button className="rb" onClick={loadContext} disabled={loadingCtx}>
                {loadingCtx ? "◈ Loading..." : "↻ Refresh Context"}
              </button>
            </div>

            {!context && !loadingCtx && (
              <div style={{ textAlign:"center", marginTop:40, color:"#2d6aad", fontSize:11, lineHeight:2 }}>
                Click "Refresh Context" to see what context<br/>ATP currently has from your integrations.
              </div>
            )}

            {loadingCtx && (
              <div style={{ textAlign:"center", marginTop:40, color:"#c8a0f0", fontSize:11 }}>
                <div style={{ display:"flex", justifyContent:"center", gap:4, marginBottom:8 }}>
                  {[0,.2,.4].map((d,i) => <div key={i} style={{ width:6,height:6,borderRadius:"50%",background:"#c8a0f0",animation:`pulse 0.8s ${d}s infinite` }}/>)}
                </div>
                Building context from all integrations...
              </div>
            )}

            {context && !loadingCtx && (
              <>
                {context.isEmpty && (
                  <div style={{ border:"0.5px solid #f0c040", borderRadius:8, padding:"16px 18px", background:"#1a1500", marginBottom:16 }}>
                    <div style={{ fontSize:11, color:"#f0c040" }}>⚠ No context available</div>
                    <div style={{ fontSize:10, color:"#a09060", marginTop:4 }}>Add and enable integrations to give ATP context about your application.</div>
                  </div>
                )}

                {context.errors?.length > 0 && (
                  <div style={{ border:"0.5px solid #ff3b3b", borderRadius:8, padding:"12px 14px", background:"#1a0808", marginBottom:12 }}>
                    <div style={{ fontSize:10, color:"#ff6b6b", marginBottom:4 }}>Integration errors:</div>
                    {context.errors.map((e,i) => <div key={i} style={{ fontSize:9, color:"#ff8888" }}>✗ {e.name}: {e.error}</div>)}
                  </div>
                )}

                {context.sections?.map((section, i) => (
                  <div key={i} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", marginBottom:10, background:"#0d1520" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                      <span style={{ fontSize:14 }}>{INTEGRATION_TYPES[section.type]?.icon || "🔌"}</span>
                      <span style={{ fontSize:11, fontWeight:600, color:"#b0d0f0" }}>{section.name}</span>
                      <span className="pill" style={{ background:"#0a0e12", border:"0.5px solid #1e3a5f", color:"#4a7fa5" }}>{section.type}</span>
                    </div>
                    <pre style={{ fontSize:9, color:"#a0c0d8", margin:0, whiteSpace:"pre-wrap", lineHeight:1.7, fontFamily:"'IBM Plex Mono',monospace", maxHeight:200, overflowY:"auto" }}>
                      {section.text}
                    </pre>
                  </div>
                ))}

                {!context.isEmpty && (
                  <div style={{ border:"0.5px solid #4caf5040", borderRadius:8, padding:"12px 14px", background:"#0a1a0a" }}>
                    <div style={{ fontSize:10, color:"#4caf50", marginBottom:6 }}>✓ Full context ({context.text?.length} chars) ready for Claude</div>
                    <div style={{ fontSize:9, color:"#4a7fa5" }}>This context is automatically injected into advanced discovery and test generation prompts.</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function F({ label, children, required }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", marginBottom:5 }}>
        {label}{required && <span style={{ color:"#ff6b6b" }}> *</span>}
      </div>
      {children}
    </div>
  );
}

const inp = {
  width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f",
  borderRadius:5, color:"#c8d8e8", fontSize:12, padding:"7px 9px",
  outline:"none", fontFamily:"'IBM Plex Mono',monospace",
};
