import { config } from "../config/index.js";

/**
 * Capture a JPEG screenshot from the given page.
 * Returns a base64 data-URI string, or null on failure.
 * @param {import('playwright').Page} page
 * @returns {Promise<string|null>}
 */
export async function captureScreenshot(page) {
  try {
    const buf = await page.screenshot({
      type:     config.screenshot.type,
      quality:  config.screenshot.quality,
      fullPage: config.screenshot.fullPage,
    });
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
