// Text-only quality scorer — no browser, no Playwright.
// Called at discovery time after Claude generates use cases.

const ACTION_VERBS = [
  "click","navigate","enter","select","verify","check","submit","fill",
  "scroll","search","open","close","add","remove","delete","create","update",
  "login","logout","register","upload","download","drag","hover","press","type",
];

const VERIFIABLE_WORDS = [
  "visible","contains","equals","displayed","redirected","shows","appears",
  "present","exists","loaded","confirmed","message","success","error","enabled",
  "disabled","selected","checked","updated","created","deleted","saved",
];

function scoreStep(step, allSteps) {
  let score = 0;
  const words = step.toLowerCase().split(/\s+/);

  // Has an action verb
  if (words.some(w => ACTION_VERBS.includes(w))) score += 20;

  // References a specific UI element (quoted text, button/field/link/page names)
  if (/["']/.test(step) || /\b(button|field|link|input|form|page|tab|menu|modal|dropdown|checkbox|radio|icon)\b/i.test(step)) score += 20;

  // Reasonable length: 5–30 words
  if (words.length >= 5 && words.length <= 30) score += 20;

  // Unique within the use case
  if (allSteps.filter(s => s === step).length === 1) score += 20;

  // Not vague
  const vague = /^(test|do|check|verify|ensure|make sure|confirm)\s+(the\s+)?(feature|functionality|app|page|it|this)\.?$/i;
  if (!vague.test(step.trim())) score += 20;

  return score;
}

function scoreAssertion(assertion) {
  let score = 0;
  const lower = assertion.toLowerCase();

  // Contains a verifiable state word
  if (VERIFIABLE_WORDS.some(w => lower.includes(w))) score += 25;

  // References a specific value or element (quotes, numbers, URLs)
  if (/["']|https?:\/\/|\d+|#|\./.test(assertion) || /\b(message|text|url|page|element|button|field|count)\b/i.test(assertion)) score += 25;

  // Not too generic (more than 5 words)
  if (assertion.split(/\s+/).length > 5) score += 25;

  // Ends with a measurable outcome (not just "works" or "is fine")
  if (!/\b(works|fine|correct|ok|good)\b/i.test(assertion)) score += 25;

  return score;
}

export async function evalUseCase(useCase, integrationContext = "") {
  const steps      = useCase.steps ?? [];
  const assertions = useCase.assertions ?? [];
  const issues     = [];
  const suggestions = [];

  const stepScores = steps.map(s => scoreStep(s, steps));
  const assertionScores = assertions.map(a => scoreAssertion(a));

  const avgStep      = steps.length > 0 ? stepScores.reduce((a, b) => a + b, 0) / steps.length : 0;
  const avgAssertion = assertions.length > 0 ? assertionScores.reduce((a, b) => a + b, 0) / assertions.length : 50;

  // Issue detection
  if (steps.length === 0)      issues.push("use case has no steps");
  if (assertions.length === 0) issues.push("use case has no assertions — add at least one verification");
  if (steps.length > 15)       issues.push("too many steps (>15) — consider splitting into smaller use cases");

  steps.forEach((s, i) => {
    if (stepScores[i] < 40) {
      issues.push(`step ${i + 1} is vague: "${s.slice(0, 60)}"`);
      suggestions.push(`step ${i + 1}: be more specific — name the exact button, field, or page`);
    }
  });

  assertions.forEach((a, i) => {
    if (assertionScores[i] < 50) {
      issues.push(`assertion ${i + 1} may be untestable: "${a.slice(0, 60)}"`);
      suggestions.push(`assertion ${i + 1}: specify expected text, URL, or element that should be visible`);
    }
  });

  // Integration alignment (simple keyword check — no AI call)
  let alignmentScore = 50; // neutral when no context
  if (integrationContext) {
    const ucText  = `${useCase.title} ${useCase.description} ${steps.join(" ")}`.toLowerCase();
    const ctxWords = integrationContext.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const matches  = ctxWords.filter(w => ucText.includes(w)).length;
    alignmentScore = Math.min(100, 50 + matches * 5);
  }

  const score = Math.round(avgStep * 0.6 + avgAssertion * 0.3 + alignmentScore * 0.1);
  const clampedScore = Math.max(0, Math.min(100, score));

  return {
    score:            clampedScore,
    stepScores,
    assertionScores,
    issues,
    suggestions,
    prodReady: clampedScore >= 85,
  };
}
