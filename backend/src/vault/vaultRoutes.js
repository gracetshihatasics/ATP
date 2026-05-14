import { vaultStore } from "./store.js";

export function vaultRoutes(app) {
  // List all credentials (no secrets exposed)
  app.get("/api/vault", (_, res) => {
    res.json({ ok: true, credentials: vaultStore.list() });
  });

  // Get one credential with decrypted fields
  app.get("/api/vault/:id", (req, res) => {
    const entry = vaultStore.get(req.params.id);
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, credential: entry });
  });

  // Find credential for a URL
  app.get("/api/vault/match", (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "url query param required" });
    const entry = vaultStore.findForUrl(url);
    res.json({ ok: true, credential: entry });
  });

  // Create credential
  app.post("/api/vault", (req, res) => {
    const { name, environment, type, url, fields } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const entry = vaultStore.create({ name, environment, type, url, fields });
    res.json({ ok: true, credential: entry });
  });

  // Update credential
  app.put("/api/vault/:id", (req, res) => {
    const entry = vaultStore.update(req.params.id, req.body);
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, credential: entry });
  });

  // Delete credential
  app.delete("/api/vault/:id", (req, res) => {
    const deleted = vaultStore.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });
}
