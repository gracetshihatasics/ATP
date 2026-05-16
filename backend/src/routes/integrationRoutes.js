import { integrationStore } from "../integrations/integrationStore.js";
import { syncIntegration, buildContext, extractTestData } from "../integrations/contextBuilder.js";
import { validateTestAgainstContext } from "../integrations/testContextValidator.js";

export function integrationRoutes(app) {

  // ── List all integrations ──────────────────────────────────────────────────
  app.get("/api/integrations", (_, res) => {
    res.json({ ok: true, integrations: integrationStore.list() });
  });

  // ── Get one integration (masked secrets) ───────────────────────────────────
  app.get("/api/integrations/:id", (req, res) => {
    const int = integrationStore.get(req.params.id);
    if (!int) return res.status(404).json({ error: "Not found" });
    // Mask secrets before sending
    const masked = { ...int, config: Object.fromEntries(
      Object.entries(int.config).map(([k, v]) =>
        ["password","apiToken","token","secret","connectionString"].some(s => k.toLowerCase().includes(s))
          ? [k, v ? "••••••••" : ""]
          : [k, v]
      )
    )};
    res.json({ ok: true, integration: masked });
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
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // ── Build full context for a URL ───────────────────────────────────────────
  app.get("/api/integrations/context", async (req, res) => {
    const { url, goal } = req.query;
    try {
      const ctx = await buildContext(url || "", goal || "");
      res.json({ ok: true, context: ctx });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
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
      res.status(500).json({ ok: false, error: err.message });
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
      res.status(500).json({ ok: false, error: err.message });
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
