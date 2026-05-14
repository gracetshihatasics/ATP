import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";

const client = new Anthropic({ apiKey: config.apiKey });

const DISCOVERY_SYSTEM = `You are an expert QA architect. Analyse the given URL and generate a test plan.
CRITICAL: Respond with ONLY a raw JSON object. Start with { end with }. No markdown. No backticks.
{"appName":"string","appType":"string","summary":"string","useCases":[{"id":"UC-001","category":"Authentication|Core Workflow|Data Management|Integration|Edge Case","title":"string","description":"string","priority":"Critical|High|Medium|Low","steps":["string"],"assertions":["string"],"requiresAuth":false}],"apiEndpoints":[{"method":"string","path":"string","purpose":"string"}],"suggestedSuites":[{"name":"string","description":"string","useCaseIds":["UC-001"]}]}
Generate exactly 7 use cases, 5 apiEndpoints, 3 suggestedSuites. Keep everything concise.`;

const SCENARIO_SYSTEM = `You are a QA engineer. Generate a test scenario.
CRITICAL: ONLY raw JSON. Start { end }. No markdown.
{"testCode":"string","dataRequirements":["string"],"expectedDuration":"string","riskLevel":"string","notes":"string"}`;

function extractJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  throw new Error("Could not extract JSON");
}

export async function discoverRoute(req, res) {
  const { url, username, password } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });
  try {
    const content = [`URL: ${url}`, username ? `Username: ${username}` : null, password ? "Password: [provided]" : null, "\nGenerate a comprehensive test plan."].filter(Boolean).join("\n");
    const response = await client.messages.create({ model: config.model, max_tokens: 8000, system: DISCOVERY_SYSTEM, messages: [{ role: "user", content }] });
    res.json({ ok: true, plan: extractJSON(response.content[0]?.text ?? "") });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

export async function scenarioRoute(req, res) {
  const { useCase } = req.body;
  if (!useCase) return res.status(400).json({ error: "useCase is required" });
  try {
    const response = await client.messages.create({ model: config.model, max_tokens: 2000, system: SCENARIO_SYSTEM, messages: [{ role: "user", content: JSON.stringify(useCase) }] });
    res.json({ ok: true, scenario: extractJSON(response.content[0]?.text ?? "") });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
