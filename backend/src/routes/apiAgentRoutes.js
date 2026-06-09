import { parseSwaggerUrl, parsePostmanCollection } from "../api/swaggerParser.js";
import { buildScenarios, scenariosToPostmanCollection, scenariosToJestFile } from "../api/scenarioBuilder.js";
import { integrationStore }  from "../integrations/integrationStore.js";
import { getContextSummary } from "../integrations/contextBuilder.js";
import { scenarioStore }     from "../api/scenarioStore.js";
import { runStore }          from "../api/runStore.js";
import { startRun, startSuiteRun, subscribe } from "../api/runExecutor.js";
import { handle, sendSSEError, ATPError, ErrorType } from "../utils/errors.js";

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
      if (!r.ok) throw new ATPError(`Postman returned ${r.status}`, ErrorType.EXTERNAL);
      const { collections } = await r.json();
      sources.push({ integrationId:p.id, name:p.name, type:"postman",
        collections:(collections||[]).map(c => ({ id:c.uid, name:c.name })) });
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
      if (!collectionId) throw new ATPError("collectionId required for Postman", ErrorType.VALIDATION);
      const headers = { "X-Api-Key":intg.config.apiKey, Accept:"application/json" };
      const r = await fetch(`https://api.getpostman.com/collections/${collectionId}`, { headers });
      if (!r.ok) throw new ATPError(`Postman returned ${r.status}`, ErrorType.EXTERNAL, { hint:"Check your API key permissions" });
      const { collection } = await r.json();
      spec = parsePostmanCollection(collection);
      if (baseUrl) spec.baseUrl = baseUrl;
    } else if (intg.type === "swagger") {
      const url = intg.config.specUrl || intg.config.url;
      if (!url) throw new ATPError("No spec URL in this integration", ErrorType.CONFIG);
      spec = await parseSwaggerUrl(url);
      if (baseUrl) spec.baseUrl = baseUrl;
    } else {
      throw new ATPError(`Integration type "${intg.type}" not supported here`, ErrorType.VALIDATION,
        { hint:"Use a Postman or Swagger integration" });
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
      throw new ATPError("Invalid Postman JSON", ErrorType.PARSE, { hint:"Paste the full collection JSON" });
    }
  } else {
    throw new ATPError("Provide integrationId, swaggerUrl, or postmanJson", ErrorType.VALIDATION);
  }

  res.json({ ok:true, spec });
}

// ── Build scenarios — SSE ─────────────────────────────────────────────────────
async function buildScenariosRoute(req, res) {
  const { spec, url, mode="quick", credentials, integrationId, collectionId } = req.body;
  if (!spec) throw new ATPError("spec required", ErrorType.VALIDATION);

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
      send({ type:"log", msg:"✗ 0 scenarios generated — JSON parse failed. Check backend terminal.", level:"error" });
      send({ type:"error", msg:"No scenarios generated" });
      res.end(); return;
    }

    send({ type:"log", msg:`✓ Generated ${scenarios.length} scenario(s)`, level:"success" });

    const suite = scenarioStore.saveSuite({
      name:`${spec.title} — ${mode==="deep"?"Deep":"Quick"} (${new Date().toLocaleDateString()})`,
      specTitle:spec.title, specSource:spec.source, baseUrl:spec.baseUrl, mode, scenarios,
      spec:{ title:spec.title, baseUrl:spec.baseUrl, source:spec.source, endpoints:spec.endpoints?.slice(0,100) },
      integrationId:integrationId||null, collectionId:collectionId||null,
    });

    send({ type:"log", msg:"✓ Suite saved", level:"success" });
    send({ type:"done", scenarios, suiteId:suite.id, contextUsed:!!context });
  } catch (err) {
    sendSSEError(res, err, { route:"agent/build", spec:spec?.title });
  }
  res.end();
}

// ── Suite CRUD ────────────────────────────────────────────────────────────────
async function listSuitesRoute(req, res) { res.json({ ok:true, suites:scenarioStore.listSuites() }); }

async function getSuiteRoute(req, res) {
  const suite = scenarioStore.getSuite(req.params.id);
  if (!suite) throw new ATPError("Suite not found", ErrorType.NOT_FOUND);
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
    res.setHeader("Content-Disposition",`attachment; filename="${safe}.postman_collection.json"`);
    return res.json(scenariosToPostmanCollection(scenarios, spec));
  }
  if (format === "jest") {
    res.setHeader("Content-Disposition",`attachment; filename="${safe}.test.js"`);
    res.setHeader("Content-Type","text/plain");
    return res.send(scenariosToJestFile(scenarios, spec));
  }
  res.setHeader("Content-Disposition",`attachment; filename="${safe}-scenarios.json"`);
  res.json({ suite:suite.name, specTitle:suite.specTitle, baseUrl:suite.baseUrl, scenarios });
}

// ── START a run (background — survives navigation) ────────────────────────────
async function startRunRoute(req, res) {
  const { scenario, spec, credentials, suiteId } = req.body;
  if (!scenario) throw new ATPError("scenario required", ErrorType.VALIDATION);

  const run = runStore.create({
    suiteId, scenarioId:scenario.id,
    scenarioName:scenario.name,
    specBaseUrl:spec?.baseUrl||"",
    mode:"single",
  });

  // Start in background — returns immediately
  startRun(run.id, { scenario:{ ...scenario, _suiteId:suiteId }, spec, credentials });

  res.json({ ok:true, runId:run.id });
}

// ── START a suite run (background) ───────────────────────────────────────────
async function startSuiteRunRoute(req, res) {
  const { scenarios, spec, credentials, filter="all", suiteId } = req.body;
  if (!scenarios?.length) throw new ATPError("scenarios required", ErrorType.VALIDATION);

  const run = runStore.create({
    suiteId, scenarioId:null,
    scenarioName:`Suite (${scenarios.length} scenarios)`,
    specBaseUrl:spec?.baseUrl||"",
    mode:"suite",
  });

  startSuiteRun(run.id, { scenarios, spec, credentials, filter, suiteId });

  res.json({ ok:true, runId:run.id });
}

// ── SSE: subscribe to a run's live updates ────────────────────────────────────
async function subscribeRunRoute(req, res) {
  const { id } = req.params;
  const run = runStore.get(id);
  if (!run) return res.status(404).json({ error:"Run not found" });

  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  res.setHeader("Access-Control-Allow-Origin","*");

  const unsubscribe = subscribe(id, res);

  // If run is already done, send final state and close
  if (["done","failed","cancelled"].includes(run.status)) {
    res.write(`data: ${JSON.stringify({ type:"snapshot", run })}\n\n`);
    res.write(`data: ${JSON.stringify({ type:"done", run })}\n\n`);
    res.end();
    return;
  }

  req.on("close", unsubscribe);
}

// ── GET run state ─────────────────────────────────────────────────────────────
async function getRunRoute(req, res) {
  const run = runStore.get(req.params.id);
  if (!run) return res.status(404).json({ error:"Run not found" });
  res.json({ ok:true, run });
}

// ── List all runs ─────────────────────────────────────────────────────────────
async function listRunsRoute(req, res) {
  const { suiteId } = req.query;
  let runs = runStore.list();
  if (suiteId) runs = runs.filter(r => r.suiteId === suiteId);
  res.json({ ok:true, runs });
}

// ── Cancel a run ──────────────────────────────────────────────────────────────
async function cancelRunRoute(req, res) {
  const run = runStore.get(req.params.id);
  if (!run) return res.status(404).json({ error:"Run not found" });
  runStore.cancel(req.params.id);
  res.json({ ok:true });
}

// ── Delete a run ──────────────────────────────────────────────────────────────
async function deleteRunRoute(req, res) {
  runStore.delete(req.params.id);
  res.json({ ok:true });
}

// ── Register all routes ───────────────────────────────────────────────────────
export function apiAgentRoutes(app) {
  // Spec & suites
  app.get   ("/api/agent/sources",           handle("agent/sources",   listApiSourcesRoute));
  app.post  ("/api/agent/import",            handle("agent/import",    importSpecRoute));
  app.post  ("/api/agent/build",             handle("agent/build",     buildScenariosRoute));
  app.get   ("/api/agent/suites",            handle("agent/suites",    listSuitesRoute));
  app.get   ("/api/agent/suites/:id",        handle("agent/suites/:id",getSuiteRoute));
  app.delete("/api/agent/suites/:id",        handle("agent/suites/:id",deleteSuiteRoute));
  app.get   ("/api/agent/suites/:id/export", handle("agent/export",    exportSuiteRoute));

  // Runs — background execution
  app.post  ("/api/agent/runs",              handle("agent/runs/start", startRunRoute));
  app.post  ("/api/agent/runs/suite",        handle("agent/runs/suite", startSuiteRunRoute));
  app.get   ("/api/agent/runs",              handle("agent/runs/list",  listRunsRoute));
  app.get   ("/api/agent/runs/:id",          handle("agent/runs/:id",   getRunRoute));
  app.get   ("/api/agent/runs/:id/stream",   subscribeRunRoute);  // SSE — no handle() wrapper
  app.post  ("/api/agent/runs/:id/cancel",   handle("agent/runs/cancel",cancelRunRoute));
  app.delete("/api/agent/runs/:id",          handle("agent/runs/delete",deleteRunRoute));
}
