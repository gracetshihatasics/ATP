/**
 * Run a list of plain-English assertion strings against the current page content.
 * Uses keyword matching — good enough for smoke-test assertions like
 * "page shows a confirmation message" or "user profile is visible".
 *
 * @param {import('playwright').Page} page
 * @param {string[]} assertions
 * @returns {Promise<Array<{ assertion: string, passed: boolean, method: string, error?: string }>>}
 */
export async function runAssertions(page, assertions) {
  const content = (await page.content()).toLowerCase();
  const results = [];

  for (const assertion of assertions) {
    try {
      // Extract meaningful keywords (>4 chars) and check if any appear in the page
      const keywords = assertion
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .split(" ")
        .filter(w => w.length > 4);

      const passed = keywords.length === 0 || keywords.some(w => content.includes(w));
      results.push({ assertion, passed, method: "keyword-scan" });
    } catch (err) {
      results.push({ assertion, passed: false, method: "keyword-scan", error: err.message });
    }
  }

  return results;
}
