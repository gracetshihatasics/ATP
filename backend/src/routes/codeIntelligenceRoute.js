import { launchBrowser }            from "../browser/launcher.js";
import { scanPageCodeIntelligence } from "../browser/codeIntelligence.js";
import { handlePopups }             from "../browser/popupHandler.js";
import { waitUntilReady }           from "../browser/smartObserver.js";

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
    send({ type:"log", msg:"Launching deep scanner...", level:"system" });
    const { browser: b, page } = await launchBrowser(
      (msg) => send({ type:"log", msg, level:"info" })
    );
    browser = b;

    // ── Attach listeners BEFORE navigation ──────────────────────────────────
    const consoleMessages = [];
    const networkFailed   = [];
    const networkRequests = new Map();

    page.on("console", msg => {
      if (["error","warning"].includes(msg.type())) {
        consoleMessages.push({ type: msg.type(), text: msg.text().slice(0, 150) });
      }
    });

    page.on("pageerror", err => {
      consoleMessages.push({ type:"pageerror", text: err.message?.slice(0,150) });
    });

    page.on("requestfailed", req => {
      networkFailed.push({
        url:    req.url().split("?")[0].slice(-80),
        method: req.method(),
        reason: req.failure()?.errorText || "unknown",
      });
    });

    page.on("response", res => {
      if (res.status() >= 400) {
        networkFailed.push({
          url:    res.url().split("?")[0].slice(-80),
          status: res.status(),
          method: res.request().method(),
        });
      }
      const url = res.url();
      networkRequests.set(url, (networkRequests.get(url) || 0) + 1);
    });

    const allPages  = [url, ...pages.filter(p => p !== url)];
    const allResults = [];

    for (const pageUrl of allPages) {
      send({ type:"log", msg:`Scanning: ${pageUrl}`, level:"info" });
      send({ type:"page_start", url: pageUrl });
      send({ type:"log", msg:"Layer 1: DOM analysis...", level:"info" });

      try {
        await page.goto(pageUrl, { waitUntil:"domcontentloaded", timeout:30_000 });
        await waitUntilReady(page, {
          maxWait: 8000, pollMs:500,
          onLog: (msg) => send({ type:"log", msg, level:"info" }),
        });
        await handlePopups(page, (msg) => send({ type:"log", msg, level:"info" }));
        // Wait for any lazy content
        await page.waitForTimeout(1500);

        send({ type:"log", msg:"Layer 2: JavaScript runtime...", level:"info" });
        send({ type:"log", msg:"Layer 3: Network analysis...", level:"info" });
        send({ type:"log", msg:"Layer 4: Navigation deep scan...", level:"info" });
        send({ type:"log", msg:"Layer 5: Accessibility audit...", level:"info" });
        send({ type:"log", msg:"◈ AI analysing all layers...", level:"ai" });

        // Inject collected console/network data into page for the scanner
        await page.evaluate(({ consoleMessages, networkFailed }) => {
          window.__atpConsoleMessages = consoleMessages;
          window.__atpNetworkFailed   = networkFailed;
        }, { consoleMessages: consoleMessages.slice(0,20), networkFailed: networkFailed.slice(0,20) });

        const result = await scanPageCodeIntelligence(page, pageUrl, { pageName: pageUrl });

        // Merge live-captured data into result
        if (result.rawLayers?.js) {
          result.rawLayers.js.consoleErrors.push(
            ...consoleMessages.filter(m => m.type === "error" || m.type === "pageerror").slice(0,10)
          );
          result.rawLayers.js.consoleWarnings = consoleMessages.filter(m => m.type === "warning").slice(0,5);
        }
        if (result.rawLayers?.network) {
          result.rawLayers.network.failedRequests.push(...networkFailed.slice(0,10));
        }

        allResults.push({ url: pageUrl, ...result });
        send({ type:"page_result", url: pageUrl, result });

        const count = result.findings?.length || 0;
        const byLayer = result.issuesByLayer || {};
        send({ type:"log", msg:`Found ${count} issue(s) — DOM:${byLayer.dom||0} JS:${byLayer.javascript||0} Net:${byLayer.network||0} Nav:${byLayer.navigation||0} A11y:${byLayer.accessibility||0}`,
          level: count > 0 ? "warn" : "success" });

        // Reset captured data for next page
        consoleMessages.length = 0;
        networkFailed.length   = 0;

      } catch (err) {
        send({ type:"log", msg:`Error scanning ${pageUrl}: ${err.message}`, level:"error" });
      }
    }

    // Aggregate
    const totalFindings  = allResults.reduce((s,r) => s+(r.findings?.length||0), 0);
    const criticalCount  = allResults.flatMap(r=>r.findings||[]).filter(f=>f.severity==="critical").length;
    const byLayer        = { dom:0, javascript:0, network:0, navigation:0, accessibility:0 };
    allResults.flatMap(r=>r.findings||[]).forEach(f => { if (byLayer[f.layer]!==undefined) byLayer[f.layer]++; });
    const avgScore       = allResults.length
      ? Math.round(allResults.reduce((s,r) => s+(r.codeQualityScore||80),0)/allResults.length)
      : 100;

    send({ type:"scan_complete", totalPages: allPages.length, totalFindings, criticalCount, byLayer, avgScore, results: allResults });

  } catch (err) {
    send({ type:"error", msg: err.message });
  } finally {
    await browser?.close().catch(()=>{});
    res.end();
  }
}
