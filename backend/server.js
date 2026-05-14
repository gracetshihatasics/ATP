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

// ── HTTP server ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// Health check
app.get("/health", (_, res) =>
  res.json({ ok: true, sessions: sessionManager.count() })
);

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
