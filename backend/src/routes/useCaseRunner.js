import { launchBrowser }      from "../browser/launcher.js";
import { executeAction }      from "../browser/executor.js";
import { runAssertions }      from "../browser/assertions.js";
import { captureScreenshot }  from "../browser/screenshot.js";
import { sessionManager }     from "../ws/sessionManager.js";
import { send }               from "../ws/send.js";
import { resultsStore }       from "../results/store.js";
import { waitUntilReady }     from "../browser/smartObserver.js";
import { analysePage }        from "../browser/pageIntelligence.js";
import { retryWithConfirmation, recheckFailedStep } from "../browser/retryEngine.js";
import { runPreRunEval }      from "../eval/preRunEval.js";
import { appKnowledge }       from "../knowledge/appKnowledge.js";
import { config }             from "../config/index.js";

export async function runUseCase(ws, sessionId, { useCase, url, credentials, suiteId = null }) {
  send(ws, { type: "run_start", ucId: useCase.id, title: useCase.title });
  const startTime   = Date.now();
  const stepResults = [];
  const insights    = [];
  let browser;
  let evalSummary   = null;

  const log = (msg, level = "info") => send(ws, { type: "log", level, msg });
  const onEvent = (event) => {
    if (["page_analysis","form_analysis","adaptive_step_start","adaptive_step_done",
         "eval_start","eval_progress","eval_result","eval_fixed","eval_blocked"].includes(event.type)) {
      send(ws, event);
    }
  };

  try {
    log("Launching browser...", "system");
    const { browser: b, page } = await launchBrowser(
      (msg) => log(`🚫 ${msg}`)
    );
    browser = b;

    page.on("pageerror", err => log(`Page JS error: ${err.message}`, "warn"));
    sessionManager.set(sessionId, { browser, page, ws, running: true });

    // Navigate
    log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitUntilReady(page, { maxWait: 10000, pollMs: 400, onLog: log, useVision: true, actionDesc: "initial page load" });
    send(ws, { type: "screenshot", data: await captureScreenshot(page), step: "Initial page load" });

    // Page Intelligence
    log("◈ Page Intelligence — analysing page structure...", "ai");
    const pageAnalysis = await analysePage(page, { goal: useCase.title, url }).catch(() => null);
    if (pageAnalysis) {
      send(ws, { type: "page_analysis", analysis: pageAnalysis });
      log(`◈ Page: ${pageAnalysis.pageType} — ${pageAnalysis.summary}`, "ai");
      if (pageAnalysis.testingInsights) log(`◈ Insight: ${pageAnalysis.testingInsights}`, "ai");
      if (pageAnalysis.potentialIssues?.length) {
        pageAnalysis.potentialIssues.forEach(i => log(`⚠ ${i}`, "warn"));
      }
      if (pageAnalysis.testingInsights) insights.push(pageAnalysis.testingInsights);

      // Update knowledge base with page info
      try {
        const urlPath = new URL(url).pathname;
        appKnowledge.updatePage(url, urlPath, {
          title:       pageAnalysis.title,
          pageType:    pageAnalysis.pageType,
          forms:       pageAnalysis.forms ?? [],
          keyElements: pageAnalysis.keyElements ?? [],
          lastVisited: new Date().toISOString(),
        });
      } catch {}
    }

    // ── Pre-run eval gate ────────────────────────────────────────────────────
    log("◈ Pre-run eval — checking selector confidence...", "ai");
    const knowledgeBase = appKnowledge.getKnowledge(url);
    evalSummary = await runPreRunEval(page, useCase, url, credentials, pageAnalysis, knowledgeBase, onEvent);
    const actions = evalSummary.actions;
    send(ws, { type: "actions_ready", count: actions.length });
    log(`${actions.length} actions ready (${evalSummary.fixedCount} auto-fixed, ${evalSummary.blockedCount} blocked)`, "ai");

    // Execute each action with retry + deferred confirmation
    for (let i = 0; i < actions.length; i++) {
      if (!sessionManager.isRunning(sessionId)) {
        log("Run stopped by user.", "warn");
        break;
      }

      const action = actions[i];

      // Skip blocked actions that couldn't be auto-fixed
      if (action.blocked) {
        const stepRecord = {
          index:       i,
          description: action.description,
          status:      "blocked",
          error:       action.fixReason || "selector could not be resolved",
          attempts:    0,
          uncertain:   false,
          observation: action.fixReason || "selector unresolvable",
          evalScore:   action.evalScore,
          blocked:     true,
        };
        stepResults.push(stepRecord);
        send(ws, {
          type:        "step_done",
          index:       i,
          status:      "blocked",
          description: action.description,
          error:       stepRecord.error,
          attempts:    0,
          uncertain:   false,
          observation: stepRecord.observation,
          evalScore:   action.evalScore,
          blocked:     true,
        });
        log(`⛔ Step ${i + 1} blocked — ${stepRecord.error}`, "warn");
        continue;
      }

      send(ws, {
        type:        "step_start",
        index:       i,
        total:       actions.length,
        description: action.description,
        evalScore:   action.evalScore,
        fixed:       action.fixed ?? false,
      });
      if (action.reasoning) log(`  ◈ ${action.reasoning}`, "ai");

      const result = await retryWithConfirmation(
        page,
        action,
        async () => executeAction(page, action, ws),
        {
          maxAttempts:    3,
          backoffMs:      [1500, 3000, 5000],
          confirmAfterMs: 1500,
          onLog:          log,
        }
      );

      if (result.uncertain) {
        log(`◈ Step outcome uncertain — action ran but could not confirm. Marked as passed.`, "warn");
      }

      // Record selector outcome in knowledge base
      if (action.selector) {
        try { appKnowledge.recordSelectorResult(url, action.selector, result.success); } catch {}
      }

      const stepRecord = {
        index:       i,
        description: action.description,
        status:      result.success ? "pass" : "fail",
        error:       result.success ? undefined : result.observation,
        attempts:    result.attempts,
        uncertain:   result.uncertain || false,
        observation: result.observation,
        evalScore:   action.evalScore,
        fixed:       action.fixed ?? false,
      };

      stepResults.push(stepRecord);
      send(ws, {
        type:        "step_done",
        index:       i,
        status:      result.success ? "pass" : "fail",
        screenshot:  result.screenshot,
        description: action.description,
        error:       result.success ? undefined : result.observation,
        attempts:    result.attempts,
        uncertain:   result.uncertain,
        observation: result.observation,
        evalScore:   action.evalScore,
        fixed:       action.fixed ?? false,
      });

      if (!result.success) {
        log(`Step ${i + 1} failed after ${result.attempts} attempt(s): ${result.observation}`, "warn");

        // Adaptive recovery
        log("◈ Attempting adaptive recovery...", "ai");
        try {
          const recovery = await adaptiveRecover(page, action, result.observation, credentials, log);
          if (recovery.length) {
            log(`◈ Recovery: trying ${recovery.length} alternative action(s)`, "ai");
            for (const ra of recovery.slice(0, 3)) {
              const recovResult = await retryWithConfirmation(page, ra,
                async () => executeAction(page, ra, ws),
                { maxAttempts: 2, backoffMs: [1000, 2000], confirmAfterMs: 1000, onLog: log }
              );
              if (recovResult.success) {
                log(`◈ Recovery succeeded: ${recovResult.observation}`, "success");
                stepResults[stepResults.length - 1].status = "recovered";
                stepResults[stepResults.length - 1].recoveryAction = ra.description;
                send(ws, { type: "step_recovered", index: i, description: action.description, recoveryAction: ra.description });
                break;
              }
            }
          }
        } catch {}
      }
    }

    // ── Deferred recheck ──────────────────────────────────────────────────────
    const failedSteps = stepResults.filter(s => s.status === "fail");
    if (failedSteps.length > 0) {
      log(`◈ Deferred recheck: reviewing ${failedSteps.length} failed step(s) on final page state...`, "ai");
      for (const fs of failedSteps) {
        const recheck = await recheckFailedStep(page, fs.description, log).catch(() => null);
        if (recheck?.actuallySucceeded && recheck.confidence !== "low") {
          log(`◈ Recheck: "${fs.description}" actually succeeded — ${recheck.evidence}`, "success");
          fs.status          = "pass-deferred";
          fs.recheckEvidence = recheck.evidence;
          send(ws, { type: "step_recheck", description: fs.description, actuallySucceeded: true, evidence: recheck.evidence });
        }
      }
    }

    // Run assertions
    log("Running assertions...", "ai");
    const assertResults = await runAssertions(page, useCase.assertions ?? []);
    for (const result of assertResults) send(ws, { type: "assertion", ...result });

    send(ws, { type: "screenshot", data: await captureScreenshot(page), step: "Final state" });
    const passed   = assertResults.filter(a => a.passed).length;
    const failed   = assertResults.filter(a => !a.passed).length;
    const status   = failed === 0 ? "pass" : "fail";
    const duration = Date.now() - startTime;

    const saved = resultsStore.save({
      type:        "usecase",
      name:        useCase.title,
      url,
      status,
      passed,
      failed,
      total:       assertResults.length,
      duration,
      steps:       stepResults,
      assertions:  assertResults,
      insights,
      pageType:    pageAnalysis?.pageType,
      suiteId,
      category:    useCase.category,
      priority:    useCase.priority,
      evalScore:   evalSummary?.overallScore,
      startedAt:   new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
    });

    // Update knowledge base with run outcome
    try {
      appKnowledge.recordRun(url, status === "pass", evalSummary?.overallScore ?? 0);
      if (status === "pass" && (evalSummary?.overallScore ?? 0) >= config.eval.prodReadyThreshold) {
        appKnowledge.addLearnedPattern(url, {
          type:      "successful-run",
          useCase:   useCase.title,
          avgScore:  evalSummary.overallScore,
        });
      }
    } catch {}

    send(ws, { type: "run_complete", ucId: useCase.id, passed, failed, total: assertResults.length, runId: saved.id, status });
    return saved;

  } catch (err) {
    log(`Fatal: ${err.message}`, "error");
    send(ws, { type: "run_error", ucId: useCase.id, error: err.message });
    const saved = resultsStore.save({
      type: "usecase", name: useCase.title, url,
      status: "error", passed: 0, failed: 1, total: 1,
      duration: Date.now() - startTime, steps: stepResults, assertions: [],
      suiteId, error: err.message,
      startedAt: new Date(startTime).toISOString(), completedAt: new Date().toISOString(),
    });
    return saved;
  } finally {
    await browser?.close().catch(() => {});
    sessionManager.destroy(sessionId);
  }
}

// ── Adaptive recovery — re-analyse page after failure ────────────────────────
async function adaptiveRecover(page, failedAction, errorMessage, credentials, log) {
  const { generateAdaptiveActions } = await import("../browser/pageIntelligence.js");
  return generateAdaptiveActions(
    page,
    `Recover from failed action: "${failedAction.description}". Error: "${errorMessage}". Find an alternative way.`,
    [failedAction.description],
    { credentials }
  ).catch(() => []);
}
