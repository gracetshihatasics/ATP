import { chromium } from "playwright";
import { config }   from "../config/index.js";
import { attachPopupHandler } from "./popupHandler.js";

/**
 * Launch a Chromium instance with stealth headers to avoid bot detection.
 * Many sites (ASICS, Nike, etc.) use Akamai/Cloudflare which block headless browsers.
 * These settings make the browser look more like a real user.
 */
export async function launchBrowser(onDismiss = () => {}) {
  const browser = await chromium.launch({
    headless: config.browser.headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  const context = await browser.newContext({
    viewport:  config.browser.viewport,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale:    "en-US",
    timezoneId:"America/New_York",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept":          "text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "sec-ch-ua":       '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      "sec-ch-ua-mobile":"?0",
      "sec-ch-ua-platform":'"macOS"',
      "Sec-Fetch-Dest":  "document",
      "Sec-Fetch-Mode":  "navigate",
      "Sec-Fetch-Site":  "none",
      "Sec-Fetch-User":  "?1",
      "Upgrade-Insecure-Requests": "1",
    },
  });

  const page = await context.newPage();

  // Remove webdriver fingerprint
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins",   { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    window.chrome = { runtime: {} };
  });

  // Attach universal popup handler — dismisses cookie banners, modals, alerts
  await attachPopupHandler(page, onDismiss);

  return { browser, page };
}
