import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";

const client = new Anthropic({ apiKey: config.apiKey });

/**
 * Page Intelligence Engine
 *
 * At any point during a test run, this module can:
 * 1. Analyse the full page and understand what it contains
 * 2. Detect forms, wizards, tabs, carousels, modals, etc.
 * 3. Generate intelligent interaction steps for any UI pattern
 * 4. Adapt the test plan when the page doesn't match expectations
 * 5. Understand form fields and know how to fill them correctly
 */

// ── Analyse current page ──────────────────────────────────────────────────────
export async function analysePage(page, context = {}) {
  const [screenshot, domInfo] = await Promise.all([
    page.screenshot({ type: "jpeg", quality: 65 }).then(b => b.toString("base64")),
    extractDOMInfo(page),
  ]);

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshot } },
        { type: "text", text: `Analyse this web page screenshot and DOM info to understand what the user sees.

DOM summary:
${JSON.stringify(domInfo, null, 2)}

Current test context: ${context.goal || "exploring the page"}
Current URL: ${context.url || "unknown"}

CRITICAL: Respond ONLY with raw JSON. Start { end }.
{
  "pageType": "form|wizard|dashboard|listing|detail|checkout|login|profile|search-results|category|product|cart|other",
  "title": "string — what this page is about",
  "summary": "string — 1 sentence describing what the user sees",
  "primaryAction": "string — the main thing a user would do here",
  "uiPatterns": [
    {
      "type": "form|tab-set|accordion|wizard|modal|carousel|infinite-scroll|filter-panel|dropdown-menu|data-table|stepper",
      "description": "string",
      "selector": "best CSS selector to target this pattern",
      "interactionGuide": "how to interact with this pattern step by step"
    }
  ],
  "forms": [
    {
      "id": "form-1",
      "purpose": "string — what this form does (login, checkout, search, newsletter, etc)",
      "selector": "CSS selector for the form",
      "fields": [
        {
          "label": "string",
          "type": "text|email|password|tel|number|select|checkbox|radio|textarea|date|file|search",
          "selector": "best selector for this field",
          "required": true,
          "placeholder": "string if any",
          "options": ["option1", "option2"],
          "fillStrategy": "string — what to put in this field and why",
          "testValue": "string — the actual value to use when testing"
        }
      ],
      "submitSelector": "CSS selector for the submit button",
      "hasNextStep": false,
      "isMultiStep": false,
      "currentStep": 1,
      "totalSteps": 1
    }
  ],
  "tabs": [
    { "label": "string", "selector": "string", "isActive": false }
  ],
  "keyElements": [
    { "description": "string", "selector": "string", "action": "click|fill|hover|scroll" }
  ],
  "testingInsights": "string — specific advice for testing this page's features",
  "potentialIssues": ["string — anything that might cause test failures"],
  "nextSteps": ["string — suggested actions to test this page thoroughly"]
}` },
      ],
    }],
  });

  return extractJSON(response.content[0]?.text ?? "");
}

// ── Analyse a specific form ───────────────────────────────────────────────────
export async function analyseForm(page, formSelector, context = {}) {
  const screenshot = await page.screenshot({ type: "jpeg", quality: 65 }).then(b => b.toString("base64"));

  // Extract form HTML for detailed analysis
  const formHTML = await page.evaluate((sel) => {
    const form = document.querySelector(sel) || document.querySelector("form");
    return form ? form.outerHTML.slice(0, 5000) : "";
  }, formSelector).catch(() => "");

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshot } },
        { type: "text", text: `Analyse this form in detail. I need to know exactly how to fill and submit it for testing.

Form HTML:
${formHTML}

Testing goal: ${context.goal || "complete this form successfully"}

CRITICAL: Raw JSON only. Start { end }.
{
  "formPurpose": "string",
  "isMultiStep": false,
  "currentStep": 1,
  "totalSteps": 1,
  "stepIndicator": "CSS selector for step indicator if multi-step",
  "fields": [
    {
      "label": "string",
      "selector": "string — most reliable selector",
      "type": "text|email|password|tel|number|select|checkbox|radio|textarea|date|file|search",
      "required": true,
      "currentValue": "string if pre-filled",
      "testValue": "realistic test value to enter",
      "options": [],
      "interactionType": "type|click|select|check|upload",
      "order": 1,
      "dependencies": "string — fill this after field X if any"
    }
  ],
  "submitButton": {
    "selector": "string",
    "label": "string",
    "isEnabled": true
  },
  "nextButton": {
    "selector": "string or null",
    "label": "string or null"
  },
  "validationHints": ["string — any validation rules visible"],
  "fillOrder": ["field label in order to fill"],
  "testScenarios": [
    {
      "name": "Happy path",
      "description": "Fill all required fields with valid data",
      "steps": ["step 1", "step 2"]
    },
    {
      "name": "Validation error",
      "description": "Submit empty or invalid data to test error messages",
      "steps": ["step 1", "step 2"]
    }
  ]
}` },
      ],
    }],
  });

  return extractJSON(response.content[0]?.text ?? "");
}

// ── Generate adaptive actions for the current page ────────────────────────────
export async function generateAdaptiveActions(page, goal, existingSteps = [], context = {}) {
  const screenshot = await page.screenshot({ type: "jpeg", quality: 65 }).then(b => b.toString("base64"));
  const url        = page.url();

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshot } },
        { type: "text", text: `You are a browser automation AI. Look at this screenshot and generate the exact Playwright actions needed.

Current URL: ${url}
Goal: ${goal}
Steps already completed: ${existingSteps.join(", ") || "none"}
Credentials available: ${JSON.stringify(context.credentials || {})}

Based on WHAT YOU SEE in the screenshot, generate the next actions to achieve the goal.

Rules:
- Generate actions based on what is ACTUALLY VISIBLE on screen, not assumptions
- If you see a form, analyse each field and generate fill actions
- If you see a tab, click it if relevant
- If you see a modal/popup, handle it first
- If you see a next/continue button, include it
- Use text-based selectors when possible: button:has-text("Submit")
- Always scroll to elements before clicking if they might be below fold
- Add wait_for actions before interacting with dynamic content

CRITICAL: Raw JSON array only. Start [ end ].
[
  {
    "type": "navigate|click|fill|select|scroll|scroll_to|wait|wait_for|press|hover|wait_navigation",
    "selector": "string",
    "value": "string",
    "description": "human readable — what this does and why",
    "reasoning": "why this action is needed based on what I see"
  }
]` },
      ],
    }],
  });

  const raw = response.content[0]?.text ?? "";
  return extractJSONArray(raw);
}

// ── Detect if current page matches expected state ─────────────────────────────
export async function detectPageContext(page, expectedContext) {
  const screenshot = await page.screenshot({ type: "jpeg", quality: 50 }).then(b => b.toString("base64"));

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 500,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: screenshot } },
        { type: "text", text: `Expected to be on: ${expectedContext}
Current URL: ${page.url()}

What is actually on this page? Does it match the expectation?

Raw JSON only: {
  "matches": true/false,
  "actualPage": "string — what page this actually is",
  "reason": "string",
  "blockedBy": "null|login|captcha|error|redirect|popup",
  "suggestion": "string — what to do next"
}` },
      ],
    }],
  });

  return extractJSON(response.content[0]?.text ?? "");
}

// ── Extract DOM structural info ───────────────────────────────────────────────
async function extractDOMInfo(page) {
  return page.evaluate(() => {
    const forms    = Array.from(document.querySelectorAll("form")).map(f => ({
      id:     f.id || f.name || "",
      action: f.action || "",
      fields: Array.from(f.querySelectorAll("input,select,textarea")).slice(0,10).map(el => ({
        type:        el.type || el.tagName.toLowerCase(),
        name:        el.name || el.id || "",
        placeholder: el.placeholder || "",
        required:    el.required,
        value:       el.value?.slice(0,30) || "",
      })),
    }));

    const tabs = Array.from(document.querySelectorAll("[role='tab'], .tab, [class*='tab-']")).slice(0,10).map(t => ({
      text: t.innerText?.trim().slice(0,30),
      active: t.getAttribute("aria-selected") === "true" || t.classList.contains("active"),
    }));

    const buttons = Array.from(document.querySelectorAll("button,[role='button']")).slice(0,15).map(b => b.innerText?.trim().slice(0,30)).filter(Boolean);

    const headings = Array.from(document.querySelectorAll("h1,h2,h3")).slice(0,5).map(h => h.innerText?.trim().slice(0,60)).filter(Boolean);

    const errors = Array.from(document.querySelectorAll("[class*='error'],[class*='alert'],[role='alert']")).slice(0,5).map(e => e.innerText?.trim().slice(0,100)).filter(Boolean);

    return { forms, tabs, buttons, headings, errors, url: window.location.href };
  }).catch(() => ({}));
}

function extractJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  return {};
}

function extractJSONArray(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("["), e = raw.lastIndexOf("]");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  return [];
}
