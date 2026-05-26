import crypto from "crypto";
import { config }              from "../config/index.js";
import { launchBrowser }       from "../browser/launcher.js";
import { executeAction }       from "../browser/executor.js";
import { runAssertions }       from "../browser/assertions.js";
import { captureScreenshot }   from "../browser/screenshot.js";
import { generateActions }     from "../ai/actionGenerator.js";
import { analysePage }         from "../browser/pageIntelligence.js";
import { waitUntilReady }      from "../browser/smartObserver.js";
import { retryWithConfirmation } from "../browser/retryEngine.js";
import { handlePopups }        from "../browser/popupHandler.js";
import { resultsStore }        from "../results/store.js";
import { analyseFailure }      from "../results/failureAnalyser.js";
import { vaultStore }          from "../vault/store.js";
import { buildContext }        from "../integrations/contextBuilder.js";
import { scanPageCodeIntelligence } from "../browser/codeIntelligence.js";

// Simple fake WS for MCP context (no WebSocket needed — logs go to return value)
function makeFakeWS(logs) {
  return { send: (data) => {
    try {
      const msg = typeof data === "string" ? JSON.parse(data) : data;
      if (msg.type === "log") logs.push({ level: msg.level, msg: msg.msg });
    } catch {}
  }};
}

// ── discover_usecases ─────────────────────────────────────────────────────────
export async function discoverUsecases({ url, credentialId, advanced = false }) {
  const BACKEND = `http://localhost:${config.port}`;

  if (advanced) {
    // Use the full advanced discovery via HTTP
    const res = await fetch(`${BACKEND}/api/discover/advanced`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, credentialId }),
    });
    // SSE stream — collect all events
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buf = "", plan = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      for (const line of buf.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "done" || evt.type === "discovery_complete") plan = evt.plan;
          } catch {}
        }
      }
      buf = buf.split("\n").pop();
    }
    return plan || { error: "Advanced discovery returned no plan" };
  }

  // Quick discovery via HTTP
  const res  = await fetch(`${BACKEND}/api/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, credentialId }),
  });
  return res.json();
}

// ── run_usecase ───────────────────────────────────────────────────────────────
export async function runUsecase({ url, useCase, credentialId }) {
  const runId   = `mcp-${crypto.randomUUID().slice(0, 8)}`;
  const logs    = [];
  const log     = (msg, level = "info") => logs.push({ level, msg });
  const fakeWS  = makeFakeWS(logs);
  const stepResults   = [];
  const startTime     = Date.now();
  let browser;

  try {
    log("Launching browser...", "system");
    const { browser: b, page } = await launchBrowser(
      (msg) => log(msg, "info")
    );
    browser = b;

    // Resolve credentials
    let credentials = {};
    if (credentialId) {
      credentials = vaultStore.resolveContext(credentialId);
      log(`Credentials resolved from vault`, "info");
    }

    log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitUntilReady(page, { maxWait: 10000, pollMs: 400, onLog: log });
    await handlePopups(page, (m) => log(m));

    // Page intelligence
    const pageAnalysis = await analysePage(page, { goal: useCase.title, url }).catch(() => null);
    if (pageAnalysis) log(`Page: ${pageAnalysis.pageType} — ${pageAnalysis.summary}`, "ai");

    // Generate actions
    const actions = await generateActions(useCase, url, credentials, pageAnalysis);
    log(`${actions.length} actions generated`, "ai");

    // Execute with retry
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      log(`Step ${i+1}: ${action.description}`, "action");

      const result = await retryWithConfirmation(
        page, action,
        async () => executeAction(page, action, fakeWS),
        { maxAttempts: 3, backoffMs: [1500, 3000, 5000], confirmAfterMs: 1500, onLog: log }
      );

      stepResults.push({
        index:       i,
        description: action.description,
        status:      result.success ? "pass" : "fail",
        error:       result.success ? undefined : result.observation,
        attempts:    result.attempts,
        uncertain:   result.uncertain,
      });

      log(result.success ? `✓ ${action.description}` : `✗ ${result.observation}`, result.success ? "success" : "error");
    }

    // Assertions
    const assertResults = await runAssertions(page, useCase.assertions ?? []);
    const passed   = assertResults.filter(a => a.passed).length;
    const failed   = assertResults.filter(a => !a.passed).length;
    const status   = failed === 0 && stepResults.every(s => s.status !== "fail") ? "pass" : "fail";
    const duration = Date.now() - startTime;

    const saved = resultsStore.save({
      type: "usecase", name: useCase.title, url, status,
      passed, failed, total: assertResults.length,
      duration, steps: stepResults, assertions: assertResults,
      startedAt: new Date(startTime).toISOString(), completedAt: new Date().toISOString(),
    });

    log(`Run complete — ${passed} passed, ${failed} failed (${(duration/1000).toFixed(1)}s)`, status === "pass" ? "success" : "warn");

    return { runId: saved.id, status, passed, failed, total: assertResults.length, duration, steps: stepResults, assertions: assertResults, log: logs };

  } finally {
    await browser?.close().catch(() => {});
  }
}

// ── run_suite ─────────────────────────────────────────────────────────────────
export async function runSuite({ url, useCases, credentialId, suiteFilter }) {
  // Apply filter if specified
  let cases = useCases;
  if (suiteFilter) {
    const f = suiteFilter.toLowerCase();
    cases = useCases.filter(uc =>
      uc.priority?.toLowerCase() === f ||
      uc.category?.toLowerCase().includes(f) ||
      uc.title?.toLowerCase().includes(f)
    );
    if (!cases.length) cases = useCases; // fallback — run all if filter matches nothing
  }

  const results   = [];
  const startTime = Date.now();

  for (const useCase of cases) {
    const result = await runUsecase({ url, useCase, credentialId });
    results.push(result);
    await new Promise(r => setTimeout(r, 1000));
  }

  const passed   = results.filter(r => r.status === "pass").length;
  const failed   = results.filter(r => r.status !== "pass").length;
  const duration = Date.now() - startTime;

  resultsStore.save({
    type: "suite", name: `Suite (${cases.length} tests)`, url,
    status: failed === 0 ? "pass" : "fail",
    passed, failed, total: results.length, duration,
    steps: results.map(r => ({ description: r.name || "test", status: r.status })),
    assertions: [],
    startedAt: new Date(startTime).toISOString(), completedAt: new Date().toISOString(),
  });

  return {
    total: results.length, passed, failed,
    passRate: Math.round(passed / results.length * 100),
    duration: `${(duration/1000).toFixed(1)}s`,
    results: results.map(r => ({
      title:  r.name || "test",
      status: r.status,
      passed: r.passed,
      failed: r.failed,
      runId:  r.runId,
    })),
  };
}

// ── get_results ───────────────────────────────────────────────────────────────
export async function getResults({ runId, limit = 10, status, url } = {}) {
  if (runId) {
    const run = resultsStore.getById(runId);
    return run || { error: `Run ${runId} not found` };
  }
  const { records, total } = resultsStore.getAll({ limit, status, url });
  const summary            = resultsStore.getSummary();
  return {
    summary: {
      total:    summary.total,
      passed:   summary.passed,
      failed:   summary.failed,
      passRate: `${summary.passRate}%`,
      flaky:    summary.flaky?.length || 0,
    },
    recent: records.map(r => ({
      id:       r.id,
      name:     r.name,
      url:      r.url,
      status:   r.status,
      passed:   r.passed,
      failed:   r.failed,
      duration: r.duration ? `${(r.duration/1000).toFixed(1)}s` : "—",
      date:     r.startedAt?.slice(0, 16).replace("T", " "),
    })),
    totalRuns: total,
  };
}

// ── analyse_failure ───────────────────────────────────────────────────────────
export async function analyseFailureHandler({ runId }) {
  const run = resultsStore.getById(runId);
  if (!run) return { error: `Run ${runId} not found` };
  if (run.status === "pass") return { message: "Test passed — no failure to analyse" };
  return analyseFailure(run);
}

// ── list_credentials ──────────────────────────────────────────────────────────
export async function listCredentials() {
  const creds = vaultStore.list();
  return {
    credentials: creds.map(c => ({
      id:          c.id,
      name:        c.name,
      type:        c.kind === "set" ? `set (${c.users?.length || 0} users)` : c.type,
      environment: c.environment,
      url:         c.url,
    })),
    total: creds.length,
    tip:   "Use the 'id' field as credentialId in discover_usecases or run_usecase",
  };
}

// ── get_context ───────────────────────────────────────────────────────────────
export async function getContext({ url, goal }) {
  const ctx = await buildContext(url, goal || "");
  if (ctx.isEmpty) {
    return { message: "No integrations connected. Add integrations in the ATP UI under 🔗 Integrations.", context: "" };
  }
  return {
    sources:  ctx.sections.map(s => ({ type: s.type, name: s.name })),
    context:  ctx.text.slice(0, 5000),
    isEmpty:  false,
    errors:   ctx.errors,
  };
}

// ── update_tests_from_diff ────────────────────────────────────────────────────
export async function updateTestsFromDiff({ url, diff, affectedFiles = [] }) {
  const BACKEND = `http://localhost:${config.port}`;
  const prEvent = {
    kind: "manual", prNumber: 0, prTitle: "Manual diff update",
    branchFrom: "feature", branchTo: "main",
    sha: "HEAD", baseSha: "HEAD~1", author: "mcp",
    repoFullName: "manual/update", repoOwner: "manual", repoName: "update",
    filesUrl: "", htmlUrl: "",
  };

  const { analyseDiff } = await import("../git/diffAnalyser.js");
  const changedFiles = affectedFiles.map(f => ({ filename: f, status: "modified", additions: 0, deletions: 0, patch: diff.slice(0, 1000) }));
  const existingTests = resultsStore.getAll({ limit: 50 }).records
    .filter(r => r.type === "usecase")
    .map(r => ({ id: r.id, title: r.name }));

  const analysis = await analyseDiff(prEvent, changedFiles, existingTests);
  return {
    riskLevel:        analysis.riskLevel,
    summary:          analysis.summary,
    affectedFeatures: analysis.affectedFeatures,
    affectedTestIds:  analysis.affectedTestIds,
    newTestsNeeded:   analysis.newTestsNeeded,
    concerns:         analysis.concerns,
    tip:              "Run the affected tests with run_usecase or run_suite",
  };
}

// ── scan_code_intelligence ────────────────────────────────────────────────────
export async function scanCodeIntelligence({ url }) {
  let browser;
  try {
    const { browser: b, page } = await launchBrowser();
    browser = b;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitUntilReady(page, { maxWait: 5000, pollMs: 400, onLog: () => {} });
    const result = await scanPageCodeIntelligence(page, url);
    return {
      url,
      overallHealth:    result.overallHealth,
      summary:          result.summary,
      codeQualityScore: result.codeQualityScore,
      findings:         (result.findings || []).map(f => ({
        type:                f.type,
        severity:            f.severity,
        element:             f.element,
        reason:              f.reason,
        testDecision:        f.testDecision,
        codeRecommendation:  f.codeRecommendation,
      })),
      totalFindings: result.findings?.length || 0,
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
