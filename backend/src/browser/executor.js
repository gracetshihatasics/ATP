import { config }       from "../config/index.js";
import { send }         from "../ws/send.js";
import { handlePopups } from "./popupHandler.js";

const T = config.browser.timeout;

export async function executeAction(page, action, ws) {
  send(ws, { type: "log", level: "action", msg: `${action.type.toUpperCase()}: ${action.description}` });

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
        // Try networkidle first for full load, fall back to domcontentloaded
        await page.goto(url, { waitUntil: "networkidle", timeout: T.navigation })
          .catch(() => page.goto(url, { waitUntil: "domcontentloaded", timeout: T.navigation }));

        // Wait for page to stabilise after load
        await page.waitForTimeout(T.afterNavigation);
        await waitForPageStable(page);
        await handlePopups(page, onDismiss);
      } catch (err) {
        send(ws, { type: "log", level: "warn", msg: `Navigation warning: ${err.message.slice(0, 100)}` });
        // Even on timeout, wait a bit — page may have partially loaded
        await page.waitForTimeout(2000);
        await handlePopups(page, onDismiss);
      }
      break;
    }

    // ── Click ─────────────────────────────────────────────────────────────────
    case "click": {
      const locator = page.locator(action.selector).first();
      // Wait for element to be visible AND stable (not moving/animating)
      await locator.waitFor({ state: "visible", timeout: T.element });
      await waitForElementStable(page, action.selector);
      // Scroll element into view
      await locator.scrollIntoViewIfNeeded({ timeout: T.action }).catch(() => {});
      await page.waitForTimeout(T.afterScroll);
      // Now click
      await locator.click({ timeout: T.action, force: action.force ?? false });
      await page.waitForTimeout(T.afterClick);
      await handlePopups(page, onDismiss);
      break;
    }

    // ── Fill ──────────────────────────────────────────────────────────────────
    case "fill": {
      const locator = page.locator(action.selector).first();
      await locator.waitFor({ state: "visible", timeout: T.element });
      await locator.scrollIntoViewIfNeeded({ timeout: T.action }).catch(() => {});
      await page.waitForTimeout(300);
      await locator.clear({ timeout: T.action }).catch(() => {});
      await locator.fill(action.value ?? "", { timeout: T.action });
      break;
    }

    // ── Select ────────────────────────────────────────────────────────────────
    case "select": {
      const locator = page.locator(action.selector).first();
      await locator.waitFor({ state: "visible", timeout: T.element });
      await locator.selectOption(action.value, { timeout: T.action });
      break;
    }

    // ── Press key ─────────────────────────────────────────────────────────────
    case "press":
      await page.keyboard.press(action.value ?? "Enter");
      await page.waitForTimeout(T.afterClick);
      await handlePopups(page, onDismiss);
      break;

    // ── Wait ──────────────────────────────────────────────────────────────────
    case "wait": {
      const ms = parseInt(action.value) || 1000;
      send(ws, { type: "log", level: "info", msg: `Waiting ${ms}ms...` });
      await page.waitForTimeout(ms);
      break;
    }

    // ── Wait for element ──────────────────────────────────────────────────────
    case "wait_for": {
      const sel = action.selector || action.value;
      send(ws, { type: "log", level: "info", msg: `Waiting for: ${sel}` });
      await page.locator(sel).first().waitFor({ state: "visible", timeout: T.element });
      break;
    }

    // ── Scroll ────────────────────────────────────────────────────────────────
    case "scroll": {
      const px = parseInt(action.value) || 400;
      await page.evaluate((n) => window.scrollBy({ top: n, behavior: "smooth" }), px);
      // Always wait after scroll — elements need time to enter viewport + lazy load
      await page.waitForTimeout(T.afterScroll);
      await waitForPageStable(page);
      break;
    }

    // ── Scroll to element ─────────────────────────────────────────────────────
    case "scroll_to": {
      const locator = page.locator(action.selector).first();
      await locator.scrollIntoViewIfNeeded({ timeout: T.element });
      await page.waitForTimeout(T.afterScroll);
      break;
    }

    // ── Hover ─────────────────────────────────────────────────────────────────
    case "hover": {
      const locator = page.locator(action.selector).first();
      await locator.waitFor({ state: "visible", timeout: T.element });
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300);
      await locator.hover({ timeout: T.action });
      await page.waitForTimeout(500); // wait for hover menus to appear
      break;
    }

    // ── Assert text ───────────────────────────────────────────────────────────
    case "assert_text":
      await page.waitForSelector(`text=${action.value}`, { timeout: T.element });
      break;

    // ── Assert visible ────────────────────────────────────────────────────────
    case "assert_visible":
      await page.locator(action.selector).first().waitFor({ state: "visible", timeout: T.element });
      break;

    // ── Wait for navigation ───────────────────────────────────────────────────
    case "wait_navigation":
      await page.waitForLoadState("networkidle", { timeout: T.navigation }).catch(() =>
        page.waitForLoadState("domcontentloaded", { timeout: T.navigation })
      );
      await handlePopups(page, onDismiss);
      break;

    default:
      send(ws, { type: "log", level: "warn", msg: `Unknown action type: "${action.type}"` });
  }
}

// ── Wait for page network to settle ──────────────────────────────────────────
async function waitForPageStable(page, timeout = 3000) {
  await page.waitForLoadState("domcontentloaded", { timeout }).catch(() => {});
  // Give JS frameworks time to render
  await page.waitForTimeout(300);
}

// ── Wait for element to stop moving (animation/transition done) ───────────────
async function waitForElementStable(page, selector, maxWait = 2000) {
  try {
    const start = Date.now();
    let prevBox = null;
    while (Date.now() - start < maxWait) {
      const box = await page.locator(selector).first().boundingBox().catch(() => null);
      if (box && prevBox &&
        Math.abs(box.x - prevBox.x) < 1 &&
        Math.abs(box.y - prevBox.y) < 1) {
        return; // element has stopped moving
      }
      prevBox = box;
      await page.waitForTimeout(100);
    }
  } catch {
    // If we can't check, just wait a fixed amount
    await page.waitForTimeout(500);
  }
}
