import "dotenv/config";
import express          from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import cors             from "cors";
import crypto           from "crypto";

import { config }        from "./src/config/index.js";
import { messageRouter } from "./src/ws/messageRouter.js";
import { sessionManager } from "./src/ws/sessionManager.js";
import { send }          from "./src/ws/send.js";

import { discoverRoute, scenarioRoute }       from "./src/routes/aiRoutes.js";
import { advancedDiscoverRoute }              from "./src/routes/advancedDiscoveryRoute.js";
import { codeIntelligenceRoute }              from "./src/routes/codeIntelligenceRoute.js";
import { apiAgentRoutes }                     from "./src/routes/apiAgentRoutes.js";
import { vaultRoutes }                        from "./src/vault/vaultRoutes.js";
import { resultsRoutes }                      from "./src/results/routes.js";
import { webhookRoutes }                      from "./src/routes/webhookRoute.js";
import { integrationRoutes, mcpRoutes }       from "./src/routes/integrationRoutes.js";
import { testbedRoutes, testbedExportRoutes } from "./src/testbed/testbedRoutes.js";
import { urlRoutes }                          from "./src/routes/urlStore.js";
import { scheduleRoutes }                     from "./src/scheduler/scheduleRoutes.js";
import { startScheduler }                     from "./src/scheduler/scheduleRunner.js";
import { integrationStore }                   from "./src/integrations/integrationStore.js";
import { formatError, logError }              from "./src/utils/errors.js";

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
const httpServer = createServer(app);

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_, res) =>
  res.json({ ok: true, sessions: sessionManager.count(), hasApiKey: !!config.apiKey && config.apiKey.length > 10 })
);

app.get("/api/health/anthropic", async (_, res) => {
  if (!config.apiKey || config.apiKey.length < 10) {
    return res.json({ ok: false, error: "ANTHROPIC_API_KEY not set in backend/.env", model: config.model });
  }
  try {
    const https  = await import("https");
    const result = await new Promise((resolve, reject) => {
      const body = JSON.stringify({ model: config.model, max_tokens: 5, messages: [{ role: "user", content: "Hi" }] });
      const req  = https.default.request({
        hostname: "api.anthropic.com", port: 443, path: "/v1/messages", method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": config.apiKey, "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(body) },
      }, (r) => {
        let data = "";
        r.on("data", c => { data += c; });
        r.on("end", () => resolve({ status: r.statusCode, body: data }));
      });
      req.on("error", reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
      req.write(body); req.end();
    });
    const parsed  = JSON.parse(result.body);
    if (result.status === 200) return res.json({ ok: true, model: config.model });
    const errType = result.status === 401 ? "invalid-key" : result.status === 403 ? "invalid-key" : result.status === 429 ? "quota" : "unknown";
    res.json({ ok: false, error: parsed.error?.message || result.body, errorType: errType, model: config.model });
  } catch (err) {
    console.error("[health/anthropic] FAIL:", err.message);
    res.json({ ok: false, error: err.message, errorType: "network", model: config.model });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.post("/api/discover",          discoverRoute);
app.post("/api/discover/advanced", advancedDiscoverRoute);
app.post("/api/code-intelligence", codeIntelligenceRoute);
app.post("/api/scenario",          scenarioRoute);

apiAgentRoutes(app);
vaultRoutes(app);
resultsRoutes(app);
webhookRoutes(app);
integrationRoutes(app);
mcpRoutes(app);
testbedRoutes(app);
testbedExportRoutes(app);
urlRoutes(app);
scheduleRoutes(app);

// ── Scheduler ─────────────────────────────────────────────────────────────────
startScheduler();

// ── Startup log ───────────────────────────────────────────────────────────────
setTimeout(() => {
  console.log(`[ATP] Integrations stored: ${integrationStore.count()}`);
}, 500);

// ── WebSocket ─────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", (ws) => {
  const sessionId = crypto.randomUUID();
  ws.sessionId = sessionId;
  console.log(`[WS] +  ${sessionId}`);
  ws.on("message", async (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    await messageRouter(ws, sessionId, msg);
  });
  ws.on("close", () => { sessionManager.destroy(sessionId); console.log(`[WS] -  ${sessionId}`); });
  send(ws, { type: "connected", sessionId });
});

// ── Global error handler — catches anything that slips through ────────────────
app.use((err, req, res, next) => {
  logError(err, { route: req.path, method: req.method });
  const { status, body } = formatError(err, { route: req.path });
  if (!res.headersSent) res.status(status).json(body);
});

// ── 404 handler ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok:false, error:`Route not found: ${req.method} ${req.path}`, type:"not_found" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(config.port, () => {
  console.log(`\n🤖  ATP Backend  →  http://localhost:${config.port}`);
  console.log(`📡  WebSocket    →  ws://localhost:${config.port}\n`);
  if (!config.apiKey) console.warn("⚠️   ANTHROPIC_API_KEY is not set — AI features will fail.\n");
});
