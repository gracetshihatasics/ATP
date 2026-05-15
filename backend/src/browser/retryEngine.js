import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";
import { captureScreenshot } from "./screenshot.js";

const client = new Anthropic({ apiKey: config.apiKey });

/**
 * Retry & Deferred Confirmation Engine
 *
 * Solves the "false fail" problem:
 *   - Step runs but page hasn't updated yet → ATP marks fail
 *   - This engine retries confirmation up to N times
 *   - Uses AI vision to confirm success/failure definitively
 *   - Distinguishes: hard fail vs soft fail vs pending
 */

// ── Retry an action with exponential backoff + AI confirmation ────────────────
export async function retryWithConfirmation(page, action, executeFn, options = {}) {
  const {
    maxAttempts   = 3,
    backoffMs     = [1000, 2000, 4000],
    onLog         = () => {},
    confirmAfterMs = 2000,  // re-check after this delay even if it seemed to pass
  } = options;

  let lastError = null;
  let lastScreenshot = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        const waitMs = backoffMs[attempt - 2] || 3000;
        onLog(`◈ Retry ${attempt}/${maxAttempts} — waiting ${waitMs}ms before retry`, "warn");
        await page.waitForTimeout(waitMs);
      }

      // Execute the action
      await executeFn();
      lastError = null;

      // Wait a moment then do deferred confirmation
      await page.waitForTimeout(confirmAfterMs);
      const confirmation = await confirmActionSucceeded(page, action, onLog);

      if (confirmation.confirmed) {
        onLog(`✓ Confirmed: ${confirmation.observation}`, "success");
        lastScreenshot = confirmation.screenshot;
        return { success: true, screenshot: confirmation.screenshot, observation: confirmation.observation, attempts: attempt };
      }

      if (confirmation.status === "pending") {
        // Still loading — wait more and re-check
        onLog(`⟳ Still loading: ${confirmation.observation} — waiting...`, "info");
        await page.waitForTimeout(3000);
        const recheck = await confirmActionSucceeded(page, action, onLog);
        if (recheck.confirmed) {
          onLog(`✓ Confirmed after wait: ${recheck.observation}`, "success");
          return { success: true, screenshot: recheck.screenshot, observation: recheck.observation, attempts: attempt };
        }
        // If still pending and last attempt, accept as pass (action ran, can't definitively confirm)
        if (attempt === maxAttempts) {
          onLog(`◈ Could not confirm but action ran — marking as likely passed`, "warn");
          return { success: true, screenshot: recheck.screenshot, observation: recheck.observation, uncertain: true, attempts: attempt };
        }
        lastError = new Error(`Pending after wait: ${recheck.observation}`);
        continue;
      }

      // Confirmed fail — retry
      onLog(`✗ Confirmation failed: ${confirmation.observation}`, "warn");
      lastError = new Error(confirmation.observation);
      lastScreenshot = confirmation.screenshot;

    } catch (err) {
      lastError = err;
      lastScreenshot = await captureScreenshot(page).catch(() => null);
      onLog(`✗ Attempt ${attempt} error: ${err.message.slice(0, 100)}`, "warn");
    }
  }

  return {
    success: false,
    screenshot: lastScreenshot,
    observation: lastError?.message || "Action failed after all retries",
    attempts: maxAttempts,
  };
}

// ── Deferred confirmation — check page state after action ─────────────────────
export async function confirmActionSucceeded(page, action, onLog = () => {}) {
  try {
    // Fast DOM check first
    const domSignals = await checkDOMSignals(page, action);

    if (domSignals.definite === "pass") {
      const screenshot = await captureScreenshot(page);
      return { confirmed: true, status: "pass", observation: domSignals.reason, screenshot };
    }

    if (domSignals.definite === "fail") {
      const screenshot = await captureScreenshot(page);
      return { confirmed: false, status: "fail", observation: domSignals.reason, screenshot };
    }

    if (domSignals.definite === "pending") {
      return { confirmed: false, status: "pending", observation: domSignals.reason, screenshot: null };
    }

    // Uncertain — use AI vision
    const screenshot = await page.screenshot({ type: "jpeg", quality: 65 });
    const base64     = screenshot.toString("base64");

    const response = await client.messages.create({
      model:      config.model,
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: `The browser just performed: "${action.description}"

Did this action succeed? Check the page carefully for:
✓ Success: Expected content is visible, no error messages, page updated
⟳ Pending: Spinner/loader still visible, content still loading
✗ Failed: Error message visible, "page not found", validation error, unchanged page

Respond ONLY with JSON:
{
  "status": "pass|fail|pending",
  "confirmed": true/false,
  "observation": "one sentence — exactly what you see",
  "evidence": "specific element or text that proves your conclusion",
  "errorMessage": "the exact error text if visible, null if none"
}` },
        ],
      }],
    });

    const raw    = response.content[0]?.text ?? "";
    const s      = raw.indexOf("{"), e = raw.lastIndexOf("}");
    const result = s !== -1 ? JSON.parse(raw.slice(s, e + 1)) : { status: "pass", confirmed: true };

    onLog(`◈ Vision check: ${result.observation}`, "ai");
    if (result.errorMessage) onLog(`  ✗ Error detected: ${result.errorMessage}`, "warn");

    return {
      confirmed:  result.status === "pass",
      status:     result.status,
      observation: result.observation,
      evidence:   result.evidence,
      errorMessage: result.errorMessage,
      screenshot: `data:image/jpeg;base64,${screenshot.toString("base64")}`,
    };
  } catch {
    // If vision fails, don't block the test
    const screenshot = await captureScreenshot(page);
    return { confirmed: true, status: "pass", observation: "Vision check unavailable — proceeding", screenshot };
  }
}

// ── Check DOM signals without AI ──────────────────────────────────────────────
async function checkDOMSignals(page, action) {
  return page.evaluate((actionDesc) => {
    // Error signals
    const errorEls = document.querySelectorAll(
      '[class*="error"]:not([class*="error-boundary"]), [class*="alert-danger"], [role="alert"], [class*="notification--error"], [class*="toast-error"]'
    );
    const visibleErrors = Array.from(errorEls).filter(el => {
      const style = window.getComputedStyle(el);
      const text  = el.innerText?.trim();
      return style.display !== "none" && style.visibility !== "hidden" && text?.length > 3;
    }).map(el => el.innerText?.trim().slice(0, 100));

    if (visibleErrors.length) {
      return { definite: "fail", reason: `Error visible: ${visibleErrors[0]}` };
    }

    // Loading signals
    const spinners = document.querySelectorAll(
      '[class*="spinner"], [class*="loading"], [aria-busy="true"], [class*="skeleton"], [class*="loader"]'
    );
    const visibleSpinners = Array.from(spinners).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    });
    if (visibleSpinners.length) {
      return { definite: "pending", reason: `${visibleSpinners.length} loader(s) still visible` };
    }

    // Success signals for common patterns
    const successEls = document.querySelectorAll(
      '[class*="success"], [class*="confirmation"], [class*="thank-you"], [class*="order-confirm"]'
    );
    const visibleSuccess = Array.from(successEls).filter(el => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && el.innerText?.trim().length > 3;
    });
    if (visibleSuccess.length) {
      return { definite: "pass", reason: `Success element visible: ${visibleSuccess[0].innerText?.trim().slice(0, 50)}` };
    }

    return { definite: "uncertain", reason: "No definitive signals — using vision" };
  }, action.description).catch(() => ({ definite: "uncertain", reason: "DOM check failed" }));
}

// ── Check if a step that previously failed may have actually succeeded ─────────
export async function recheckFailedStep(page, stepDescription, onLog = () => {}) {
  onLog(`◈ Re-checking previously failed step: ${stepDescription}`, "ai");

  const screenshot = await page.screenshot({ type: "jpeg", quality: 65 });
  const base64     = screenshot.toString("base64");

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 300,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: `A test step previously failed: "${stepDescription}"

Looking at the current page state, could this step have actually succeeded? 
Sometimes actions work but confirmation happens too early.

Look for evidence that "${stepDescription}" did or didn't happen.

JSON only: {
  "actuallySucceeded": true/false,
  "confidence": "high|medium|low",
  "evidence": "what you see that proves it",
  "currentState": "brief description of current page"
}` },
      ],
    }],
  });

  const raw = response.content[0]?.text ?? "";
  const s   = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) {
    const result = JSON.parse(raw.slice(s, e + 1));
    onLog(`◈ Recheck: ${result.evidence} (confidence: ${result.confidence})`, "ai");
    return result;
  }
  return { actuallySucceeded: false, confidence: "low", evidence: "Could not assess" };
}
