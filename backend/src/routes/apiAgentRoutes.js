import { parseSwaggerUrl, parsePostmanCollection } from "../api/swaggerParser.js";
import { buildScenarios, buildEndpointScenario }  from "../api/scenarioBuilder.js";
import { runScenario }                            from "../api/apiRunner.js";

// In-memory store — replace with DB for production
const specStore     = new Map(); // specId → NormalisedSpec
const scenarioStore = new Map(); // specId → scenarios[]
const resultStore   = new Map(); // runId  → results

// ── Import spec ───────────────────────────────────────────────────────────────
export async function importSpecRoute(req, res) {
  const { swaggerUrl, postmanJson, baseUrl } = req.body;

  try {
    let spec;

    if (swaggerUrl) {
      spec = await parseSwaggerUrl(swaggerUrl);
      if (baseUrl) spec.baseUrl = baseUrl;
    } else if (postmanJson) {
      const collection = typeof postmanJson === "string" ? JSON.parse(postmanJson) : postmanJson;
      spec = parsePostmanCollection(collection);
      if (baseUrl) spec.baseUrl = baseUrl;
    } else {
      return res.status(400).json({ error: "Provide swaggerUrl or postmanJson" });
    }

    const specId = `spec-${Date.now()}`;
    specStore.set(specId, spec);

    res.json({
      ok: true,
      specId,
      title:         spec.title,
      version:       spec.version,
      source:        spec.source,
      baseUrl:       spec.baseUrl,
      endpointCount: spec.endpoints.length,
      endpoints:     spec.endpoints,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Build scenarios ───────────────────────────────────────────────────────────
export async function buildScenariosRoute(req, res) {
  const { specId, credentials } = req.body;
  const spec = specStore.get(specId);
  if (!spec) return res.status(404).json({ error: "Spec not found — import it first" });

  try {
    const scenarios = await buildScenarios(spec, credentials ?? {});
    scenarioStore.set(specId, scenarios);
    res.json({ ok: true, specId, scenarios });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Run a single scenario (streaming via SSE) ────────────────────────────────
export async function runScenarioRoute(req, res) {
  const { specId, scenarioId, baseUrl, credentials } = req.body;
  const spec      = specStore.get(specId);
  const scenarios = scenarioStore.get(specId) ?? [];
  const scenario  = scenarios.find(s => s.id === scenarioId);

  if (!spec)     return res.status(404).json({ error: "Spec not found" });
  if (!scenario) return res.status(404).json({ error: "Scenario not found" });

  // Server-Sent Events for streaming step results
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const result = await runScenario(
      scenario,
      baseUrl || spec.baseUrl,
      credentials ?? {},
      send
    );

    const runId = `run-${Date.now()}`;
    resultStore.set(runId, result);
    send({ type: "complete", runId, result });
  } catch (err) {
    send({ type: "error", error: err.message });
  } finally {
    res.end();
  }
}

// ── Run all scenarios for a spec ─────────────────────────────────────────────
export async function runAllScenariosRoute(req, res) {
  const { specId, baseUrl, credentials } = req.body;
  const spec      = specStore.get(specId);
  const scenarios = scenarioStore.get(specId) ?? [];

  if (!spec) return res.status(404).json({ error: "Spec not found" });

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const allResults = [];

  try {
    for (const scenario of scenarios) {
      const result = await runScenario(
        scenario,
        baseUrl || spec.baseUrl,
        credentials ?? {},
        send
      );
      allResults.push(result);
      await new Promise(r => setTimeout(r, 500));
    }

    const runId  = `suite-${Date.now()}`;
    const passed = allResults.filter(r => r.status === "pass").length;
    const failed = allResults.filter(r => r.status !== "pass").length;
    resultStore.set(runId, allResults);
    send({ type: "suite_complete", runId, passed, failed, total: allResults.length });
  } catch (err) {
    send({ type: "error", error: err.message });
  } finally {
    res.end();
  }
}

// ── Get results ───────────────────────────────────────────────────────────────
export async function getResultsRoute(req, res) {
  const { runId } = req.params;
  const result = resultStore.get(runId);
  if (!result) return res.status(404).json({ error: "Run not found" });
  res.json({ ok: true, result });
}
