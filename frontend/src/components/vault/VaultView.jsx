import { useState, useEffect } from "react";
import { listCredentials, getCredential, createCredential, updateCredential, deleteCredential } from "../../services/vault.js";

const ENVIRONMENTS = ["dev", "staging", "prod", "custom"];
const TYPES = ["basic", "bearer", "apikey", "oauth2"];

const TYPE_FIELDS = {
  basic:   [{ key: "username", label: "Username", secret: false }, { key: "password", label: "Password", secret: true }],
  bearer:  [{ key: "token", label: "Bearer Token", secret: true }],
  apikey:  [{ key: "apiKey", label: "API Key", secret: true }, { key: "headerName", label: "Header Name", secret: false, placeholder: "X-API-Key" }],
  oauth2:  [{ key: "clientId", label: "Client ID", secret: false }, { key: "clientSecret", label: "Client Secret", secret: true }, { key: "tokenUrl", label: "Token URL", secret: false }],
};

const ENV_COLORS = {
  dev:     { bg: "#0a1520", border: "#1a4a8a", text: "#4d9de0" },
  staging: { bg: "#1a1000", border: "#8a6a00", text: "#f0c040" },
  prod:    { bg: "#1a0808", border: "#8a1a1a", text: "#e05050" },
  custom:  { bg: "#0a1200", border: "#1a7a3a", text: "#4caf50" },
};

export function VaultView() {
  const [credentials, setCredentials] = useState([]);
  const [selected, setSelected]       = useState(null);
  const [editing, setEditing]         = useState(null); // null | "new" | credential id
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  // Form state
  const [form, setForm] = useState({ name: "", environment: "dev", type: "basic", url: "", fields: {} });

  useEffect(() => { loadCredentials(); }, []);

  const loadCredentials = async () => {
    try {
      setCredentials(await listCredentials());
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSelect = async (cred) => {
    try {
      const full = await getCredential(cred.id);
      setSelected(full);
      setEditing(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleNew = () => {
    setSelected(null);
    setForm({ name: "", environment: "dev", type: "basic", url: "", fields: {} });
    setEditing("new");
  };

  const handleEdit = () => {
    if (!selected) return;
    setForm({
      name:        selected.name,
      environment: selected.environment,
      type:        selected.type,
      url:         selected.url,
      fields:      selected.fields ?? {},
    });
    setEditing(selected.id);
  };

  const handleSave = async () => {
    setLoading(true); setError(null);
    try {
      if (editing === "new") {
        await createCredential(form);
      } else {
        await updateCredential(editing, form);
      }
      await loadCredentials();
      setEditing(null);
      setSelected(null);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this credential?")) return;
    try {
      await deleteCredential(id);
      setSelected(null); setEditing(null);
      await loadCredentials();
    } catch (e) {
      setError(e.message);
    }
  };

  const setField = (key, value) =>
    setForm(prev => ({ ...prev, fields: { ...prev.fields, [key]: value } }));

  const typeFields = TYPE_FIELDS[form.type] ?? [];

  return (
    <div style={{ display:"flex", height:"calc(100vh - 44px)" }}>

      {/* ── Left: credential list ── */}
      <div style={{ width:280, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
        <div style={{ padding:"12px 14px", borderBottom:"0.5px solid #1e3a5f", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.12em", textTransform:"uppercase" }}>Credential Vault</div>
          <button className="rb" onClick={handleNew} style={{ fontSize:9, padding:"3px 10px" }}>+ New</button>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"8px 10px" }}>
          {credentials.length === 0 && (
            <div style={{ fontSize:10, color:"#1e3a5f", textAlign:"center", marginTop:30, lineHeight:1.9 }}>
              No credentials stored yet.<br/>Click + New to add one.
            </div>
          )}
          {credentials.map(cred => {
            const ec = ENV_COLORS[cred.environment] ?? ENV_COLORS.custom;
            const isSelected = selected?.id === cred.id;
            return (
              <div key={cred.id} className={`uc-card ${isSelected?"sel":""}`} onClick={() => handleSelect(cred)}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:5 }}>
                  <div style={{ fontSize:12, fontWeight:500, color:"#b0c8e0" }}>{cred.name}</div>
                  <span className="pill" style={{ background:ec.bg, border:`0.5px solid ${ec.border}`, color:ec.text }}>{cred.environment}</span>
                </div>
                <div style={{ fontSize:10, color:"#4a7fa5", marginBottom:3 }}>{cred.type} · {cred.fields?.length ?? 0} fields</div>
                {cred.url && <div style={{ fontSize:9, color:"#1e3a5f", wordBreak:"break-all" }}>{cred.url}</div>}
              </div>
            );
          })}
        </div>

        {/* Security note */}
        <div style={{ padding:"10px 14px", borderTop:"0.5px solid #1e3a5f", background:"#0a0e12" }}>
          <div style={{ fontSize:9, color:"#2d6aad", lineHeight:1.7 }}>
            🔒 All credentials encrypted with AES-256-GCM at rest.<br/>
            Set <code style={{ color:"#c8a0f0" }}>VAULT_SECRET</code> in .env for production.
          </div>
        </div>
      </div>

      {/* ── Main: detail / form ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {!selected && editing !== "new" ? (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:28 }}>🔐</div>
            <div style={{ fontSize:12, color:"#2d6aad", letterSpacing:"0.08em" }}>Credential Vault</div>
            <div style={{ fontSize:10, color:"#1e3a5f", maxWidth:300, textAlign:"center", lineHeight:1.9 }}>
              Store credentials for your apps and APIs.<br/>
              They are encrypted and auto-injected when running tests.
            </div>
            <button className="rb" onClick={handleNew} style={{ marginTop:8 }}>+ Add Credential</button>
          </div>
        ) : editing ? (
          /* ── Form ── */
          <div style={{ flex:1, overflowY:"auto", padding:"20px 24px", maxWidth:600 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:16 }}>
              {editing === "new" ? "New Credential" : "Edit Credential"}
            </div>

            {error && <div style={{ fontSize:11, color:"#ff6b6b", marginBottom:12, padding:"8px 10px", background:"#1a0808", borderRadius:5, border:"0.5px solid #ff3b3b" }}>{error}</div>}

            <Field label="Name" required>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. ASICS Staging API" style={inputStyle} />
            </Field>

            <Field label="Target URL">
              <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
                placeholder="https://api.example.com" style={inputStyle} />
            </Field>

            <div style={{ display:"flex", gap:12, marginBottom:14 }}>
              <Field label="Environment" style={{ flex:1 }}>
                <select value={form.environment} onChange={e => setForm(p => ({ ...p, environment: e.target.value }))} style={{ ...inputStyle, cursor:"pointer" }}>
                  {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </Field>
              <Field label="Auth Type" style={{ flex:1 }}>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value, fields: {} }))} style={{ ...inputStyle, cursor:"pointer" }}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>

            <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>
              {form.type} credentials
            </div>
            {typeFields.map(f => (
              <Field key={f.key} label={f.label}>
                <input
                  type={f.secret ? "password" : "text"}
                  value={form.fields[f.key] ?? ""}
                  onChange={e => setField(f.key, e.target.value)}
                  placeholder={f.placeholder ?? (f.secret ? "••••••••" : "")}
                  style={inputStyle}
                />
              </Field>
            ))}

            <div style={{ display:"flex", gap:8, marginTop:20 }}>
              <button className="rb" onClick={handleSave} disabled={loading || !form.name}>
                {loading ? "Saving..." : editing === "new" ? "Save Credential" : "Update Credential"}
              </button>
              <button className="nb" onClick={() => { setEditing(null); setError(null); }}>Cancel</button>
            </div>
          </div>
        ) : selected ? (
          /* ── Detail view ── */
          <div style={{ flex:1, overflowY:"auto", padding:"20px 24px", maxWidth:600 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>{selected.name}</div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="nb" onClick={handleEdit} style={{ fontSize:10 }}>✎ Edit</button>
                <button className="sb" onClick={() => handleDelete(selected.id)} style={{ fontSize:10 }}>✕ Delete</button>
              </div>
            </div>

            {/* Meta */}
            <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
              {[["Environment", selected.environment], ["Type", selected.type]].map(([l, v]) => {
                const ec = ENV_COLORS[selected.environment] ?? ENV_COLORS.custom;
                return (
                  <div key={l} style={{ background:"#0d1520", border:"0.5px solid #1e3a5f", borderRadius:6, padding:"6px 12px" }}>
                    <div style={{ fontSize:9, color:"#2d6aad", marginBottom:2 }}>{l}</div>
                    <div style={{ fontSize:11, color: l === "Environment" ? ec.text : "#b0c8e0" }}>{v}</div>
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

            {/* Fields */}
            <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10 }}>Stored Fields</div>
            {Object.entries(selected.fields ?? {}).map(([k, v]) => (
              <div key={k} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderBottom:"0.5px solid #0d1a2a", fontSize:11 }}>
                <span style={{ color:"#4a7fa5", minWidth:120 }}>{k}</span>
                <span style={{ color:"#b0c8e0", flex:1, fontFamily:"'IBM Plex Mono',monospace" }}>
                  {k.toLowerCase().includes("secret") || k.toLowerCase().includes("password") || k.toLowerCase().includes("token")
                    ? "••••••••••••"
                    : v}
                </span>
              </div>
            ))}

            <div style={{ marginTop:14, fontSize:9, color:"#2d6aad" }}>
              Created {new Date(selected.createdAt).toLocaleString()} · Updated {new Date(selected.updatedAt).toLocaleString()}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children, style = {}, required }) {
  return (
    <div style={{ marginBottom:12, ...style }}>
      <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.08em", marginBottom:5 }}>
        {label}{required && <span style={{ color:"#ff6b6b" }}> *</span>}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "#0d1520",
  border: "0.5px solid #1e3a5f",
  borderRadius: 5,
  color: "#c8d8e8",
  fontSize: 12,
  padding: "7px 9px",
  outline: "none",
  fontFamily: "'IBM Plex Mono', monospace",
};
