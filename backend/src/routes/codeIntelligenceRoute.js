import { launchBrowser }           from "../browser/launcher.js";
import { scanPageCodeIntelligence } from "../browser/codeIntelligence.js";
import { handlePopups }            from "../browser/popupHandler.js";
import { waitUntilReady }          from "../browser/smartObserver.js";

/**
 * POST /api/code-intelligence
 * Body: { url, pages?: string[] }
 * Scans a URL (and optionally multiple pages) for hidden/dead code.
 * Streams SSE events.
 */
export async function codeIntelligenceRoute(req, res) {
  const { url, pages = [] } = req.body;
  if (!url) return res.status(400).json({ error: "url required" });

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let browser;
  try {
    send({ type: "log", msg: "Launching scanner...", level: "system" });
    const { browser: b, page } = await launchBrowser(
      (msg) => send({ type: "log", msg, level: "info" })
    );
    browser = b;

    const allPages  = [url, ...pages.filter(p => p !== url)];
    const allResults = [];

    for (const pageUrl of allPages) {
      send({ type: "log", msg: `Scanning: ${pageUrl}`, level: "info" });
      send({ type: "page_start", url: pageUrl });

      try {
        await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await waitUntilReady(page, {
          maxWait: 8000, pollMs: 500,
          onLog: (msg) => send({ type: "log", msg, level: "info" }),
        });
        await handlePopups(page, (msg) => send({ type: "log", msg, level: "info" }));

        send({ type: "log", msg: "◈ Analysing DOM for hidden/dead code...", level: "ai" });
        const result = await scanPageCodeIntelligence(page, pageUrl, { pageName: pageUrl });

        allResults.push({ url: pageUrl, ...result });
        send({ type: "page_result", url: pageUrl, result });

        if (result.findings?.length) {
          send({ type: "log", msg: `Found ${result.findings.length} issue(s) on ${pageUrl}`, level: result.overallHealth === "critical" ? "error" : "warn" });
        } else {
          send({ type: "log", msg: `✓ Clean: ${pageUrl}`, level: "success" });
        }
      } catch (err) {
        send({ type: "log", msg: `Error scanning ${pageUrl}: ${err.message}`, level: "error" });
      }
    }

    // Aggregate summary
    const totalFindings  = allResults.reduce((s, r) => s + (r.findings?.length || 0), 0);
    const criticalCount  = allResults.flatMap(r => r.findings || []).filter(f => f.severity === "critical").length;
    const ignorableCount = allResults.flatMap(r => r.findings || []).filter(f => f.testDecision === "ignore-always" || f.testDecision === "skip").length;

    send({
      type: "scan_complete",
      totalPages:    allPages.length,
      totalFindings,
      criticalCount,
      ignorableCount,
      results:       allResults,
    });

  } catch (err) {
    send({ type: "error", msg: err.message });
  } finally {
    await browser?.close().catch(() => {});
    res.end();
  }
}
