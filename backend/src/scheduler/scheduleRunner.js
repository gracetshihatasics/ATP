import { scheduleStore, calcNextRun, isDue, sendSlackNotification, buildSlackMessage } from "./scheduleStore.js";
import { launchBrowser }    from "../browser/launcher.js";
import { executeAction }    from "../browser/executor.js";
import { runAssertions }    from "../browser/assertions.js";
import { generateActions }  from "../ai/actionGenerator.js";
import { analysePage }      from "../browser/pageIntelligence.js";
import { waitUntilReady }   from "../browser/smartObserver.js";
import { handlePopups }     from "../browser/popupHandler.js";
import { retryWithConfirmation } from "../browser/retryEngine.js";
import { resultsStore }     from "../results/store.js";
import { vaultStore }       from "../vault/store.js";
import { getContextSummary } from "../integrations/contextBuilder.js";

let timerRef = null;
let running  = false;

/**
 * Start the scheduler — checks every minute for due runs.
 */
export function startScheduler() {
  if (timerRef) return;
  console.log("[Scheduler] Started — checking every 60s");
  timerRef = setInterval(tick, 60_000);
  tick(); // run once immediately on startup
}

export function stopScheduler() {
  if (timerRef) { clearInterval(timerRef); timerRef = null; }
}

async function tick() {
  if (running) return;
  const schedules = scheduleStore.list().filter(isDue);
  if (!schedules.length) return;

  running = true;
  for (const schedule of schedules) {
    console.log(`[Scheduler] Running: ${schedule.name}`);
    await executeSchedule(schedule).catch(err =>
      console.error(`[Scheduler] Error running ${schedule.name}:`, err.message)
    );
  }
  running = false;
}

async function executeSchedule(schedule) {
  const startTime = Date.now();
  const runId     = `sched-${Date.now()}`;

  // Mark as running — update lastRun immediately
  scheduleStore.update(schedule.id, {
    lastRun:    new Date().toISOString(),
    nextRun:    calcNextRun({ ...schedule, lastRun: new Date().toISOString() }),
    lastStatus: "running",
  });

  // Get test plan for this URL
  // First try to find recent use cases from results store
  const recentRuns = resultsStore.getAll({ limit: 200, url: schedule.url }).records
    .filter(r => r.type === "usecase" && r.steps?.length > 0);

  // Apply suite filter
  let useCases = recentRuns.map(r => ({
    id:         r.id,
    title:      r.name,
    steps:      r.steps?.map(s => s.description).filter(Boolean) ?? [],
    assertions: r.assertions?.map(a => a.assertion).filter(Boolean) ?? [],
    priority:   r.priority || "Medium",
    category:   r.category || "General",
  }));

  if (schedule.suiteFilter && schedule.suiteFilter !== "all") {
    const f = schedule.suiteFilter.toLowerCase();
    useCases = useCases.filter(uc =>
      uc.priority?.toLowerCase() === f ||
      uc.category?.toLowerCase().includes(f)
    );
  }

  // Cap at maxTests
  useCases = useCases.slice(0, schedule.maxTests || 20);

  if (!useCases.length) {
    console.log(`[Scheduler] No use cases found for ${schedule.url} — skipping`);
    scheduleStore.update(schedule.id, { lastStatus: "skipped" });
    return;
  }

  console.log(`[Scheduler] Running ${useCases.length} test(s) for ${schedule.url}`);

  // Get credentials
  let credentials = {};
  if (schedule.credentialId) {
    credentials = vaultStore.resolveContext(schedule.credentialId);
  }

  // Get integration context
  const contextSummary = await getContextSummary(schedule.url).catch(() => "");

  // Run each use case headlessly
  const results     = [];
  const failedTests = [];

  for (const useCase of useCases) {
    const result = await runUseCaseHeadless(useCase, schedule.url, credentials, contextSummary);
    results.push(result);
    if (result.status !== "pass") failedTests.push(useCase.title);
    // Small pause between tests
    await new Promise(r => setTimeout(r, 2000));
  }

  const passed   = results.filter(r => r.status === "pass").length;
  const failed   = results.filter(r => r.status !== "pass").length;
  const duration = Date.now() - startTime;
  const status   = failed === 0 ? "pass" : "fail";

  // Save suite result
  const saved = resultsStore.save({
    type:        "suite",
    name:        `[Scheduled] ${schedule.name}`,
    url:         schedule.url,
    status,
    passed,
    failed,
    total:       results.length,
    duration,
    steps:       results.map(r => ({ description: r.name, status: r.status })),
    assertions:  [],
    scheduledId: schedule.id,
    startedAt:   new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
  });

  // Update schedule status
  scheduleStore.update(schedule.id, {
    lastStatus: status,
    lastRunId:  saved.id,
  });

  console.log(`[Scheduler] ${schedule.name} complete — ${passed}/${results.length} passed (${(duration/1000).toFixed(1)}s)`);

  // Send Slack notification
  const slackCfg  = schedule.slack;
  const notifyOn  = slackCfg?.notifyOn || "always";
  const shouldNotify =
    slackCfg?.webhookUrl &&
    (notifyOn === "always" ||
    (notifyOn === "fail"   && status === "fail") ||
    (notifyOn === "pass"   && status === "pass"));

  if (shouldNotify) {
    const message = buildSlackMessage(schedule, {
      passed, failed, total: results.length,
      status, duration, runId: saved.id, failedTests,
    });
    await sendSlackNotification(slackCfg.webhookUrl, message);
    console.log(`[Scheduler] Slack notification sent for ${schedule.name}`);
  }
}

// ── Run a single use case without WebSocket (headless) ────────────────────────
async function runUseCaseHeadless(useCase, url, credentials, contextSummary) {
  let browser;
  try {
    const { browser: b, page } = await launchBrowser();
    browser = b;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitUntilReady(page, { maxWait: 10000, pollMs: 500, onLog: () => {} });
    await handlePopups(page, () => {});

    const pageAnalysis = await analysePage(page, { goal: useCase.title, url }).catch(() => null);
    const actions      = await generateActions(useCase, url, credentials, pageAnalysis);

    const stepResults = [];
    const fakeWS = { send: () => {} };

    for (const action of actions) {
      const result = await retryWithConfirmation(
        page, action,
        async () => executeAction(page, action, fakeWS),
        { maxAttempts: 3, backoffMs: [1500, 3000, 5000], confirmAfterMs: 1500, onLog: () => {} }
      );
      stepResults.push({
        description: action.description,
        status:      result.success ? "pass" : "fail",
        error:       result.success ? undefined : result.observation,
      });
    }

    const assertResults = await runAssertions(page, useCase.assertions ?? []);
    const passed   = assertResults.filter(a => a.passed).length;
    const failed   = assertResults.filter(a => !a.passed).length;
    const status   = failed === 0 && stepResults.every(s => s.status !== "fail") ? "pass" : "fail";

    const saved = resultsStore.save({
      type:       "usecase",
      name:       useCase.title,
      url,
      status,
      passed,
      failed,
      total:      assertResults.length,
      duration:   0,
      steps:      stepResults,
      assertions: assertResults,
      startedAt:  new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

    return { id: saved.id, name: useCase.title, status, passed, failed };

  } catch (err) {
    return { name: useCase.title, status: "error", error: err.message };
  } finally {
    await browser?.close().catch(() => {});
  }
}
