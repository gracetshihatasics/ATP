import { runAdvancedDiscovery } from "../discovery/deepDiscovery.js";

/**
 * POST /api/discover/advanced
 * Body: { url, credentialId }
 * Streams SSE events for each phase, ends with the full plan.
 */
export async function advancedDiscoverRoute(req, res) {
  const { url, credentialId } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await runAdvancedDiscovery(url, credentialId ?? null, send);
    send({ type: "done", plan: result.plan, duration: result.duration });
  } catch (err) {
    send({ type: "error", msg: err.message });
  } finally {
    res.end();
  }
}
