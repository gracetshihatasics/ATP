import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";

const client = new Anthropic({ apiKey: config.apiKey });

const SYSTEM = `You are a Playwright automation expert. Convert use case steps into precise browser actions.
Return ONLY a raw JSON array. No markdown. No explanation. Start with [ end with ].
Each element: { "type": "navigate|click|fill|select|wait|scroll|press|hover|assert_text|assert_visible", "selector": "css or text locator", "value": "string if needed", "description": "human-readable label" }
Selector guidelines:
  - Prefer text locators: button:has-text("Add to Cart"), a:has-text("Sign In")
  - Use semantic attrs: [data-testid="..."], [aria-label="..."], [role="..."]
  - Fall back to: input[name="email"], input[type="password"], input[placeholder="Search"]
  - Avoid: .class-names, div > span (fragile)`;

/**
 * Ask Claude to translate use-case steps into a list of Playwright action objects.
 * Falls back to a single navigate action if parsing fails.
 *
 * @param {{ title: string, steps: string[] }} useCase
 * @param {string} url
 * @param {{ username?: string, password?: string }} credentials
 * @returns {Promise<Array<{ type: string, selector?: string, value?: string, description: string }>>}
 */
export async function generateActions(useCase, url, credentials = {}) {
  const credLine = credentials.username
    ? `\nCredentials — username: "${credentials.username}", password: "${credentials.password}"`
    : "";

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: config.maxTokens,
    system:     SYSTEM,
    messages: [{
      role:    "user",
      content: `URL: ${url}${credLine}
Use case: ${useCase.title}
Steps:
${useCase.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Generate the Playwright actions array.`,
    }],
  });

  const raw = response.content[0]?.text ?? "";
  try {
    const start = raw.indexOf("[");
    const end   = raw.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("No array found");
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    // Safe fallback — just navigate to the URL
    return [{ type: "navigate", value: url, description: `Navigate to ${url}` }];
  }
}
