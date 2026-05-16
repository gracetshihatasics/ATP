import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";

const client = new Anthropic({ apiKey: config.apiKey });

/**
 * Code Intelligence Scanner
 *
 * Scans the DOM of a live page to detect:
 * - Hidden elements with no visible path to show them
 * - Dead event listeners on elements that can't be reached
 * - Feature flags disabled in code but still in DOM
 * - Routes/pages that exist in code but aren't linked anywhere
 * - Components rendered but immediately hidden
 * - Commented-out code that left orphan DOM nodes
 * - CSS-hidden interactive elements (display:none, visibility:hidden, opacity:0)
 * - Elements behind permissions/roles that no test user can access
 *
 * Returns findings with:
 * - Severity: critical | warning | info
 * - Action: ignore | remove | investigate | test-when-enabled
 * - Whether ATP should skip testing it
 */

export async function scanPageCodeIntelligence(page, url, context = {}) {
  // Collect full DOM intelligence — hidden elements, dead code, orphans
  const domFindings = await collectDOMFindings(page);

  if (!domFindings.hiddenElements.length &&
      !domFindings.orphanedElements.length &&
      !domFindings.deadRoutes.length) {
    return { findings: [], summary: "No hidden or dead code detected", clean: true };
  }

  // Screenshot for visual context
  const screenshot = await page.screenshot({ type: "jpeg", quality: 60 })
    .then(b => b.toString("base64")).catch(() => null);

  // Ask Claude to analyse all findings
  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: [
        ...(screenshot ? [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshot } }] : []),
        {
          type: "text",
          text: `You are a senior frontend code quality analyst. Analyse this page's DOM for hidden, dead, or unreachable code.

URL: ${url}
Page context: ${context.pageName || "unknown"}

DOM Findings:
${JSON.stringify(domFindings, null, 2)}

For each finding, determine:
1. Is this genuinely dead/hidden code or is it intentionally hidden (e.g. modal not yet opened)?
2. Should tests skip it, flag it for removal, or investigate it?
3. Is it a code quality issue worth reporting to engineers?

CRITICAL: Raw JSON only. Start { end }.
{
  "summary": "1-2 sentence summary of what was found",
  "clean": false,
  "overallHealth": "clean|minor-issues|needs-attention|critical",
  "findings": [
    {
      "id": "finding-001",
      "type": "hidden-feature|dead-route|orphaned-component|feature-flag-disabled|permission-locked|css-hidden|display-none|unreachable-element",
      "severity": "critical|warning|info",
      "element": "description of the element",
      "selector": "CSS selector if identifiable",
      "reason": "why this is a problem",
      "isIntentional": false,
      "testDecision": "skip|ignore-always|test-when-enabled|investigate|remove-from-tests",
      "codeRecommendation": "what the engineering team should do",
      "businessImpact": "what does this mean for users",
      "priority": "high|medium|low"
    }
  ],
  "testingRecommendations": [
    {
      "action": "skip|add-to-ignore-list|flag-for-review|test-conditionally",
      "elements": ["selector1", "selector2"],
      "reason": "why",
      "suggestion": "specific suggestion for ATP test configuration"
    }
  ],
  "codeQualityScore": 85,
  "issuesByType": {
    "hiddenFeatures": 0,
    "deadRoutes": 0,
    "orphanedComponents": 0,
    "featureFlags": 0,
    "permissionLocked": 0
  }
}`,
        },
      ],
    }],
  });

  const raw = response.content[0]?.text ?? "";
  return extractJSON(raw);
}

// ── Collect DOM findings without AI ──────────────────────────────────────────
async function collectDOMFindings(page) {
  return page.evaluate(() => {
    const findings = {
      hiddenElements:    [],
      orphanedElements:  [],
      deadRoutes:        [],
      featureFlags:      [],
      cssHidden:         [],
      displayNone:       [],
      invisibleButtons:  [],
      emptyContainers:   [],
      commentedOut:      [],
      zeroSizeElements:  [],
    };

    // ── 1. Elements hidden via CSS but still in DOM ──────────────────────────
    const allInteractive = document.querySelectorAll(
      "button, a[href], input, select, textarea, [role='button'], [role='tab'], [role='menuitem'], [data-action], [onclick]"
    );

    allInteractive.forEach(el => {
      const style   = window.getComputedStyle(el);
      const rect    = el.getBoundingClientRect();
      const text    = el.innerText?.trim().slice(0, 60) || el.getAttribute("aria-label") || el.id || "";
      const isHidden = style.display === "none" ||
                       style.visibility === "hidden" ||
                       style.opacity === "0" ||
                       (rect.width === 0 && rect.height === 0);

      if (isHidden && text) {
        const type = style.display === "none" ? "display-none"
          : style.visibility === "hidden"     ? "visibility-hidden"
          : style.opacity === "0"             ? "opacity-zero"
          : "zero-size";

        findings.hiddenElements.push({
          tag:      el.tagName.toLowerCase(),
          text,
          type,
          id:       el.id || null,
          classes:  Array.from(el.classList).slice(0, 3).join(" "),
          hasClick: !!(el.onclick || el.getAttribute("data-action")),
          href:     el.getAttribute("href") || null,
        });
      }
    });

    // ── 2. Feature flag / conditional rendering patterns ─────────────────────
    const featureFlagSelectors = [
      "[data-feature]", "[data-flag]", "[data-enabled]", "[data-disabled]",
      "[class*='feature-']", "[class*='flag-']", "[id*='feature-']",
    ];
    featureFlagSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.display === "none" || el.getAttribute("data-enabled") === "false" || el.getAttribute("data-disabled") === "true") {
          findings.featureFlags.push({
            selector: sel,
            attr:     el.getAttribute("data-feature") || el.getAttribute("data-flag") || el.getAttribute("data-enabled"),
            text:     el.innerText?.trim().slice(0, 50) || "",
            classes:  Array.from(el.classList).slice(0, 3).join(" "),
          });
        }
      });
    });

    // ── 3. Nav links pointing to nowhere / dead routes ────────────────────────
    document.querySelectorAll("a[href]").forEach(a => {
      const href = a.getAttribute("href");
      if (!href) return;
      if (href === "#" || href === "#!" || href === "javascript:void(0)") {
        findings.deadRoutes.push({
          text:    a.innerText?.trim().slice(0, 40) || a.getAttribute("aria-label") || "",
          href,
          classes: Array.from(a.classList).slice(0, 3).join(" "),
          visible: window.getComputedStyle(a).display !== "none",
        });
      }
    });

    // ── 4. Empty containers that look like they should have content ───────────
    const containers = document.querySelectorAll(
      "[class*='container'], [class*='section'], [class*='panel'], [class*='widget'], [class*='card']"
    );
    containers.forEach(el => {
      const text    = el.innerText?.trim();
      const rect    = el.getBoundingClientRect();
      const style   = window.getComputedStyle(el);
      if (!text && rect.width > 50 && rect.height > 20 && style.display !== "none") {
        findings.emptyContainers.push({
          tag:     el.tagName.toLowerCase(),
          classes: Array.from(el.classList).slice(0, 3).join(" "),
          width:   Math.round(rect.width),
          height:  Math.round(rect.height),
        });
      }
    });

    // ── 5. Buttons/links with no visible text or label ────────────────────────
    document.querySelectorAll("button, a[href]").forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display === "none") return;
      const text   = el.innerText?.trim();
      const label  = el.getAttribute("aria-label");
      const title  = el.getAttribute("title");
      const rect   = el.getBoundingClientRect();
      if (!text && !label && !title && rect.width > 0) {
        findings.invisibleButtons.push({
          tag:     el.tagName.toLowerCase(),
          classes: Array.from(el.classList).slice(0, 3).join(" "),
          id:      el.id || null,
          width:   Math.round(rect.width),
          height:  Math.round(rect.height),
        });
      }
    });

    // ── 6. Zero-size but present interactive elements ────────────────────────
    allInteractive.forEach(el => {
      const rect  = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (rect.width === 0 && rect.height === 0 && style.display !== "none") {
        findings.zeroSizeElements.push({
          tag:  el.tagName.toLowerCase(),
          text: el.innerText?.trim().slice(0, 40) || el.id || "",
          type: el.getAttribute("type") || "",
        });
      }
    });

    // ── 7. Comments in DOM (HTML comments can indicate dead code) ────────────
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    let commentNode;
    let commentCount = 0;
    while ((commentNode = walker.nextNode()) && commentCount < 10) {
      const text = commentNode.textContent?.trim().slice(0, 80);
      if (text && text.length > 5) {
        findings.commentedOut.push({ text });
        commentCount++;
      }
    }

    return findings;
  }).catch(() => ({
    hiddenElements: [], orphanedElements: [], deadRoutes: [],
    featureFlags: [], cssHidden: [], displayNone: [],
    invisibleButtons: [], emptyContainers: [], commentedOut: [],
    zeroSizeElements: [],
  }));
}

function extractJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  return { findings: [], summary: "Analysis failed", clean: false };
}
