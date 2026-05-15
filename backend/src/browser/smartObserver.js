import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";

const client = new Anthropic({ apiKey: config.apiKey });

/**
 * Ask Claude to look at the current page screenshot and answer:
 * - Is the page fully loaded?
 * - Is a specific element visible?
 * - Did the last action succeed?
 * - What should happen next?
 *
 * This replaces hardcoded timeouts with AI observation.
 */

// ── Is page ready? ────────────────────────────────────────────────────────────
export async function isPageReady(page) {
  try {
    // First check DOM signals — fast, no AI cost
    const domReady = await page.evaluate(() => {
      const spinners = document.querySelectorAll(
        '[class*="spinner"], [class*="loading"], [class*="skeleton"], [aria-busy="true"], [class*="loader"]'
      );
      const visibleSpinners = Array.from(spinners).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      });
      return {
        readyState:      document.readyState,
        hasSpinners:     visibleSpinners.length > 0,
        spinnerCount:    visibleSpinners.length,
        hasSkeleton:     document.querySelectorAll('[class*="skeleton"]').length > 0,
        bodyText:        document.body?.innerText?.slice(0, 100) ?? "",
      };
    });

    if (domReady.readyState !== "complete") return { ready: false, reason: `Document readyState: ${domReady.readyState}` };
    if (domReady.hasSpinners) return { ready: false, reason: `${domReady.spinnerCount} loading spinner(s) visible` };
    if (domReady.hasSkeleton) return { ready: false, reason: "Skeleton loaders still present" };

    return { ready: true, reason: "Page DOM signals indicate ready" };
  } catch {
    return { ready: true, reason: "Could not check — proceeding" };
  }
}

// ── Wait for page to be ready — polls DOM then optionally uses AI vision ──────
export async function waitUntilReady(page, options = {}) {
  const {
    maxWait    = 30_000,
    pollMs     = 500,
    onLog      = () => {},
    useVision  = false,
    actionDesc = "",
  } = options;

  const start = Date.now();

  // Phase 1: Poll DOM signals
  while (Date.now() - start < maxWait) {
    const { ready, reason } = await isPageReady(page);
    if (ready) break;
    onLog(`⟳ Waiting: ${reason}`);
    await page.waitForTimeout(pollMs);
  }

  // Phase 2: If still unsure and vision enabled, ask Claude
  if (useVision) {
    const verdict = await askClaudeIfReady(page, actionDesc, onLog);
    if (!verdict.ready) {
      onLog(`◈ AI: ${verdict.reason} — waiting extra ${verdict.waitMs}ms`);
      await page.waitForTimeout(verdict.waitMs || 1500);
    } else {
      onLog(`◈ AI: ${verdict.reason}`);
    }
  }
}

// ── Is a specific element visible and interactable? ───────────────────────────
export async function isElementReady(page, selector, options = {}) {
  const { onLog = () => {} } = options;

  try {
    // Check DOM first
    const domCheck = await page.evaluate((sel) => {
      try {
        const el = document.querySelector(sel) ||
          Array.from(document.querySelectorAll("*")).find(e =>
            e.textContent?.trim().toLowerCase().includes(sel.replace(/button:has-text\("(.+)"\)/i,"$1").toLowerCase())
          );
        if (!el) return { found: false };
        const rect  = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          found:     true,
          visible:   style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0",
          inViewport: rect.top >= 0 && rect.top <= window.innerHeight,
          rect:      { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
          disabled:  el.disabled || el.getAttribute("aria-disabled") === "true",
        };
      } catch { return { found: false }; }
    }, selector);

    if (!domCheck.found)      return { ready: false, reason: "Element not found in DOM", needsScroll: false };
    if (!domCheck.visible)    return { ready: false, reason: "Element found but hidden",  needsScroll: false };
    if (domCheck.disabled)    return { ready: false, reason: "Element is disabled",        needsScroll: false };
    if (!domCheck.inViewport) return { ready: false, reason: "Element exists but not in viewport", needsScroll: true, rect: domCheck.rect };

    return { ready: true, reason: "Element visible and in viewport", rect: domCheck.rect };
  } catch (err) {
    return { ready: false, reason: err.message, needsScroll: false };
  }
}

// ── Did the last action succeed? (AI vision check) ────────────────────────────
export async function didActionSucceed(page, actionDescription, onLog = () => {}) {
  try {
    const screenshot = await page.screenshot({ type: "jpeg", quality: 60 });
    const base64     = screenshot.toString("base64");

    const response = await client.messages.create({
      model:      config.model,
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: `The browser just performed: "${actionDescription}"

Did this action succeed? Look for:
- Error messages or red text
- "Page not found" or blank content
- Form validation errors
- Loading still in progress
- The expected result visible

Respond ONLY with JSON: { "succeeded": true/false, "confidence": "high/medium/low", "observation": "what you see in 1 sentence", "issue": "what went wrong if failed" }` },
        ],
      }],
    });

    const raw = response.content[0]?.text ?? "";
    const s   = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s !== -1 && e > s) {
      const result = JSON.parse(raw.slice(s, e + 1));
      onLog(`◈ Vision: ${result.observation}`);
      return result;
    }
    return { succeeded: true, confidence: "low", observation: "Could not parse vision response" };
  } catch {
    return { succeeded: true, confidence: "low", observation: "Vision check failed — proceeding" };
  }
}

// ── Ask Claude if page is ready for next action ───────────────────────────────
async function askClaudeIfReady(page, nextAction, onLog) {
  try {
    const screenshot = await page.screenshot({ type: "jpeg", quality: 50 });
    const base64     = screenshot.toString("base64");

    const response = await client.messages.create({
      model:      config.model,
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: `Is this page ready for the next action: "${nextAction}"?

Look for: loading spinners, skeleton screens, partially rendered content, blank areas that should have content.

Respond ONLY with JSON: { "ready": true/false, "reason": "one sentence", "waitMs": 0 }
If not ready, suggest waitMs (500-3000).` },
        ],
      }],
    });

    const raw = response.content[0]?.text ?? "";
    const s   = raw.indexOf("{"), e = raw.lastIndexOf("}");
    if (s !== -1 && e > s) return JSON.parse(raw.slice(s, e + 1));
    return { ready: true, reason: "Could not assess" };
  } catch {
    return { ready: true, reason: "Vision check failed" };
  }
}
