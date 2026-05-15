import { config }          from "../config/index.js";
import { send }            from "../ws/send.js";
import { handlePopups }    from "./popupHandler.js";
import { waitUntilReady, isElementReady, didActionSucceed } from "./smartObserver.js";

const T = config.browser.timeout;

export async function executeAction(page, action, ws) {
  send(ws, { type: "log", level: "action", msg: `${action.type.toUpperCase()}: ${action.description}` });

  const onLog     = (msg) => send(ws, { type: "log", level: "info", msg });
  const onDismiss = (msg) => send(ws, { type: "log", level: "info", msg });

  switch (action.type) {

    // ── Navigate ──────────────────────────────────────────────────────────────
    case "navigate": {
      const url = action.value || action.url;
      if (!url || typeof url !== "string") {
        send(ws, { type: "log", level: "warn", msg: "Navigate skipped — no URL in action" });
        break;
      }
      try {
        onLog(`Navigating to ${url}`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: T.navigation });

        // Smart wait — observe until page is actually ready
        await waitUntilReady(page, {
          maxWait:    15_000,
          pollMs:     400,
          onLog,
          useVision:  true,
          actionDesc: `page loaded at ${url}`,
        });
        await handlePopups(page, onDismiss);
      } catch (err) {
        onLog(`Navigation warning: ${err.message.slice(0, 100)}`);
        // Even on error, observe what loaded
        await waitUntilReady(page, { maxWait: 5000, onLog });
        await handlePopups(page, onDismiss);
      }
      break;
    }

    // ── Click ─────────────────────────────────────────────────────────────────
    case "click": {
      // 1. Check if element is ready
      const check = await isElementReady(page, action.selector, { onLog });

      if (!check.ready && check.needsScroll) {
        // Element exists but not in viewport — scroll to it intelligently
        onLog(`Element not in viewport — scrolling into view`);
        await page.locator(action.selector).first()
          .scrollIntoViewIfNeeded({ timeout: T.action }).catch(() => {});

        // Observe: did scroll bring it into view?
        await waitUntilReady(page, { maxWait: 3000, pollMs: 300, onLog, useVision: true, actionDesc: `scrolled to ${action.description}` });
      } else if (!check.ready) {
        // Element not found yet — wait for it to appear
        onLog(`Waiting for element to appear: ${action.selector}`);
        await page.locator(action.selector).first()
          .waitFor({ state: "visible", timeout: T.element }).catch(() => {});
      }

      // 2. Wait for any animation to finish (element stable)
      await waitForElementStable(page, action.selector);

      // 3. Click
      await page.locator(action.selector).first()
        .click({ timeout: T.action, force: action.force ?? false });

      // 4. Observe result — did click succeed?
      await waitUntilReady(page, { maxWait: 8000, pollMs: 400, onLog, useVision: true, actionDesc: action.description });
      await handlePopups(page, onDismiss);
      break;
    }

    // ── Fill ──────────────────────────────────────────────────────────────────
    case "fill": {
      const check = await isElementReady(page, action.selector, { onLog });
      if (check.needsScroll) {
        await page.locator(action.selector).first().scrollIntoViewIfNeeded().catch(() => {});
        await waitUntilReady(page, { maxWait: 2000, onLog });
      } else if (!check.ready) {
        onLog(`Waiting for input: ${action.selector}`);
        await page.locator(action.selector).first().waitFor({ state: "visible", timeout: T.element }).catch(() => {});
      }
      await page.locator(action.selector).first().clear({ timeout: T.action }).catch(() => {});
      await page.locator(action.selector).first().fill(action.value ?? "", { timeout: T.action });
      break;
    }

    // ── Select ────────────────────────────────────────────────────────────────
    case "select": {
      await page.locator(action.selector).first()
        .waitFor({ state: "visible", timeout: T.element });
      await page.locator(action.selector).first()
        .selectOption(action.value, { timeout: T.action });
      break;
    }

    // ── Press key ─────────────────────────────────────────────────────────────
    case "press":
      await page.keyboard.press(action.value ?? "Enter");
      await waitUntilReady(page, { maxWait: 8000, pollMs: 400, onLog, useVision: true, actionDesc: `pressed ${action.value}` });
      await handlePopups(page, onDismiss);
      break;

    // ── Wait (explicit) ───────────────────────────────────────────────────────
    case "wait": {
      const ms = parseInt(action.value) || 1000;
      onLog(`Waiting ${ms}ms`);
      await page.waitForTimeout(ms);
      break;
    }

    // ── Wait for element ──────────────────────────────────────────────────────
    case "wait_for": {
      const sel = action.selector || action.value;
      onLog(`Waiting for element: ${sel}`);
      await page.locator(sel).first().waitFor({ state: "visible", timeout: T.element });
      break;
    }

    // ── Scroll (amount) ───────────────────────────────────────────────────────
    case "scroll": {
      const px = parseInt(action.value) || 400;
      await page.evaluate((n) => window.scrollBy({ top: n, behavior: "smooth" }), px);
      // Observe: wait for page to settle after scroll (lazy load, animations)
      await waitUntilReady(page, { maxWait: 4000, pollMs: 300, onLog, useVision: true, actionDesc: "scrolled — checking content loaded" });
      break;
    }

    // ── Scroll to element ─────────────────────────────────────────────────────
    case "scroll_to": {
      onLog(`Scrolling to: ${action.selector}`);
      await page.locator(action.selector).first()
        .scrollIntoViewIfNeeded({ timeout: T.element }).catch(() => {});
      await waitUntilReady(page, { maxWait: 3000, onLog, useVision: true, actionDesc: `scrolled to ${action.description}` });
      break;
    }

    // ── Hover ─────────────────────────────────────────────────────────────────
    case "hover": {
      const check = await isElementReady(page, action.selector, { onLog });
      if (check.needsScroll) {
        await page.locator(action.selector).first().scrollIntoViewIfNeeded().catch(() => {});
        await waitUntilReady(page, { maxWait: 2000, onLog });
      }
      await page.locator(action.selector).first().hover({ timeout: T.action });
      // Wait for hover menus/tooltips to appear
      await waitUntilReady(page, { maxWait: 2000, pollMs: 300, onLog });
      break;
    }

    // ── Assert text ───────────────────────────────────────────────────────────
    case "assert_text":
      await page.waitForSelector(`text=${action.value}`, { timeout: T.element });
      break;

    // ── Assert visible ────────────────────────────────────────────────────────
    case "assert_visible":
      await page.locator(action.selector).first()
        .waitFor({ state: "visible", timeout: T.element });
      break;

    // ── Wait for navigation/load ──────────────────────────────────────────────
    case "wait_navigation":
      onLog("Waiting for page navigation to complete...");
      await page.waitForLoadState("networkidle", { timeout: T.navigation })
        .catch(() => page.waitForLoadState("domcontentloaded", { timeout: T.navigation }));
      await waitUntilReady(page, { maxWait: 5000, onLog, useVision: true, actionDesc: "page navigation complete" });
      await handlePopups(page, onDismiss);
      break;

    default:
      send(ws, { type: "log", level: "warn", msg: `Unknown action type: "${action.type}"` });
  }
}

// ── Wait for element to stop moving (CSS animation/transition done) ───────────
async function waitForElementStable(page, selector, maxWait = 1500) {
  try {
    let prevY = null;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const box = await page.locator(selector).first().boundingBox().catch(() => null);
      if (!box) break;
      if (prevY !== null && Math.abs(box.y - prevY) < 1) return; // stable
      prevY = box.y;
      await page.waitForTimeout(80);
    }
  } catch {}
}
