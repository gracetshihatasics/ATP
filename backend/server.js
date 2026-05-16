import "dotenv/config";
import express     from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import cors        from "cors";
import crypto      from "crypto";
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
import { vaultRoutes }   from "./src/vault/vaultRoutes.js";
import { resultsRoutes } from "./src/results/routes.js";
import { webhookRoutes } from "./src/routes/webhookRoute.js";

// ── HTTP server ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// Health check
app.get("/health", (_, res) =>
  res.json({ ok: true, sessions: sessionManager.count() })
);

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
