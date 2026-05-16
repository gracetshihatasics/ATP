import Anthropic      from "@anthropic-ai/sdk";
import { config }     from "../config/index.js";
import { surfaceScan } from "./surfaceScanner.js";
import { resolveAuth } from "./authResolver.js";
import { mapFeatures } from "./featureMapper.js";
import { getContextSummary } from "../integrations/contextBuilder.js";

const client = new Anthropic({ apiKey: config.apiKey });

const USE_CASE_SYSTEM = `You are an expert QA architect performing deep autonomous test discovery.

Given a full feature map of a web application, generate comprehensive test use cases.
CRITICAL: Respond with ONLY a raw JSON object. Start { end }. No markdown.

{
  "appName": "string",
  "appType": "string",
  "summary": "string",
  "authStrategy": "string (vault|auto-registered|guest)",
  "featureAreas": [
    {
      "name": "string",
      "useCaseCount": 0,
      "coverage": "full|partial|public-only"
    }
  ],
  "useCases": [
    {
      "id": "UC-001",
      "feature": "string (feature area name)",
      "category": "Authentication|Core Workflow|Data Management|Integration|Edge Case|Performance|Security",
      "title": "string",
      "description": "string (max 25 words)",
      "priority": "Critical|High|Medium|Low",
      "steps": ["step (max 15 words)"],
      "assertions": ["assert (max 12 words)"],
      "requiresAuth": false,
      "testData": { "notes": "any test data needed" }
    }
  ],
  "apiEndpoints": [{ "method": "string", "path": "string", "purpose": "string" }],
  "suggestedSuites": [
    { "name": "string", "description": "string", "useCaseIds": ["UC-001"], "feature": "string" }
  ],
  "coverageNotes": "string (what was and wasn't covered and why)"
}

Generate as many use cases as needed — no limit. Cover:
- Happy paths for every feature
- Negative/error paths
- Edge cases (empty states, boundaries, invalid input)
- Auth-dependent flows (skip if guest)
- Cross-feature flows (e.g. add to cart → checkout → loyalty points)
Group them by feature area. Minimum 5 use cases per feature area found.`;

/**
 * Full advanced discovery orchestrator.
 * Streams progress events and returns a comprehensive test plan.
 *
 * @param {string} url
 * @param {string|null} credentialId
 * @param {(event:object)=>void} onEvent
 * @returns {Promise<AdvancedDiscoveryResult>}
 */
export async function runAdvancedDiscovery(url, credentialId, onEvent = () => {}) {
  const startTime = Date.now();

  try {
    // ── Phase 1: Surface scan ──────────────────────────────────────────────────
    onEvent({ type: "phase_update", phase: 1, total: 4, label: "Surface scan", status: "running" });
    const surface = await surfaceScan(url, onEvent);
    onEvent({ type: "phase_update", phase: 1, total: 4, label: "Surface scan", status: "done",
      summary: `${surface.navLinks.length} links · ${surface.uiSignals.features.length} features detected` });

    // ── Phase 2: Auth resolution ───────────────────────────────────────────────
    onEvent({ type: "phase_update", phase: 2, total: 4, label: "Authentication", status: "running" });
    const authContext = await resolveAuth(url, credentialId, surface, onEvent);
    onEvent({ type: "phase_update", phase: 2, total: 4, label: "Authentication", status: "done",
      summary: `Strategy: ${authContext.strategy}` });

    // ── Phase 3: Feature mapping ───────────────────────────────────────────────
    onEvent({ type: "phase_update", phase: 3, total: 4, label: "Feature mapping", status: "running" });
    const featureAreas = await mapFeatures(url, surface, authContext, onEvent);
    const totalFlows   = featureAreas.reduce((sum, f) => sum + f.flows.length, 0);
    onEvent({ type: "phase_update", phase: 3, total: 4, label: "Feature mapping", status: "done",
      summary: `${featureAreas.length} areas · ${totalFlows} flows discovered` });

    // ── Phase 4: AI use case generation ───────────────────────────────────────
    onEvent({ type: "phase_update", phase: 4, total: 4, label: "Generating use cases", status: "running" });
    onEvent({ type: "log", msg: "AI synthesising all discoveries into test plan...", level: "ai" });

    // Pull in integration context (Jira, Confluence, DB, etc.)
    onEvent({ type: "log", msg: "Loading integration context...", level: "ai" });
    const integrationContext = await getContextSummary(url).catch(() => "");
    if (integrationContext) {
      onEvent({ type: "log", msg: "✓ Integration context loaded", level: "success" });
    }

    const plan = await generateUseCases(url, surface, authContext, featureAreas, integrationContext, onEvent);

    onEvent({ type: "phase_update", phase: 4, total: 4, label: "Generating use cases", status: "done",
      summary: `${plan.useCases.length} use cases across ${plan.featureAreas?.length ?? featureAreas.length} features` });

    const duration = Math.round((Date.now() - startTime) / 1000);
    onEvent({ type: "discovery_complete", duration, plan });

    return { plan, surface, authContext, featureAreas, duration };

  } catch (err) {
    onEvent({ type: "error", msg: err.message });
    throw err;
  }
}

async function generateUseCases(url, surface, authContext, featureAreas, integrationContext, onEvent) {
  // Build a rich summary for Claude
  const featureSummary = featureAreas.map(f => `
Feature: ${f.name}
URL: ${f.url}
Flows found: ${f.flows.map(fl => `${fl.name}${fl.requiresAuth ? " [auth]" : ""}${fl.available ? "" : " [unavailable: " + fl.reason + "]"}`).join(", ")}
Headings: ${f.analysis?.headings?.join(", ") ?? ""}
Buttons: ${f.analysis?.buttons?.slice(0,8).join(", ") ?? ""}
Forms: ${f.analysis?.forms ?? 0}
Body excerpt: ${f.analysis?.bodyText?.slice(0, 200) ?? ""}
`).join("\n---\n");

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 16000,
    system:     USE_CASE_SYSTEM,
    messages: [{
      role:    "user",
      content: `Application URL: ${url}
App title: ${surface.meta?.title}
App description: ${surface.meta?.description}
Auth strategy used: ${authContext.strategy}
${authContext.username ? `Test user: ${authContext.username}` : ""}
Total feature areas discovered: ${featureAreas.length}
Total flows mapped: ${featureAreas.reduce((s,f) => s + f.flows.length, 0)}
UI signals detected: ${surface.uiSignals?.features?.map(f => f.feature).join(", ")}

${integrationContext ? `=== INTEGRATION CONTEXT ===\n${integrationContext}\n=== END INTEGRATION CONTEXT ===\n` : ""}
=== FEATURE MAP ===
${featureSummary}

Generate a comprehensive test plan covering ALL discovered features.
For each feature area generate minimum 5 use cases.
Total should be ${Math.max(featureAreas.length * 5, 20)}+ use cases.
Use the integration context above to generate more realistic test data and scenarios that match real business requirements.`,
    }],
  });

  const raw  = response.content[0]?.text ?? "";
  const plan = extractJSON(raw);

  // Merge auth context into plan
  plan.authStrategy = authContext.strategy;
  if (authContext.strategy === "auto-registered") {
    plan.autoRegisteredUser = { username: authContext.username, email: authContext.email };
  }

  return plan;
}

function extractJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  throw new Error("Could not parse discovery result");
}
