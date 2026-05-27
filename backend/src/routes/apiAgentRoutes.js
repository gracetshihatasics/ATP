import { parseSwaggerUrl, parsePostmanCollection } from "../api/swaggerParser.js";
import { buildScenarios }  from "../api/scenarioBuilder.js";
import { runScenario }     from "../api/apiRunner.js";
import { integrationStore } from "../integrations/integrationStore.js";
import { getContextSummary } from "../integrations/contextBuilder.js";
import { resultsStore }    from "../results/store.js";

// ── List API sources from connected integrations ──────────────────────────────
async function listApiSourcesRoute(req, res) {
  try {
    const postmanIntgs = integrationStore.getByType("postman");
    const swaggerIntgs = integrationStore.getByType("swagger");
    const sources = [];

    for (const p of postmanIntgs) {
      try {
        const headers = { "X-Api-Key": p.config.apiKey, Accept: "application/json" };
        const url     = p.config.workspaceId
          ? `https://api.getpostman.com/collections?workspace=${p.config.workspaceId}`
          : "https://api.getpostman.com/collections";
        const r    = await fetch(url, { headers });
        if (r.ok) {
          const { collections } = await r.json();
          sources.push({ integrationId:p.id, name:p.name, type:"postman",
            collections: (collections||[]).map(c => ({ id:c.uid, name:c.name })) });
        } else {
          sources.push({ integrationId:p.id, name:p.name, type:"postman", collections:[], error:`HTTP ${r.status}` });
        }
      } catch (e) {
        sources.push({ integrationId:p.id, name:p.name, type:"postman", collections:[], error:e.message });
      }
    }

    for (const s of swaggerIntgs) {
      sources.push({ integrationId:s.id, name:s.name, type:"swagger", specUrl: s.config.specUrl||s.config.url||"" });
    }

    res.json({ ok:true, sources });
  } catch (err) {
    res.status(500).json({ ok:false, error:err.message, sources:[] });
  }
}

// ── Import spec ────────────────────────────────────────────────────────────────
async function importSpecRoute(req, res) {
  const { integrationId, collectionId, swaggerUrl, postmanJson, baseUrl } = req.body;
  try {
    let spec;

    if (integrationId) {
      const intg = integrationStore.get(integrationId);
      if (!intg) return res.status(404).json({ error:"Integration not found" });

      if (intg.type === "postman") {
        if (!collectionId) return res.status(400).json({ error:"collectionId required for Postman" });
        const headers = { "X-Api-Key": intg.config.apiKey, Accept:"application/json" };
        const r = await fetch(`https://api.getpostman.com/collections/${collectionId}`, { headers });
        if (!r.ok) return res.status(400).json({ error:`Postman fetch failed: ${r.status}` });
        const { collection } = await r.json();
        spec = parsePostmanCollection(collection);
        if (baseUrl) spec.baseUrl = baseUrl;
      } else if (intg.type === "swagger") {
        const url = intg.config.specUrl || intg.config.url;
        spec = await parseSwaggerUrl(url);
        if (baseUrl) spec.baseUrl = baseUrl;
      } else {
        return res.status(400).json({ error:`Integration type ${intg.type} not supported for API agent` });
      }
    } else if (swaggerUrl) {
      spec = await parseSwaggerUrl(swaggerUrl);
      if (baseUrl) spec.baseUrl = baseUrl;
    } else if (postmanJson) {
      const parsed = typeof postmanJson === "string" ? JSON.parse(postmanJson) : postmanJson;
      spec = parsePostmanCollection(parsed.collection || parsed);
      if (baseUrl) spec.baseUrl = baseUrl;
    } else {
      return res.status(400).json({ error:"Provide integrationId, swaggerUrl, or postmanJson" });
    }

    res.json({ ok:true, spec });
  } catch (err) {
    res.status(500).json({ error:err.message });
  }
}

// ── Build scenarios with context ──────────────────────────────────────────────
async function buildScenariosRoute(req, res) {
  const { spec, url } = req.body;
  if (!spec) return res.status(400).json({ error:"spec required" });
  try {
    const targetUrl = url || spec.baseUrl || "";
    const context   = targetUrl ? await getContextSummary(targetUrl).catch(()=>"") : "";
    const scenarios = await buildScenarios(spec, {}, context);
    res.json({ ok:true, scenarios, contextUsed:!!context });
  } catch (err) {
    res.status(500).json({ error:err.message });
  }
}

// ── Run one scenario — SSE ─────────────────────────────────────────────────────
async function runScenarioRoute(req, res) {
  const { scenario, spec, credentials } = req.body;
  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  res.setHeader("Access-Control-Allow-Origin","*");
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);
  try {
    const result = await runScenario(scenario, spec?.baseUrl||"", credentials||{}, (evt) => {
      if (evt.type === "step") send({ type:"step", ...evt });
      else if (evt.type === "log") send({ type:"log", msg:evt.msg, level:evt.level||"info" });
    });
    const saved = resultsStore.save({
      type:"api", name:scenario.name, url:spec?.baseUrl||"",
      status:result.status, passed:result.passed||0, failed:result.failed||0,
      total:result.steps?.length||0, duration:result.duration||0,
      steps:result.steps||[], assertions:[],
      startedAt:new Date().toISOString(), completedAt:new Date().toISOString(),
    });
    send({ type:"done", result, runId:saved.id });
  } catch (err) {
    send({ type:"error", msg:err.message });
  }
  res.end();
}

// ── Run all scenarios — SSE ───────────────────────────────────────────────────
async function runAllScenariosRoute(req, res) {
  const { scenarios, spec, credentials, filter="all" } = req.body;
  let toRun = scenarios||[];
  if (filter !== "all") toRun = toRun.filter(s => s.priority?.toLowerCase()===filter || s.category?.toLowerCase().includes(filter));

  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  res.setHeader("Access-Control-Allow-Origin","*");
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);
  const all  = [];

  for (let i=0; i<toRun.length; i++) {
    const sc = toRun[i];
    send({ type:"scenario_start", index:i, total:toRun.length, name:sc.name });
    try {
      const result = await runScenario(sc, spec?.baseUrl||"", credentials||{}, (evt) => {
        if (evt.type==="step") send({ type:"step", scenarioIndex:i, ...evt });
        else if (evt.type==="log") send({ type:"log", msg:evt.msg, level:evt.level||"info" });
      });
      all.push({ ...result, name:sc.name });
      send({ type:"scenario_done", index:i, status:result.status, passed:result.passed||0, failed:result.failed||0 });
    } catch (err) {
      all.push({ name:sc.name, status:"error", error:err.message });
      send({ type:"scenario_done", index:i, status:"error", error:err.message });
    }
  }

  const passed = all.filter(r=>r.status==="pass").length;
  const failed = all.length - passed;
  resultsStore.save({
    type:"api-suite", name:`API Suite — ${toRun.length} scenarios`,
    url:spec?.baseUrl||"", status:failed===0?"pass":"fail",
    passed, failed, total:toRun.length,
    steps:all.map(r=>({ description:r.name, status:r.status })), assertions:[],
    startedAt:new Date().toISOString(), completedAt:new Date().toISOString(),
  });

  send({ type:"suite_done", passed, failed, total:toRun.length });
  res.end();
}

// ── Register ──────────────────────────────────────────────────────────────────
export function apiAgentRoutes(app) {
  app.get ("/api/agent/sources",  listApiSourcesRoute);
  app.post("/api/agent/import",   importSpecRoute);
  app.post("/api/agent/build",    buildScenariosRoute);
  app.post("/api/agent/run",      runScenarioRoute);
  app.post("/api/agent/run-all",  runAllScenariosRoute);
}
