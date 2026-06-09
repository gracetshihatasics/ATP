/**
 * RunExecutor — executes API test runs in the background.
 *
 * Runs are started async, persisted via runStore, and
 * can be subscribed to via SSE for live updates.
 * Navigation away from the page does NOT stop execution.
 */
import { runScenario }        from "./apiRunner.js";
import { scenarioStore }      from "./scenarioStore.js";
import { runStore }           from "./runStore.js";
import { resultsStore }       from "../results/store.js";

// Active SSE subscribers: runId → Set of res objects
const subscribers = new Map();

export function subscribe(runId, res) {
  if (!subscribers.has(runId)) subscribers.set(runId, new Set());
  subscribers.get(runId).add(res);
  // Send current run state immediately on connect
  const run = runStore.get(runId);
  if (run) {
    emit(runId, { type:"snapshot", run });
  }
  return () => {
    subscribers.get(runId)?.delete(res);
    if (subscribers.get(runId)?.size === 0) subscribers.delete(runId);
  };
}

function emit(runId, data) {
  const subs = subscribers.get(runId);
  if (!subs || subs.size === 0) return;
  const line = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) {
    try { res.write(line); } catch {}
  }
}

/**
 * Start executing a run in the background.
 * Returns immediately — execution continues even if caller navigates away.
 */
export async function startRun(runId, { scenario, spec, credentials }) {
  const ctrl = new AbortController();
  runStore.setAbortController(runId, ctrl);
  runStore.markRunning(runId);
  emit(runId, { type:"log", msg:`▶ Starting: ${scenario.name}`, level:"system" });

  // Execute in background — don't await
  executeInBackground(runId, scenario, spec, credentials, ctrl.signal);
}

async function executeInBackground(runId, scenario, spec, credentials, signal) {
  const startTime = Date.now();

  try {
    const result = await runScenario(scenario, spec?.baseUrl || "", credentials || {}, (evt) => {
      if (signal.aborted) return;

      if (evt.type === "step_start") {
        const msg = `▶ [${evt.stepIndex+1}/${evt.totalSteps}] ${evt.method} — ${evt.name}`;
        runStore.appendLog(runId, { msg, level:"system", ts: Date.now() });
        emit(runId, { type:"log", msg, level:"system" });
      }
      if (evt.type === "step_done") {
        const step = { name:evt.name, status:evt.status, statusCode:evt.statusCode,
          url:evt.url, duration:evt.duration, assertions:evt.assertions,
          requestBody:evt.requestBody, responseBody:evt.responseBody, captures:evt.captures };
        runStore.appendStep(runId, step);
        emit(runId, { type:"step", step });
        const icon = evt.status === "pass" ? "✓" : "✗";
        const msg  = `  ${icon} ${evt.name} — ${evt.statusCode} (${evt.duration}ms)`;
        runStore.appendLog(runId, { msg, level:evt.status==="pass"?"success":"error", ts:Date.now() });
        emit(runId, { type:"log", msg, level:evt.status==="pass"?"success":"error" });
      }
      if (evt.type === "step_error") {
        const step = { name:evt.name, status:"error", error:evt.error };
        runStore.appendStep(runId, step);
        emit(runId, { type:"step", step });
        const msg = `  ✗ ${evt.name}: ${evt.error}`;
        runStore.appendLog(runId, { msg, level:"error", ts:Date.now() });
        emit(runId, { type:"log", msg, level:"error" });
      }
      if (evt.type === "capture") {
        const msg = `  ↳ captured {{${evt.varName}}} = ${evt.value}`;
        runStore.appendLog(runId, { msg, level:"ai", ts:Date.now() });
        emit(runId, { type:"log", msg, level:"ai" });
      }
      if (evt.type === "capture_miss") {
        const msg = `  ⚠ ${evt.note}`;
        runStore.appendLog(runId, { msg, level:"warn", ts:Date.now() });
        emit(runId, { type:"log", msg, level:"warn" });
      }
      if (evt.type === "log") {
        runStore.appendLog(runId, { msg:evt.msg, level:evt.level||"info", ts:Date.now() });
        emit(runId, { type:"log", msg:evt.msg, level:evt.level||"info" });
      }
    });

    if (signal.aborted) return;

    const duration = Date.now() - startTime;

    // Persist final result
    runStore.markDone(runId, {
      passed:   result.passed,
      failed:   result.failed,
      total:    result.total,
      duration,
      captures: result.captureLog || [],
    });

    // Also save to results store for the Results tab
    resultsStore.save({
      type:"api", name:scenario.name, url:spec?.baseUrl||"",
      status:result.status, passed:result.passed, failed:result.failed,
      total:result.steps?.length||0, duration,
      steps:result.steps||[], assertions:[],
      startedAt:new Date(startTime).toISOString(), completedAt:new Date().toISOString(),
    });

    // Update suite if applicable
    if (scenario._suiteId) {
      scenarioStore.updateSuiteResults(scenario._suiteId, scenario.id, result);
    }

    const msg = `${result.status === "pass" ? "✓ PASS" : "✗ FAIL"} — ${result.passed}/${result.total} steps · ${duration}ms`;
    runStore.appendLog(runId, { msg, level:result.status==="pass"?"success":"error", ts:Date.now() });
    emit(runId, { type:"done", run: runStore.get(runId) });

  } catch (err) {
    if (signal.aborted) return;
    runStore.markFailed(runId, err.message);
    const msg = `✗ Run failed: ${err.message}`;
    runStore.appendLog(runId, { msg, level:"error", ts:Date.now() });
    emit(runId, { type:"error", msg, run: runStore.get(runId) });
  }
}

/**
 * Execute ALL scenarios in a suite sequentially in the background.
 */
export async function startSuiteRun(runId, { scenarios, spec, credentials, filter="all", suiteId }) {
  const ctrl = new AbortController();
  runStore.setAbortController(runId, ctrl);
  runStore.markRunning(runId);

  let toRun = scenarios || [];
  if (filter !== "all") toRun = toRun.filter(s =>
    s.priority?.toLowerCase() === filter || s.category?.toLowerCase().includes(filter)
  );

  runStore.update(runId, { total: toRun.length, mode:"suite" });
  emit(runId, { type:"log", msg:`▶ Suite run — ${toRun.length} scenario(s) [${filter}]`, level:"system" });

  executeSuiteInBackground(runId, toRun, spec, credentials, suiteId, ctrl.signal);
}

async function executeSuiteInBackground(runId, scenarios, spec, credentials, suiteId, signal) {
  const startTime = Date.now();
  let passed = 0, failed = 0;

  for (let i = 0; i < scenarios.length; i++) {
    if (signal.aborted) break;

    const sc  = { ...scenarios[i], _suiteId: suiteId };
    const msg = `\n▶ [${i+1}/${scenarios.length}] ${sc.name}`;
    runStore.appendLog(runId, { msg, level:"system", ts:Date.now() });
    emit(runId, { type:"log", msg, level:"system" });
    emit(runId, { type:"scenario_start", index:i, total:scenarios.length, name:sc.name });

    try {
      const result = await runScenario(sc, spec?.baseUrl||"", credentials||{}, (evt) => {
        if (signal.aborted) return;
        if (evt.type === "step_start") {
          const m = `  ▶ [${evt.stepIndex+1}/${evt.totalSteps}] ${evt.method} — ${evt.name}`;
          runStore.appendLog(runId, { msg:m, level:"system", ts:Date.now() });
          emit(runId, { type:"log", msg:m, level:"system" });
        }
        if (evt.type === "step_done") {
          const step = { scenarioIndex:i, name:evt.name, status:evt.status, statusCode:evt.statusCode, url:evt.url, duration:evt.duration };
          runStore.appendStep(runId, step);
          emit(runId, { type:"step", step });
          const m = `    ${evt.status==="pass"?"✓":"✗"} ${evt.name} (${evt.statusCode}, ${evt.duration}ms)`;
          runStore.appendLog(runId, { msg:m, level:evt.status==="pass"?"success":"error", ts:Date.now() });
          emit(runId, { type:"log", msg:m, level:evt.status==="pass"?"success":"error" });
        }
        if (evt.type === "capture") {
          const m = `    ↳ {{${evt.varName}}} = ${evt.value}`;
          runStore.appendLog(runId, { msg:m, level:"ai", ts:Date.now() });
          emit(runId, { type:"log", msg:m, level:"ai" });
        }
        if (evt.type === "log") {
          runStore.appendLog(runId, { msg:evt.msg, level:evt.level||"info", ts:Date.now() });
          emit(runId, { type:"log", msg:evt.msg, level:evt.level||"info" });
        }
      });

      if (result.status === "pass") passed++; else failed++;

      if (suiteId) scenarioStore.updateSuiteResults(suiteId, sc.id, result);

      const m = `  ${result.status==="pass"?"✓ PASS":"✗ FAIL"} — ${result.passed}/${result.total} steps`;
      runStore.appendLog(runId, { msg:m, level:result.status==="pass"?"success":"error", ts:Date.now() });
      emit(runId, { type:"scenario_done", index:i, status:result.status, passed:result.passed, failed:result.failed });

    } catch (err) {
      failed++;
      const m = `  ✗ Error: ${err.message}`;
      runStore.appendLog(runId, { msg:m, level:"error", ts:Date.now() });
      emit(runId, { type:"scenario_done", index:i, status:"error", error:err.message });
    }
  }

  if (!signal.aborted) {
    const duration = Date.now() - startTime;
    runStore.markDone(runId, { passed, failed, total:scenarios.length, duration, captures:[] });
    const m = `\n${failed===0?"✓ Suite PASS":"✗ Suite FAIL"} — ${passed}/${scenarios.length} passed · ${duration}ms`;
    runStore.appendLog(runId, { msg:m, level:failed===0?"success":"error", ts:Date.now() });
    emit(runId, { type:"done", run:runStore.get(runId) });

    resultsStore.save({
      type:"api-suite", name:`Suite Run (${scenarios.length} scenarios)`,
      url:spec?.baseUrl||"", status:failed===0?"pass":"fail",
      passed, failed, total:scenarios.length,
      steps:[], assertions:[],
      startedAt:new Date(startTime).toISOString(), completedAt:new Date().toISOString(),
    });
  }
}

// On server startup, mark any interrupted runs as failed
export function recoverInterruptedRuns() {
  const interrupted = runStore.getInterrupted();
  for (const run of interrupted) {
    runStore.markFailed(run.id, "Server restarted while run was in progress");
  }
  if (interrupted.length > 0) {
    console.log(`[RunExecutor] Marked ${interrupted.length} interrupted run(s) as failed`);
  }
}
