import { useState, useEffect } from "react";
import { listCredentials } from "../../services/vault.js";

const ENV_COLORS = {
  dev:     "#4d9de0",
  staging: "#f0c040",
  prod:    "#e05050",
  custom:  "#4caf50",
};

/**
 * Reusable credential picker — shows a dropdown of vault entries.
 * Props:
 *   value        — selected credential id (or null)
 *   onChange     — (id, entry) => void
 *   placeholder  — string shown when nothing selected
 */
export function CredentialPicker({ value, onChange, placeholder = "None (no auth)" }) {
  const [credentials, setCredentials] = useState([]);
  const [open, setOpen]               = useState(false);
  const [loading, setLoading]         = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { setCredentials(await listCredentials()); } catch {}
    setLoading(false);
  };

  const selected = credentials.find(c => c.id === value) ?? null;

  const handleSelect = (cred) => {
    onChange(cred?.id ?? null, cred ?? null);
    setOpen(false);
  };

  return (
    <div style={{ position:"relative" }}>
      {/* Trigger */}
      <div
        onClick={() => { setOpen(!open); load(); }}
        style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#0d1520", border:`0.5px solid ${open?"#4d9de0":"#1e3a5f"}`, borderRadius:5, padding:"7px 10px", cursor:"pointer", transition:"border-color 0.15s" }}>
        {selected ? (
          <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, minWidth:0 }}>
            <span style={{ fontSize:9, color: ENV_COLORS[selected.environment] ?? "#4a7fa5", flexShrink:0 }}>●</span>
            <span style={{ fontSize:11, color:"#c8d8e8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selected.name}</span>
            <span className="pill" style={{ background:"#0a1520", border:"0.5px solid #1e3a5f", color:"#4a7fa5", flexShrink:0 }}>
              {selected.kind === "set" ? `set · ${selected.users?.length}u` : selected.type}
            </span>
          </div>
        ) : (
          <span style={{ fontSize:11, color:"#2d6aad" }}>{loading ? "Loading..." : placeholder}</span>
        )}
        <span style={{ color:"#2d6aad", fontSize:10, marginLeft:8, flexShrink:0 }}>{open ? "▴" : "▾"}</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#0d1520", border:"0.5px solid #2d6aad", borderRadius:6, zIndex:100, overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,0.4)" }}>
          {/* None option */}
          <div
            onClick={() => handleSelect(null)}
            style={{ padding:"8px 12px", cursor:"pointer", fontSize:11, color:"#4a7fa5", borderBottom:"0.5px solid #1e3a5f", transition:"background 0.1s" }}
            onMouseEnter={e => e.currentTarget.style.background="#1a2a3a"}
            onMouseLeave={e => e.currentTarget.style.background="transparent"}>
            ○ None (no auth)
          </div>

          {credentials.length === 0 && (
            <div style={{ padding:"10px 12px", fontSize:11, color:"#1e3a5f" }}>
              No credentials in vault yet — add one in 🔐 Vault
            </div>
          )}

          {credentials.map(cred => {
            const ec = ENV_COLORS[cred.environment] ?? "#4a7fa5";
            const isSet = cred.kind === "set";
            return (
              <div key={cred.id}
                onClick={() => handleSelect(cred)}
                style={{ padding:"9px 12px", cursor:"pointer", borderBottom:"0.5px solid #0d1a2a", transition:"background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background="#1a2a3a"}
                onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:2 }}>
                  <span style={{ fontSize:9, color:ec }}>●</span>
                  <span style={{ fontSize:11, color:"#c8d8e8", fontWeight:500 }}>{cred.name}</span>
                  <span className="pill" style={{ background:"#0a1520", border:`0.5px solid ${ec}`, color:ec }}>
                    {cred.environment}
                  </span>
                  {isSet && <span className="pill" style={{ background:"#0a1200", border:"0.5px solid #1a7a3a", color:"#4caf50" }}>set</span>}
                </div>
                <div style={{ fontSize:9, color:"#4a7fa5", paddingLeft:14 }}>
                  {isSet
                    ? `${cred.users?.length ?? 0} users: ${cred.users?.map(u=>u.alias).join(", ")}`
                    : `${cred.type} · ${cred.fields?.length ?? 0} fields · ${cred.url || "any URL"}`
                  }
                </div>
              </div>
            );
          })}

          {/* Quick link to vault */}
          <div style={{ padding:"7px 12px", fontSize:9, color:"#1e3a5f", borderTop:"0.5px solid #1e3a5f" }}>
            Manage credentials in 🔐 Vault
          </div>
        </div>
      )}
    </div>
  );
}
