import { parseSwaggerUrl, parsePostmanCollection } from "../api/swaggerParser.js";
import { buildScenarios, scenariosToPostmanCollection, scenariosToJestFile } from "../api/scenarioBuilder.js";
import { runScenario }       from "../api/apiRunner.js";
import { integrationStore }  from "../integrations/integrationStore.js";
import { getContextSummary } from "../integrations/contextBuilder.js";
import { scenarioStore }     from "../api/scenarioStore.js";
import { resultsStore }      from "../results/store.js";
import { handle, sendSSEError, requireFields, ATPError, ErrorType } from "../utils/errors.js";

// ── List API sources ──────────────────────────────────────────────────────────
async function listApiSourcesRoute(req, res) {
  const postmanIntgs = integrationStore.getByType("postman");
  const swaggerIntgs = integrationStore.getByType("swagger");
  const sources = [];

  for (const p of postmanIntgs) {
    try {
      const headers = { "X-Api-Key": p.config.apiKey, Accept: "application/json" };
      const url     = p.config.workspaceId
        ? `https://api.getpostman.com/collections?workspace=${p.config.workspaceId}`
        : "https://api.getpostman.com/collections";
      const r = await fetch(url, { headers });
      if (!r.ok) throw new ATPError(`Postman returned ${r.status}`, ErrorType.EXTERNAL, { context:{ integration:p.name } });
      const { collections } = await r.json();
      sources.push({ integrationId:p.id, name:p.name, type:"postman",
        collections: (collections||[]).map(c => ({ id:c.uid, name:c.name })) });
    } catch (e) {
      sources.push({ integrationId:p.id, name:p.name, type:"postman", collections:[], error:e.message });
    }
  }
  for (const s of swaggerIntgs) {
    sources.push({ integrationId:s.id, name:s.name, type:"swagger", specUrl:s.config.specUrl||s.config.url||"" });
  }
  res.json({ ok:true, sources });
}

// ── Import spec ───────────────────────────────────────────────────────────────
async function importSpecRoute(req, res) {
  const { integrationId, collectionId, swaggerUrl, postmanJson, baseUrl } = req.body;
  let spec;

  if (integrationId) {
    const intg = integrationStore.get(integrationId);
    if (!intg) throw new ATPError("Integration not found", ErrorType.NOT_FOUND, { context:{ integrationId } });

    if (intg.type === "postman") {
      if (!collectionId) throw new ATPError("collectionId is required for Postman", ErrorType.VALIDATION);
      const headers = { "X-Api-Key":intg.config.apiKey, Accept:"application/json" };
      const r = await fetch(`https://api.getpostman.com/collections/${collectionId}`, { headers });
      if (!r.ok) throw new ATPError(`Postman returned ${r.status} fetching collection`, ErrorType.EXTERNAL, {
        context: { collectionId }, hint: "Check your Postman API key has the right permissions" });
      const { collection } = await r.json();
      spec = parsePostmanCollection(collection);
      if (baseUrl) spec.baseUrl = baseUrl;
    } else if (intg.type === "swagger") {
      const url = intg.config.specUrl || intg.config.url;
      if (!url) throw new ATPError("No spec URL configured for this Swagger integration", ErrorType.CONFIG,
        { hint: "Edit the integration and add a spec URL" });
      spec = await parseSwaggerUrl(url);
      if (baseUrl) spec.baseUrl = baseUrl;
    } else {
      throw new ATPError(`Integration type "${intg.type}" is not supported for API Agent`, ErrorType.VALIDATION,
        { hint: "Connect a Postman or Swagger integration in 🔗 Context → Integrations" });
    }
  } else if (swaggerUrl) {
    spec = await parseSwaggerUrl(swaggerUrl);
    if (baseUrl) spec.baseUrl = baseUrl;
  } else if (postmanJson) {
    try {
      const parsed = typeof postmanJson === "string" ? JSON.parse(postmanJson) : postmanJson;
      spec = parsePostmanCollection(parsed.collection || parsed);
      if (baseUrl) spec.baseUrl = baseUrl;
    } catch {
      throw new ATPError("Invalid Postman JSON — could not parse", ErrorType.PARSE,
        { hint: "Paste the full collection JSON exported from Postman" });
    }
  } else {
    throw new ATPError("Provide an integrationId, swaggerUrl, or postmanJson", ErrorType.VALIDATION);
  }

  res.json({ ok:true, spec });
}

// ── Build scenarios — SSE ─────────────────────────────────────────────────────
async function buildScenariosRoute(req, res) {
  const { spec, url, mode="quick", credentials, integrationId, collectionId } = req.body;
  if (!spec) throw new ATPError("spec is required", ErrorType.VALIDATION);

  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  res.setHeader("Access-Control-Allow-Origin","*");
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);

  try {
    const targetUrl = url || spec.baseUrl || "";
    send({ type:"log", msg:"◈ Gathering context from all integrations...", level:"ai" });

    const contextParts = [];
    if (targetUrl) {
      const urlCtx = await getContextSummary(targetUrl).catch(()=>"");
      if (urlCtx) { contextParts.push(urlCtx); send({ type:"log", msg:"✓ Integration context injected", level:"success" }); }
    }

    const jira       = integrationStore.getByType("jira");
    const confluence = integrationStore.getByType("confluence");
    const notion     = integrationStore.getByType("notion");
    if (jira.length)       send({ type:"log", msg:`  + Jira (${jira.length})`, level:"info" });
    if (confluence.length) send({ type:"log", msg:`  + Confluence (${confluence.length})`, level:"info" });
    if (notion.length)     send({ type:"log", msg:`  + Notion (${notion.length})`, level:"info" });

    const context   = contextParts.join("\n\n---\n\n");
    const modeLabel = mode === "deep" ? "deep full-coverage" : "quick critical-path";
    send({ type:"log", msg:`◈ Building ${modeLabel} scenarios for ${spec.endpoints?.length} endpoint(s)...`, level:"ai" });
    if (mode === "deep") send({ type:"log", msg:"  This may take 30-60s...", level:"info" });

    const scenarios = await buildScenarios(spec, credentials||{}, context, mode);
    console.log(`[agent/build] Generated ${scenarios.length} scenario(s) for ${spec.title}`);

    if (scenarios.length === 0) {
      send({ type:"log", msg:"✗ Claude returned 0 scenarios — likely a JSON parse error. Check backend terminal.", level:"error" });
      send({ type:"log", msg:"  Try again — this sometimes happens with very large specs (91 endpoints).", level:"warn" });
      send({ type:"log", msg:"  Consider using 'Deep' mode which uses a higher token limit.", level:"info" });
      send({ type:"error", msg:"No scenarios generated — Claude response could not be parsed" });
      res.end();
      return;
    }

    send({ type:"log", msg:`✓ Generated ${scenarios.length} scenario(s)`, level:"success" });

    const suite = scenarioStore.saveSuite({
      name:         `${spec.title} — ${mode==="deep"?"Deep":"Quick"} (${new Date().toLocaleDateString()})`,
      specTitle:    spec.title, specSource:spec.source, baseUrl:spec.baseUrl,
      mode, scenarios,
      spec: { title:spec.title, baseUrl:spec.baseUrl, source:spec.source, endpoints:spec.endpoints?.slice(0,100) },
      integrationId: integrationId||null, collectionId: collectionId||null,
    });

    send({ type:"log", msg:"✓ Suite saved", level:"success" });
    send({ type:"done", scenarios, suiteId:suite.id, contextUsed:!!context });
  } catch (err) {
    sendSSEError(res, err, { route:"agent/build", spec:spec?.title });
  }
  res.end();
}

// ── Suite CRUD ────────────────────────────────────────────────────────────────
async function listSuitesRoute(req, res) {
  res.json({ ok:true, suites:scenarioStore.listSuites() });
}

async function getSuiteRoute(req, res) {
  const suite = scenarioStore.getSuite(req.params.id);
  if (!suite) throw new ATPError("Suite not found", ErrorType.NOT_FOUND, { context:{ id:req.params.id } });
  res.json({ ok:true, suite });
}

async function deleteSuiteRoute(req, res) {
  scenarioStore.deleteSuite(req.params.id);
  res.json({ ok:true });
}

async function exportSuiteRoute(req, res) {
  const { format="json" } = req.query;
  const suite = scenarioStore.getSuite(req.params.id);
  if (!suite) throw new ATPError("Suite not found", ErrorType.NOT_FOUND);

  const { scenarios, spec } = suite;
  const safe = (suite.specTitle||"atp").replace(/[^a-z0-9]/gi,"-").toLowerCase();

  if (format === "postman") {
    const col = scenariosToPostmanCollection(scenarios, spec);
    res.setHeader("Content-Disposition", `attachment; filename="${safe}.postman_collection.json"`);
    return res.json(col);
  }
  if (format === "jest") {
    const code = scenariosToJestFile(scenarios, spec);
    res.setHeader("Content-Disposition", `attachment; filename="${safe}.test.js"`);
    res.setHeader("Content-Type","text/plain");
    return res.send(code);
  }
  res.setHeader("Content-Disposition", `attachment; filename="${safe}-scenarios.json"`);
  res.json({ suite:suite.name, specTitle:suite.specTitle, baseUrl:suite.baseUrl, scenarios });
}

// ── Run one scenario — SSE ────────────────────────────────────────────────────
async function runScenarioRoute(req, res) {
  const { scenario, spec, credentials, suiteId } = req.body;
  if (!scenario) throw new ATPError("scenario is required", ErrorType.VALIDATION);

  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  res.setHeader("Access-Control-Allow-Origin","*");
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);

  try {
    const result = await runScenario(scenario, spec?.baseUrl||"", credentials||{}, evt => {
      if (evt.type==="step") send({ type:"step", ...evt });
      else if (evt.type==="log") send({ type:"log", msg:evt.msg, level:evt.level||"info" });
    });
    if (suiteId) scenarioStore.updateSuiteResults(suiteId, scenario.id, result);
    const saved = resultsStore.save({
      type:"api", name:scenario.name, url:spec?.baseUrl||"",
      status:result.status, passed:result.passed||0, failed:result.failed||0,
      total:result.steps?.length||0, duration:result.duration||0,
      steps:result.steps||[], assertions:[],
      startedAt:new Date().toISOString(), completedAt:new Date().toISOString(),
    });
    send({ type:"done", result, runId:saved.id });
  } catch (err) {
    sendSSEError(res, err, { route:"agent/run", scenario:scenario?.name });
  }
  res.end();
}

// ── Run all — SSE ─────────────────────────────────────────────────────────────
async function runAllScenariosRoute(req, res) {
  const { scenarios, spec, credentials, filter="all", suiteId } = req.body;
  if (!scenarios?.length) throw new ATPError("scenarios array is required", ErrorType.VALIDATION);

  let toRun = scenarios;
  if (filter !== "all") toRun = toRun.filter(s =>
    s.priority?.toLowerCase()===filter || s.category?.toLowerCase().includes(filter)
  );

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
      const result = await runScenario(sc, spec?.baseUrl||"", credentials||{}, evt => {
        if (evt.type==="step") send({ type:"step", scenarioIndex:i, ...evt });
        else if (evt.type==="log") send({ type:"log", msg:evt.msg, level:evt.level||"info" });
      });
      if (suiteId) scenarioStore.updateSuiteResults(suiteId, sc.id, result);
      all.push({ ...result, name:sc.name });
      send({ type:"scenario_done", index:i, status:result.status, passed:result.passed||0, failed:result.failed||0 });
    } catch (err) {
      const classified = err instanceof ATPError ? err : new ATPError(err.message, ErrorType.INTERNAL);
      all.push({ name:sc.name, status:"error", error:classified.message, hint:classified.hint });
      send({ type:"scenario_done", index:i, status:"error", error:classified.message });
    }
  }

  const passed = all.filter(r=>r.status==="pass").length;
  resultsStore.save({
    type:"api-suite", name:`${spec?.title||"API"} Suite — ${toRun.length} scenarios`,
    url:spec?.baseUrl||"", status:all.length-passed===0?"pass":"fail",
    passed, failed:all.length-passed, total:toRun.length,
    steps:all.map(r=>({ description:r.name, status:r.status })), assertions:[],
    startedAt:new Date().toISOString(), completedAt:new Date().toISOString(),
  });

  send({ type:"suite_done", passed, failed:all.length-passed, total:toRun.length });
  res.end();
}

// ── Register ──────────────────────────────────────────────────────────────────
export function apiAgentRoutes(app) {
  app.get   ("/api/agent/sources",         handle("agent/sources",   listApiSourcesRoute));
  app.post  ("/api/agent/import",          handle("agent/import",    importSpecRoute));
  app.post  ("/api/agent/build",           handle("agent/build",     buildScenariosRoute));
  app.get   ("/api/agent/suites",          handle("agent/suites",    listSuitesRoute));
  app.get   ("/api/agent/suites/:id",      handle("agent/suites/:id",getSuiteRoute));
  app.delete("/api/agent/suites/:id",      handle("agent/suites/:id",deleteSuiteRoute));
  app.get   ("/api/agent/suites/:id/export", handle("agent/export",  exportSuiteRoute));
  app.post  ("/api/agent/run",             handle("agent/run",       runScenarioRoute));
  app.post  ("/api/agent/run-all",         handle("agent/run-all",   runAllScenariosRoute));
}
