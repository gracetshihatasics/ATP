import { launchBrowser }     from "../browser/launcher.js";
import { captureScreenshot } from "../browser/screenshot.js";
import { handlePopups }      from "../browser/popupHandler.js";

/**
 * Phase 1: Surface scan — no auth required.
 * Fetches the URL, analyses DOM structure, extracts navigation,
 * identifies feature areas and public flows.
 *
 * @param {string} url
 * @param {(event:object)=>void} onEvent
 * @returns {Promise<SurfaceScanResult>}
 */
export async function surfaceScan(url, onEvent = () => {}) {
  onEvent({ type: "phase", phase: 1, msg: "Launching browser for surface scan..." });

  let browser;
  try {
    const { browser: b, page } = await launchBrowser(
      (msg) => onEvent({ type: "log", msg: `🚫 ${msg}`, level: "info" })
    );
    browser = b;

    // Navigate to the URL
    onEvent({ type: "log", msg: `Navigating to ${url}`, level: "info" });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 }).catch(() =>
      page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
    );
    await handlePopups(page, (msg) => onEvent({ type: "log", msg, level: "info" }));

    const screenshot = await captureScreenshot(page);
    onEvent({ type: "screenshot", data: screenshot, label: "Homepage" });

    // Extract page title, meta description, app signals
    const meta = await page.evaluate(() => ({
      title:       document.title,
      description: document.querySelector('meta[name="description"]')?.content ?? "",
      keywords:    document.querySelector('meta[name="keywords"]')?.content ?? "",
      ogType:      document.querySelector('meta[property="og:type"]')?.content ?? "",
      generator:   document.querySelector('meta[name="generator"]')?.content ?? "",
      hasReact:    !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || !!document.querySelector('[data-reactroot]'),
      hasNext:     !!window.__NEXT_DATA__,
      hasNuxt:     !!window.__NUXT__,
      bodyText:    document.body?.innerText?.slice(0, 2000) ?? "",
    }));

    onEvent({ type: "log", msg: `Page: ${meta.title}`, level: "info" });

    // Extract all navigation links
    const navLinks = await extractNavLinks(page, url);
    onEvent({ type: "log", msg: `Found ${navLinks.length} navigation links`, level: "info" });

    // Extract key UI elements
    const uiSignals = await extractUISignals(page);
    onEvent({ type: "log", msg: `Detected ${uiSignals.features.length} feature signals`, level: "info" });

    // Try to find auth-related pages
    const authPages = await findAuthPages(page, url, navLinks);
    onEvent({ type: "log", msg: `Auth pages: ${authPages.map(p => p.type).join(", ") || "none found"}`, level: "info" });

    // Visit top-level nav pages and grab their structure
    const pageMap = await mapNavPages(page, url, navLinks.slice(0, 12), onEvent);

    return {
      url,
      meta,
      navLinks,
      uiSignals,
      authPages,
      pageMap,
      screenshot,
    };

  } finally {
    await browser?.close().catch(() => {});
  }
}

async function extractNavLinks(page, baseUrl) {
  return page.evaluate((base) => {
    const links = [];
    const seen  = new Set();

    document.querySelectorAll("nav a, header a, [role='navigation'] a, .nav a, .menu a, .navbar a").forEach(a => {
      const href  = a.href;
      const text  = a.innerText?.trim();
      const label = a.getAttribute("aria-label") ?? "";

      if (!href || !text || seen.has(href)) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (href.includes("#") && !href.includes("?")) return;

      try {
        const u = new URL(href);
        if (u.hostname !== new URL(base).hostname) return; // external links
      } catch { return; }

      seen.add(href);
      links.push({ href, text: text.slice(0, 60), label: label.slice(0, 60) });
    });

    return links.slice(0, 30);
  }, baseUrl);
}

async function extractUISignals(page) {
  return page.evaluate(() => {
    const features = [];
    const body = document.body?.innerText?.toLowerCase() ?? "";
    const html = document.documentElement?.innerHTML?.toLowerCase() ?? "";

    const signals = [
      { keyword: "loyalty",      feature: "Loyalty Program" },
      { keyword: "reward",       feature: "Rewards" },
      { keyword: "cart",         feature: "Shopping Cart" },
      { keyword: "checkout",     feature: "Checkout" },
      { keyword: "wishlist",     feature: "Wishlist" },
      { keyword: "account",      feature: "User Account" },
      { keyword: "profile",      feature: "Profile Management" },
      { keyword: "order",        feature: "Order Management" },
      { keyword: "track",        feature: "Order Tracking" },
      { keyword: "search",       feature: "Product Search" },
      { keyword: "filter",       feature: "Product Filtering" },
      { keyword: "review",       feature: "Product Reviews" },
      { keyword: "subscribe",    feature: "Newsletter/Subscription" },
      { keyword: "newsletter",   feature: "Newsletter" },
      { keyword: "login",        feature: "Authentication" },
      { keyword: "register",     feature: "Registration" },
      { keyword: "dashboard",    feature: "Dashboard" },
      { keyword: "payment",      feature: "Payment" },
      { keyword: "address",      feature: "Address Management" },
      { keyword: "notification",  feature: "Notifications" },
      { keyword: "return",       feature: "Returns & Refunds" },
      { keyword: "size",         feature: "Size Guide" },
      { keyword: "store",        feature: "Store Locator" },
      { keyword: "gift",         feature: "Gift Cards" },
      { keyword: "promotion",    feature: "Promotions" },
      { keyword: "coupon",       feature: "Coupons & Discounts" },
      { keyword: "compare",      feature: "Product Comparison" },
      { keyword: "social",       feature: "Social Features" },
      { keyword: "share",        feature: "Social Sharing" },
      { keyword: "language",     feature: "Multi-language" },
      { keyword: "currency",     feature: "Multi-currency" },
    ];

    for (const { keyword, feature } of signals) {
      if (body.includes(keyword) || html.includes(keyword)) {
        if (!features.find(f => f.feature === feature)) {
          features.push({ feature, keyword });
        }
      }
    }

    // Form detection
    const forms = document.querySelectorAll("form");
    const formTypes = [];
    forms.forEach(f => {
      const action = f.action ?? "";
      const inputs = Array.from(f.querySelectorAll("input")).map(i => i.type || i.name).filter(Boolean);
      if (inputs.includes("email") || inputs.includes("password")) formTypes.push("auth-form");
      if (inputs.includes("search") || inputs.includes("q")) formTypes.push("search-form");
    });

    return { features, formTypes: [...new Set(formTypes)] };
  });
}

async function findAuthPages(page, baseUrl, navLinks) {
  const authKeywords = ["login", "sign-in", "signin", "register", "signup", "sign-up", "account", "auth"];
  const authPages = [];

  for (const link of navLinks) {
    const text = (link.text + link.href).toLowerCase();
    for (const kw of authKeywords) {
      if (text.includes(kw)) {
        const type = ["login","sign-in","signin"].some(k => text.includes(k)) ? "login"
          : ["register","signup","sign-up"].some(k => text.includes(k)) ? "register"
          : "account";
        authPages.push({ ...link, type });
        break;
      }
    }
  }
  return authPages;
}

async function mapNavPages(page, baseUrl, navLinks, onEvent) {
  const pageMap = [];

  for (const link of navLinks) {
    try {
      onEvent({ type: "log", msg: `  Scanning: ${link.text}`, level: "info" });
      await page.goto(link.href, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await handlePopups(page, (msg) => onEvent({ type: "log", msg, level: "info" }));
      // Wait for page to fully render including lazy-loaded content
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);

      const screenshot = await captureScreenshot(page);
      const content = await page.evaluate(() => ({
        title:    document.title,
        headings: Array.from(document.querySelectorAll("h1,h2,h3")).slice(0,6).map(h => h.innerText?.trim()).filter(Boolean),
        bodyText: document.body?.innerText?.slice(0, 500) ?? "",
        forms:    document.querySelectorAll("form").length,
        buttons:  Array.from(document.querySelectorAll("button,[role='button']")).slice(0,10).map(b => b.innerText?.trim()).filter(Boolean),
        inputs:   Array.from(document.querySelectorAll("input")).slice(0,8).map(i => i.placeholder || i.name || i.type).filter(Boolean),
      }));

      pageMap.push({ ...link, ...content, screenshot });
      onEvent({ type: "page_scanned", link, screenshot, title: content.title });
    } catch {
      // skip pages that fail to load
    }
  }

  return pageMap;
}
