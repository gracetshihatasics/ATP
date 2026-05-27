import "dotenv/config";
import express     from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import cors        from "cors";
import crypto      from "crypto";

// ── Proxy / TLS fix — apply before any network calls ──────────────────────────
// If HTTPS_PROXY or NODE_TLS_REJECT_UNAUTHORIZED is set in .env it takes effect here
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
import { config }  from "./src/config/index.js";
import { messageRouter } from "./src/ws/messageRouter.js";
import { sessionManager } from "./src/ws/sessionManager.js";
import { send }    from "./src/ws/send.js";
import { discoverRoute, scenarioRoute } from "./src/routes/aiRoutes.js";
import { advancedDiscoverRoute }        from "./src/routes/advancedDiscoveryRoute.js";
import { codeIntelligenceRoute }        from "./src/routes/codeIntelligenceRoute.js";
import {
  importSpecRoute,
  buildScenariosRoute,
  runScenarioRoute,
  runAllScenariosRoute,
  getResultsRoute,
} from "./src/routes/apiAgentRoutes.js";
import { vaultRoutes }        from "./src/vault/vaultRoutes.js";
import { resultsRoutes }      from "./src/results/routes.js";
import { webhookRoutes }      from "./src/routes/webhookRoute.js";
import { integrationRoutes, mcpRoutes } from "./src/routes/integrationRoutes.js";
import { testbedRoutes, testbedExportRoutes } from "./src/testbed/testbedRoutes.js";
import { urlRoutes }                          from "./src/routes/urlStore.js";

// ── HTTP server ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// Health check
app.get("/health", (_, res) =>
  res.json({ ok: true, sessions: sessionManager.count(), hasApiKey: !!config.apiKey && config.apiKey.length > 10 })
);

// Diagnose Anthropic connection
app.get("/api/health/anthropic", async (_, res) => {
  if (!config.apiKey || config.apiKey.length < 10) {
    return res.json({ ok: false, error: "ANTHROPIC_API_KEY not set in backend/.env", model: config.model });
  }
  try {
    const https  = await import("https");
    const result = await new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: config.model, max_tokens: 5,
        messages: [{ role: "user", content: "Hi" }],
      });
      const req = https.default.request({
        hostname: "api.anthropic.com", port: 443, path: "/v1/messages", method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key":    config.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(body),
        },
      }, (r) => {
        let data = "";
        r.on("data", c => { data += c; });
        r.on("end", () => resolve({ status: r.statusCode, body: data }));
      });
      req.on("error", reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error("Timeout")); });
      req.write(body); req.end();
    });

    const parsed = JSON.parse(result.body);
    if (result.status === 200) {
      res.json({ ok: true, model: config.model });
    } else {
      const errType =
        result.status === 401 ? "invalid-key" :
        result.status === 403 ? "invalid-key" :
        result.status === 429 ? "quota" : "unknown";
      res.json({ ok: false, error: parsed.error?.message || result.body, errorType: errType, model: config.model });
    }
  } catch (err) {
    console.error("[health/anthropic] FAIL:", err.message);
    res.json({ ok: false, error: err.message, errorType: "network", model: config.model });
  }
});

// AI routes — proxied from frontend to avoid CORS
app.post("/api/discover",             discoverRoute);
app.post("/api/discover/advanced",    advancedDiscoverRoute);
app.post("/api/code-intelligence",    codeIntelligenceRoute);
app.post("/api/scenario",             scenarioRoute);

// API Agent routes
app.post("/api/agent/import",         importSpecRoute);
app.post("/api/agent/build",          buildScenariosRoute);
app.post("/api/agent/run",            runScenarioRoute);
app.post("/api/agent/run-all",        runAllScenariosRoute);
app.get( "/api/agent/results/:runId", getResultsRoute);

// Vault routes
vaultRoutes(app);

// Results routes
resultsRoutes(app);

// Git / webhook routes
webhookRoutes(app);

// Integration routes
integrationRoutes(app);
mcpRoutes(app);

// Testbed routes
testbedRoutes(app);
testbedExportRoutes(app);

// URL store
urlRoutes(app);

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const sessionId = crypto.randomUUID();
  ws.sessionId = sessionId;
  console.log(`[WS] +  ${sessionId}`);

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    await messageRouter(ws, sessionId, msg);
  });

  ws.on("close", () => {
    sessionManager.destroy(sessionId);
    console.log(`[WS] -  ${sessionId}`);
  });

  send(ws, { type: "connected", sessionId });
});

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(config.port, () => {
  console.log(`\n🤖  ATP Backend  →  http://localhost:${config.port}`);
  console.log(`📡  WebSocket    →  ws://localhost:${config.port}\n`);
  if (!config.apiKey) {
    console.warn("⚠️   ANTHROPIC_API_KEY is not set — AI features will fail.\n");
  }
});
