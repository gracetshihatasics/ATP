import { launchBrowser }     from "../browser/launcher.js";
import { captureScreenshot } from "../browser/screenshot.js";
import { vaultStore }        from "../vault/store.js";
import Anthropic             from "@anthropic-ai/sdk";
import { config }            from "../config/index.js";
import crypto                from "crypto";

const client = new Anthropic({ apiKey: config.apiKey });

/**
 * Phase 2: Auth resolver.
 * Strategy:
 *   1. Use vault credential if provided
 *   2. Try auto-registration if register page found
 *   3. Fall back to guest (no auth)
 *
 * Returns an auth context object: { strategy, cookies, token, username, password, userId, ... }
 */
export async function resolveAuth(url, credentialId, surfaceResult, onEvent = () => {}) {
  onEvent({ type: "phase", phase: 2, msg: "Resolving authentication..." });

  // ── Strategy 1: Vault credential ──────────────────────────────────────────
  if (credentialId) {
    const cred = vaultStore.resolveContext(credentialId);
    if (cred && Object.keys(cred).length > 0) {
      onEvent({ type: "log", msg: "Using vault credential", level: "success" });

      // Try to actually log in and get cookies/token
      const loginResult = await attemptLogin(url, surfaceResult, cred, onEvent);
      if (loginResult.success) {
        return { strategy: "vault", ...cred, ...loginResult };
      }
      onEvent({ type: "log", msg: "Vault credential login failed — continuing with credential fields only", level: "warn" });
      return { strategy: "vault-fields", ...cred };
    }
  }

  // ── Strategy 2: Auto-registration ─────────────────────────────────────────
  const registerPage = surfaceResult.authPages?.find(p => p.type === "register");
  if (registerPage) {
    onEvent({ type: "log", msg: "No credential provided — attempting auto-registration", level: "ai" });
    const regResult = await attemptRegistration(registerPage.href, onEvent);
    if (regResult.success) {
      onEvent({ type: "log", msg: `Auto-registered: ${regResult.username}`, level: "success" });
      return { strategy: "auto-registered", ...regResult };
    }
    onEvent({ type: "log", msg: "Auto-registration failed — proceeding as guest", level: "warn" });
  }

  // ── Strategy 3: Guest ──────────────────────────────────────────────────────
  onEvent({ type: "log", msg: "Proceeding as guest (unauthenticated)", level: "info" });
  return { strategy: "guest" };
}

async function attemptLogin(baseUrl, surfaceResult, cred, onEvent) {
  const loginPage = surfaceResult.authPages?.find(p => p.type === "login");
  if (!loginPage) return { success: false };

  let browser;
  try {
    const { browser: b, page } = await launchBrowser();
    browser = b;

    onEvent({ type: "log", msg: `Attempting login at ${loginPage.href}`, level: "info" });
    await page.goto(loginPage.href, { waitUntil: "domcontentloaded", timeout: 15_000 });

    // Find and fill email/username
    const username = cred.username || cred["existingUser.username"] || cred.email || "";
    const password = cred.password || cred["existingUser.password"] || cred.token || "";

    if (username) {
      await page.locator('input[type="email"],input[name="email"],input[name="username"],input[name="login"]').first().fill(username).catch(() => {});
    }
    if (password) {
      await page.locator('input[type="password"]').first().fill(password).catch(() => {});
    }

    // Submit
    await page.locator('button[type="submit"],button:has-text("Login"),button:has-text("Sign in"),button:has-text("Log in")').first().click().catch(() => {});
    await page.waitForTimeout(2000);

    const shot = await captureScreenshot(page);
    onEvent({ type: "screenshot", data: shot, label: "After login attempt" });

    // Check if login succeeded (URL changed, no error messages)
    const currentUrl = page.url();
    const success = currentUrl !== loginPage.href && !currentUrl.includes("login") && !currentUrl.includes("error");

    const cookies = await page.context().cookies();
    return { success, cookies, afterLoginUrl: currentUrl, screenshot: shot };

  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function attemptRegistration(registerUrl, onEvent) {
  let browser;
  try {
    const { browser: b, page } = await launchBrowser();
    browser = b;

    // Generate test user
    const id       = crypto.randomUUID().slice(0, 8);
    const username = `atp_test_${id}`;
    const email    = `atp_test_${id}@mailinator.com`;
    const password = `AtpTest${id}!`;

    onEvent({ type: "log", msg: `Navigating to registration: ${registerUrl}`, level: "info" });
    await page.goto(registerUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });

    // Ask Claude to figure out the form fields
    const formHtml = await page.evaluate(() => {
      const form = document.querySelector("form");
      return form ? form.outerHTML.slice(0, 3000) : "";
    });

    if (!formHtml) return { success: false, reason: "No form found" };

    // Fill common registration fields
    await page.locator('input[name="firstName"],input[name="first_name"],input[placeholder*="First"]').first().fill("ATP").catch(() => {});
    await page.locator('input[name="lastName"],input[name="last_name"],input[placeholder*="Last"]').first().fill("TestUser").catch(() => {});
    await page.locator('input[type="email"],input[name="email"]').first().fill(email).catch(() => {});
    await page.locator('input[name="username"],input[name="login"]').first().fill(username).catch(() => {});
    await page.locator('input[type="password"]').first().fill(password).catch(() => {});
    await page.locator('input[name="confirmPassword"],input[name="password_confirmation"],input[name="confirm"]').first().fill(password).catch(() => {});

    // Accept terms if present
    await page.locator('input[type="checkbox"][name*="terms"],input[type="checkbox"][name*="agree"]').first().check().catch(() => {});

    const shot = await captureScreenshot(page);
    onEvent({ type: "screenshot", data: shot, label: "Registration form filled" });

    // Submit
    await page.locator('button[type="submit"],button:has-text("Register"),button:has-text("Sign up"),button:has-text("Create account")').first().click().catch(() => {});
    await page.waitForTimeout(3000);

    const afterUrl = page.url();
    const afterShot = await captureScreenshot(page);
    onEvent({ type: "screenshot", data: afterShot, label: "After registration" });

    const success = afterUrl !== registerUrl && !afterUrl.includes("error");
    const cookies = await page.context().cookies();

    return { success, username, email, password, cookies, afterUrl };

  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    await browser?.close().catch(() => {});
  }
}
