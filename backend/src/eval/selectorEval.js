// DOM-only selector scorer — no Claude, no new browser launch.
// Receives an already-open Playwright page object.

const NO_SELECTOR_TYPES = new Set(["navigate", "wait", "wait_navigation", "press", "scroll"]);

export async function evalSelector(page, action, knowledgeBoost = 0) {
  // Actions that don't target a DOM element always pass
  if (NO_SELECTOR_TYPES.has(action.type)) {
    return { score: 95, matches: 1, visible: true, interactable: true, issue: null };
  }

  // wait_for needs a selector but it may not exist yet — be lenient
  if (action.type === "wait_for") {
    return { score: 80, matches: 1, visible: true, interactable: true, issue: null };
  }

  if (!action.selector) {
    return { score: 0, matches: 0, visible: false, interactable: false, issue: "no selector" };
  }

  let els;
  try {
    els = await page.$$(action.selector);
  } catch (e) {
    return { score: 0, matches: 0, visible: false, interactable: false, issue: `invalid selector: ${e.message}` };
  }

  const matches = els.length;

  if (matches === 0) {
    return { score: 0, matches: 0, visible: false, interactable: false, issue: "selector resolves to 0 elements" };
  }

  // Base score from match count
  let score = matches === 1 ? 85 : matches === 2 ? 60 : 40;

  // Visibility check
  let visible = false;
  try { visible = await els[0].isVisible(); } catch {}
  if (!visible) score -= 20;

  // Interactability check
  let interactable = false;
  try { interactable = await els[0].isEnabled(); } catch {}
  if (!interactable) score -= 10;

  // Viewport bonus
  try {
    const inViewport = await page.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
    }, els[0]);
    if (inViewport) score += 5;
  } catch {}

  // Knowledge base boost (capped at 15)
  score += Math.min(knowledgeBoost, 15);

  score = Math.max(0, Math.min(100, score));

  const issue = matches > 1 ? `selector matches ${matches} elements (ambiguous)` : !visible ? "element not visible" : !interactable ? "element not interactable" : null;

  return { score, matches, visible, interactable, issue };
}
