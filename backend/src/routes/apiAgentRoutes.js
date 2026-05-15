import { parseSwaggerUrl, parsePostmanCollection } from "../api/swaggerParser.js";
import { buildScenarios }                         from "../api/scenarioBuilder.js";
import { runScenario }                            from "../api/apiRunner.js";
import { resultsStore }                           from "../results/store.js";
import crypto                                     from "crypto";

const specStore     = new Map();
const scenarioStore = new Map();

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
    res.json({ ok: true, specId, title: spec.title, version: spec.version, source: spec.source, baseUrl: spec.baseUrl, endpointCount: spec.endpoints.length, endpoints: spec.endpoints });
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

// ── Run a single scenario (SSE streaming) ────────────────────────────────────
export async function runScenarioRoute(req, res) {
  const { specId, scenarioId, baseUrl, credentials } = req.body;
  const spec      = specStore.get(specId);
  const scenarios = scenarioStore.get(specId) ?? [];
  const scenario  = scenarios.find(s => s.id === scenarioId);
  if (!spec)     return res.status(404).json({ error: "Spec not found" });
  if (!scenario) return res.status(404).json({ error: "Scenario not found" });

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");

  const send   = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const startTime = Date.now();

  try {
    const result = await runScenario(scenario, baseUrl || spec.baseUrl, credentials ?? {}, send);
    const duration = Date.now() - startTime;

    // Save to results store
    const saved = resultsStore.save({
      type:        "api",
      name:        scenario.name,
      url:         baseUrl || spec.baseUrl,
      apiTitle:    spec.title,
      status:      result.status,
      passed:      result.passed,
      failed:      result.failed,
      total:       result.total,
      duration,
      steps:       (result.steps || []).map(s => ({
        description: s.name || s.stepId,
        status:      s.status,
        duration:    s.duration,
        statusCode:  s.statusCode,
        url:         s.url,
        method:      s.method,
        error:       s.error,
        assertions:  s.assertions,
      })),
      assertions:  (result.steps || []).flatMap(s => s.assertions || []),
      scenario:    { id: scenario.id, category: scenario.category, priority: scenario.priority },
      startedAt:   new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
    });

    send({ type: "complete", runId: saved.id, result });
  } catch (err) {
    send({ type: "error", error: err.message });
  } finally {
    res.end();
  }
}

// ── Run all scenarios (SSE streaming) ────────────────────────────────────────
export async function runAllScenariosRoute(req, res) {
  const { specId, baseUrl, credentials } = req.body;
  const spec      = specStore.get(specId);
  const scenarios = scenarioStore.get(specId) ?? [];
  if (!spec) return res.status(404).json({ error: "Spec not found" });

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");

  const send      = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const suiteId   = `api-suite-${crypto.randomUUID().slice(0, 8)}`;
  const startTime = Date.now();
  const allResults = [];

  try {
    send({ type: "suite_start", total: scenarios.length, suiteId });

    for (const scenario of scenarios) {
      const scStart = Date.now();
      const result  = await runScenario(scenario, baseUrl || spec.baseUrl, credentials ?? {}, send);
      const scDur   = Date.now() - scStart;

      const saved = resultsStore.save({
        type:        "api",
        name:        scenario.name,
        url:         baseUrl || spec.baseUrl,
        apiTitle:    spec.title,
        status:      result.status,
        passed:      result.passed,
        failed:      result.failed,
        total:       result.total,
        duration:    scDur,
        steps:       (result.steps || []).map(s => ({
          description: s.name || s.stepId,
          status:      s.status,
          duration:    s.duration,
          statusCode:  s.statusCode,
          url:         s.url,
          method:      s.method,
          error:       s.error,
          assertions:  s.assertions,
        })),
        assertions:  (result.steps || []).flatMap(s => s.assertions || []),
        scenario:    { id: scenario.id, category: scenario.category, priority: scenario.priority },
        suiteId,
        startedAt:   new Date(scStart).toISOString(),
        completedAt: new Date().toISOString(),
      });

      allResults.push({ ...result, runId: saved.id });
      await new Promise(r => setTimeout(r, 500));
    }

    const passed   = allResults.filter(r => r.status === "pass").length;
    const failed   = allResults.filter(r => r.status !== "pass").length;
    const duration = Date.now() - startTime;

    // Save suite-level record
    const suiteSaved = resultsStore.save({
      type:        "suite",
      name:        `${spec.title} — API Suite (${scenarios.length} scenarios)`,
      url:         baseUrl || spec.baseUrl,
      apiTitle:    spec.title,
      status:      failed === 0 ? "pass" : "fail",
      passed,
      failed,
      total:       allResults.length,
      duration,
      steps:       allResults.map(r => ({ description: r.name, status: r.status, runId: r.runId })),
      assertions:  [],
      suiteId,
      ucRunIds:    allResults.map(r => r.runId),
      startedAt:   new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
    });

    send({ type: "suite_complete", suiteId, passed, failed, total: allResults.length, runId: suiteSaved.id });
  } catch (err) {
    send({ type: "error", error: err.message });
  } finally {
    res.end();
  }
}

// ── Get results ───────────────────────────────────────────────────────────────
export async function getResultsRoute(req, res) {
  const result = resultsStore.getById(req.params.runId);
  if (!result) return res.status(404).json({ error: "Run not found" });
  res.json({ ok: true, result });
}
