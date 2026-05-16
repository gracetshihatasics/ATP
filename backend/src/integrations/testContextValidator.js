import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";
import { buildContext } from "../integrations/contextBuilder.js";

const client = new Anthropic({ apiKey: config.apiKey });

/**
 * When a test fails, validate whether the test itself is still correct
 * given the current integration context (Jira, Confluence, DB, GitHub, etc.)
 *
 * Answers:
 * - Is the test still valid? (or did the feature change?)
 * - Is this a real app bug or a stale test?
 * - Does the test match current acceptance criteria?
 * - Suggested fix if the test needs updating
 */
export async function validateTestAgainstContext(run, page = null) {
  const context = await buildContext(run.url, run.name).catch(() => ({ isEmpty: true, text: "" }));

  // Take a screenshot if page is available
  let screenshotB64 = null;
  if (page) {
    screenshotB64 = await page.screenshot({ type: "jpeg", quality: 60 })
      .then(b => b.toString("base64")).catch(() => null);
  }

  const failedSteps = (run.steps || []).filter(s => s.status !== "pass");
  const failedAsserts = (run.assertions || []).filter(a => !a.passed);

  const prompt = `You are a senior QA engineer validating whether a failing test is still relevant given the current system context.

Test: "${run.name}"
URL: ${run.url}
Status: ${run.status}
Passed: ${run.passed}/${run.total}

Failed steps:
${failedSteps.map(s => `- ${s.description}: ${s.error || "no error"}`).join("\n") || "none"}

Failed assertions:
${failedAsserts.map(a => `- ${a.assertion}`).join("\n") || "none"}

Test steps (full):
${(run.steps || []).map((s, i) => `${i + 1}. [${s.status}] ${s.description}`).join("\n") || "none"}

${context.isEmpty ? "No integration context available." : `Current system context:\n${context.text.slice(0, 4000)}`}

Analyse:
1. Is this test still valid given the current context? Or has the feature/flow changed?
2. Is this a real application bug, a stale/outdated test, or an environment issue?
3. Does the test match current acceptance criteria or documented behaviour?
4. What specifically needs to change — the test, the app, or neither?

CRITICAL: Raw JSON only. Start { end }.
{
  "testStillValid": true,
  "verdict": "real-bug|stale-test|environment-issue|selector-issue|data-issue|unknown",
  "confidence": "high|medium|low",
  "explanation": "2-3 sentences explaining the verdict",
  "contextMismatch": "string — what in the context contradicts the test, if anything",
  "suggestedTestFix": "string — if the test needs updating, what to change",
  "suggestedAppFix": "string — if it's an app bug, what to fix",
  "shouldSkip": false,
  "skipReason": "string — why to skip if shouldSkip is true",
  "priority": "critical|high|medium|low"
}`;

  const messages = [{
    role: "user",
    content: screenshotB64 ? [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshotB64 } },
      { type: "text", text: prompt },
    ] : prompt,
  }];

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 1000,
    messages,
  });

  const raw = response.content[0]?.text ?? "";
  const s   = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) {
    try { return JSON.parse(raw.slice(s, e + 1)); } catch {}
  }

  return {
    testStillValid: true,
    verdict:        "unknown",
    confidence:     "low",
    explanation:    "Could not validate against context",
  };
}
