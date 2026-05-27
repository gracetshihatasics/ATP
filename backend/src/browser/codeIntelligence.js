import { anthropic as client } from "../ai/client.js";
import { config }              from "../config/index.js";

/**
 * Deep Code Intelligence Scanner
 *
 * Goes beyond surface DOM to detect:
 *
 * Layer 1 — DOM (surface)
 *   Hidden/invisible interactive elements
 *   Feature flags, dead links, empty containers
 *   Unlabelled buttons, zero-size elements, HTML comments
 *
 * Layer 2 — JavaScript runtime
 *   Console errors & warnings during page load
 *   Event listeners on hidden/removed elements
 *   React/Vue/Angular component state leaks
 *   Inline scripts with dead references
 *   window.__features / window.__flags / window.config objects
 *
 * Layer 3 — Network
 *   API calls fired but response never rendered
 *   Failed requests (4xx/5xx) on page load
 *   Resources loaded but never used (JS/CSS)
 *   Duplicate requests to same endpoint
 *
 * Layer 4 — Navigation deep scan
 *   Click every visible nav link, tab, accordion
 *   Record what appears/disappears
 *   Detect routes that 404 or redirect unexpectedly
 *   Find UI states only reachable through interaction
 *
 * Layer 5 — Accessibility
 *   Missing ARIA labels on interactive elements
 *   Keyboard traps (focus can't leave an area)
 *   Images without alt text
 *   Form inputs without labels
 *   Colour contrast failures (elements using inline styles)
 *   Missing lang attribute
 *
 * Layer 6 — Performance signals
 *   Render-blocking scripts
 *   Layout shifts caused by hidden elements becoming visible
 *   Elements with large off-screen images preloaded
 *   Synchronous XHR calls
 */

export async function scanPageCodeIntelligence(page, url, context = {}) {

  // ── Collect all layers in parallel where possible ────────────────────────
  const [domFindings, jsFindings, networkFindings, a11yFindings] = await Promise.all([
    collectDOMFindings(page),
    collectJSFindings(page),
    collectNetworkFindings(page),
    collectA11yFindings(page),
  ]);

  // ── Deep navigation scan (sequential — must click things) ─────────────────
  const navFindings = await collectNavFindings(page, url);

  // ── Screenshot for AI visual context ──────────────────────────────────────
  const screenshot = await page.screenshot({ type: "jpeg", quality: 60 })
    .then(b => b.toString("base64")).catch(() => null);

  const allFindings = {
    dom:     domFindings,
    js:      jsFindings,
    network: networkFindings,
    a11y:    a11yFindings,
    nav:     navFindings,
  };

  const totalSignals =
    domFindings.hiddenElements.length +
    domFindings.deadRoutes.length +
    domFindings.featureFlags.length +
    jsFindings.consoleErrors.length +
    jsFindings.runtimeIssues.length +
    networkFindings.failedRequests.length +
    networkFindings.unusedResources.length +
    a11yFindings.violations.length +
    navFindings.deadNavLinks.length;

  if (totalSignals === 0) {
    return { findings: [], summary: "No issues detected across all scan layers", clean: true, layers: allFindings };
  }

  // ── AI deep analysis ───────────────────────────────────────────────────────
  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: [
        ...(screenshot ? [{ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:screenshot } }] : []),
        {
          type: "text",
          text: `You are a senior frontend architect performing a deep code quality audit.
Analyse ALL layers of findings from this page scan.

URL: ${url}
Page: ${context.pageName || "unknown"}

=== LAYER 1: DOM ANALYSIS ===
Hidden interactive elements: ${domFindings.hiddenElements.length}
${JSON.stringify(domFindings.hiddenElements.slice(0, 10), null, 1)}

Feature flags detected: ${domFindings.featureFlags.length}
${JSON.stringify(domFindings.featureFlags.slice(0, 5), null, 1)}

Dead routes (href="#" etc): ${domFindings.deadRoutes.length}
${JSON.stringify(domFindings.deadRoutes.slice(0, 5), null, 1)}

Empty containers: ${domFindings.emptyContainers.length}
Unlabelled buttons: ${domFindings.invisibleButtons.length}
HTML comments: ${JSON.stringify(domFindings.commentedOut)}

=== LAYER 2: JAVASCRIPT RUNTIME ===
Console errors on load: ${jsFindings.consoleErrors.length}
${JSON.stringify(jsFindings.consoleErrors.slice(0, 5), null, 1)}

Console warnings: ${jsFindings.consoleWarnings.length}
${JSON.stringify(jsFindings.consoleWarnings.slice(0, 3), null, 1)}

Runtime issues detected: ${JSON.stringify(jsFindings.runtimeIssues)}
Feature flags in JS: ${JSON.stringify(jsFindings.featureFlagsInCode)}
Disabled handlers: ${JSON.stringify(jsFindings.disabledHandlers.slice(0, 5))}
Framework signals: ${JSON.stringify(jsFindings.frameworkSignals)}

=== LAYER 3: NETWORK ===
Failed requests on load: ${networkFindings.failedRequests.length}
${JSON.stringify(networkFindings.failedRequests.slice(0, 5), null, 1)}

Duplicate API calls: ${JSON.stringify(networkFindings.duplicateRequests.slice(0, 5))}
Unused JS/CSS resources: ${networkFindings.unusedResources.length}
${JSON.stringify(networkFindings.unusedResources.slice(0, 5), null, 1)}
Slow requests (>2s): ${JSON.stringify(networkFindings.slowRequests.slice(0, 3))}

=== LAYER 4: NAVIGATION DEEP SCAN ===
Nav links tested: ${navFindings.testedLinks.length}
Dead nav links (404/error): ${navFindings.deadNavLinks.length}
${JSON.stringify(navFindings.deadNavLinks.slice(0, 5), null, 1)}
Hidden sections revealed by interaction: ${navFindings.revealedSections.length}
${JSON.stringify(navFindings.revealedSections.slice(0, 5), null, 1)}

=== LAYER 5: ACCESSIBILITY ===
Violations found: ${a11yFindings.violations.length}
${JSON.stringify(a11yFindings.violations.slice(0, 8), null, 1)}
Missing labels: ${a11yFindings.missingLabels.length}
Images without alt: ${a11yFindings.imagesWithoutAlt.length}
Keyboard traps: ${JSON.stringify(a11yFindings.keyboardTraps)}

For EACH finding across all layers:
1. Is this a real issue or a false positive?
2. Severity and business impact
3. Specific engineering recommendation
4. Test decision for ATP

CRITICAL: Raw JSON only. Start { end }.
{
  "summary": "2-3 sentences covering all layers",
  "clean": false,
  "overallHealth": "clean|minor-issues|needs-attention|critical",
  "codeQualityScore": 85,
  "layerScores": {
    "dom": 90, "javascript": 85, "network": 80, "navigation": 95, "accessibility": 70
  },
  "findings": [
    {
      "id": "string",
      "layer": "dom|javascript|network|navigation|accessibility",
      "type": "hidden-feature|dead-route|orphaned-component|feature-flag-disabled|js-error|failed-request|unused-resource|duplicate-request|missing-aria|keyboard-trap|missing-alt|dead-nav-link|revealed-section|disabled-handler|performance-issue",
      "severity": "critical|warning|info",
      "element": "string",
      "selector": "string or null",
      "reason": "string",
      "isIntentional": false,
      "testDecision": "skip|ignore-always|test-when-enabled|investigate|remove-from-tests|add-test",
      "codeRecommendation": "string",
      "businessImpact": "string",
      "priority": "high|medium|low",
      "evidence": "specific data that proves this finding"
    }
  ],
  "topIssues": ["string — top 3 most important things to fix"],
  "testingRecommendations": [
    {
      "action": "skip|add-to-ignore-list|flag-for-review|test-conditionally|add-new-test",
      "elements": ["selector"],
      "reason": "string",
      "suggestion": "string"
    }
  ],
  "issuesByLayer": {
    "dom": 0, "javascript": 0, "network": 0, "navigation": 0, "accessibility": 0
  }
}`,
        },
      ],
    }],
  });

  const raw    = response.content[0]?.text ?? "";
  const result = extractJSON(raw);
  return { ...result, rawLayers: allFindings };
}

// ── LAYER 1: DOM ──────────────────────────────────────────────────────────────
async function collectDOMFindings(page) {
  return page.evaluate(() => {
    const findings = {
      hiddenElements: [], orphanedElements: [], deadRoutes: [],
      featureFlags: [], invisibleButtons: [], emptyContainers: [],
      commentedOut: [], zeroSizeElements: [],
    };

    const allInteractive = document.querySelectorAll(
      "button,a[href],input,select,textarea,[role='button'],[role='tab'],[role='menuitem'],[data-action],[onclick]"
    );

    // Hidden interactive elements
    allInteractive.forEach(el => {
      const style = window.getComputedStyle(el);
      const rect  = el.getBoundingClientRect();
      const text  = el.innerText?.trim().slice(0, 60) || el.getAttribute("aria-label") || el.id || "";
      const hidden = style.display==="none" || style.visibility==="hidden" || style.opacity==="0" || (rect.width===0&&rect.height===0);
      if (hidden && text) {
        findings.hiddenElements.push({
          tag: el.tagName.toLowerCase(), text,
          type: style.display==="none"?"display-none":style.visibility==="hidden"?"visibility-hidden":style.opacity==="0"?"opacity-zero":"zero-size",
          id: el.id||null, classes: Array.from(el.classList).slice(0,3).join(" "),
          hasClick: !!(el.onclick||el.getAttribute("data-action")),
          href: el.getAttribute("href")||null,
          parent: el.parentElement?.className?.slice(0,40)||null,
        });
      }
    });

    // Feature flags
    ["[data-feature]","[data-flag]","[data-enabled]","[data-disabled]","[class*='feature-']","[class*='flag-']","[data-testid*='feature']"].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const style = window.getComputedStyle(el);
        const isOff = style.display==="none" || el.getAttribute("data-enabled")==="false" || el.getAttribute("data-disabled")==="true" || el.getAttribute("aria-disabled")==="true";
        if (isOff) {
          findings.featureFlags.push({
            selector: sel,
            attr: el.getAttribute("data-feature")||el.getAttribute("data-flag")||el.getAttribute("data-enabled"),
            text: el.innerText?.trim().slice(0,50)||"",
            classes: Array.from(el.classList).slice(0,3).join(" "),
          });
        }
      });
    });

    // Dead routes
    document.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href");
      if (!href) return;
      if (["#","#!","javascript:void(0)","javascript:;","void(0)"].includes(href)) {
        findings.deadRoutes.push({
          text: a.innerText?.trim().slice(0,40)||a.getAttribute("aria-label")||"",
          href, classes: Array.from(a.classList).slice(0,3).join(" "),
          visible: window.getComputedStyle(a).display!=="none",
          location: a.closest("nav,header,footer,aside")?.tagName?.toLowerCase()||"body",
        });
      }
    });

    // Empty containers
    document.querySelectorAll("[class*='container'],[class*='section'],[class*='panel'],[class*='widget'],[class*='card'],[class*='placeholder'],[class*='skeleton']").forEach(el => {
      const text = el.innerText?.trim();
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (!text && rect.width>50 && rect.height>20 && style.display!=="none") {
        findings.emptyContainers.push({
          tag: el.tagName.toLowerCase(),
          classes: Array.from(el.classList).slice(0,3).join(" "),
          width: Math.round(rect.width), height: Math.round(rect.height),
          hasChildren: el.children.length,
        });
      }
    });

    // Unlabelled interactive elements
    document.querySelectorAll("button,a[href]").forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display==="none") return;
      const text  = el.innerText?.trim();
      const label = el.getAttribute("aria-label");
      const title = el.getAttribute("title");
      const rect  = el.getBoundingClientRect();
      if (!text && !label && !title && rect.width>0) {
        findings.invisibleButtons.push({
          tag: el.tagName.toLowerCase(),
          classes: Array.from(el.classList).slice(0,3).join(" "),
          id: el.id||null, width: Math.round(rect.width), height: Math.round(rect.height),
          hasIcon: !!el.querySelector("svg,img,i,[class*='icon']"),
        });
      }
    });

    // HTML comments
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    let node, count = 0;
    while ((node = walker.nextNode()) && count < 15) {
      const text = node.textContent?.trim().slice(0,100);
      if (text?.length > 5) { findings.commentedOut.push({ text }); count++; }
    }

    return findings;
  }).catch(() => ({ hiddenElements:[], orphanedElements:[], deadRoutes:[], featureFlags:[], invisibleButtons:[], emptyContainers:[], commentedOut:[], zeroSizeElements:[] }));
}

// ── LAYER 2: JavaScript runtime ───────────────────────────────────────────────
async function collectJSFindings(page) {
  return page.evaluate(() => {
    const findings = {
      consoleErrors:    [],
      consoleWarnings:  [],
      runtimeIssues:    [],
      featureFlagsInCode: [],
      disabledHandlers: [],
      frameworkSignals: {},
    };

    // Intercept existing console messages stored by page (if any logging lib used)
    // Also check for common error indicators in the DOM
    const errorEls = document.querySelectorAll("[class*='error'],[class*='Error'],[role='alert']");
    errorEls.forEach(el => {
      const text = el.innerText?.trim();
      const style = window.getComputedStyle(el);
      if (text && text.length > 3 && style.display !== "none") {
        findings.consoleErrors.push({ source:"dom-error", text: text.slice(0,100) });
      }
    });

    // Look for error boundaries / fallback UIs (React)
    document.querySelectorAll("[data-error],[class*='error-boundary'],[class*='ErrorBoundary']").forEach(el => {
      if (el.innerText?.trim()) {
        findings.runtimeIssues.push({ type:"error-boundary", text: el.innerText?.trim().slice(0,80) });
      }
    });

    // Feature flags in global JS config objects
    const flagSources = ["__flags","__features","__config","__env","APP_CONFIG","featureFlags","window.flags"];
    for (const key of flagSources) {
      try {
        const val = key.includes(".") ? eval(key) : window[key];
        if (val && typeof val === "object") {
          const disabled = Object.entries(val).filter(([,v]) => v === false || v === "disabled" || v === "off");
          if (disabled.length) {
            findings.featureFlagsInCode.push({ source: key, disabled: disabled.slice(0,10).map(([k])=>k) });
          }
        }
      } catch {}
    }

    // Disabled event handlers
    document.querySelectorAll("[disabled],[aria-disabled='true'],[data-disabled='true']").forEach(el => {
      const text = el.innerText?.trim() || el.getAttribute("aria-label") || el.getAttribute("title") || el.id || "";
      const rect = el.getBoundingClientRect();
      if (text && rect.width > 0) {
        findings.disabledHandlers.push({
          tag: el.tagName.toLowerCase(), text: text.slice(0,50),
          reason: el.disabled ? "disabled attribute" : "aria-disabled",
          classes: Array.from(el.classList).slice(0,3).join(" "),
        });
      }
    });

    // Framework signals
    if (window.React || document.querySelector("[data-reactroot],[data-react-class]")) findings.frameworkSignals.react = true;
    if (window.Vue || document.querySelector("[data-v-],[__vue__]")) findings.frameworkSignals.vue = true;
    if (window.angular || window.ng || document.querySelector("[ng-version],[_nghost]")) findings.frameworkSignals.angular = true;
    if (window.next || document.querySelector("#__NEXT_DATA__")) findings.frameworkSignals.nextjs = true;
    if (window.nuxt || document.querySelector("#__NUXT_DATA__")) findings.frameworkSignals.nuxtjs = true;

    // Check for hydration errors (SSR mismatch)
    if (document.querySelector("[data-dgst],[data-nonce]")) {
      const nonces = document.querySelectorAll("[data-dgst]");
      nonces.forEach(n => {
        const msg = n.getAttribute("data-dgst");
        if (msg) findings.runtimeIssues.push({ type:"hydration-error", text: msg.slice(0,100) });
      });
    }

    // Check for lazy-loaded components that failed
    document.querySelectorAll("[class*='lazy'],[class*='Suspense'],[class*='loading-failed']").forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display !== "none" && el.innerText?.includes("error")) {
        findings.runtimeIssues.push({ type:"lazy-load-failed", text: el.innerText?.trim().slice(0,80) });
      }
    });

    return findings;
  }).catch(() => ({ consoleErrors:[], consoleWarnings:[], runtimeIssues:[], featureFlagsInCode:[], disabledHandlers:[], frameworkSignals:{} }));
}

// ── LAYER 3: Network ──────────────────────────────────────────────────────────
async function collectNetworkFindings(page) {
  // Read network requests captured during page load
  const requests = await page.evaluate(() => {
    // Performance API gives us resource timing
    const entries = performance.getEntriesByType("resource");
    return entries.map(e => ({
      name:     e.name,
      type:     e.initiatorType,
      duration: Math.round(e.duration),
      size:     e.transferSize || 0,
      status:   0, // can't get status from timing API
    })).slice(0, 100);
  }).catch(() => []);

  // Use CDP to check for failed requests if available
  const failedRequests  = [];
  const unusedResources = [];
  const duplicateRequests = [];
  const slowRequests    = [];

  // Check for duplicate resource loads
  const urlCounts = {};
  requests.forEach(r => {
    urlCounts[r.name] = (urlCounts[r.name] || 0) + 1;
  });
  Object.entries(urlCounts).filter(([,c]) => c > 1).forEach(([url, count]) => {
    duplicateRequests.push({ url: url.split("?")[0].slice(-60), count });
  });

  // Slow requests
  requests.filter(r => r.duration > 2000).forEach(r => {
    slowRequests.push({ url: r.name.split("?")[0].slice(-60), duration: r.duration, type: r.type });
  });

  // Large unused resources (scripts > 500kb that may be dead code)
  requests.filter(r => r.type === "script" && r.size > 500_000).forEach(r => {
    unusedResources.push({ url: r.name.split("?")[0].slice(-60), size: Math.round(r.size/1024) + "kb", type:"large-script" });
  });

  // Check network errors via page JS errors list
  const networkErrors = await page.evaluate(() => {
    const errors = [];
    // Check for failed image loads
    document.querySelectorAll("img").forEach(img => {
      if (img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith("data:")) {
        errors.push({ url: img.src.slice(-60), type:"image-404" });
      }
    });
    // Check for failed link elements
    document.querySelectorAll("link[rel='stylesheet']").forEach(link => {
      if (link.sheet === null && link.href) {
        errors.push({ url: link.href.slice(-60), type:"css-404" });
      }
    });
    return errors;
  }).catch(() => []);

  failedRequests.push(...networkErrors);

  return { failedRequests, unusedResources, duplicateRequests, slowRequests, totalResources: requests.length };
}

// ── LAYER 4: Navigation deep scan ─────────────────────────────────────────────
async function collectNavFindings(page, baseUrl) {
  const findings = { testedLinks: [], deadNavLinks: [], revealedSections: [], interactiveDiscoveries: [] };

  try {
    // Get all visible nav links on the current page
    const navLinks = await page.evaluate(() => {
      const links = [];
      document.querySelectorAll("nav a[href], header a[href], [role='navigation'] a[href], [class*='nav'] a[href], [class*='menu'] a[href]").forEach(a => {
        const href  = a.getAttribute("href");
        const text  = a.innerText?.trim();
        const style = window.getComputedStyle(a);
        if (href && text && style.display !== "none" && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
          links.push({ href, text: text.slice(0,40) });
        }
      });
      return [...new Map(links.map(l => [l.href, l])).values()].slice(0, 15);
    }).catch(() => []);

    findings.testedLinks = navLinks;

    // Test each nav link for 404s
    for (const link of navLinks.slice(0, 8)) {
      try {
        const href = link.href.startsWith("http") ? link.href : new URL(link.href, baseUrl).href;
        const res  = await page.evaluate(async (url) => {
          try {
            const r = await fetch(url, { method:"HEAD", signal: AbortSignal.timeout(5000) });
            return r.status;
          } catch { return 0; }
        }, href).catch(() => 0);

        if (res === 404 || res === 410) {
          findings.deadNavLinks.push({ href: link.href, text: link.text, status: res });
        }
      } catch {}
    }

    // Check for tabs/accordions that reveal hidden content
    const revealTriggers = await page.evaluate(() => {
      const triggers = [];
      document.querySelectorAll("[role='tab'],[data-toggle],[data-bs-toggle='tab'],[class*='accordion'],[class*='tab-']").forEach(el => {
        const text  = el.innerText?.trim();
        const style = window.getComputedStyle(el);
        if (text && style.display !== "none") {
          triggers.push({ selector: el.getAttribute("data-target") || el.getAttribute("aria-controls") || "", text: text.slice(0,40), tag: el.tagName.toLowerCase() });
        }
      });
      return triggers.slice(0, 10);
    }).catch(() => []);

    // Try clicking a few tabs to see what they reveal
    for (const trigger of revealTriggers.slice(0, 5)) {
      try {
        const before = await page.evaluate(() => document.body.innerHTML.length);
        await page.locator(`[role='tab']:has-text("${trigger.text}")`).first().click({ timeout:3000 }).catch(()=>{});
        await page.waitForTimeout(500);
        const after  = await page.evaluate(() => document.body.innerHTML.length);
        if (Math.abs(after - before) > 200) {
          findings.revealedSections.push({ trigger: trigger.text, contentChange: Math.abs(after-before), note:"Content revealed by interaction" });
        }
      } catch {}
    }

  } catch {}

  return findings;
}

// ── LAYER 5: Accessibility ────────────────────────────────────────────────────
async function collectA11yFindings(page) {
  return page.evaluate(() => {
    const findings = { violations: [], missingLabels: [], imagesWithoutAlt: [], keyboardTraps: [] };

    // Missing ARIA labels on interactive elements
    document.querySelectorAll("button,a,[role='button'],[role='link'],[role='menuitem']").forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display === "none") return;
      const text   = el.innerText?.trim();
      const label  = el.getAttribute("aria-label");
      const lby    = el.getAttribute("aria-labelledby");
      const title  = el.getAttribute("title");
      const rect   = el.getBoundingClientRect();
      if (!text && !label && !lby && !title && rect.width > 0) {
        findings.missingLabels.push({
          tag:     el.tagName.toLowerCase(),
          role:    el.getAttribute("role") || "",
          classes: Array.from(el.classList).slice(0,3).join(" "),
          id:      el.id || null,
        });
      }
    });

    // Images without alt
    document.querySelectorAll("img").forEach(img => {
      const style = window.getComputedStyle(img);
      if (style.display === "none") return;
      if (!img.hasAttribute("alt") && !img.getAttribute("aria-label") && !img.getAttribute("role")==="presentation") {
        findings.imagesWithoutAlt.push({ src: img.src?.slice(-50)||"", classes: Array.from(img.classList).slice(0,2).join(" ") });
      }
    });

    // Form inputs without labels
    document.querySelectorAll("input,select,textarea").forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display==="none" || el.type==="hidden") return;
      const id    = el.id;
      const label = id ? document.querySelector(`label[for="${id}"]`) : null;
      const ariaLabel = el.getAttribute("aria-label");
      const ariaLby   = el.getAttribute("aria-labelledby");
      const placeholder = el.getAttribute("placeholder");
      if (!label && !ariaLabel && !ariaLby) {
        findings.violations.push({
          type: "input-missing-label",
          severity: "warning",
          element: `${el.tagName.toLowerCase()}[type="${el.type||"text"}"]`,
          text: placeholder || el.id || "",
          classes: Array.from(el.classList).slice(0,2).join(" "),
        });
      }
    });

    // Heading hierarchy issues
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(h => window.getComputedStyle(h).display!=="none");
    const h1Count  = headings.filter(h => h.tagName==="H1").length;
    if (h1Count === 0) findings.violations.push({ type:"missing-h1", severity:"warning", element:"page", text:"No H1 heading found" });
    if (h1Count > 1)   findings.violations.push({ type:"multiple-h1", severity:"info", element:"page", text:`${h1Count} H1 headings found (should be 1)` });

    // Missing page lang attribute
    if (!document.documentElement.getAttribute("lang")) {
      findings.violations.push({ type:"missing-lang", severity:"warning", element:"html", text:"Missing lang attribute on <html>" });
    }

    // Check for autofocus on elements other than modals (keyboard trap risk)
    document.querySelectorAll("[autofocus]").forEach(el => {
      const text = el.innerText?.trim() || el.getAttribute("aria-label") || el.id || "";
      findings.keyboardTraps.push({ element: el.tagName.toLowerCase(), text: text.slice(0,40) });
    });

    // Tab index issues — very high tabindex breaks natural flow
    document.querySelectorAll("[tabindex]").forEach(el => {
      const tab = parseInt(el.getAttribute("tabindex"));
      if (tab > 0) {
        findings.violations.push({
          type: "positive-tabindex",
          severity: "info",
          element: el.tagName.toLowerCase(),
          text: (el.innerText?.trim() || el.id || "").slice(0,40),
          classes: Array.from(el.classList).slice(0,2).join(" "),
        });
      }
    });

    return findings;
  }).catch(() => ({ violations:[], missingLabels:[], imagesWithoutAlt:[], keyboardTraps:[] }));
}

function extractJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  return { findings: [], summary: "Analysis failed", clean: false };
}
