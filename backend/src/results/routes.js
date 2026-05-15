import { resultsStore }              from "../results/store.js";
import { toJUnitXML, toAllureJSON, toJSONSummary } from "../results/ciExport.js";

export function resultsRoutes(app) {

  // ── List runs ──────────────────────────────────────────────────────────────
  app.get("/api/results", (req, res) => {
    const { limit, offset, type, status, url } = req.query;
    const result = resultsStore.getAll({
      limit:  parseInt(limit)  || 50,
      offset: parseInt(offset) || 0,
      type, status, url,
    });
    res.json({ ok: true, ...result });
  });

  // ── Summary stats ──────────────────────────────────────────────────────────
  app.get("/api/results/summary", (_, res) => {
    res.json({ ok: true, summary: resultsStore.getSummary() });
  });

  // ── Trend for one test ─────────────────────────────────────────────────────
  app.get("/api/results/trend", (req, res) => {
    const { name, days } = req.query;
    if (!name) return res.status(400).json({ error: "name required" });
    res.json({ ok: true, trend: resultsStore.getTrend(name, parseInt(days) || 14) });
  });

  // ── Get single run ─────────────────────────────────────────────────────────
  app.get("/api/results/:id", (req, res) => {
    const run = resultsStore.getById(req.params.id);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json({ ok: true, run });
  });

  // ── Save a run manually (also called internally) ───────────────────────────
  app.post("/api/results", (req, res) => {
    const run = resultsStore.save(req.body);
    res.json({ ok: true, run });
  });

  // ── Delete a run ───────────────────────────────────────────────────────────
  app.delete("/api/results/:id", (req, res) => {
    resultsStore.delete(req.params.id);
    res.json({ ok: true });
  });

  // ── CI Export: JUnit XML ───────────────────────────────────────────────────
  app.get("/api/results/export/junit", (req, res) => {
    const { limit, url, name } = req.query;
    const { records } = resultsStore.getAll({ limit: parseInt(limit) || 100, url });
    const filtered = name ? records.filter(r => r.name.includes(name)) : records;
    const xml = toJUnitXML(filtered, req.query.suite || "ATP");
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Content-Disposition", 'attachment; filename="atp-results.xml"');
    res.send(xml);
  });

  // ── CI Export: Allure JSON ─────────────────────────────────────────────────
  app.get("/api/results/export/allure", (req, res) => {
    const { limit } = req.query;
    const { records } = resultsStore.getAll({ limit: parseInt(limit) || 100 });
    res.json(toAllureJSON(records));
  });

  // ── CI Export: JSON summary ────────────────────────────────────────────────
  app.get("/api/results/export/summary", (req, res) => {
    const { limit } = req.query;
    const { records } = resultsStore.getAll({ limit: parseInt(limit) || 100 });
    res.json(toJSONSummary(records, req.query.suite || "ATP"));
  });

  // ── Clear all results ──────────────────────────────────────────────────────
  app.delete("/api/results", (req, res) => {
    resultsStore.clearAll();
    res.json({ ok: true });
  });
}
