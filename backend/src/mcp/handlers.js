import Anthropic       from "@anthropic-ai/sdk";
import crypto          from "crypto";
import { config }      from "../config/index.js";
import { launchBrowser }     from "../browser/launcher.js";
import { executeAction }     from "../browser/executor.js";
import { runAssertions }     from "../browser/assertions.js";
import { captureScreenshot } from "../browser/screenshot.js";
import { generateActions }   from "../ai/actionGenerator.js";

const anthropic = new Anthropic({ apiKey: config.apiKey });

/** In-memory stores — replace with a DB for production */
const testPlans  = new Map(); // url  → plan
const runResults = new Map(); // runId → results

// ── Tool: discover_usecases ───────────────────────────────────────────────────
export async function discoverUsecases({ url, username, password }) {
  const userContent = [
    `URL: ${url}`,
    username ? `Username: ${username}` : null,
    password ? "Password: [provided]"  : null,
    "\nGenerate a comprehensive test plan.",
  ].filter(Boolean).join("\n");

  const response = await anthropic.messages.create({
    model:      config.model,
    max_tokens: 8000,
    system: `You are an expert QA architect. Analyse the given URL and generate a test plan.
CRITICAL: Respond with ONLY a raw JSON object. Start with { end with }. No markdown. No backticks.
{
  "appName":"string","appType":"string","summary":"string",
  "useCases":[{"id":"UC-001","category":"string","title":"string","description":"string","priority":"Critical|High|Medium|Low","steps":["string"],"assertions":["string"],"requiresAuth":false}],
  "apiEndpoints":[{"method":"string","path":"string","purpose":"string"}],
  "suggestedSuites":[{"name":"string","description":"string","useCaseIds":["UC-001"]}]
}
Generate exactly 7 use cases, 5 API endpoints, 3 suites. Keep everything concise.`,
    messages: [{ role: "user", content: userContent }],
  });

  const raw  = response.content[0]?.text ?? "";
  const plan = parseJSON(raw);
  testPlans.set(url, plan);
  return plan;
}

// ── Tool: run_usecase ─────────────────────────────────────────────────────────
export async function runUsecase({ url, useCase, credentials = {} }) {
  const runId  = crypto.randomUUID();
  const events = [];
  const log    = (msg, level = "info") => events.push({ type: "log", level, msg });

  let browser;
  const stepResults = [];
  let assertResults = [];

  try {
    log("Launching browser…", "system");
    const { browser: b, page } = await launchBrowser();
    browser = b;

    log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const initialShot = await captureScreenshot(page);

    log("AI generating browser actions…", "ai");
    const actions = await generateActions(useCase, url, credentials);
    log(`${actions.length} actions generated`, "ai");

    // Execute each action
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      try {
        await executeAction(page, action, { readyState: 1, send: () => {} }); // no-op WS
        await page.waitForTimeout(500);
        const screenshot = await captureScreenshot(page);
        stepResults.push({ index: i, description: action.description, status: "pass", screenshot });
        log(`✓ ${action.description}`, "success");
      } catch (err) {
        const screenshot = await captureScreenshot(page).catch(() => null);
        stepResults.push({ index: i, description: action.description, status: "fail", error: err.message, screenshot });
        log(`✗ ${action.description}: ${err.message}`, "error");
      }
    }

    log("Running assertions…", "ai");
    assertResults = await runAssertions(page, useCase.assertions ?? []);
    const finalShot = await captureScreenshot(page);

    const passed = assertResults.filter(a => a.passed).length;
    const failed = assertResults.filter(a => !a.passed).length;
    log(`Run complete — ${passed} passed, ${failed} failed`, passed === assertResults.length ? "success" : "warn");

    const result = {
      runId, ucId: useCase.id, url,
      status:      failed === 0 ? "pass" : "fail",
      steps:       stepResults,
      assertions:  assertResults,
      screenshots: { initial: initialShot, final: finalShot },
      events,
      completedAt: new Date().toISOString(),
    };

    runResults.set(runId, result);
    return result;

  } finally {
    await browser?.close().catch(() => {});
  }
}

// ── Tool: run_suite ───────────────────────────────────────────────────────────
export async function runSuite({ url, useCases, credentials = {} }) {
  const suiteId = crypto.randomUUID();
  const results = [];

  for (const useCase of useCases) {
    const result = await runUsecase({ url, useCase, credentials });
    results.push(result);
    await new Promise(r => setTimeout(r, 1000));
  }

  const passed = results.filter(r => r.status === "pass").length;
  const failed = results.filter(r => r.status === "fail").length;

  const suiteResult = {
    suiteId,
    url,
    total:  results.length,
    passed,
    failed,
    results,
    completedAt: new Date().toISOString(),
  };

  runResults.set(suiteId, suiteResult);
  return suiteResult;
}

// ── Tool: get_test_plan ───────────────────────────────────────────────────────
export async function getTestPlan({ url }) {
  return testPlans.get(url) ?? null;
}

// ── Tool: get_run_results ─────────────────────────────────────────────────────
export async function getRunResults({ runId }) {
  return runResults.get(runId) ?? null;
}

// ── Tool: update_tests_from_diff ──────────────────────────────────────────────
export async function updateTestsFromDiff({ url, diff, affectedFiles = [] }) {
  const existingPlan = testPlans.get(url);

  const response = await anthropic.messages.create({
    model:      config.model,
    max_tokens: 4000,
    system: `You are a QA architect. Given a git diff and an existing test plan, identify which test cases need updating and return an updated plan.
CRITICAL: Respond ONLY with raw JSON. Same shape as the original plan.`,
    messages: [{
      role: "user",
      content: `URL: ${url}
Affected files: ${affectedFiles.join(", ")}

Git diff:
${diff.slice(0, 3000)}

Existing test plan:
${JSON.stringify(existingPlan ?? {}, null, 2)}

Update or regenerate affected test cases. Keep unaffected ones unchanged.`,
    }],
  });

  const raw     = response.content[0]?.text ?? "";
  const newPlan = parseJSON(raw);
  testPlans.set(url, newPlan);
  return { url, updatedPlan: newPlan, affectedFiles };
}

// ── Helper ────────────────────────────────────────────────────────────────────
function parseJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  throw new Error("Could not parse JSON from Claude response");
}
