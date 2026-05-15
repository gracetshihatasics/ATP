import { useState, useEffect } from "react";
import {
  listCredentials, getCredential,
  createCredential, updateCredential,
  createCredentialSet, updateCredentialSet,
  deleteCredential,
} from "../../services/vault.js";

const ENVIRONMENTS = ["dev", "staging", "prod", "custom"];
const TYPES        = ["basic", "bearer", "apikey", "oauth2", "none"];

const TYPE_FIELDS = {
  basic:  [{ key:"username", label:"Username", secret:false }, { key:"password", label:"Password", secret:true }],
  bearer: [{ key:"token",    label:"Bearer Token", secret:true }],
  apikey: [{ key:"apiKey",   label:"API Key", secret:true }, { key:"headerName", label:"Header Name", secret:false, placeholder:"X-API-Key" }],
  oauth2: [{ key:"clientId", label:"Client ID", secret:false }, { key:"clientSecret", label:"Client Secret", secret:true }, { key:"tokenUrl", label:"Token URL", secret:false }],
  none:   [],
};

const ENV_COLORS = {
  dev:     { bg:"#0a1520", border:"#1a4a8a", text:"#4d9de0" },
  staging: { bg:"#1a1000", border:"#8a6a00", text:"#f0c040" },
  prod:    { bg:"#1a0808", border:"#8a1a1a", text:"#e05050" },
  custom:  { bg:"#0a1200", border:"#1a7a3a", text:"#4caf50" },
};

const inp = {
  width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f",
  borderRadius:5, color:"#c8d8e8", fontSize:12, padding:"7px 9px",
  outline:"none", fontFamily:"'IBM Plex Mono',monospace",
};

export function VaultView() {
  const [credentials, setCredentials] = useState([]);
  const [selected, setSelected]       = useState(null);
  const [mode, setMode]               = useState("idle"); // idle | new-cred | new-set | edit-cred | edit-set
  const [error, setError]             = useState(null);
  const [loading, setLoading]         = useState(false);
  const [createType, setCreateType]   = useState("credential"); // credential | set

  // Single credential form
  const [cForm, setCForm] = useState({ name:"", environment:"dev", type:"basic", url:"", fields:{} });

  // Set form
  const [sForm, setSForm] = useState({ name:"", environment:"dev", url:"", users:[{ alias:"", type:"basic", fields:{} }] });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setCredentials(await listCredentials()); } catch (e) { setError(e.message); }
  };

  const handleSelect = async (cred) => {
    try { setSelected(await getCredential(cred.id)); setMode("idle"); setError(null); } catch (e) { setError(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this entry?")) return;
    try { await deleteCredential(id); setSelected(null); setMode("idle"); await load(); } catch (e) { setError(e.message); }
  };

  // ── Single credential save ──────────────────────────────────────────────────
  const saveCred = async () => {
    setLoading(true); setError(null);
    try {
      if (mode === "new-cred") await createCredential(cForm);
      else await updateCredential(selected.id, cForm);
      await load(); setMode("idle"); setSelected(null);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ── Set save ────────────────────────────────────────────────────────────────
  const saveSet = async () => {
    setLoading(true); setError(null);
    try {
      if (mode === "new-set") await createCredentialSet(sForm);
      else await updateCredentialSet(selected.id, sForm);
      await load(); setMode("idle"); setSelected(null);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const startNew = () => {
    setSelected(null); setError(null);
    if (createType === "credential") {
      setCForm({ name:"", environment:"dev", type:"basic", url:"", fields:{} });
      setMode("new-cred");
    } else {
      setSForm({ name:"", environment:"dev", url:"", users:[{ alias:"admin", type:"basic", fields:{} }] });
      setMode("new-set");
    }
  };

  const startEdit = () => {
    if (!selected) return;
    setError(null);
    if (selected.kind === "set") {
      setSForm({ name:selected.name, environment:selected.environment, url:selected.url, users: selected.users.map(u => ({ ...u })) });
      setMode("edit-set");
    } else {
      setCForm({ name:selected.name, environment:selected.environment, type:selected.type, url:selected.url, fields:{ ...selected.fields } });
      setMode("edit-cred");
    }
  };

  // ── Set user helpers ────────────────────────────────────────────────────────
  const addUser = () => setSForm(p => ({ ...p, users:[...p.users, { alias:"", type:"basic", fields:{} }] }));
  const removeUser = (i) => setSForm(p => ({ ...p, users:p.users.filter((_,j)=>j!==i) }));
  const updateUser = (i, key, val) => setSForm(p => ({ ...p, users:p.users.map((u,j)=>j===i?{ ...u, [key]:val }:u) }));
  const updateUserField = (i, key, val) => setSForm(p => ({ ...p, users:p.users.map((u,j)=>j===i?{ ...u, fields:{ ...u.fields, [key]:val } }:u) }));

  const isFormMode = ["new-cred","new-set","edit-cred","edit-set"].includes(mode);

  return (
    <div style={{ display:"flex", height:"calc(100vh - 44px)" }}>

      {/* ── Left list ── */}
      <div style={{ width:280, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
        <div style={{ padding:"12px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:8 }}>Credential Vault</div>
          <div style={{ display:"flex", gap:4, marginBottom:8 }}>
            {["credential","set"].map(t => (
              <button key={t} className={`fb ${createType===t?"on":""}`} onClick={()=>setCreateType(t)} style={{ flex:1, textAlign:"center" }}>
                {t === "credential" ? "Single" : "Set (multi-user)"}
              </button>
            ))}
          </div>
          <button className="rb" onClick={startNew} style={{ width:"100%", textAlign:"center" }}>
            + New {createType === "set" ? "Credential Set" : "Credential"}
          </button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"8px 10px" }}>
          {credentials.length === 0 && (
            <div style={{ fontSize:10, color:"#1e3a5f", textAlign:"center", marginTop:30, lineHeight:1.9 }}>No credentials yet.<br/>Click + New to add one.</div>
          )}
          {credentials.map(cred => {
            const ec = ENV_COLORS[cred.environment] ?? ENV_COLORS.custom;
            const isSet = cred.kind === "set";
            return (
              <div key={cred.id} className={`uc-card ${selected?.id===cred.id?"sel":""}`} onClick={()=>handleSelect(cred)}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                  <div style={{ fontSize:11, fontWeight:500, color:"#b0c8e0", flex:1 }}>{cred.name}</div>
                  <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                    {isSet && <span className="pill" style={{ background:"#0a1200", border:"0.5px solid #1a7a3a", color:"#4caf50" }}>set</span>}
                    <span className="pill" style={{ background:ec.bg, border:`0.5px solid ${ec.border}`, color:ec.text }}>{cred.environment}</span>
                  </div>
                </div>
                {isSet
                  ? <div style={{ fontSize:10, color:"#4a7fa5" }}>{cred.users?.length ?? 0} users · {cred.users?.map(u=>u.alias).join(", ")}</div>
                  : <div style={{ fontSize:10, color:"#4a7fa5" }}>{cred.type} · {cred.fields?.length ?? 0} fields</div>
                }
                {cred.url && <div style={{ fontSize:9, color:"#1e3a5f", marginTop:3, wordBreak:"break-all" }}>{cred.url}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ padding:"10px 14px", borderTop:"0.5px solid #1e3a5f", background:"#0a0e12" }}>
          <div style={{ fontSize:9, color:"#2d6aad", lineHeight:1.7 }}>
            🔒 AES-256-GCM encrypted at rest.<br/>
            Set <code style={{ color:"#c8a0f0" }}>VAULT_SECRET</code> in .env
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
        {error && <div style={{ fontSize:11, color:"#ff6b6b", marginBottom:14, padding:"8px 12px", background:"#1a0808", borderRadius:5, border:"0.5px solid #ff3b3b" }}>{error}</div>}

        {/* ── Empty state ── */}
        {!selected && !isFormMode && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, height:"60%" }}>
            <div style={{ fontSize:28 }}>🔐</div>
            <div style={{ fontSize:12, color:"#2d6aad" }}>Credential Vault</div>
            <div style={{ fontSize:10, color:"#1e3a5f", maxWidth:340, textAlign:"center", lineHeight:1.9 }}>
              Store credentials for apps and APIs — encrypted and auto-injected at test time.<br/><br/>
              Use <strong style={{ color:"#4a7fa5" }}>Single</strong> for one user per test.<br/>
              Use <strong style={{ color:"#4caf50" }}>Set</strong> when a test needs multiple users<br/>
              (admin, existing customer, new user, guest).
            </div>
          </div>
        )}

        {/* ── Single credential form ── */}
        {(mode === "new-cred" || mode === "edit-cred") && (
          <div style={{ maxWidth:560 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:16 }}>
              {mode === "new-cred" ? "New Credential" : "Edit Credential"}
            </div>
            <F label="Name" required><input value={cForm.name} onChange={e=>setCForm(p=>({...p,name:e.target.value}))} placeholder="e.g. ASICS Staging API" style={inp}/></F>
            <F label="Target URL"><input value={cForm.url} onChange={e=>setCForm(p=>({...p,url:e.target.value}))} placeholder="https://api.example.com" style={inp}/></F>
            <div style={{ display:"flex", gap:12 }}>
              <F label="Environment" style={{ flex:1 }}>
                <select value={cForm.environment} onChange={e=>setCForm(p=>({...p,environment:e.target.value}))} style={{ ...inp, cursor:"pointer" }}>
                  {ENVIRONMENTS.map(e=><option key={e}>{e}</option>)}
                </select>
              </F>
              <F label="Auth Type" style={{ flex:1 }}>
                <select value={cForm.type} onChange={e=>setCForm(p=>({...p,type:e.target.value,fields:{}}))} style={{ ...inp, cursor:"pointer" }}>
                  {TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </F>
            </div>
            {(TYPE_FIELDS[cForm.type]??[]).map(f=>(
              <F key={f.key} label={f.label}>
                <input type={f.secret?"password":"text"} value={cForm.fields[f.key]??""} onChange={e=>setCForm(p=>({...p,fields:{...p.fields,[f.key]:e.target.value}}))} placeholder={f.placeholder??(f.secret?"••••••••":"")} style={inp}/>
              </F>
            ))}
            <div style={{ display:"flex", gap:8, marginTop:20 }}>
              <button className="rb" onClick={saveCred} disabled={loading||!cForm.name}>{loading?"Saving...":mode==="new-cred"?"Save":"Update"}</button>
              <button className="nb" onClick={()=>setMode("idle")}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Credential Set form ── */}
        {(mode === "new-set" || mode === "edit-set") && (
          <div style={{ maxWidth:680 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:4 }}>
              {mode === "new-set" ? "New Credential Set" : "Edit Credential Set"}
            </div>
            <div style={{ fontSize:10, color:"#4a7fa5", marginBottom:16 }}>
              Group multiple users for tests that need different roles. Reference them as <code style={{ color:"#c8a0f0" }}>{"{{alias.field}}"}</code> in test steps.
            </div>
            <div style={{ display:"flex", gap:12 }}>
              <F label="Set Name" required style={{ flex:2 }}><input value={sForm.name} onChange={e=>setSForm(p=>({...p,name:e.target.value}))} placeholder="e.g. ASICS Checkout Test" style={inp}/></F>
              <F label="Environment" style={{ flex:1 }}>
                <select value={sForm.environment} onChange={e=>setSForm(p=>({...p,environment:e.target.value}))} style={{ ...inp, cursor:"pointer" }}>
                  {ENVIRONMENTS.map(e=><option key={e}>{e}</option>)}
                </select>
              </F>
            </div>
            <F label="Target URL"><input value={sForm.url} onChange={e=>setSForm(p=>({...p,url:e.target.value}))} placeholder="https://api.example.com" style={inp}/></F>

            <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10, marginTop:4 }}>Users in this set</div>

            {sForm.users.map((user, i) => (
              <div key={i} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"12px 14px", marginBottom:10, background:"#0d1520" }}>
                <div style={{ display:"flex", gap:10, marginBottom:10, alignItems:"flex-end" }}>
                  <F label="Alias" required style={{ flex:1, margin:0 }}>
                    <input value={user.alias} onChange={e=>updateUser(i,"alias",e.target.value)} placeholder="e.g. admin, existingUser, guest" style={inp}/>
                  </F>
                  <F label="Auth Type" style={{ flex:1, margin:0 }}>
                    <select value={user.type} onChange={e=>updateUser(i,"type",e.target.value)} style={{ ...inp, cursor:"pointer" }}>
                      {TYPES.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </F>
                  <button onClick={()=>removeUser(i)} style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:4, color:"#ff6b6b", cursor:"pointer", fontSize:11, padding:"4px 8px", fontFamily:"inherit", flexShrink:0 }}>✕</button>
                </div>

                {user.alias && (
                  <div style={{ fontSize:9, color:"#c8a0f0", marginBottom:8 }}>
                    Reference as: {(TYPE_FIELDS[user.type]??[]).map(f=>`{{${user.alias}.${f.key}}}`).join("  ")}
                    {user.type === "none" ? "(no auth — guest/anonymous)" : ""}
                  </div>
                )}

                {(TYPE_FIELDS[user.type]??[]).map(f=>(
                  <F key={f.key} label={f.label} style={{ marginBottom:8 }}>
                    <input type={f.secret?"password":"text"} value={user.fields[f.key]??""} onChange={e=>updateUserField(i,f.key,e.target.value)} placeholder={f.placeholder??(f.secret?"••••••••":"")} style={inp}/>
                  </F>
                ))}
              </div>
            ))}

            <button className="nb" onClick={addUser} style={{ marginBottom:16, fontSize:10 }}>+ Add User</button>

            <div style={{ display:"flex", gap:8 }}>
              <button className="rb" onClick={saveSet} disabled={loading||!sForm.name}>{loading?"Saving...":mode==="new-set"?"Save Set":"Update Set"}</button>
              <button className="nb" onClick={()=>setMode("idle")}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Detail view ── */}
        {selected && mode === "idle" && (
          <div style={{ maxWidth:600 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>{selected.name}</div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="nb" onClick={startEdit} style={{ fontSize:10 }}>✎ Edit</button>
                <button className="sb" onClick={()=>handleDelete(selected.id)} style={{ fontSize:10 }}>✕ Delete</button>
              </div>
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
              {[["Kind", selected.kind === "set" ? "Credential Set" : "Single Credential"], ["Environment", selected.environment]].map(([l,v])=>{
                const ec = ENV_COLORS[selected.environment]??ENV_COLORS.custom;
                return (
                  <div key={l} style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:6, padding:"6px 12px" }}>
                    <div style={{ fontSize:9, color:"#2d6aad", marginBottom:2 }}>{l}</div>
                    <div style={{ fontSize:11, color: l==="Environment"?ec.text:"#b0c8e0" }}>{v}</div>
                  </div>
                );
              })}
              {selected.url && (
                <div style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:6, padding:"6px 12px", flex:1 }}>
                  <div style={{ fontSize:9, color:"#2d6aad", marginBottom:2 }}>Target URL</div>
                  <div style={{ fontSize:11, color:"#b0c8e0", wordBreak:"break-all" }}>{selected.url}</div>
                </div>
              )}
            </div>

            {/* Single credential fields */}
            {selected.kind !== "set" && (
              <>
                <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Fields</div>
                {Object.entries(selected.fields??{}).map(([k,v])=>(
                  <div key={k} style={{ display:"flex", gap:10, padding:"8px 12px", borderBottom:"0.5px solid #0d1a2a", fontSize:11 }}>
                    <span style={{ color:"#4a7fa5", minWidth:120 }}>{k}</span>
                    <span style={{ color:"#b0c8e0", flex:1, fontFamily:"'IBM Plex Mono',monospace" }}>
                      {["secret","password","token","key"].some(s=>k.toLowerCase().includes(s)) ? "••••••••••••" : v}
                    </span>
                  </div>
                ))}
              </>
            )}

            {/* Set users */}
            {selected.kind === "set" && (
              <>
                <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>
                  Users ({selected.users?.length})
                </div>
                {selected.users?.map((user,i)=>(
                  <div key={i} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"12px 14px", marginBottom:8, background:"#0d1520" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:"#7ec8ff" }}>{user.alias}</span>
                      <span className="pill" style={{ background:"#0a1520", border:"0.5px solid #1e3a5f", color:"#4a7fa5" }}>{user.type}</span>
                    </div>
                    <div style={{ fontSize:9, color:"#c8a0f0", marginBottom:8 }}>
                      Reference: {(TYPE_FIELDS[user.type]??[]).map(f=>`{{${user.alias}.${f.key}}}`).join("  ") || "(no auth)"}
                    </div>
                    {Object.entries(user.fields??{}).map(([k,v])=>(
                      <div key={k} style={{ display:"flex", gap:10, fontSize:10, padding:"4px 0", borderBottom:"0.5px solid #0d1a2a" }}>
                        <span style={{ color:"#4a7fa5", minWidth:100 }}>{k}</span>
                        <span style={{ color:"#b0c8e0" }}>
                          {["secret","password","token","key"].some(s=>k.toLowerCase().includes(s)) ? "••••••••••••" : v}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ marginTop:12, padding:"10px 12px", background:"#0a1520", borderRadius:6, border:"0.5px solid #1e3a5f" }}>
                  <div style={{ fontSize:9, color:"#2d6aad", marginBottom:6 }}>HOW TO USE IN TEST STEPS</div>
                  {selected.users?.map(u=>(
                    (TYPE_FIELDS[u.type]??[]).map(f=>(
                      <div key={`${u.alias}.${f.key}`} style={{ fontSize:10, color:"#c8a0f0", marginBottom:3 }}>
                        <code>{`{{${u.alias}.${f.key}}}`}</code>
                        <span style={{ color:"#4a7fa5" }}> → {u.alias}'s {f.key}</span>
                      </div>
                    ))
                  ))}
                  {selected.users?.some(u=>u.type==="none") && (
                    <div style={{ fontSize:10, color:"#4a7fa5", marginTop:4 }}>guest user has no credentials — use for unauthenticated flows</div>
                  )}
                </div>
              </>
            )}

            <div style={{ marginTop:14, fontSize:9, color:"#2d6aad" }}>
              Created {new Date(selected.createdAt).toLocaleString()} · Updated {new Date(selected.updatedAt).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function F({ label, children, style={}, required }) {
  return (
    <div style={{ marginBottom:12, ...style }}>
      <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", marginBottom:5 }}>
        {label}{required && <span style={{ color:"#ff6b6b" }}> *</span>}
      </div>
      {children}
    </div>
  );
}
