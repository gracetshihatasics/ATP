import { anthropic } from "../ai/client.js";
import { config }    from "../config/index.js";
import { evalSelector } from "./selectorEval.js";

export async function autoFixAction(page, action, evalResult, pageAnalysis, knowledgeContext) {
  try {
    // Screenshot
    const screenshotBuf = await page.screenshot({ type: "jpeg", quality: 60 });
    const screenshotB64 = screenshotBuf.toString("base64");

    // Focused DOM snippet — nearest form ancestor or top 2000 chars of body
    let domSnippet = "";
    try {
      domSnippet = await page.evaluate((sel) => {
        let el = null;
        if (sel) {
          try { el = document.querySelector(sel); } catch {}
        }
        const form = el?.closest("form") ?? el?.closest("main") ?? el?.closest("[role='main']");
        if (form) return form.outerHTML.slice(0, 3000);
        return document.body?.innerHTML?.slice(0, 2000) ?? "";
      }, action.selector);
    } catch {}

    // Top-5 known-good selectors from knowledge history
    const knownGood = Object.entries(knowledgeContext?.selectorHistory ?? {})
      .filter(([, v]) => v.hitCount > 0)
      .sort(([, a], [, b]) => (b.hitCount / (b.hitCount + b.missCount)) - (a.hitCount / (a.hitCount + a.missCount)))
      .slice(0, 5)
      .map(([sel, v]) => `${sel} (${v.hitCount} hits)`)
      .join("\n");

    const pageContext = pageAnalysis
      ? `Page type: ${pageAnalysis.pageType}. Summary: ${pageAnalysis.summary}.`
      : "";

    const prompt = `You are a Playwright selector repair specialist.

A selector failed evaluation:
- Action type: ${action.type}
- Original selector: ${action.selector}
- Description: ${action.description}
- Issue: ${evalResult.issue}
- Matches found: ${evalResult.matches}

${pageContext}

${knownGood ? `Known-good selectors on this app:\n${knownGood}` : ""}

DOM context:
\`\`\`html
${domSnippet}
\`\`\`

Look at the screenshot and DOM. Find a better selector that:
1. Resolves to exactly ONE element
2. Uses text-based selectors first: button:has-text("..."), a:has-text("...")
3. Then semantic attrs: [data-testid="..."], [aria-label="..."], [role="..."]
4. Then input attrs: input[name="..."], input[type="..."]
5. Avoids fragile class names or deep DOM nesting

Return ONLY raw JSON with no markdown:
{"selector": "...", "reasoning": "one sentence"}`;

    const response = await anthropic.messages.create({
      model:      config.model,
      max_tokens: 500,
      system:     "You are a Playwright selector repair specialist. Return ONLY valid raw JSON, no markdown, no explanation outside JSON.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshotB64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const raw = response.content[0]?.text?.trim() ?? "";
    let parsed;
    try {
      // strip markdown fences if present
      const clean = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/,"").trim();
      parsed = JSON.parse(clean);
    } catch {
      return { fixed: false, action, newScore: evalResult.score ?? 0, reasoning: "could not parse Claude response" };
    }

    if (!parsed.selector) {
      return { fixed: false, action, newScore: evalResult.score ?? 0, reasoning: "Claude returned no selector" };
    }

    const fixedAction = { ...action, selector: parsed.selector };
    const verify = await evalSelector(page, fixedAction, 0);

    if (verify.score >= config.eval.confidenceThreshold) {
      return { fixed: true, action: fixedAction, newScore: verify.score, reasoning: parsed.reasoning ?? "" };
    }

    return { fixed: false, action, newScore: verify.score, reasoning: `fixed selector scored ${verify.score} — below threshold` };
  } catch (e) {
    return { fixed: false, action, newScore: 0, reasoning: `auto-fix error: ${e.message}` };
  }
}
