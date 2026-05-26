import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";

const client = new Anthropic({ apiKey: config.apiKey });

const DISCOVERY_SYSTEM = `You are an expert QA architect. Analyse the given URL and generate a test plan.
CRITICAL: Respond with ONLY a raw JSON object. Start with { end with }. No markdown. No backticks. Nothing else.
{
  "appName":"string","appType":"string","summary":"string (2 sentences)",
  "useCases":[{"id":"UC-001","category":"Authentication|Core Workflow|Data Management|Integration|Edge Case","title":"string","description":"string (max 20 words)","priority":"Critical|High|Medium|Low","steps":["step (max 12 words)"],"assertions":["assert (max 12 words)"],"requiresAuth":false}],
  "apiEndpoints":[{"method":"GET|POST|PUT|DELETE","path":"/api/...","purpose":"string"}],
  "suggestedSuites":[{"name":"string","description":"string","useCaseIds":["UC-001"]}]
}
Generate exactly 7 use cases. Keep everything concise. Include 5 apiEndpoints and 3 suggestedSuites.`;

const SCENARIO_SYSTEM = `You are a QA engineer. Generate a test scenario.
CRITICAL: ONLY raw JSON. Start { end }. No markdown.
{"testCode":"string (playwright pseudocode, use actual newlines)","dataRequirements":["string"],"expectedDuration":"string","riskLevel":"string","notes":"string"}`;

function extractJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch {} }
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  throw new Error("Could not extract JSON from response");
}

export async function discoverRoute(req, res) {
  const { url, username, password, credentialId } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });

  // Guard — catch missing API key before calling Anthropic
  if (!config.apiKey || config.apiKey.length < 10) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY is not set or invalid. Check backend/.env",
    });
  }

  try {
    // Pull integration context if available
    let contextBlock = "";
    try {
      const { getContextSummary } = await import("../integrations/contextBuilder.js");
      const ctx = await getContextSummary(url);
      if (ctx) contextBlock = `\n\nIntegration context:\n${ctx.slice(0, 2000)}`;
    } catch {}

    const content = [
      `URL: ${url}`,
      username ? `Username: ${username}` : null,
      password ? "Password: [provided]" : null,
      contextBlock || null,
      "\nGenerate a comprehensive test plan.",
    ].filter(Boolean).join("\n");

    const response = await client.messages.create({
      model:      config.model,
      max_tokens: 8000,
      system:     DISCOVERY_SYSTEM,
      messages:   [{ role: "user", content }],
    });

    const raw  = response.content[0]?.text ?? "";
    const plan = extractJSON(raw);
    res.json({ ok: true, plan });
  } catch (err) {
    // Log full error server-side
    console.error("[discover] Error:", {
      message: err.message,
      status:  err.status,
      type:    err.error?.type,
      detail:  err.error?.error?.message,
      stack:   err.stack?.split("\n").slice(0,3).join(" | "),
    });

    // Return meaningful message to frontend
    const userMessage =
      err.message?.includes("Connection error") ? "Cannot reach Anthropic API — check your internet connection and ANTHROPIC_API_KEY in backend/.env" :
      err.message?.includes("authentication")   ? "Invalid ANTHROPIC_API_KEY — check backend/.env" :
      err.message?.includes("model")            ? `Model error: ${err.message}` :
      err.error?.error?.message || err.message;

    res.status(500).json({ error: userMessage });
  }
}

export async function scenarioRoute(req, res) {
  const { useCase } = req.body;
  if (!useCase) return res.status(400).json({ error: "useCase is required" });

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 2000,
      system: SCENARIO_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(useCase) }],
    });

    const raw = response.content[0]?.text ?? "";
    const scenario = extractJSON(raw);
    res.json({ ok: true, scenario });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
