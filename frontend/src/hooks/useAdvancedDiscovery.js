import { useState, useRef, useCallback } from "react";

const BACKEND = "http://localhost:3579";

export function useAdvancedDiscovery() {
  const [phase, setPhase]             = useState("idle"); // idle|running|done|error
  const [phases, setPhases]           = useState([
    { id:1, label:"Surface scan",      status:"pending", summary:"" },
    { id:2, label:"Authentication",    status:"pending", summary:"" },
    { id:3, label:"Feature mapping",   status:"pending", summary:"" },
    { id:4, label:"Generating cases",  status:"pending", summary:"" },
  ]);
  const [log, setLog]                 = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [featuresDone, setFeaturesDone] = useState([]);
  const [plan, setPlan]               = useState(null);
  const [duration, setDuration]       = useState(null);
  const [authInfo, setAuthInfo]       = useState(null);
  const logRef = useRef(null);

  const addLog = useCallback((msg, level = "info") => {
    setLog(prev => [...prev, { msg, level }]);
    setTimeout(() => logRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
  }, []);

  const resetPhases = () => setPhases([
    { id:1, label:"Surface scan",      status:"pending", summary:"" },
    { id:2, label:"Authentication",    status:"pending", summary:"" },
    { id:3, label:"Feature mapping",   status:"pending", summary:"" },
    { id:4, label:"Generating cases",  status:"pending", summary:"" },
  ]);

  const handleEvent = useCallback((event) => {
    switch (event.type) {
      case "phase_update":
        setPhases(prev => prev.map(p => p.id === event.phase
          ? { ...p, status: event.status, summary: event.summary ?? p.summary }
          : p
        ));
        if (event.status === "running") addLog(`Phase ${event.phase}: ${event.label}...`, "system");
        if (event.status === "done")    addLog(`✓ ${event.label}: ${event.summary}`, "success");
        break;

      case "phase":
        addLog(event.msg, "system"); break;

      case "log":
        addLog(event.msg, event.level ?? "info"); break;

      case "screenshot":
        if (event.data) setScreenshots(prev => [...prev, { data: event.data, label: event.label }]);
        break;

      case "page_scanned":
        addLog(`  ✓ Scanned: ${event.link?.text ?? event.title}`, "info");
        if (event.screenshot) setScreenshots(prev => [...prev, { data: event.screenshot, label: event.title ?? event.link?.text }]);
        break;

      case "feature_start":
        addLog(`  ◉ Mapping: ${event.feature}`, "ai"); break;

      case "feature_done":
        setFeaturesDone(prev => [...prev, { name: event.feature, flows: event.flows }]);
        addLog(`  ✓ ${event.feature}: ${event.flows} flows`, "success");
        break;

      case "discovery_complete":
      case "done":
        setPlan(event.plan);
        setDuration(event.duration);
        setAuthInfo(event.plan?.authStrategy ? { strategy: event.plan.authStrategy, user: event.plan.autoRegisteredUser } : null);
        addLog(`Discovery complete in ${event.duration}s — ${event.plan?.useCases?.length ?? 0} use cases`, "success");
        setPhase("done");
        break;

      case "error":
        addLog(`Error: ${event.msg}`, "error");
        setPhase("error");
        break;
    }
  }, [addLog]);

  const run = async (url, credentialId) => {
    setPhase("running");
    setLog([]); setScreenshots([]); setFeaturesDone([]); setPlan(null); setDuration(null);
    resetPhases();

    const res = await fetch(`${BACKEND}/api/discover/advanced`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url, credentialId }),
    });

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try { handleEvent(JSON.parse(line.slice(6))); } catch {}
        }
      }
    }
  };

  return {
    phase, phases, log, logRef, screenshots,
    featuresDone, plan, duration, authInfo,
    run,
  };
}
