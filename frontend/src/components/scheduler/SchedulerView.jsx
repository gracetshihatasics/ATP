import { useState, useEffect } from "react";

const BACKEND = "http://localhost:3579";

const CRON_PRESETS = {
  hourly:  "Every hour",
  nightly: "Nightly (2am)",
  daily:   "Daily (9am)",
  weekly:  "Weekly (Mon 9am)",
  custom:  "Custom cron",
};

const STATUS_C = {
  pass:    { color:"#4caf50", icon:"✅" },
  fail:    { color:"#ff3b3b", icon:"❌" },
  error:   { color:"#ff8c00", icon:"⚠️" },
  running: { color:"#c8a0f0", icon:"●" },
  skipped: { color:"#2d6aad", icon:"⏭" },
};

export function SchedulerView() {
  const [schedules,  setSchedules]  = useState([]);
  const [view,       setView]       = useState("list"); // list | new | edit | detail
  const [selected,   setSelected]   = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [triggering, setTriggering] = useState({});
  const [urls,       setUrls]       = useState([]);

  const empty = { name:"", url:"", cron:"nightly", cronExpression:"", enabled:true,
    suiteFilter:"all", maxTests:20,
    slack: { webhookUrl:"", channel:"#tests", notifyOn:"always" } };
  const [form, setForm] = useState(empty);

  useEffect(() => { load(); loadUrls(); const iv = setInterval(load, 30_000); return () => clearInterval(iv); }, []);

  const load = async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/schedules`);
      const data = await res.json();
      setSchedules(data.schedules || []);
    } catch {}
  };

  const loadUrls = async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/urls`);
      const data = await res.json();
      setUrls(data.urls || []);
    } catch {}
  };

  const save = async () => {
    setSaving(true);
    try {
      const method   = selected ? "PUT" : "POST";
      const endpoint = selected
        ? `${BACKEND}/api/schedules/${selected.id}`
        : `${BACKEND}/api/schedules`;
      const res  = await fetch(endpoint, {
        method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) { await load(); setView("list"); setSelected(null); setForm(empty); }
    } catch {} finally { setSaving(false); }
  };

  const toggle = async (s) => {
    await fetch(`${BACKEND}/api/schedules/${s.id}/toggle`, { method:"POST" });
    load();
  };

  const remove = async (id) => {
    if (!confirm("Delete this schedule?")) return;
    await fetch(`${BACKEND}/api/schedules/${id}`, { method:"DELETE" });
    load();
  };

  const trigger = async (s) => {
    setTriggering(p => ({ ...p, [s.id]:true }));
    try {
      await fetch(`${BACKEND}/api/schedules/${s.id}/run`, { method:"POST" });
      setTimeout(load, 2000);
    } catch {} finally {
      setTimeout(() => setTriggering(p => ({ ...p, [s.id]:false })), 3000);
    }
  };

  const testSlack = async () => {
    if (!form.slack?.webhookUrl) return;
    setTesting(true); setTestResult(null);
    try {
      const res  = await fetch(`${BACKEND}/api/schedules/test-slack`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ webhookUrl: form.slack.webhookUrl }),
      });
      const data = await res.json();
      setTestResult(data.ok ? "success" : "error");
    } catch { setTestResult("error"); }
    setTesting(false);
  };

  const startEdit = (s) => {
    setSelected(s);
    setForm({
      name:         s.name,
      url:          s.url,
      cron:         s.cron,
      cronExpression: s.cronExpression || "",
      enabled:      s.enabled,
      suiteFilter:  s.suiteFilter || "all",
      maxTests:     s.maxTests || 20,
      slack:        s.slack || { webhookUrl:"", channel:"#tests", notifyOn:"always" },
    });
    setView("edit");
  };

  const setSlack = (key, val) => setForm(p => ({ ...p, slack: { ...(p.slack||{}), [key]:val } }));

  return (
    <div style={{ display:"flex", height:"100%", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* Sidebar */}
      <div style={{ width:230, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column", background:"#090d11" }}>
        <div style={{ padding:"12px 14px", borderBottom:"0.5px solid #1e3a5f" }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#7ec8ff", marginBottom:2 }}>⏰ Scheduled Runs</div>
          <div style={{ fontSize:9, color:"#4a7fa5", lineHeight:1.6 }}>Run tests automatically.<br/>Get notified on Slack.</div>
        </div>

        <div style={{ padding:"6px 10px", borderBottom:"0.5px solid #1e3a5f" }}>
          <button onClick={() => { setView("list"); setSelected(null); }}
            style={{ display:"block", width:"100%", textAlign:"left", background:view==="list"?"#1a3050":"none", border:"none", borderRadius:4, color:view==="list"?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"5px 8px", fontFamily:"inherit", marginBottom:2 }}>
            Schedules ({schedules.length})
          </button>
          <button onClick={() => { setSelected(null); setForm(empty); setView("new"); }}
            style={{ display:"block", width:"100%", textAlign:"left", background:view==="new"?"#1a3050":"none", border:"none", borderRadius:4, color:view==="new"?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:10, padding:"5px 8px", fontFamily:"inherit" }}>
            + New Schedule
          </button>
        </div>

        <div style={{ flex:1, overflowY:"auto" }}>
          {schedules.length === 0 && (
            <div style={{ fontSize:9, color:"#1e3a5f", textAlign:"center", marginTop:20, lineHeight:2 }}>
              No schedules yet.<br/>Create one to automate<br/>your test runs.
            </div>
          )}
          {schedules.map(s => {
            const sc = STATUS_C[s.lastStatus] || { color:"#2d6aad", icon:"○" };
            return (
              <div key={s.id} onClick={() => startEdit(s)}
                style={{ padding:"8px 12px", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                  <span style={{ fontSize:10 }}>{sc.icon}</span>
                  <span style={{ fontSize:10, color:"#b0c8e0", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</span>
                  <span style={{ fontSize:7, color:s.enabled?"#4caf50":"#ff3b3b" }}>●</span>
                </div>
                <div style={{ fontSize:8, color:"#2d6aad", paddingLeft:18 }}>{CRON_PRESETS[s.cron] || s.cron}</div>
                {s.nextRunHuman && <div style={{ fontSize:8, color:"#4a7fa5", paddingLeft:18 }}>{s.nextRunHuman}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1, overflowY:"auto" }}>

        {/* List */}
        {view === "list" && (
          <div style={{ padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:20 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:4 }}>Scheduled Runs</div>
                <div style={{ fontSize:11, color:"#4a7fa5", lineHeight:1.8 }}>
                  Run test suites automatically on a schedule.<br/>
                  Results post to Slack so you know before your users do.
                </div>
              </div>
              <button className="rb" onClick={() => { setSelected(null); setForm(empty); setView("new"); }}>
                + New Schedule
              </button>
            </div>

            {schedules.length === 0 ? (
              <div style={{ textAlign:"center", marginTop:60 }}>
                <div style={{ fontSize:36, marginBottom:12 }}>⏰</div>
                <div style={{ fontSize:12, color:"#2d6aad", marginBottom:8 }}>No scheduled runs yet</div>
                <div style={{ fontSize:10, color:"#1e3a5f", marginBottom:24, lineHeight:2 }}>
                  Schedule a nightly run on your app and get<br/>Slack alerts when tests fail.
                </div>
                <button className="rb" onClick={() => { setForm(empty); setView("new"); }}>Create First Schedule</button>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:10 }}>
                {schedules.map(s => {
                  const sc = STATUS_C[s.lastStatus] || { color:"#2d6aad", icon:"○" };
                  return (
                    <div key={s.id} style={{ border:`0.5px solid ${s.enabled?"#1e3a5f":"#0d1a2a"}`, borderRadius:8, padding:"14px 16px", background:"#0d1520", opacity:s.enabled?1:0.6 }}>
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, color:"#b0d0f0", marginBottom:2 }}>{s.name}</div>
                          <div style={{ fontSize:9, color:"#4d9de0" }}>{s.url?.replace(/^https?:\/\//,"").slice(0,35)}</div>
                        </div>
                        <button onClick={() => toggle(s)}
                          style={{ background:s.enabled?"#0a2010":"#1a0808", border:`0.5px solid ${s.enabled?"#4caf50":"#ff3b3b"}`, borderRadius:4, color:s.enabled?"#4caf50":"#ff6b6b", cursor:"pointer", fontSize:9, padding:"2px 8px", fontFamily:"inherit", flexShrink:0 }}>
                          {s.enabled ? "ON" : "OFF"}
                        </button>
                      </div>

                      <div style={{ display:"flex", gap:10, fontSize:9, color:"#4a7fa5", marginBottom:10 }}>
                        <span>⏰ {CRON_PRESETS[s.cron] || s.cron}</span>
                        {s.slack?.webhookUrl && <span>📢 Slack</span>}
                        <span>{s.maxTests} tests max</span>
                      </div>

                      {s.lastStatus && (
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10, padding:"5px 8px", background:"#0a0e12", borderRadius:4 }}>
                          <span style={{ fontSize:12 }}>{sc.icon}</span>
                          <div style={{ fontSize:9 }}>
                            <span style={{ color:sc.color }}>{s.lastStatus?.toUpperCase()}</span>
                            {s.lastRun && <span style={{ color:"#2d6aad" }}> · {new Date(s.lastRun).toLocaleString()}</span>}
                          </div>
                        </div>
                      )}

                      {s.nextRunHuman && s.enabled && (
                        <div style={{ fontSize:9, color:"#4a7fa5", marginBottom:10 }}>Next run: {s.nextRunHuman}</div>
                      )}

                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => trigger(s)} disabled={triggering[s.id]}
                          style={{ flex:1, background:"linear-gradient(135deg,#1a3050,#0d1a30)", border:"0.5px solid #4d9de0", borderRadius:4, color:triggering[s.id]?"#2d6aad":"#7ec8ff", cursor:triggering[s.id]?"default":"pointer", fontSize:9, padding:"5px 0", fontFamily:"inherit" }}>
                          {triggering[s.id] ? "◈ Running..." : "▶ Run Now"}
                        </button>
                        <button onClick={() => startEdit(s)}
                          style={{ background:"none", border:"0.5px solid #1e3a5f", borderRadius:4, color:"#4a7fa5", cursor:"pointer", fontSize:9, padding:"5px 10px", fontFamily:"inherit" }}>
                          ✎
                        </button>
                        <button onClick={() => remove(s.id)}
                          style={{ background:"none", border:"0.5px solid #3a1a1a", borderRadius:4, color:"#ff6b6b", cursor:"pointer", fontSize:9, padding:"5px 8px", fontFamily:"inherit" }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* New / Edit form */}
        {(view === "new" || view === "edit") && (
          <div style={{ padding:"20px 24px", maxWidth:560 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <button className="nb" onClick={() => { setView("list"); setSelected(null); }} style={{ fontSize:10 }}>← Back</button>
              <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff" }}>
                {view === "new" ? "New Schedule" : `Edit: ${selected?.name}`}
              </div>
            </div>

            <Fl label="Name *">
              <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
                placeholder="Nightly regression" style={inp} />
            </Fl>

            <Fl label="URL *">
              {urls.length > 0 ? (
                <select value={form.url} onChange={e=>setForm(p=>({...p,url:e.target.value}))} style={{ ...inp, cursor:"pointer" }}>
                  <option value="">Select saved URL...</option>
                  {urls.map(u => <option key={u.id} value={u.url}>{u.label || u.url}</option>)}
                </select>
              ) : (
                <input value={form.url} onChange={e=>setForm(p=>({...p,url:e.target.value}))}
                  placeholder="https://myapp.com" style={inp} />
              )}
            </Fl>

            <Fl label="Schedule">
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom: form.cron==="custom"?8:0 }}>
                {Object.entries(CRON_PRESETS).map(([key, label]) => (
                  <button key={key} onClick={() => setForm(p=>({...p,cron:key}))}
                    style={{ background:form.cron===key?"#1a3050":"#0d1520", border:`0.5px solid ${form.cron===key?"#4d9de0":"#1e3a5f"}`, borderRadius:5, color:form.cron===key?"#7ec8ff":"#4a7fa5", cursor:"pointer", fontSize:9, padding:"7px 4px", fontFamily:"inherit", textAlign:"center" }}>
                    {label}
                  </button>
                ))}
              </div>
              {form.cron === "custom" && (
                <input value={form.cronExpression} onChange={e=>setForm(p=>({...p,cronExpression:e.target.value}))}
                  placeholder="0 2 * * * (min hour day month weekday)" style={{ ...inp, marginTop:6 }} />
              )}
            </Fl>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <Fl label="Suite filter">
                <select value={form.suiteFilter} onChange={e=>setForm(p=>({...p,suiteFilter:e.target.value}))} style={{ ...inp, cursor:"pointer" }}>
                  {["all","critical","high","medium"].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </Fl>
              <Fl label="Max tests">
                <input type="number" min={1} max={100} value={form.maxTests}
                  onChange={e=>setForm(p=>({...p,maxTests:parseInt(e.target.value)||20}))} style={inp} />
              </Fl>
            </div>

            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom:16 }}>
              <input type="checkbox" checked={form.enabled} onChange={e=>setForm(p=>({...p,enabled:e.target.checked}))} />
              <span style={{ fontSize:10, color:"#a0c0d8" }}>Enabled</span>
            </label>

            {/* Slack */}
            <div style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"14px 16px", marginBottom:16, background:"#0d1520" }}>
              <div style={{ fontSize:10, fontWeight:600, color:"#7ec8ff", marginBottom:10 }}>📢 Slack Notifications</div>

              <Fl label="Webhook URL">
                <div style={{ display:"flex", gap:6 }}>
                  <input type="password" value={form.slack?.webhookUrl||""} onChange={e=>setSlack("webhookUrl",e.target.value)}
                    placeholder="https://hooks.slack.com/services/..." style={{ ...inp, flex:1 }} />
                  <button onClick={testSlack} disabled={testing || !form.slack?.webhookUrl}
                    style={{ background:"#0d1520", border:"0.5px solid #4d9de0", borderRadius:4, color:testing?"#2d6aad":"#7ec8ff", cursor:"pointer", fontSize:9, padding:"0 10px", fontFamily:"inherit", flexShrink:0, whiteSpace:"nowrap" }}>
                    {testing ? "Testing..." : "Test"}
                  </button>
                </div>
                {testResult === "success" && <div style={{ fontSize:9, color:"#4caf50", marginTop:4 }}>✓ Slack test sent!</div>}
                {testResult === "error"   && <div style={{ fontSize:9, color:"#ff6b6b", marginTop:4 }}>✗ Could not send — check webhook URL</div>}
              </Fl>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <Fl label="Channel">
                  <input value={form.slack?.channel||""} onChange={e=>setSlack("channel",e.target.value)}
                    placeholder="#tests" style={inp} />
                </Fl>
                <Fl label="Notify on">
                  <select value={form.slack?.notifyOn||"always"} onChange={e=>setSlack("notifyOn",e.target.value)} style={{ ...inp, cursor:"pointer" }}>
                    <option value="always">Always</option>
                    <option value="fail">Failures only</option>
                    <option value="pass">Passes only</option>
                  </select>
                </Fl>
              </div>

              <div style={{ fontSize:9, color:"#2d6aad", lineHeight:1.8 }}>
                Get a Slack webhook at <span style={{ color:"#c8a0f0" }}>api.slack.com/apps → Incoming Webhooks</span>
              </div>
            </div>

            <button className="rb" onClick={save} disabled={saving || !form.name || !form.url}
              style={{ width:"100%", padding:"11px 0", fontSize:12 }}>
              {saving ? "Saving..." : view === "new" ? "Create Schedule" : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Fl({ label, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:9, color:"#2d6aad", marginBottom:4, letterSpacing:"0.08em" }}>{label}</div>
      {children}
    </div>
  );
}

const inp = {
  width:"100%", background:"#0d1520", border:"0.5px solid #1e3a5f",
  borderRadius:5, color:"#c8d8e8", fontSize:12, padding:"7px 9px",
  outline:"none", fontFamily:"'IBM Plex Mono',monospace",
};
