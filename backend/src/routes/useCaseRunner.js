import { launchBrowser }      from "../browser/launcher.js";
import { executeAction }      from "../browser/executor.js";
import { runAssertions }      from "../browser/assertions.js";
import { captureScreenshot }  from "../browser/screenshot.js";
import { generateActions }    from "../ai/actionGenerator.js";
import { sessionManager }     from "../ws/sessionManager.js";
import { send }               from "../ws/send.js";
import { resultsStore }       from "../results/store.js";

export async function runUseCase(ws, sessionId, { useCase, url, credentials, suiteId = null }) {
  send(ws, { type: "run_start", ucId: useCase.id, title: useCase.title });
  const startTime   = Date.now();
  const stepResults = [];
  let browser;

  try {
    send(ws, { type: "log", level: "system", msg: "Launching browser..." });
    const { browser: b, page } = await launchBrowser(
      (msg) => send(ws, { type: "log", level: "info", msg: `🚫 ${msg}` })
    );
    browser = b;

    page.on("pageerror", err =>
      send(ws, { type: "log", level: "warn", msg: `Page JS error: ${err.message}` })
    );
    sessionManager.set(sessionId, { browser, page, ws, running: true });

    send(ws, { type: "log", level: "info", msg: `Navigating to ${url}` });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    send(ws, { type: "screenshot", data: await captureScreenshot(page), step: "Initial page load" });

    send(ws, { type: "log", level: "ai", msg: "AI translating steps into browser actions..." });
    const actions = await generateActions(useCase, url, credentials);
    send(ws, { type: "actions_ready", count: actions.length });

    for (let i = 0; i < actions.length; i++) {
      if (!sessionManager.isRunning(sessionId)) {
        send(ws, { type: "log", level: "warn", msg: "Run stopped by user." });
        break;
      }
      const action = actions[i];
      send(ws, { type: "step_start", index: i, total: actions.length, description: action.description });
      try {
        await executeAction(page, action, ws);
        await page.waitForTimeout(600);
        const screenshot = await captureScreenshot(page);
        stepResults.push({ index: i, description: action.description, status: "pass" });
        send(ws, { type: "step_done", index: i, status: "pass", screenshot, description: action.description });
      } catch (err) {
        const screenshot = await captureScreenshot(page).catch(() => null);
        stepResults.push({ index: i, description: action.description, status: "fail", error: err.message });
        send(ws, { type: "step_done", index: i, status: "fail", screenshot, description: action.description, error: err.message });
        send(ws, { type: "log", level: "warn", msg: `Step ${i + 1} failed: ${err.message}` });
      }
    }

    send(ws, { type: "log", level: "ai", msg: "Running assertions..." });
    const assertResults = await runAssertions(page, useCase.assertions ?? []);
    for (const result of assertResults) send(ws, { type: "assertion", ...result });

    send(ws, { type: "screenshot", data: await captureScreenshot(page), step: "Final state" });
    const passed   = assertResults.filter(a => a.passed).length;
    const failed   = assertResults.filter(a => !a.passed).length;
    const status   = failed === 0 ? "pass" : "fail";
    const duration = Date.now() - startTime;

    // Save to results store
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
      suiteId,
      category:    useCase.category,
      priority:    useCase.priority,
      startedAt:   new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
    });

    send(ws, { type: "run_complete", ucId: useCase.id, passed, failed, total: assertResults.length, runId: saved.id, status });
    return saved; // return for suite runner to collect

  } catch (err) {
    send(ws, { type: "log",       level: "error", msg: `Fatal: ${err.message}` });
    send(ws, { type: "run_error", ucId: useCase.id, error: err.message });

    // Save error result too
    const saved = resultsStore.save({
      type:        "usecase",
      name:        useCase.title,
      url,
      status:      "error",
      passed:      0,
      failed:      1,
      total:       1,
      duration:    Date.now() - startTime,
      steps:       stepResults,
      assertions:  [],
      suiteId,
      error:       err.message,
      startedAt:   new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
    });
    return saved;
  } finally {
    await browser?.close().catch(() => {});
    sessionManager.destroy(sessionId);
  }
}
