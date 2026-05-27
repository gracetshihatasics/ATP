import { handle, sendSSEError, ATPError, ErrorType, logError } from "../utils/errors.js";
import { integrationStore } from "../integrations/integrationStore.js";
import { syncIntegration, buildContext, extractTestData } from "../integrations/contextBuilder.js";
import { validateTestAgainstContext } from "../integrations/testContextValidator.js";

export function integrationRoutes(app) {

  // ── List all integrations ──────────────────────────────────────────────────
  app.get("/api/integrations", (_, res) => {
    res.json({ ok: true, integrations: integrationStore.list() });
  });

  // ── Get one integration (sensitive fields masked, URLs shown) ────────────────
  app.get("/api/integrations/:id", (req, res) => {
    const int = integrationStore.getForDisplay(req.params.id);
    if (!int) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, integration: int });
  });

  // ── Save integration ───────────────────────────────────────────────────────
  app.post("/api/integrations", (req, res) => {
    const saved = integrationStore.save(req.body);
    res.json({ ok: true, integration: saved });
  });

  app.put("/api/integrations/:id", (req, res) => {
    const saved = integrationStore.save({ ...req.body, id: req.params.id });
    res.json({ ok: true, integration: saved });
  });

  // ── Delete integration ─────────────────────────────────────────────────────
  app.delete("/api/integrations/:id", (req, res) => {
    integrationStore.delete(req.params.id);
    res.json({ ok: true });
  });

  // ── Test / sync one integration ────────────────────────────────────────────
  app.post("/api/integrations/:id/sync", async (req, res) => {
    try {
      const data = await syncIntegration(req.params.id);
      res.json({ ok: true, data, summary: data.summary });
    } catch (err) {
      integrationStore.updateStatus(req.params.id, "error", err.message);
      res.status(400).json({ ok:false, error:err.message, type:"validation" });
    }
  });

  // ── Build full context for a URL ───────────────────────────────────────────
  app.get("/api/integrations/context", async (req, res) => {
    const { url, goal } = req.query;
    try {
      const ctx = await buildContext(url || "", goal || "");
      res.json({ ok: true, context: ctx });
    } catch (err) {
      res.status(500).json({ ok:false, error:err.message, type:"internal" });
    }
  });

  // ── Extract test data for a use case ──────────────────────────────────────
  app.post("/api/integrations/test-data", async (req, res) => {
    const { url, useCase } = req.body;
    try {
      const ctx    = await buildContext(url || "");
      const result = await extractTestData(ctx, useCase);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok:false, error:err.message, type:"internal" });
    }
  });

  // ── Validate a failing test against current context ───────────────────────
  app.post("/api/integrations/validate-test", async (req, res) => {
    const { run } = req.body;
    if (!run) return res.status(400).json({ error: "run required" });
    try {
      const result = await validateTestAgainstContext(run);
      res.json({ ok: true, validation: result });
    } catch (err) {
      res.status(500).json({ ok:false, error:err.message, type:"internal" });
    }
  });

  // ── Toggle enabled ─────────────────────────────────────────────────────────
  app.post("/api/integrations/:id/toggle", (req, res) => {
    const int = integrationStore.get(req.params.id);
    if (!int) return res.status(404).json({ error: "Not found" });
    integrationStore.save({ ...int, enabled: !int.enabled });
    res.json({ ok: true });
  });
}

// ── MCP setup info ─────────────────────────────────────────────────────────
export function mcpRoutes(app) {
  app.get("/api/mcp/setup", async (req, res) => {
    const { fileURLToPath } = await import("url");
    const path = await import("path");
    const fs   = await import("fs");

    const __dirname  = path.dirname(fileURLToPath(import.meta.url));
    // routes → src → backend, then mcp-server.js sits in backend/
    const serverPath = path.resolve(__dirname, "../../../mcp-server.js");
    const nodePath   = process.execPath;

    const mcpConfig = {
      mcpServers: {
        atp: {
          command: nodePath,
          args:    [serverPath],
          env: {
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "sk-ant-***" : "YOUR_API_KEY_HERE",
            PORT: process.env.PORT || "3579",
          },
        },
      },
    };

    // Try to detect Claude Desktop config file
    const homeDir     = process.env.HOME || process.env.USERPROFILE || "~";
    const macPath     = `${homeDir}/Library/Application Support/Claude/claude_desktop_config.json`;
    const winPath     = `${process.env.APPDATA || homeDir}\\Claude\\claude_desktop_config.json`;
    const configPath  = process.platform === "win32" ? winPath : macPath;
    const configExists = fs.existsSync(configPath);

    res.json({
      ok:          true,
      serverPath,
      nodePath,
      configPath,
      configExists,
      mcpConfig,
      tools:       [
        "discover_usecases",
        "run_usecase",
        "run_suite",
        "get_results",
        "analyse_failure",
        "list_credentials",
        "get_context",
        "update_tests_from_diff",
        "scan_code_intelligence",
      ],
      examplePrompts: [
        "Discover test cases for https://asics.com",
        "Run the checkout test suite on https://staging.asics.com",
        "What test results failed recently?",
        "Analyse why run-abc123 failed",
        "What credentials do I have in the vault?",
        "Scan https://asics.com for hidden code",
        "Update tests based on this git diff: ...",
      ],
    });
  });

  // Write config directly to Claude Desktop
  app.post("/api/mcp/install", async (req, res) => {
    const fs   = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");

    const __dirname  = path.dirname(fileURLToPath(import.meta.url));
    // src/routes → src → backend → mcp-server.js
    const serverPath = path.resolve(__dirname, "../../mcp-server.js");
    const homeDir    = process.env.HOME || process.env.USERPROFILE || "";
    const configPath = process.platform === "win32"
      ? `${process.env.APPDATA}\\Claude\\claude_desktop_config.json`
      : `${homeDir}/Library/Application Support/Claude/claude_desktop_config.json`;

    try {
      let existing = {};
      if (fs.existsSync(configPath)) {
        existing = JSON.parse(fs.readFileSync(configPath, "utf8"));
      }

      if (!existing.mcpServers) existing.mcpServers = {};
      existing.mcpServers.atp = {
        command: process.execPath,
        args:    [serverPath],
        env: {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
          PORT:              process.env.PORT || "3579",
        },
      };

      // Ensure directory exists
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), "utf8");
      res.json({ ok: true, configPath, message: "ATP added to Claude Desktop. Restart Claude Desktop to apply." });
    } catch (err) {
      res.status(500).json({ ok:false, error:err.message, type:"internal" });
    }
  });
}
