import { useState, useRef, useCallback } from "react";
import { importSpec, buildScenarios, runScenario, runAllScenarios } from "../services/apiAgent.js";
import { sleep } from "../utils/helpers.js";

export function useApiAgent() {
  const [phase, setPhase]               = useState("idle"); // idle|importing|building|ready|running
  const [log, setLog]                   = useState([]);
  const [spec, setSpec]                 = useState(null);
  const [scenarios, setScenarios]       = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [runResults, setRunResults]     = useState({}); // scenarioId → result
  const [activeStep, setActiveStep]     = useState(null);
  const [captures, setCaptures]         = useState({});
  const [suiteResult, setSuiteResult]   = useState(null);
  const logRef = useRef(null);

  const addLog = useCallback((msg, type = "info") => {
    setLog(prev => [...prev, { msg, type }]);
    setTimeout(() => logRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 50);
  }, []);

  // ── Import spec ─────────────────────────────────────────────────────────────
  const doImport = async ({ swaggerUrl, postmanJson, baseUrl }) => {
    setPhase("importing"); setLog([]); setSpec(null);
    setScenarios([]); setRunResults({}); setSuiteResult(null);
    try {
      addLog("Fetching API specification...", "system"); await sleep(300);
      const data = await importSpec({ swaggerUrl, postmanJson, baseUrl });
      addLog(`Imported: ${data.title} (${data.source})`, "success");
      addLog(`Found ${data.endpointCount} endpoints`, "success");
      setSpec(data);
      setPhase("imported");
    } catch (err) {
      addLog(`Import failed: ${err.message}`, "error");
      setPhase("idle");
    }
  };

  // ── Build scenarios ─────────────────────────────────────────────────────────
  const doBuild = async (credentials) => {
    if (!spec) return;
    setPhase("building");
    try {
      addLog("AI analysing API structure...", "ai"); await sleep(400);
      addLog("Building business transaction scenarios...", "ai");
      const data = await buildScenarios({ specId: spec.specId, credentials });
      addLog(`Generated ${data.scenarios.length} scenarios`, "success");
      setScenarios(data.scenarios);
      setPhase("ready");
    } catch (err) {
      addLog(`Build failed: ${err.message}`, "error");
      setPhase("imported");
    }
  };

  // ── Run one scenario ────────────────────────────────────────────────────────
  const doRunScenario = async (scenario, baseUrl, credentials) => {
    setPhase("running"); setActiveStep(null); setCaptures({});
    setRunResults(prev => ({ ...prev, [scenario.id]: { status: "running", steps: [] } }));
    addLog(`Running: ${scenario.name}`, "system");

    await runScenario(
      { specId: spec.specId, scenarioId: scenario.id, baseUrl: baseUrl || spec.baseUrl, credentials },
      (event) => {
        switch (event.type) {
          case "step_start":
            setActiveStep(event.stepId);
            addLog(`→ ${event.method} ${event.path}`, "action");
            break;
          case "capture":
            setCaptures(prev => ({ ...prev, [event.varName]: event.value }));
            addLog(`  captured {{${event.varName}}} = ${event.value}`, "ai");
            break;
          case "step_done":
            const passed = event.assertions.filter(a => a.passed).length;
            const failed = event.assertions.filter(a => !a.passed).length;
            addLog(`  ${event.status === "pass" ? "✓" : "✗"} ${passed} passed, ${failed} failed`, event.status === "pass" ? "success" : "error");
            break;
          case "step_error":
            addLog(`  ✗ ${event.error}`, "error");
            break;
          case "scenario_done":
            setRunResults(prev => ({ ...prev, [scenario.id]: event }));
            addLog(`Scenario ${event.status === "pass" ? "passed ✓" : "failed ✗"} — ${event.passed}/${event.total} steps passed`, event.status === "pass" ? "success" : "warn");
            break;
          case "complete":
            setRunResults(prev => ({ ...prev, [scenario.id]: event.result }));
            break;
          case "error":
            addLog(`Error: ${event.error}`, "error");
            break;
        }
      }
    );

    setPhase("ready"); setActiveStep(null);
  };

  // ── Run all scenarios ───────────────────────────────────────────────────────
  const doRunAll = async (baseUrl, credentials) => {
    setPhase("running"); setRunResults({}); setSuiteResult(null);
    addLog("Running all scenarios...", "system");

    await runAllScenarios(
      { specId: spec.specId, baseUrl: baseUrl || spec.baseUrl, credentials },
      (event) => {
        switch (event.type) {
          case "scenario_start": addLog(`▶ ${event.name}`, "system"); break;
          case "step_start":     addLog(`  → ${event.method} ${event.path}`, "action"); break;
          case "capture":        addLog(`  captured {{${event.varName}}}`, "ai"); break;
          case "scenario_done":
            setRunResults(prev => ({ ...prev, [event.scenarioId]: event }));
            addLog(`  ${event.status === "pass" ? "✓" : "✗"} ${event.name}`, event.status === "pass" ? "success" : "warn");
            break;
          case "suite_complete":
            setSuiteResult(event);
            addLog(`Suite complete — ${event.passed} passed, ${event.failed} failed`, event.failed === 0 ? "success" : "warn");
            break;
          case "error": addLog(`Error: ${event.error}`, "error"); break;
        }
      }
    );

    setPhase("ready");
  };

  return {
    phase, log, logRef, spec, scenarios,
    selectedScenario, setSelectedScenario,
    runResults, activeStep, captures, suiteResult,
    doImport, doBuild, doRunScenario, doRunAll,
  };
}
