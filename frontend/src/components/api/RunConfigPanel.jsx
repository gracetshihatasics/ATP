/**
 * RunConfigPanel
 *
 * Lets the user configure everything needed to run API scenarios:
 *  - Base URL (override what's in the spec)
 *  - Vault credential (auto-injects username/password/token/apiKey etc.)
 *  - Manual env vars (key=value pairs for {{variable}} substitution)
 *  - Auth header builder (Bearer, Basic, API Key)
 *
 * All values are merged into the `credentials` object passed to runScenario.
 * Sensitive values are masked in the UI.
 */

import { useState, useEffect } from "react";
import { listCredentials }     from "../../services/vault.js";

const BACKEND = "http://localhost:3579";

export function RunConfigPanel({ spec, onConfigChange }) {
  const [vaultCreds,   setVaultCreds]   = useState([]);
  const [selectedCred, setSelectedCred] = useState(null);
  const [baseUrl,      setBaseUrl]      = useState(spec?.baseUrl || "");
  const [authType,     setAuthType]     = useState("none"); // none | bearer | basic | apikey | vault
  const [bearerToken,  setBearerToken]  = useState("");
  const [apiKeyHeader, setApiKeyHeader] = useState("X-API-Key");
  const [apiKeyValue,  setApiKeyValue]  = useState("");
  const [basicUser,    setBasicUser]    = useState("");
  const [basicPass,    setBasicPass]    = useState("");
  const [envVars,      setEnvVars]      = useState([{ key:"", value:"" }]);
  const [showValues,   setShowValues]   = useState(false);

  useEffect(() => {
    listCredentials().then(creds => setVaultCreds(creds || [])).catch(() => {});
  }, []);

  // Sync base URL from spec when spec changes
  useEffect(() => {
    if (spec?.baseUrl && !baseUrl) setBaseUrl(spec.baseUrl);
  }, [spec?.baseUrl]);

  // Emit config whenever anything changes
  useEffect(() => {
    onConfigChange(buildConfig());
  }, [baseUrl, authType, bearerToken, apiKeyHeader, apiKeyValue, basicUser, basicPass, selectedCred, envVars]);

  function buildConfig() {
    const credentials = {};

    // Vault credential fields
    if (authType === "vault" && selectedCred) {
      Object.assign(credentials, selectedCred.fields || {});
    }

    // Bearer token → injects as Authorization header via {{token}}
    if (authType === "bearer" && bearerToken) {
      credentials.token       = bearerToken;
      credentials.bearerToken = bearerToken;
    }

    // API Key
    if (authType === "apikey" && apiKeyValue) {
      credentials.apiKey      = apiKeyValue;
      credentials.apiKeyHeader = apiKeyHeader;
      credentials[apiKeyHeader] = apiKeyValue; // also inject by header name
    }

    // Basic auth
    if (authType === "basic") {
      credentials.username = basicUser;
      credentials.password = basicPass;
    }

    // Manual env vars
    for (const { key, value } of envVars) {
      if (key.trim() && value.trim()) credentials[key.trim()] = value.trim();
    }

    return {
      baseUrl:     baseUrl.trim() || spec?.baseUrl || "",
      credentials,
      authType,
      hasAuth:     authType !== "none",
    };
  }

  const addEnvVar = () => setEnvVars(p => [...p, { key:"", value:"" }]);
  const setEnvVar = (i, field, val) => setEnvVars(p => p.map((v, j) => j===i ? { ...v, [field]:val } : v));
  const removeEnvVar = (i) => setEnvVars(p => p.filter((_, j) => j !== i));

  const loadVaultCred = async (id) => {
    if (!id) { setSelectedCred(null); return; }
    try {
      const res  = await fetch(`${BACKEND}/api/vault/${id}/context`);
      const data = await res.json();
      const cred = vaultCreds.find(c => c.id === id);
      setSelectedCred({ ...cred, fields: data.context || {} });
    } catch {}
  };

  return (
    <div style={{ fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* Base URL */}
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.08em" }}>
          Base URL
          {spec?.baseUrl && <span style={{ color:"#1e3a5f", marginLeft:6, textTransform:"none" }}>from spec: {spec.baseUrl}</span>}
        </div>
        <input
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder={spec?.baseUrl || "https://api.example.com"}
          style={inp}
        />
        {!baseUrl && !spec?.baseUrl && (
          <div style={{ fontSize:8, color:"#ff8c00", marginTop:3 }}>⚠ No base URL — scenarios will fail without one</div>
        )}
      </div>

      {/* Auth type */}
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:9, color:"#2d6aad", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.08em" }}>Auth / Credentials</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:4, marginBottom:8 }}>
          {[
            ["none",   "None"],
            ["bearer", "Bearer"],
            ["basic",  "Basic"],
            ["apikey", "API Key"],
            ["vault",  "🔐 Vault"],
          ].map(([t, l]) => (
            <button key={t} onClick={() => setAuthType(t)}
              style={{ background:authType===t?"#1a3050":"#0d1520", border:`0.5px solid ${authType===t?"#4d9de0":"#1e3a5f"}`, borderRadius:4, color:authType===t?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:9, padding:"5px 0", fontFamily:"inherit" }}>
              {l}
            </button>
          ))}
        </div>

        {/* Bearer Token */}
        {authType === "bearer" && (
          <div>
            <div style={{ fontSize:8, color:"#2d6aad", marginBottom:3 }}>
              Token — injected as <code style={{ color:"#c8a0f0" }}>{"{{token}}"}</code> and <code style={{ color:"#c8a0f0" }}>Authorization: Bearer {"{{token}}"}</code>
            </div>
            <input
              type={showValues ? "text" : "password"}
              value={bearerToken}
              onChange={e => setBearerToken(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiJ9..."
              style={inp}
            />
          </div>
        )}

        {/* Basic Auth */}
        {authType === "basic" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            <div>
              <div style={{ fontSize:8, color:"#2d6aad", marginBottom:3 }}>Username → <code style={{ color:"#c8a0f0" }}>{"{{username}}"}</code></div>
              <input value={basicUser} onChange={e => setBasicUser(e.target.value)} placeholder="user@example.com" style={inp} />
            </div>
            <div>
              <div style={{ fontSize:8, color:"#2d6aad", marginBottom:3 }}>Password → <code style={{ color:"#c8a0f0" }}>{"{{password}}"}</code></div>
              <input type={showValues?"text":"password"} value={basicPass} onChange={e => setBasicPass(e.target.value)} placeholder="••••••••" style={inp} />
            </div>
          </div>
        )}

        {/* API Key */}
        {authType === "apikey" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1.5fr", gap:6 }}>
            <div>
              <div style={{ fontSize:8, color:"#2d6aad", marginBottom:3 }}>Header name</div>
              <input value={apiKeyHeader} onChange={e => setApiKeyHeader(e.target.value)} placeholder="X-API-Key" style={inp} />
            </div>
            <div>
              <div style={{ fontSize:8, color:"#2d6aad", marginBottom:3 }}>Value → <code style={{ color:"#c8a0f0" }}>{"{{apiKey}}"}</code></div>
              <input type={showValues?"text":"password"} value={apiKeyValue} onChange={e => setApiKeyValue(e.target.value)} placeholder="sk-••••••••" style={inp} />
            </div>
          </div>
        )}

        {/* Vault */}
        {authType === "vault" && (
          <div>
            <div style={{ fontSize:8, color:"#2d6aad", marginBottom:3 }}>
              All fields from the selected credential are injected as <code style={{ color:"#c8a0f0" }}>{"{{fieldName}}"}</code> variables
            </div>
            {vaultCreds.length === 0 ? (
              <div style={{ fontSize:9, color:"#f0c040", padding:"6px 8px", background:"#1a1500", borderRadius:4 }}>
                ⚠ No credentials in vault — add some in ⚙ Settings → Vault
              </div>
            ) : (
              <select
                onChange={e => loadVaultCred(e.target.value)}
                style={{ ...inp, cursor:"pointer" }}
              >
                <option value="">Select credential...</option>
                {vaultCreds.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type || "credential"})</option>
                ))}
              </select>
            )}
            {selectedCred?.fields && Object.keys(selectedCred.fields).length > 0 && (
              <div style={{ marginTop:6, padding:"6px 8px", background:"#0a0e12", borderRadius:4 }}>
                <div style={{ fontSize:8, color:"#4caf50", marginBottom:4 }}>Fields available as variables:</div>
                {Object.keys(selectedCred.fields).map(k => (
                  <div key={k} style={{ fontSize:8, color:"#c8a0f0", marginBottom:2 }}>
                    <code>{`{{${k}}}`}</code> <span style={{ color:"#2d6aad" }}>= ••••••••</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Environment variables */}
      <div style={{ marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
          <div style={{ fontSize:9, color:"#2d6aad", textTransform:"uppercase", letterSpacing:"0.08em" }}>
            Environment Variables
            <span style={{ color:"#1e3a5f", fontSize:8, textTransform:"none", marginLeft:4 }}>
              — override any <code style={{ color:"#c8a0f0" }}>{"{{variable}}"}</code> in scenarios
            </span>
          </div>
          <button onClick={addEnvVar}
            style={{ background:"none", border:"0.5px solid #1e3a5f", borderRadius:3, color:"#2d6aad", cursor:"pointer", fontSize:8, padding:"2px 7px", fontFamily:"inherit" }}>
            + Add
          </button>
        </div>
        {envVars.map((v, i) => (
          <div key={i} style={{ display:"flex", gap:5, marginBottom:5, alignItems:"center" }}>
            <div style={{ position:"relative", flex:"0 0 120px" }}>
              <span style={{ position:"absolute", left:7, top:"50%", transform:"translateY(-50%)", color:"#c8a0f0", fontSize:9, pointerEvents:"none" }}>{"{{"}</span>
              <input
                value={v.key}
                onChange={e => setEnvVar(i, "key", e.target.value)}
                placeholder="variableName"
                style={{ ...inp, paddingLeft:20, paddingRight:12 }}
              />
              <span style={{ position:"absolute", right:5, top:"50%", transform:"translateY(-50%)", color:"#c8a0f0", fontSize:9, pointerEvents:"none" }}>{"}}"}  </span>
            </div>
            <span style={{ color:"#2d6aad", flexShrink:0 }}>=</span>
            <input
              type={showValues ? "text" : isSensitiveKey(v.key) ? "password" : "text"}
              value={v.value}
              onChange={e => setEnvVar(i, "value", e.target.value)}
              placeholder="value"
              style={{ ...inp, flex:1 }}
            />
            <button onClick={() => removeEnvVar(i)}
              style={{ background:"none", border:"none", color:"#3a1a1a", cursor:"pointer", fontSize:12, padding:"0 2px", fontFamily:"inherit", flexShrink:0 }}
              onMouseEnter={e=>e.currentTarget.style.color="#ff6b6b"}
              onMouseLeave={e=>e.currentTarget.style.color="#3a1a1a"}>
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Show/hide toggle */}
      <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:9, color:"#2d6aad" }}>
        <input type="checkbox" checked={showValues} onChange={e => setShowValues(e.target.checked)} />
        Show sensitive values
      </label>
    </div>
  );
}

function isSensitiveKey(k) {
  return /password|secret|token|apikey|api_key|auth|bearer|credential/i.test(k || "");
}

const inp = {
  width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f",
  borderRadius:5, color:"#c8d8e8", fontSize:11, padding:"6px 8px",
  outline:"none", fontFamily:"'IBM Plex Mono',monospace",
};
