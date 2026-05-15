import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";

const client = new Anthropic({ apiKey: config.apiKey });

const SYSTEM = `You are a senior QA engineer and test analyst. Given a failed test run, analyse why it failed and provide actionable insights.

CRITICAL: Respond ONLY with raw JSON. Start { end }. No markdown.
{
  "rootCause": "string — one clear sentence: what specifically went wrong",
  "category": "selector|timeout|network|auth|assertion|data|environment|bug",
  "severity": "critical|high|medium|low",
  "explanation": "string — 2-3 sentences explaining the failure in plain English",
  "isAppBug": true,
  "isFlakyTest": false,
  "recommendations": [
    "string — specific actionable fix, max 20 words each"
  ],
  "affectedArea": "string — which part of the app is affected",
  "businessImpact": "string — what does this mean for users/business (1 sentence)"
}`;

/**
 * Analyse a failed test run and return AI-generated insights.
 * @param {object} run — the full run record from resultsStore
 * @returns {Promise<FailureAnalysis>}
 */
export async function analyseFailure(run) {
  const failedSteps = (run.steps || []).filter(s => s.status !== "pass");
  const failedAssertions = (run.assertions || []).filter(a => !a.passed);

  const context = `Test: ${run.name}
URL: ${run.url}
Type: ${run.type}
Status: ${run.status}
Passed: ${run.passed}/${run.total}
Duration: ${((run.duration || 0) / 1000).toFixed(1)}s

Failed Steps:
${failedSteps.map(s => `- ${s.description || s.name}: ${s.error || "no error message"}`).join("\n") || "none"}

Failed Assertions:
${failedAssertions.map(a => `- ${a.assertion}${a.actual !== undefined ? ` (got: ${a.actual})` : ""}`).join("\n") || "none"}

All Steps:
${(run.steps || []).map((s, i) => `${i + 1}. [${s.status}] ${s.description || s.name}${s.error ? ` → ${s.error}` : ""}`).join("\n") || "none"}`;

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 1000,
    system:     SYSTEM,
    messages: [{ role: "user", content: `Analyse this failed test run:\n\n${context}` }],
  });

  const raw = response.content[0]?.text ?? "";
  return extractJSON(raw);
}

/**
 * Generate a suite-level insight summary across multiple run results.
 * @param {object[]} runs
 * @returns {Promise<SuiteInsight>}
 */
export async function analyseSuite(runs) {
  const passed  = runs.filter(r => r.status === "pass").length;
  const failed  = runs.filter(r => r.status !== "pass").length;
  const failedRuns = runs.filter(r => r.status !== "pass");

  const context = `Suite Results: ${passed} passed, ${failed} failed out of ${runs.length} total

Failed tests:
${failedRuns.map(r => `- ${r.name}: ${(r.steps || []).filter(s => s.status !== "pass").map(s => s.error || s.description).join("; ")}`).join("\n") || "none"}

All results:
${runs.map(r => `[${r.status}] ${r.name} (${r.passed}/${r.total})`).join("\n")}`;

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 800,
    system: `You are a QA lead. Summarise a test suite run and give key insights.
CRITICAL: Raw JSON only. Start { end }.
{
  "overallHealth": "healthy|degraded|critical",
  "summary": "string — 2 sentences plain English summary",
  "commonPattern": "string — if failures share a pattern, describe it",
  "topPriority": "string — the most important thing to fix",
  "recommendations": ["string — max 3 items"]
}`,
    messages: [{ role: "user", content: context }],
  });

  const raw = response.content[0]?.text ?? "";
  return extractJSON(raw);
}

function extractJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  return { rootCause: "Analysis unavailable", category: "unknown", severity: "medium", recommendations: [] };
}
