import { chromium } from "playwright";
import { config } from "../config/index.js";

/**
 * Launch a headless Chromium instance and return { browser, page }.
 * Caller is responsible for calling browser.close() in a finally block.
 */
export async function launchBrowser() {
  const browser = await chromium.launch({ headless: config.browser.headless });

  const context = await browser.newContext({
    viewport:  config.browser.viewport,
    userAgent: config.browser.userAgent,
  });

  const page = await context.newPage();
  return { browser, page };
}
