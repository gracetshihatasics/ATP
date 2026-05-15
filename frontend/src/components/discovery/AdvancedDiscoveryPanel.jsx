import { useState } from "react";
import { PRIORITY_COLORS, CATEGORY_ICONS } from "../../constants/theme.js";

export function AdvancedDiscoveryPanel({ adv, onLaunchRun, onMergePlan }) {
  const { phase, phases, log, logRef, screenshots, featuresDone, plan, duration, authInfo } = adv;
  const [viewShot, setViewShot]     = useState(null);
  const [activeTab, setActiveTab]   = useState("progress");
  const [filterFeature, setFilterFeature] = useState("All");

  const features = plan?.featureAreas?.map(f => f.name) ?? [];
  const filteredUCs = plan?.useCases?.filter(uc =>
    filterFeature === "All" || uc.feature === filterFeature
  ) ?? [];

  if (phase === "idle") return null;

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:"#080c0f" }}>

      {/* Phase progress bar */}
      <div style={{ padding:"12px 18px", borderBottom:"0.5px solid #1e3a5f", background:"#0a0e12" }}>
        <div style={{ display:"flex", gap:0, alignItems:"center" }}>
          {phases.map((p, i) => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", flex:1 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                  <div style={{ width:16, height:16, borderRadius:"50%", border:`0.5px solid ${p.status==="done"?"#4caf50":p.status==="running"?"#c8a0f0":"#1e3a5f"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:p.status==="done"?"#4caf50":p.status==="running"?"#c8a0f0":"#2d6aad", flexShrink:0,
                    background: p.status==="running"?"#1a0a2e":"transparent",
                    animation: p.status==="running"?"pulse 1s infinite":"none" }}>
                    {p.status==="done"?"✓":p.id}
                  </div>
                  <span style={{ fontSize:10, color:p.status==="done"?"#4caf50":p.status==="running"?"#c8a0f0":"#2d6aad", fontWeight:p.status==="running"?600:400 }}>{p.label}</span>
                </div>
                {p.summary && <div style={{ fontSize:9, color:"#4a7fa5", paddingLeft:22 }}>{p.summary}</div>}
              </div>
              {i < phases.length-1 && (
                <div style={{ width:20, height:1, background: p.status==="done"?"#4caf50":"#1e3a5f", margin:"0 4px", flexShrink:0 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Auth info banner */}
      {authInfo && (
        <div style={{ padding:"6px 18px", background: authInfo.strategy==="auto-registered"?"#0a1500":"#0a0a1a", borderBottom:"0.5px solid #1e3a5f", display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:10, color: authInfo.strategy==="vault"?"#4caf50":authInfo.strategy==="auto-registered"?"#f0c040":"#4a7fa5" }}>
            {authInfo.strategy==="vault"?"🔐 Vault credential used":authInfo.strategy==="auto-registered"?"⚡ Auto-registered test user":"👤 Guest discovery (public pages only)"}
          </span>
          {authInfo.user && <span style={{ fontSize:9, color:"#4a7fa5" }}>→ {authInfo.user.email}</span>}
          {plan?.coverageNotes && <span style={{ fontSize:9, color:"#2d6aad", marginLeft:"auto" }}>{plan.coverageNotes.slice(0,80)}</span>}
        </div>
      )}

      {/* Tabs */}
      {phase === "done" && (
        <div style={{ background:"#0a0e12", borderBottom:"0.5px solid #1e3a5f", padding:"0 14px", display:"flex", alignItems:"center" }}>
          {[["progress","Progress"],["usecases",`Use Cases (${plan?.useCases?.length??0})`],["features",`Features (${featuresDone.length})`],["screenshots",`Screenshots (${screenshots.length})`]].map(([t,l]) => (
            <button key={t} className={`tab ${activeTab===t?"on":""}`} onClick={() => setActiveTab(t)}>{l}</button>
          ))}
          {plan && (
            <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
              <button className="rb" style={{ fontSize:10, padding:"3px 10px" }} onClick={() => onMergePlan(plan)}>
                ← Merge to Discovery
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* Left: live log */}
        <div style={{ width:280, flexShrink:0, borderRight:"0.5px solid #1e3a5f", display:"flex", flexDirection:"column" }}>
          <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"5px 12px", borderBottom:"0.5px solid #1e3a5f", textTransform:"uppercase" }}>
            Discovery log {phase==="running"&&<span style={{ color:"#c8a0f0" }}>● live</span>}
          </div>
          <div ref={logRef} style={{ flex:1, overflowY:"auto", padding:"8px 12px" }}>
            {log.map((l,i) => (
              <div key={i} style={{ fontSize:10, marginBottom:3, display:"flex", gap:5, lineHeight:1.5,
                color:l.level==="error"?"#ff6b6b":l.level==="success"?"#7ec87f":l.level==="warn"?"#ffaa44":l.level==="ai"?"#c8a0f0":l.level==="system"?"#4a7fa5":"#6a8aa8" }}>
                <span style={{ flexShrink:0 }}>{l.level==="error"?"✗":l.level==="success"?"✓":l.level==="ai"?"◈":l.level==="system"?"▸":"›"}</span>
                <span>{l.msg}</span>
              </div>
            ))}
            {phase==="running" && <div style={{ display:"flex", gap:3, padding:"4px 0" }}>{[0,.2,.4].map((d,i)=><div key={i} style={{ width:4,height:4,borderRadius:"50%",background:"#c8a0f0",animation:`pulse 1s ${d}s infinite` }}/>)}</div>}
          </div>

          {/* Features discovered */}
          {featuresDone.length > 0 && (
            <>
              <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", padding:"5px 12px", borderTop:"0.5px solid #1e3a5f", textTransform:"uppercase" }}>
                Features ({featuresDone.length})
              </div>
              <div style={{ maxHeight:160, overflowY:"auto" }}>
                {featuresDone.map((f,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 12px", fontSize:10, borderBottom:"0.5px solid #0d1a2a" }}>
                    <span style={{ color:"#7ec87f" }}>✓ {f.name}</span>
                    <span style={{ color:"#2d6aad" }}>{f.flows} flows</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Duration */}
          {duration && (
            <div style={{ padding:"8px 12px", borderTop:"0.5px solid #1e3a5f", fontSize:10, color:"#4a7fa5" }}>
              ⏱ Completed in {duration}s · {plan?.useCases?.length??0} use cases
            </div>
          )}
        </div>

        {/* Right: main content area */}
        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>

          {/* Progress tab */}
          {(activeTab === "progress" || phase !== "done") && (
            <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>
              {screenshots.length === 0 && phase==="running" && (
                <div style={{ textAlign:"center", marginTop:40, color:"#1e3a5f", fontSize:11 }}>
                  Browser launching... screenshots will appear here
                </div>
              )}
              <div style={{ columns: screenshots.length > 4 ? 2 : 1, gap:10 }}>
                {screenshots.map((s,i) => (
                  <div key={i} style={{ marginBottom:10, breakInside:"avoid" }}>
                    <img src={s.data} alt={s.label} style={{ width:"100%", borderRadius:6, border:"0.5px solid #1e3a5f", cursor:"pointer", display:"block" }}
                      onClick={() => setViewShot(s.data)} />
                    <div style={{ fontSize:9, color:"#4a7fa5", padding:"3px 4px" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Use cases tab */}
          {activeTab === "usecases" && plan && (
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
              {/* Feature filter */}
              <div style={{ padding:"7px 14px", borderBottom:"0.5px solid #1e3a5f", display:"flex", flexWrap:"wrap", gap:4 }}>
                {["All", ...features].map(f => (
                  <button key={f} className={`fb ${filterFeature===f?"on":""}`} onClick={() => setFilterFeature(f)} style={{ fontSize:9 }}>{f}</button>
                ))}
              </div>
              <div style={{ flex:1, overflowY:"auto", padding:"8px 14px" }}>
                {filteredUCs.map(uc => {
                  const pc = PRIORITY_COLORS[uc.priority] ?? PRIORITY_COLORS.Medium;
                  return (
                    <div key={uc.id} className="uc-card">
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <span style={{ fontSize:9, color:"#2d6aad" }}>{uc.id}</span>
                          <span style={{ fontSize:10 }}>{CATEGORY_ICONS[uc.category]??"📋"}</span>
                          {uc.feature && <span style={{ fontSize:9, color:"#4a7fa5" }}>{uc.feature}</span>}
                        </div>
                        <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                          <span className="pill" style={{ background:pc.bg, border:`0.5px solid ${pc.border}`, color:pc.text }}>{uc.priority}</span>
                          <button className="rb" style={{ fontSize:9, padding:"2px 7px" }} onClick={() => onLaunchRun(uc)}>▶</button>
                        </div>
                      </div>
                      <div style={{ fontSize:11, fontWeight:500, color:"#b0c8e0", marginBottom:3 }}>{uc.title}</div>
                      <div style={{ fontSize:10, color:"#4a7fa5" }}>{uc.description}</div>
                      {uc.requiresAuth && <div style={{ fontSize:9, color:"#c8a060", marginTop:4 }}>🔐 requires auth</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Features tab */}
          {activeTab === "features" && (
            <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>
              {(plan?.featureAreas ?? featuresDone).map((f,i) => (
                <div key={i} style={{ border:"0.5px solid #1e3a5f", borderRadius:8, padding:"12px 14px", marginBottom:10, background:"#0d1520" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:"#b0d0f0" }}>{f.name}</div>
                    <div style={{ display:"flex", gap:6 }}>
                      {f.coverage && <span className="pill" style={{ background:"#0a1520", border:"0.5px solid #1e3a5f", color:"#4a7fa5", fontSize:9 }}>{f.coverage}</span>}
                      <span style={{ fontSize:10, color:"#4caf50" }}>{f.useCaseCount ?? f.flows} {f.useCaseCount ? "cases" : "flows"}</span>
                    </div>
                  </div>
                  <div style={{ fontSize:10, color:"#4a7fa5" }}>
                    {plan?.useCases?.filter(uc => uc.feature === f.name).length ?? 0} use cases generated
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Screenshots tab */}
          {activeTab === "screenshots" && (
            <div style={{ flex:1, overflowY:"auto", padding:"14px 18px" }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
                {screenshots.map((s,i) => (
                  <div key={i} style={{ cursor:"pointer" }} onClick={() => setViewShot(s.data)}>
                    <img src={s.data} alt={s.label} style={{ width:"100%", borderRadius:6, border:"0.5px solid #1e3a5f", display:"block" }} />
                    <div style={{ fontSize:9, color:"#4a7fa5", padding:"4px 2px" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {viewShot && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }} onClick={() => setViewShot(null)}>
          <img src={viewShot} style={{ maxWidth:"92vw", maxHeight:"90vh", borderRadius:8, border:"0.5px solid #2d6aad" }} onClick={e => e.stopPropagation()} alt="Screenshot" />
          <div style={{ position:"absolute", top:14, right:14, color:"#fff", fontSize:20, cursor:"pointer" }} onClick={() => setViewShot(null)}>✕</div>
        </div>
      )}
    </div>
  );
}
