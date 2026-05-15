import { vaultStore } from "./store.js";

export function vaultRoutes(app) {
  // List all (credentials + sets)
  app.get("/api/vault", (_, res) =>
    res.json({ ok: true, credentials: vaultStore.list() })
  );

  // Get one (decrypted)
  app.get("/api/vault/:id", (req, res) => {
    const entry = vaultStore.get(req.params.id);
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, credential: entry });
  });

  // Find for URL
  app.get("/api/vault/match", (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url required" });
    res.json({ ok: true, credential: vaultStore.findForUrl(url) });
  });

  // Resolve context for injection into test runner
  app.get("/api/vault/:id/context", (req, res) => {
    const ctx = vaultStore.resolveContext(req.params.id);
    res.json({ ok: true, context: ctx });
  });

  // ── Single credential ───────────────────────────────────────────────────────
  app.post("/api/vault", (req, res) => {
    const { name, environment, type, url, fields } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    res.json({ ok: true, credential: vaultStore.create({ name, environment, type, url, fields }) });
  });

  app.put("/api/vault/:id", (req, res) => {
    const entry = vaultStore.update(req.params.id, req.body);
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, credential: entry });
  });

  app.delete("/api/vault/:id", (req, res) => {
    if (!vaultStore.delete(req.params.id)) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  // ── Credential sets ─────────────────────────────────────────────────────────
  app.post("/api/vault/sets", (req, res) => {
    const { name, environment, url, users } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    res.json({ ok: true, credential: vaultStore.createSet({ name, environment, url, users }) });
  });

  app.put("/api/vault/sets/:id", (req, res) => {
    const entry = vaultStore.updateSet(req.params.id, req.body);
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, credential: entry });
  });
}
