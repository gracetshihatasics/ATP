import { config } from "../config/index.js";
import { send } from "../ws/send.js";

const { action: T } = config.browser.timeout;

/**
 * Execute a single AI-generated action on the given page.
 * @param {import('playwright').Page} page
 * @param {{ type: string, selector?: string, value?: string, description: string }} action
 * @param {import('ws').WebSocket} ws
 */
export async function executeAction(page, action, ws) {
  send(ws, { type: "log", level: "action", msg: `${action.type.toUpperCase()}: ${action.description}` });

  switch (action.type) {
    case "navigate":
      await page.goto(action.value, { waitUntil: "domcontentloaded", timeout: config.browser.timeout.navigation });
      break;

    case "click":
      await page.locator(action.selector).first().click({ timeout: T });
      break;

    case "fill":
      await page.locator(action.selector).first().fill(action.value ?? "", { timeout: T });
      break;

    case "select":
      await page.locator(action.selector).first().selectOption(action.value, { timeout: T });
      break;

    case "press":
      await page.keyboard.press(action.value ?? "Enter");
      break;

    case "wait":
      await page.waitForTimeout(parseInt(action.value) || 1000);
      break;

    case "scroll":
      await page.evaluate((px) => window.scrollBy(0, px), parseInt(action.value) || 400);
      break;

    case "assert_text":
      await page.waitForSelector(`text=${action.value}`, { timeout: T });
      break;

    case "assert_visible":
      await page.locator(action.selector).first().waitFor({ state: "visible", timeout: T });
      break;

    case "hover":
      await page.locator(action.selector).first().hover({ timeout: T });
      break;

    default:
      send(ws, { type: "log", level: "warn", msg: `Skipping unknown action type: "${action.type}"` });
  }
}
