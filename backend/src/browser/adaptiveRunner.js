import { analysePage, analyseForm, generateAdaptiveActions, detectPageContext } from "./pageIntelligence.js";
import { waitUntilReady } from "./smartObserver.js";
import { executeAction }  from "./executor.js";
import { captureScreenshot } from "./screenshot.js";

/**
 * Adaptive execution engine.
 *
 * Instead of blindly running pre-generated steps, this engine:
 * 1. Analyses the page before each step
 * 2. Understands forms, tabs, wizards on the fly
 * 3. Regenerates steps if the page doesn't match expectations
 * 4. Handles unexpected states (error pages, popups, redirects)
 * 5. Fills forms intelligently based on what it sees
 */
export async function runAdaptive(page, useCase, url, credentials, { onEvent, onLog }) {
  const completedSteps = [];
  const insights       = [];

  onLog("◈ Page Intelligence activating...", "ai");

  // Step 1: Analyse the landing page
  onLog("Analysing page structure...", "ai");
  const pageAnalysis = await analysePage(page, { goal: useCase.title, url }).catch(() => null);

  if (pageAnalysis) {
    onEvent({ type: "page_analysis", analysis: pageAnalysis });
    onLog(`◈ Page: ${pageAnalysis.pageType} — ${pageAnalysis.summary}`, "ai");

    if (pageAnalysis.potentialIssues?.length) {
      pageAnalysis.potentialIssues.forEach(issue =>
        onLog(`⚠ Potential issue: ${issue}`, "warn")
      );
    }

    if (pageAnalysis.testingInsights) {
      onLog(`◈ Testing insight: ${pageAnalysis.testingInsights}`, "ai");
      insights.push(pageAnalysis.testingInsights);
    }
  }

  // Step 2: Execute use case steps with adaptive intelligence
  const steps = useCase.steps ?? [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    onLog(`Step ${i + 1}/${steps.length}: ${step}`, "system");
    onEvent({ type: "adaptive_step_start", index: i, total: steps.length, description: step });

    try {
      // Generate actions for this step based on current page state
      onLog(`◈ Generating actions for: ${step}`, "ai");
      const actions = await generateAdaptiveActions(page, step, completedSteps, { credentials });

      if (!actions.length) {
        onLog(`No actions generated for step — skipping`, "warn");
        completedSteps.push(`${step} (skipped)`);
        continue;
      }

      onLog(`Generated ${actions.length} actions`, "ai");

      // Execute each action with smart waiting
      for (const action of actions) {
        onLog(`→ ${action.type.toUpperCase()}: ${action.description}`, "action");
        if (action.reasoning) onLog(`  ◈ Reason: ${action.reasoning}`, "ai");

        // If this is a form fill, run form intelligence first
        if (action.type === "fill" || (action.type === "click" && action.description?.toLowerCase().includes("form"))) {
          await handleFormIntelligence(page, action, credentials, onLog, onEvent);
        } else {
          await executeAction(page, action, { readyState: 1, send: (msg) => {
            if (msg.type === "log") onLog(msg.msg, msg.level);
          }});
        }

        await waitUntilReady(page, { maxWait: 8000, pollMs: 400, onLog });
      }

      // Check if step actually succeeded by looking at the page
      const context = await detectPageContext(page, `After: ${step}`).catch(() => null);
      if (context?.blockedBy) {
        onLog(`⚠ Blocked by: ${context.blockedBy} — ${context.suggestion}`, "warn");

        // Auto-handle common blockers
        if (context.blockedBy === "login") {
          onLog("◈ Login wall detected — attempting authentication", "ai");
          await handleLoginWall(page, credentials, onLog, onEvent);
        }
      }

      completedSteps.push(step);
      const screenshot = await captureScreenshot(page);
      onEvent({ type: "adaptive_step_done", index: i, status: "pass", screenshot, description: step });

    } catch (err) {
      onLog(`Step failed: ${err.message}`, "error");
      const screenshot = await captureScreenshot(page).catch(() => null);
      onEvent({ type: "adaptive_step_done", index: i, status: "fail", screenshot, description: step, error: err.message });

      // Try to recover — analyse what went wrong
      onLog("◈ Analysing failure and attempting recovery...", "ai");
      const recovery = await generateAdaptiveActions(page,
        `Recover from failed step: "${step}". Error: ${err.message}. Try an alternative approach.`,
        completedSteps, { credentials }
      ).catch(() => []);

      if (recovery.length) {
        onLog(`◈ Recovery: trying ${recovery.length} alternative actions`, "ai");
        for (const action of recovery.slice(0, 3)) {
          await executeAction(page, action, { readyState: 1, send: () => {} }).catch(() => {});
        }
      }
    }
  }

  return { completedSteps, insights, pageAnalysis };
}

// ── Handle forms with full intelligence ──────────────────────────────────────
async function handleFormIntelligence(page, triggerAction, credentials, onLog, onEvent) {
  // Find the most relevant form
  const formSelector = await page.evaluate(() => {
    const forms = document.querySelectorAll("form");
    if (forms.length === 1) return "form";
    // Find visible form
    const visible = Array.from(forms).find(f => {
      const rect = f.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    return visible ? (visible.id ? `#${visible.id}` : "form") : "form";
  }).catch(() => "form");

  onLog(`◈ Analysing form: ${formSelector}`, "ai");
  const formAnalysis = await analyseForm(page, formSelector, {
    goal: triggerAction.description,
  }).catch(() => null);

  if (!formAnalysis?.fields?.length) {
    // Fall back to normal action
    await executeAction(page, triggerAction, { readyState: 1, send: () => {} });
    return;
  }

  onEvent({ type: "form_analysis", analysis: formAnalysis });
  onLog(`◈ Form: ${formAnalysis.formPurpose} — ${formAnalysis.fields.length} fields${formAnalysis.isMultiStep ? ` (${formAnalysis.totalSteps} steps)` : ""}`, "ai");

  // Fill fields in the correct order
  const fillOrder = formAnalysis.fillOrder?.length
    ? formAnalysis.fields.sort((a, b) => (formAnalysis.fillOrder.indexOf(a.label) - formAnalysis.fillOrder.indexOf(b.label)))
    : formAnalysis.fields;

  for (const field of fillOrder) {
    if (!field.selector || !field.testValue) continue;

    // Inject credentials if the field is auth-related
    let value = field.testValue;
    if (field.type === "email"    && credentials?.username) value = credentials.username;
    if (field.type === "password" && credentials?.password) value = credentials.password;

    onLog(`  Filling ${field.label}: ${field.type === "password" ? "••••••••" : value}`, "action");

    try {
      if (field.interactionType === "select" || field.type === "select") {
        await executeAction(page, { type: "select", selector: field.selector, value: field.testValue, description: `Select ${field.label}` },
          { readyState: 1, send: () => {} });
      } else if (field.interactionType === "check" || field.type === "checkbox") {
        const checked = await page.locator(field.selector).first().isChecked().catch(() => false);
        if (!checked) await page.locator(field.selector).first().check({ timeout: 5000 }).catch(() => {});
      } else if (field.interactionType === "click" || field.type === "radio") {
        await executeAction(page, { type: "click", selector: field.selector, description: `Select ${field.label}` },
          { readyState: 1, send: () => {} });
      } else {
        await executeAction(page, { type: "fill", selector: field.selector, value, description: `Fill ${field.label}` },
          { readyState: 1, send: () => {} });
      }
    } catch (err) {
      onLog(`  ⚠ Could not fill ${field.label}: ${err.message.slice(0, 60)}`, "warn");
    }
  }

  // Handle multi-step forms
  if (formAnalysis.isMultiStep && formAnalysis.nextButton?.selector) {
    onLog(`◈ Multi-step form: clicking Next (step ${formAnalysis.currentStep}/${formAnalysis.totalSteps})`, "ai");
    await executeAction(page, {
      type: "click", selector: formAnalysis.nextButton.selector,
      description: `Next step: ${formAnalysis.nextButton.label || "Continue"}`,
    }, { readyState: 1, send: () => {} }).catch(() => {});
    await waitUntilReady(page, { maxWait: 8000, onLog, useVision: true, actionDesc: "form next step" });
  }
}

// ── Handle login wall ─────────────────────────────────────────────────────────
async function handleLoginWall(page, credentials, onLog, onEvent) {
  if (!credentials?.username) {
    onLog("No credentials available — cannot bypass login", "warn");
    return;
  }
  const formAnalysis = await analyseForm(page, "form", { goal: "login" }).catch(() => null);
  if (formAnalysis?.fields) {
    await handleFormIntelligence(page, { description: "login" }, credentials, onLog, onEvent);
    if (formAnalysis.submitButton?.selector) {
      await executeAction(page, { type: "click", selector: formAnalysis.submitButton.selector, description: "Submit login" },
        { readyState: 1, send: () => {} }).catch(() => {});
      await waitUntilReady(page, { maxWait: 10000, onLog, useVision: true, actionDesc: "login submitted" });
    }
  }
}
