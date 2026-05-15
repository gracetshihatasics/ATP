import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";

const client = new Anthropic({ apiKey: config.apiKey });

const SYSTEM = `You are a Playwright automation expert. Convert use case steps into precise browser actions.
Return ONLY a raw JSON array. No markdown. No explanation. Start with [ end with ].
Each element: { "type": "navigate|click|fill|select|wait|wait_for|scroll|scroll_to|press|hover|assert_text|assert_visible|wait_navigation", "selector": "css or text locator", "value": "string if needed", "description": "human-readable label" }

CRITICAL RULES:
1. For "navigate": "value" MUST be the full URL string. Always start with a navigate action.
2. After navigate, always add a "wait" action (value: "2000") to let the page fully load.
3. Before clicking any element that might be below the fold, add "scroll_to" with the selector first.
4. After scroll actions, add a "wait" (value: "1500") before clicking.
5. If a step involves waiting for a result (search, form submit), add "wait_navigation" after the submit.
6. Use "wait_for" before interacting with elements that load dynamically (search results, modals).
7. Prefer text locators: button:has-text("Add to Cart"), a:has-text("Sign In")
8. Use semantic attrs: [data-testid="..."], [aria-label="..."], [role="..."]
9. Fall back to: input[name="email"], input[type="password"], input[placeholder="Search"]
10. Never use fragile class names or div > span selectors.

Example sequence for clicking a button below the fold:
[
  { "type": "navigate", "value": "https://example.com", "description": "Navigate to homepage" },
  { "type": "wait", "value": "2000", "description": "Wait for page to load" },
  { "type": "scroll_to", "selector": "button:has-text(\\"Add to Cart\\")", "description": "Scroll to Add to Cart button" },
  { "type": "wait", "value": "1000", "description": "Wait for scroll to complete" },
  { "type": "click", "selector": "button:has-text(\\"Add to Cart\\")", "description": "Click Add to Cart" },
  { "type": "wait_for", "selector": "[class*=\\"cart\\"], [data-testid=\\"cart-count\\"]", "description": "Wait for cart to update" }
]`;

/**
 * Ask Claude to translate use-case steps into a list of Playwright action objects.
 * Falls back to a single navigate action if parsing fails.
 *
 * @param {{ title: string, steps: string[] }} useCase
 * @param {string} url
 * @param {{ username?: string, password?: string }} credentials
 * @returns {Promise<Array<{ type: string, selector?: string, value?: string, description: string }>>}
 */
export async function generateActions(useCase, url, credentials = {}, pageAnalysis = null) {
  const credLine = credentials.username
    ? `\nCredentials — username: "${credentials.username}", password: "${credentials.password}"`
    : "";

  // Include page analysis context if available
  const pageContext = pageAnalysis ? `
Page Intelligence Report:
- Page type: ${pageAnalysis.pageType}
- Summary: ${pageAnalysis.summary}
- UI Patterns detected: ${pageAnalysis.uiPatterns?.map(p => `${p.type} (${p.description})`).join(", ") || "none"}
- Forms detected: ${pageAnalysis.forms?.length || 0}
- Testing insights: ${pageAnalysis.testingInsights || "none"}
- Key elements: ${pageAnalysis.keyElements?.map(e => `${e.description} → ${e.action}`).join(", ") || "none"}
` : "";

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 4000,
    system:     SYSTEM,
    messages: [{
      role:    "user",
      content: `URL: ${url}${credLine}
Use case: ${useCase.title}
Description: ${useCase.description || ""}
Steps:
${useCase.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
${pageContext}
Generate the complete Playwright actions array. Use the page intelligence report to generate more accurate selectors and interactions.`,
    }],
  });

  const raw = response.content[0]?.text ?? "";
  try {
    const start = raw.indexOf("[");
    const end   = raw.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("No array found");
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [{ type: "navigate", value: url, description: `Navigate to ${url}` }];
  }
}
