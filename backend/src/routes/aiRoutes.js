import { handle, sendSSEError, ATPError, ErrorType, logError } from "../utils/errors.js";
import https  from "https";
import { config } from "../config/index.js";

// Use native https instead of fetch-based SDK — bypasses Node fetch issues
function callClaude(system, userContent, maxTokens = 8000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:      config.model,
      max_tokens: maxTokens,
      system,
      messages:   [{ role: "user", content: userContent }],
    });

    const req = https.request({
      hostname: "api.anthropic.com",
      port:     443,
      path:     "/v1/messages",
      method:   "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         config.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length":    Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse Anthropic response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", (e) => reject(new Error(`HTTPS request failed: ${e.message}`)));
    req.setTimeout(120_000, () => { req.destroy(); reject(new Error("Request timed out after 120s")); });
    req.write(body);
    req.end();
  });
}

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
  if (!url) return res.status(400).json({ ok:false, error:"url is required", type:"validation" });

  if (!config.apiKey || config.apiKey.length < 10) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in backend/.env" });
  }

  try {
    let contextBlock = "";
    try {
      const { getContextSummary } = await import("../integrations/contextBuilder.js");
      const ctx = await getContextSummary(url);
      if (ctx) contextBlock += `\n\nIntegration context:\n${ctx.slice(0, 2000)}`;
    } catch {}
    try {
      const { getActiveSuiteContext } = await import("../testbed/testbedRoutes.js");
      const suiteCtx = getActiveSuiteContext();
      if (suiteCtx) contextBlock += `\n\n${suiteCtx}`;
    } catch {}

    const content = [
      `URL: ${url}`,
      username ? `Username: ${username}` : null,
      password ? "Password: [provided]" : null,
      contextBlock || null,
      "\nGenerate a comprehensive test plan.",
    ].filter(Boolean).join("\n");

    const response = await callClaude(DISCOVERY_SYSTEM, content, 8000);
    const raw      = response.content?.[0]?.text ?? "";
    const plan     = extractJSON(raw);
    res.json({ ok: true, plan });

  } catch (err) {
    console.error("[discover] Error:", err.message);
    res.status(500).json({ ok:false, error:err.message, type:"internal" });
  }
}

export async function scenarioRoute(req, res) {
  const { useCase } = req.body;
  if (!useCase) return res.status(400).json({ ok:false, error:"useCase is required", type:"validation" });

  try {
    const content  = `Use case: ${useCase.title}\nSteps:\n${useCase.steps?.map((s,i) => `${i+1}. ${s}`).join("\n") || ""}`;
    const response = await callClaude(SCENARIO_SYSTEM, content, 2000);
    const raw      = response.content?.[0]?.text ?? "";
    const scenario = extractJSON(raw);
    res.json({ ok: true, scenario });
  } catch (err) {
    console.error("[scenario] Error:", err.message);
    res.status(500).json({ ok:false, error:err.message, type:"internal" });
  }
}
