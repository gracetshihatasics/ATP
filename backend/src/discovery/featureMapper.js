import { launchBrowser }     from "../browser/launcher.js";
import { captureScreenshot } from "../browser/screenshot.js";

/**
 * Phase 3: Deep feature mapping.
 * For each feature area discovered in Phase 1, navigate into it,
 * interact with it, and capture what flows exist.
 *
 * @param {string} url
 * @param {object} surfaceResult — from surfaceScanner
 * @param {object} authContext   — from authResolver
 * @param {(event:object)=>void} onEvent
 * @returns {Promise<FeatureArea[]>}
 */
export async function mapFeatures(url, surfaceResult, authContext, onEvent = () => {}) {
  onEvent({ type: "phase", phase: 3, msg: "Deep feature mapping..." });

  const featureAreas = [];
  let browser;

  try {
    const { browser: b, page } = await launchBrowser(
      (msg) => onEvent({ type: "log", msg: `🚫 ${msg}`, level: "info" })
    );
    browser = b;

    // Inject auth cookies if we have them
    if (authContext.cookies?.length) {
      await page.context().addCookies(authContext.cookies);
      onEvent({ type: "log", msg: "Injected auth cookies", level: "success" });
    }

    // Navigate to home first
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1000);

    // Build feature list from both signals and nav pages
    const featuresToMap = buildFeatureList(surfaceResult);
    onEvent({ type: "log", msg: `Mapping ${featuresToMap.length} feature areas`, level: "info" });

    for (const feature of featuresToMap) {
      onEvent({ type: "feature_start", feature: feature.name });
      const mapped = await mapOneFeature(page, url, feature, authContext, onEvent);
      featureAreas.push(mapped);
      onEvent({ type: "feature_done", feature: feature.name, flows: mapped.flows.length });
    }

  } finally {
    await browser?.close().catch(() => {});
  }

  return featureAreas;
}

function buildFeatureList(surfaceResult) {
  const features = [];
  const seen     = new Set();

  // From UI signals
  for (const { feature, keyword } of surfaceResult.uiSignals?.features ?? []) {
    if (!seen.has(feature)) {
      seen.add(feature);
      // Find a nav link that matches this feature
      const link = surfaceResult.navLinks?.find(l =>
        l.text.toLowerCase().includes(keyword) || l.href.toLowerCase().includes(keyword)
      );
      features.push({ name: feature, keyword, url: link?.href ?? null });
    }
  }

  // From nav pages that weren't already covered
  for (const page of surfaceResult.pageMap ?? []) {
    const name = page.text || page.title;
    if (name && !seen.has(name)) {
      seen.add(name);
      features.push({ name, keyword: name.toLowerCase(), url: page.href });
    }
  }

  return features.slice(0, 20); // cap at 20 feature areas
}

async function mapOneFeature(page, baseUrl, feature, authContext, onEvent) {
  const flows = [];

  try {
    // Navigate to the feature URL if we have one
    if (feature.url) {
      await page.goto(feature.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      await page.waitForTimeout(800);
    }

    const screenshot = await captureScreenshot(page);
    onEvent({ type: "screenshot", data: screenshot, label: feature.name });

    // Analyse the page
    const analysis = await page.evaluate((featureName) => {
      const buttons  = Array.from(document.querySelectorAll("button,[role='button']")).slice(0,15).map(b => b.innerText?.trim()).filter(Boolean);
      const links    = Array.from(document.querySelectorAll("a")).slice(0,20).map(a => ({ text: a.innerText?.trim(), href: a.href })).filter(l => l.text);
      const forms    = Array.from(document.querySelectorAll("form")).length;
      const inputs   = Array.from(document.querySelectorAll("input,select,textarea")).slice(0,10).map(i => i.placeholder || i.name || i.type).filter(Boolean);
      const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4")).slice(0,8).map(h => h.innerText?.trim()).filter(Boolean);
      const bodyText = document.body?.innerText?.slice(0, 800) ?? "";
      return { buttons, links, forms, inputs, headings, bodyText };
    }, feature.name);

    // Derive flows from the analysis
    flows.push(...deriveFlows(feature, analysis, authContext));

    // Try clicking primary CTAs to discover sub-flows
    const ctaFlows = await exploreInteractions(page, analysis.buttons, feature, onEvent);
    flows.push(...ctaFlows);

    return {
      name:       feature.name,
      url:        feature.url ?? baseUrl,
      screenshot,
      analysis,
      flows,
    };

  } catch (err) {
    return { name: feature.name, url: feature.url ?? baseUrl, flows, error: err.message };
  }
}

function deriveFlows(feature, analysis, authContext) {
  const flows = [];
  const isAuth = authContext.strategy !== "guest";

  const { buttons, forms, inputs, headings, bodyText } = analysis;
  const text = (buttons.join(" ") + headings.join(" ") + bodyText).toLowerCase();

  // Generic flow derivation based on what's on the page
  const flowPatterns = [
    { keywords: ["add to cart","add to bag"],           flow: "Add item to cart" },
    { keywords: ["checkout","proceed"],                  flow: "Complete checkout flow" },
    { keywords: ["login","sign in"],                     flow: "User login" },
    { keywords: ["register","sign up","create account"], flow: "User registration" },
    { keywords: ["search","find"],                       flow: "Search functionality" },
    { keywords: ["filter","sort"],                       flow: "Filter and sort results" },
    { keywords: ["wishlist","save","favourite"],          flow: "Add to wishlist" },
    { keywords: ["review","rating"],                     flow: "Submit product review" },
    { keywords: ["track","tracking"],                    flow: "Track order" },
    { keywords: ["return","refund"],                     flow: "Initiate return" },
    { keywords: ["address","shipping"],                  flow: "Manage shipping address" },
    { keywords: ["payment","pay"],                       flow: "Payment management" },
    { keywords: ["loyalty","points","reward"],           flow: "View/redeem loyalty points" },
    { keywords: ["profile","account","settings"],        flow: "Update profile" },
    { keywords: ["password","security"],                 flow: "Change password" },
    { keywords: ["notification","alert"],               flow: "Manage notifications" },
    { keywords: ["subscribe","newsletter"],              flow: "Newsletter subscription" },
    { keywords: ["coupon","promo","discount"],           flow: "Apply coupon code" },
    { keywords: ["gift","gift card"],                    flow: "Gift card management" },
    { keywords: ["compare"],                             flow: "Compare products" },
    { keywords: ["share","social"],                      flow: "Share product" },
    { keywords: ["store","location"],                    flow: "Find store" },
  ];

  for (const { keywords, flow } of flowPatterns) {
    if (keywords.some(k => text.includes(k))) {
      // Skip auth-required flows if we are guest
      const requiresAuth = ["wishlist","review","track","return","address","payment","loyalty","profile","password","notification"].some(k => flow.toLowerCase().includes(k));
      if (requiresAuth && !isAuth) {
        flows.push({ name: flow, requiresAuth: true, available: false, reason: "Requires authentication" });
      } else {
        flows.push({ name: flow, requiresAuth, available: true });
      }
    }
  }

  // If forms found, add form-based flows
  if (forms > 0 && inputs.length > 0) {
    flows.push({ name: `${feature.name} form submission`, requiresAuth: false, available: true, inputs });
  }

  return flows;
}

async function exploreInteractions(page, buttons, feature, onEvent) {
  const flows = [];
  const interestingButtons = buttons.filter(b =>
    b.length > 2 && !["close","cancel","back","×","✕"].includes(b.toLowerCase())
  ).slice(0, 3);

  for (const btnText of interestingButtons) {
    try {
      const btn = page.locator(`button:has-text("${btnText}")`).first();
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) continue;

      await btn.click({ timeout: 3000 });
      await page.waitForTimeout(800);

      const shot = await captureScreenshot(page);
      onEvent({ type: "screenshot", data: shot, label: `${feature.name} → ${btnText}` });

      flows.push({ name: `${btnText} interaction`, requiresAuth: false, available: true, triggered: true });
      await page.goBack().catch(() => {});
      await page.waitForTimeout(500);
    } catch {}
  }
  return flows;
}
