import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";

const client = new Anthropic({ apiKey: config.apiKey });

/**
 * Universal popup handler — two layers:
 *   Layer 1: Static selectors (fast, no AI cost)
 *   Layer 2: AI vision — screenshots the page, detects popups/overlays,
 *            reads the message, decides OK/Cancel/Close, finds and clicks
 *            the right button. Runs when layer 1 finds nothing.
 *
 * Call attachPopupHandler(page, onDismiss) once after page creation.
 */

// ── Layer 1: Static selectors ─────────────────────────────────────────────────
const DISMISS_SELECTORS = [
  // Cookie / GDPR
  '#onetrust-accept-btn-handler',
  '#accept-recommended-btn-handler',
  '.cc-btn.cc-allow',
  '[data-cookiebanner="accept_button"]',
  'button:has-text("Accept All Cookies")',
  'button:has-text("Accept all cookies")',
  'button:has-text("Accept All")',
  'button:has-text("Accept all")',
  'button:has-text("Allow all")',
  'button:has-text("Allow All")',
  'button:has-text("I Agree")',
  'button:has-text("I agree")',
  'button:has-text("Got it")',
  'button:has-text("Agree and continue")',
  // Close / dismiss
  '[aria-label="Close"]',
  '[aria-label="close"]',
  '[aria-label="Dismiss"]',
  '[title="Close"]',
  'button:has-text("No thanks")',
  'button:has-text("No, thanks")',
  'button:has-text("Maybe later")',
  'button:has-text("Not now")',
  'button:has-text("Skip")',
  // Region / country
  'button:has-text("Continue to site")',
  'button:has-text("Stay on")',
  'button:has-text("Confirm")',
];

// ── Attach handler to page ─────────────────────────────────────────────────────
export async function attachPopupHandler(page, onDismiss = () => {}) {
  // Handle native browser dialogs immediately
  page.on("dialog", async (dialog) => {
    const msg = dialog.message().slice(0, 80);
    onDismiss(`Native ${dialog.type()}: "${msg}" → dismissed`);
    await dialog.dismiss().catch(() => dialog.accept().catch(() => {}));
  });

  // Run after every navigation
  page.on("load", async () => {
    await handlePopups(page, onDismiss);
  });

  // Run on initial page
  await handlePopups(page, onDismiss);
}

// ── Main popup handler — layer 1 then layer 2 ──────────────────────────────────
export async function handlePopups(page, onDismiss = () => {}) {
  await page.waitForTimeout(1000).catch(() => {});

  // Layer 1: try static selectors first (fast)
  const dismissed = await tryStaticSelectors(page, onDismiss);

  // Layer 2: if page still has a blocking overlay, use AI vision
  const hasOverlay = await detectOverlay(page);
  if (hasOverlay) {
    await aiDismiss(page, onDismiss);
  }

  // Always re-enable scroll in case overlay locked it
  await page.evaluate(() => {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }).catch(() => {});
}

// ── Layer 1: static selector sweep ───────────────────────────────────────────
async function tryStaticSelectors(page, onDismiss) {
  let dismissed = false;
  for (const selector of DISMISS_SELECTORS) {
    try {
      const el = page.locator(selector).first();
      const visible = await el.isVisible({ timeout: 400 }).catch(() => false);
      if (visible) {
        await el.click({ timeout: 1500, force: true }).catch(() => {});
        onDismiss(`[static] Dismissed: ${selector.slice(0, 50)}`);
        await page.waitForTimeout(500).catch(() => {});
        dismissed = true;
      }
    } catch {}
  }
  return dismissed;
}

// ── Detect if there is a blocking overlay on screen ───────────────────────────
async function detectOverlay(page) {
  return page.evaluate(() => {
    const els = document.querySelectorAll("*");
    for (const el of els) {
      const style = window.getComputedStyle(el);
      if (
        ["fixed", "absolute"].includes(style.position) &&
        parseInt(style.zIndex) > 100 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      ) {
        const rect = el.getBoundingClientRect();
        // Must cover significant area (popup/modal/banner)
        if (rect.width > 200 && rect.height > 80) return true;
      }
    }
    return false;
  }).catch(() => false);
}

// ── Layer 2: AI vision ────────────────────────────────────────────────────────
async function aiDismiss(page, onDismiss) {
  try {
    onDismiss("[AI] Overlay detected — asking AI to identify and dismiss it...");

    // Screenshot the current state
    const screenshotBuf = await page.screenshot({
      type: "jpeg", quality: 70, fullPage: false,
    });
    const base64 = screenshotBuf.toString("base64");

    // Ask Claude to analyse the screenshot and decide what to do
    const response = await client.messages.create({
      model:      config.model,
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: base64 },
          },
          {
            type: "text",
            text: `Analyse this browser screenshot. Is there a popup, modal, overlay, cookie banner, consent dialog, newsletter signup, age verification, region selector, or any other element blocking the main content?

If YES, respond with JSON only:
{
  "hasPopup": true,
  "type": "cookie|newsletter|modal|region|age|alert|other",
  "message": "what the popup says (brief)",
  "action": "accept|decline|close|skip",
  "buttonText": "exact text of the button to click to dismiss it safely",
  "reasoning": "why this action"
}

If NO blocking popup:
{ "hasPopup": false }

Only raw JSON, no markdown.`,
          },
        ],
      }],
    });

    const raw = response.content[0]?.text ?? "";
    let decision;
    try {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      decision = JSON.parse(raw.slice(s, e + 1));
    } catch {
      onDismiss("[AI] Could not parse AI response");
      return;
    }

    if (!decision.hasPopup) {
      onDismiss("[AI] No blocking popup detected");
      return;
    }

    onDismiss(`[AI] Detected ${decision.type}: "${decision.message}" → ${decision.action} via "${decision.buttonText}"`);

    // Try to click the button AI identified
    if (decision.buttonText) {
      const clicked = await clickByText(page, decision.buttonText);
      if (clicked) {
        onDismiss(`[AI] ✓ Clicked "${decision.buttonText}"`);
        await page.waitForTimeout(800).catch(() => {});
        return;
      }
    }

    // Fallback: try close button patterns if AI couldn't identify exact text
    const fallbacks = [
      `button:has-text("${decision.buttonText}")`,
      '[aria-label="Close"]',
      '[aria-label="close"]',
      'button:has-text("×")',
      'button:has-text("✕")',
      '.close', '.modal-close', '[data-dismiss]',
    ];

    for (const sel of fallbacks) {
      try {
        const el = page.locator(sel).first();
        const visible = await el.isVisible({ timeout: 400 }).catch(() => false);
        if (visible) {
          await el.click({ timeout: 1000, force: true });
          onDismiss(`[AI] ✓ Fallback click: ${sel.slice(0, 40)}`);
          await page.waitForTimeout(500).catch(() => {});
          return;
        }
      } catch {}
    }

    // Last resort: remove the overlay via JS
    await page.evaluate(() => {
      document.querySelectorAll("*").forEach(el => {
        const style = window.getComputedStyle(el);
        if (
          ["fixed", "absolute"].includes(style.position) &&
          parseInt(style.zIndex) > 100 &&
          style.display !== "none"
        ) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 200 && rect.height > 80) el.remove();
        }
      });
      document.body.style.overflow = "";
    }).catch(() => {});
    onDismiss("[AI] ✓ Force-removed overlay via DOM");

  } catch (err) {
    onDismiss(`[AI] Error: ${err.message.slice(0, 60)}`);
  }
}

// ── Helper: click a button by its visible text ────────────────────────────────
async function clickByText(page, text) {
  if (!text) return false;
  const selectors = [
    `button:has-text("${text}")`,
    `a:has-text("${text}")`,
    `[role="button"]:has-text("${text}")`,
    `input[value="${text}"]`,
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      const visible = await el.isVisible({ timeout: 500 }).catch(() => false);
      if (visible) {
        await el.click({ timeout: 1500, force: true });
        return true;
      }
    } catch {}
  }
  return false;
}
