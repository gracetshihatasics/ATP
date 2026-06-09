/**
 * RunsPanel — shows all API test runs, live or historical.
 * Reconnects to live runs automatically when mounted.
 * Survives page navigation and refresh.
 */
import { useState, useEffect, useRef } from "react";

const BACKEND = "http://localhost:3579";

const STATUS_C = {
  queued:    { c:"#4a7fa5", bg:"#0a0e12",  icon:"◌", label:"Queued"    },
  running:   { c:"#c8a0f0", bg:"#1a0a2e",  icon:"●", label:"Running"   },
  done:      { c:"#4caf50", bg:"#0a1a0a",  icon:"✓", label:"Done"      },
  failed:    { c:"#ff3b3b", bg:"#1a0808",  icon:"✗", label:"Failed"    },
  cancelled: { c:"#4a7fa5", bg:"#0a0e12",  icon:"⊘", label:"Cancelled" },
};

export function RunsPanel({ suiteId, onRunComplete }) {
  const [runs,        setRuns]        = useState([]);
  const [openRun,     setOpenRun]     = useState(null);
  const [liveLog,     setLiveLog]     = useState([]);
  const [liveSteps,   setLiveSteps]   = useState([]);
  const esRef  = useRef(null);
  const logRef = useRef(null);

  useEffect(() => { loadRuns(); const iv = setInterval(loadRuns, 5000); return () => clearInterval(iv); }, [suiteId]);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [liveLog.length]);

  const loadRuns = async () => {
    try {
      const url = suiteId ? `${BACKEND}/api/agent/runs?suiteId=${suiteId}` : `${BACKEND}/api/agent/runs`;
      const res  = await fetch(url);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch {}
  };

  const openAndStream = (run) => {
    setOpenRun(run);
    setLiveLog(run.log || []);
    setLiveSteps(run.steps || []);

    // Close any existing stream
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    // If run is still active, subscribe to live updates
    if (["queued","running"].includes(run.status)) {
      const es = new EventSource(`${BACKEND}/api/agent/runs/${run.id}/stream`);
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          if (evt.type === "snapshot") {
            setOpenRun(evt.run);
            setLiveLog(evt.run.log || []);
            setLiveSteps(evt.run.steps || []);
          }
          if (evt.type === "log")   setLiveLog(p => [...p, evt]);
          if (evt.type === "step")  setLiveSteps(p => [...p, evt.step]);
          if (evt.type === "done" || evt.type === "error") {
            setOpenRun(evt.run);
            es.close(); esRef.current = null;
            loadRuns();
            onRunComplete?.(evt.run);
          }
        } catch {}
      };
      es.onerror = () => { es.close(); esRef.current = null; };
    }
  };

  const cancel = async (runId, e) => {
    e.stopPropagation();
    await fetch(`${BACKEND}/api/agent/runs/${runId}/cancel`, { method:"POST" });
    loadRuns();
    if (openRun?.id === runId) setOpenRun(r => ({ ...r, status:"cancelled" }));
  };

  const deleteRun = async (runId, e) => {
    e.stopPropagation();
    if (openRun?.id === runId) { esRef.current?.close(); setOpenRun(null); }
    await fetch(`${BACKEND}/api/agent/runs/${runId}`, { method:"DELETE" });
    loadRuns();
  };

  useEffect(() => () => esRef.current?.close(), []);

  const displayLog   = openRun ? liveLog   : [];
  const displaySteps = openRun ? liveSteps : [];

  return (
    <div style={{ display:"flex", flex:1, overflow:"hidden", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* Run list */}
      <div style={{ width:260, flexShrink:0, borderRight:"0.5px solid #1e3a5f", overflowY:"auto", background:"#090d11" }}>
        <div style={{ padding:"8px 12px", borderBottom:"0.5px solid #1e3a5f", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:9, color:"#2d6aad", textTransform:"uppercase", letterSpacing:"0.1em" }}>Runs ({runs.length})</span>
          <button onClick={loadRuns} style={{ background:"none", border:"none", color:"#2d6aad", cursor:"pointer", fontSize:9, fontFamily:"inherit" }}>↻</button>
        </div>

        {runs.length === 0 && (
          <div style={{ fontSize:9, color:"#1e3a5f", textAlign:"center", padding:"24px 12px", lineHeight:2 }}>
            No runs yet.<br/>Run a scenario to see it here.
          </div>
        )}

        {runs.map(run => {
          const sc     = STATUS_C[run.status] || STATUS_C.failed;
          const isOpen = openRun?.id === run.id;
          const isLive = ["queued","running"].includes(run.status);
          return (
            <div key={run.id}
              onClick={() => openAndStream(run)}
              style={{ padding:"9px 12px", borderBottom:"0.5px solid #0d1a2a", cursor:"pointer", background:isOpen?"#0f1c2e":"transparent" }}
              onMouseEnter={e=>{ if(!isOpen) e.currentTarget.style.background="#0d1520"; }}
              onMouseLeave={e=>{ if(!isOpen) e.currentTarget.style.background="transparent"; }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
                <span style={{ fontSize:isLive?14:11, color:sc.c, animation:isLive?"pulse 1s infinite":undefined }}>
                  {sc.icon}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:10, color:"#b0c8e0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {run.scenarioName}
                  </div>
                  <div style={{ fontSize:8, color:sc.c }}>{sc.label}</div>
                </div>
                <div style={{ display:"flex", gap:4 }}>
                  {isLive && (
                    <button onClick={e => cancel(run.id, e)} title="Cancel"
                      style={{ background:"none", border:"0.5px solid #f0c04060", borderRadius:3, color:"#f0c040", cursor:"pointer", fontSize:8, padding:"2px 5px", fontFamily:"inherit" }}>
                      ■
                    </button>
                  )}
                  <button onClick={e => deleteRun(run.id, e)} title="Delete"
                    style={{ background:"none", border:"none", color:"#3a1a1a", cursor:"pointer", fontSize:11, padding:"0 2px", fontFamily:"inherit" }}
                    onMouseEnter={e=>e.currentTarget.style.color="#ff6b6b"}
                    onMouseLeave={e=>e.currentTarget.style.color="#3a1a1a"}>
                    ✕
                  </button>
                </div>
              </div>

              {/* Progress bar for running */}
              {isLive && run.total > 0 && (
                <div style={{ height:2, background:"#1e3a5f", borderRadius:1, overflow:"hidden", marginTop:3 }}>
                  <div style={{ height:"100%", background:sc.c, width:`${(run.steps?.length||0)/run.total*100}%`, transition:"width 0.3s" }} />
                </div>
              )}

              <div style={{ fontSize:8, color:"#2d6aad", marginTop:2 }}>
                {run.mode === "suite" ? "suite" : "single"} · {new Date(run.startedAt).toLocaleTimeString()}
                {run.duration ? ` · ${run.duration}ms` : ""}
                {run.passed !== undefined && run.total > 0 ? ` · ${run.passed}/${run.total}` : ""}
              </div>
            </div>
          );
        })}
      </div>

      {/* Run detail */}
      {openRun ? (
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Header */}
          <div style={{ padding:"10px 14px", borderBottom:"0.5px solid #1e3a5f", background:"#090d11", flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {(() => {
                const sc = STATUS_C[openRun.status] || STATUS_C.failed;
                return (
                  <div style={{ padding:"5px 12px", borderRadius:5, background:sc.bg, border:`0.5px solid ${sc.c}` }}>
                    <span style={{ fontSize:12, color:sc.c, fontWeight:700 }}>{sc.icon} {sc.label?.toUpperCase()}</span>
                  </div>
                );
              })()}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#b0d0f0" }}>{openRun.scenarioName}</div>
                <div style={{ fontSize:9, color:"#2d6aad" }}>
                  {openRun.specBaseUrl && <span>{openRun.specBaseUrl} · </span>}
                  {openRun.passed !== undefined && <span>{openRun.passed}/{openRun.total} steps passed · </span>}
                  {openRun.duration ? `${openRun.duration}ms` : "in progress..."}
                </div>
              </div>
              {["queued","running"].includes(openRun.status) && (
                <button onClick={e => cancel(openRun.id, e)}
                  style={{ background:"#1a0f00", border:"0.5px solid #f0c040", borderRadius:5, color:"#f0c040", cursor:"pointer", fontSize:10, padding:"6px 12px", fontFamily:"inherit" }}>
                  ■ Cancel
                </button>
              )}
              <button onClick={() => deleteRun(openRun.id, { stopPropagation:()=>{} })}
                style={{ background:"#1a0808", border:"0.5px solid #ff3b3b", borderRadius:5, color:"#ff6b6b", cursor:"pointer", fontSize:10, padding:"6px 12px", fontFamily:"inherit" }}>
                🗑 Delete
              </button>
            </div>
          </div>

          {/* Steps */}
          {displaySteps.length > 0 && (
            <div style={{ flexShrink:0, borderBottom:"0.5px solid #1e3a5f", background:"#0a0e12", maxHeight:160, overflowY:"auto" }}>
              {displaySteps.map((step, i) => {
                const sc = STATUS_C[step.status] || STATUS_C.failed;
                return (
                  <div key={i} style={{ display:"flex", gap:8, padding:"6px 14px", borderBottom:"0.5px solid #0d1a2a", alignItems:"center" }}>
                    <span style={{ color:sc.c, flexShrink:0, fontSize:11 }}>{sc.icon}</span>
                    <span style={{ fontSize:10, color:"#b0c8e0", flex:1 }}>{step.name}</span>
                    {step.statusCode && <span style={{ fontSize:9, color:"#4d9de0" }}>{step.statusCode}</span>}
                    {step.duration  && <span style={{ fontSize:9, color:"#2d6aad" }}>{step.duration}ms</span>}
                    {step.error     && <span style={{ fontSize:9, color:"#ff8c00", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis" }}>{step.error}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Live log */}
          <div ref={logRef} style={{ flex:1, overflowY:"auto", padding:"8px 14px", fontFamily:"'IBM Plex Mono',monospace" }}>
            {displayLog.map((entry, i) => {
              const l = typeof entry === "string" ? { msg:entry, level:"info" } : entry;
              return (
                <div key={i} style={{ fontSize:9, lineHeight:1.7, marginBottom:1,
                  color:l.level==="error"?"#ff6b6b":l.level==="success"?"#7ec87f":l.level==="ai"?"#c8a0f0":l.level==="warn"?"#f0c040":l.level==="system"?"#7ec8ff":"#6a8aa8" }}>
                  {l.msg}
                </div>
              );
            })}
            {["queued","running"].includes(openRun.status) && (
              <div style={{ fontSize:9, color:"#c8a0f0", animation:"blink 1s step-start infinite" }}>▌</div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#1e3a5f", fontSize:11, flexDirection:"column", gap:8 }}>
          <div style={{ fontSize:24 }}>▶</div>
          <div>Select a run to see details</div>
          <div style={{ fontSize:9, color:"#0d1a2a" }}>Runs continue in the background even when you navigate away</div>
        </div>
      )}
    </div>
  );
}
