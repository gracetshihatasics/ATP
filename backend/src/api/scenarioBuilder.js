import { anthropic as client } from "../ai/client.js";
import { config }              from "../config/index.js";

/**
 * Scenario Builder
 *
 * Two modes:
 *   quick — 7 critical business-flow scenarios, fast
 *   deep  — full coverage: every endpoint group, auth flows,
 *           CRUD chains, error cases, edge cases, security probes
 *
 * Context sources (all injected when available):
 *   - Integration context (Jira stories, Confluence docs, Notion, etc.)
 *   - Postman environments/variables
 *   - OpenAPI descriptions, tags, examples
 *   - Endpoint request/response schemas
 */

const BASE_SYSTEM = `You are a senior API test architect with 10 years of experience writing
integration tests for production APIs. You write thorough, realistic, data-chained test scenarios.

CRITICAL: Respond ONLY with a raw JSON array. Start [ end ]. No markdown. No backticks. No explanation.

Each scenario object:
{
  "id":          "S-001",
  "name":        "string — business transaction name (clear, specific)",
  "description": "string — what this tests and why it matters",
  "priority":    "Critical|High|Medium|Low",
  "category":    "Authentication|CRUD|Business Flow|Data Validation|Error Handling|Edge Case|Security|Performance",
  "tags":        ["string"],
  "steps": [
    {
      "id":          "step-1",
      "name":        "string",
      "method":      "GET|POST|PUT|PATCH|DELETE",
      "path":        "/api/endpoint",
      "headers":     { "Content-Type": "application/json", "Authorization": "Bearer {{token}}" },
      "body":        {},
      "params":      {},
      "captureFrom": { "token": "$.data.token", "userId": "$.data.id" },
      "assertions": [
        { "type": "status",   "expected": 200 },
        { "type": "jsonpath", "path": "$.data.id", "exists": true },
        { "type": "jsonpath", "path": "$.data.email", "contains": "@" },
        { "type": "schema",   "field": "id", "dataType": "string" },
        { "type": "header",   "name": "content-type", "contains": "json" },
        { "type": "duration", "max": 2000 }
      ],
      "dependsOn": null
    }
  ]
}

Rules:
- Chain data between steps using captureFrom + {{variableName}} — never hardcode IDs
- Cover both success (2xx) AND meaningful errors (401, 403, 404, 422, 500)
- Write realistic request bodies with plausible test data
- Each step should have 3-6 assertions
- Negative test cases: missing required fields, wrong types, invalid auth, duplicate creation
- Security: test endpoints without auth that should require it`;

const QUICK_PROMPT = (spec, contextNote, endpointList) => `
API: ${spec.title} v${spec.version}
Base URL: ${spec.baseUrl || "runtime"}
Description: ${spec.description}
Source: ${spec.source}
${contextNote}

Endpoints (${spec.endpoints.length} total):
${endpointList}

Generate EXACTLY 7 test scenarios. Focus on:
1. The most critical business flow end-to-end
2. Authentication / authorisation
3. Main entity CRUD chain (create → read → update → delete)
4. A key error/validation case
5. A security test (access without token, access other user's data)
6. A data edge case (empty, null, max length)
7. A business rule specific to this API domain

Make these the 7 scenarios an automation engineer would run in CI before every deploy.`;

const DEEP_PROMPT = (spec, contextNote, endpointList, groupList) => `
API: ${spec.title} v${spec.version}
Base URL: ${spec.baseUrl || "runtime"}
Description: ${spec.description}
Source: ${spec.source}
${contextNote}

Endpoint groups: ${groupList}

All endpoints (${spec.endpoints.length}):
${endpointList}

Generate COMPREHENSIVE test coverage — as many scenarios as needed to cover everything.
Aim for 80%+ endpoint coverage. Include:
- A scenario for EVERY functional group/resource
- Full CRUD chains for every entity
- All authentication flows (login, refresh, logout, invalid credentials)
- All error states (400, 401, 403, 404, 409, 422, 429, 500)
- Data validation for every required field
- Business rule validations
- Race conditions and concurrency edge cases
- Security: auth bypass attempts, privilege escalation, injection
- Performance: endpoints that should respond within SLA
- Integration flows: scenarios that chain multiple resources together

Group related scenarios. Prioritise Critical and High. Do not skip any endpoint group.`;

export async function buildScenarios(spec, credentials = {}, context = "", mode = "quick") {
  // For quick mode: prioritise variety — pick endpoints across all groups, max 30
  // For deep mode: use up to 80 endpoints
  const maxEndpoints = mode === "quick" ? 30 : 80;

  let endpoints = spec.endpoints || [];
  if (mode === "quick" && endpoints.length > maxEndpoints) {
    // Sample across groups for better coverage
    const byGroup = {};
    endpoints.forEach(e => {
      const g = e.tags?.[0] || e.folder || "default";
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(e);
    });
    const groups = Object.values(byGroup);
    const sampled = [];
    let i = 0;
    while (sampled.length < maxEndpoints) {
      const g = groups[i % groups.length];
      if (g.length > 0) sampled.push(g.shift());
      i++;
      if (groups.every(g => g.length === 0)) break;
    }
    endpoints = sampled;
    console.log(`[ScenarioBuilder] Sampled ${endpoints.length} endpoints across ${groups.length} groups from ${spec.endpoints.length} total`);
  } else if (endpoints.length > maxEndpoints) {
    endpoints = endpoints.slice(0, maxEndpoints);
    console.log(`[ScenarioBuilder] Capped ${spec.endpoints.length} endpoints to ${maxEndpoints} for ${mode} mode`);
  }

  const cappedSpec = { ...spec, endpoints };
  const endpointList = endpoints
    .map(e => `  [${e.method}] ${e.path}${e.summary ? ` — ${e.summary}` : ""}${e.tags?.length ? ` (${e.tags[0]})` : ""}`)
    .join("\n");

  const groups = [...new Set(endpoints.flatMap(e => e.tags || e.folder ? [e.tags?.[0] || e.folder] : ["default"]))];
  const groupList = groups.join(", ");

  const credNote = credentials.username
    ? `Test credentials available: username="${credentials.username}", password="[provided]"`
    : "No test credentials provided — generate plausible test data";

  // Build context block from all sources
  const contextParts = [];
  if (context) contextParts.push(`Integration context (Jira/Confluence/Notion):\n${context.slice(0, 2000)}`);
  if (credentials.username) contextParts.push(credNote);

  // Add schema hints for AI — use capped endpoints
  const schemasWithExamples = endpoints
    .filter(e => e.requestBody || e.responses)
    .slice(0, 8)
    .map(e => {
      const parts = [`[${e.method}] ${e.path}:`];
      if (e.requestBody) parts.push(`  body schema: ${JSON.stringify(e.requestBody).slice(0, 150)}`);
      const resp200 = e.responses?.["200"] || e.responses?.["201"];
      if (resp200?.schema) parts.push(`  response schema: ${JSON.stringify(resp200.schema).slice(0, 150)}`);
      return parts.join("\n");
    }).join("\n\n");

  if (schemasWithExamples) {
    contextParts.push(`Schema hints:\n${schemasWithExamples}`);
  }

  const contextNote = contextParts.length
    ? `\n\n${contextParts.join("\n\n---\n\n")}\n`
    : "";

  // Use cappedSpec in prompts so spec.endpoints.length is accurate
  const userPrompt = mode === "deep"
    ? DEEP_PROMPT(cappedSpec, contextNote, endpointList, groupList)
    : QUICK_PROMPT(cappedSpec, contextNote, endpointList);

  const maxTokens = mode === "deep" ? 16000 : 12000;

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: maxTokens,
    system:     BASE_SYSTEM,
    messages:   [{ role: "user", content: userPrompt }],
  });

  const raw      = response.content[0]?.text ?? "";
  const stopReason = response.stop_reason;

  // If response was cut off, try to recover partial JSON
  let scenarios = extractJSONArray(raw);

  if (scenarios.length === 0 && stopReason === "max_tokens") {
    console.warn("[ScenarioBuilder] Response truncated — attempting partial JSON recovery");
    scenarios = recoverPartialJSONArray(raw);
    if (scenarios.length > 0) {
      console.log(`[ScenarioBuilder] Recovered ${scenarios.length} scenario(s) from truncated response`);
    }
  }

  // Stamp each with metadata
  return scenarios.map((s, i) => ({
    ...s,
    id:        s.id || `S-${String(i+1).padStart(3,"0")}`,
    mode,
    specTitle: spec.title,
    specSource: spec.source,
    generatedAt: new Date().toISOString(),
  }));
}

// ── Export formats ────────────────────────────────────────────────────────────

export function scenariosToPostmanCollection(scenarios, spec) {
  const items = scenarios.map(sc => ({
    name: sc.name,
    item: sc.steps.map(step => ({
      name: step.name,
      request: {
        method: step.method,
        header: Object.entries(step.headers || {}).map(([k, v]) => ({ key: k, value: v })),
        url: {
          raw:  `{{baseUrl}}${step.path}`,
          host: ["{{baseUrl}}"],
          path: step.path.split("/").filter(Boolean),
        },
        body: step.body && Object.keys(step.body).length
          ? { mode: "raw", raw: JSON.stringify(step.body, null, 2), options: { raw: { language: "json" } } }
          : undefined,
      },
      event: [{
        listen: "test",
        script: {
          type: "text/javascript",
          exec: generatePostmanTests(step.assertions),
        },
      }],
    })),
  }));

  return {
    info: {
      name:   `${spec?.title || "ATP"} — Generated Tests`,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [{ key: "baseUrl", value: spec?.baseUrl || "", type: "string" }],
    item: items,
  };
}

export function scenariosToJestFile(scenarios, spec) {
  const lines = [
    `/**`,
    ` * ATP Generated Integration Tests`,
    ` * API: ${spec?.title || "API"}`,
    ` * Generated: ${new Date().toISOString()}`,
    ` */`,
    ``,
    `const BASE_URL = process.env.API_BASE_URL || '${spec?.baseUrl || "http://localhost:3000"}';`,
    `const captures = {};`,
    ``,
    `async function request(method, path, options = {}) {`,
    `  const url = BASE_URL + path.replace(/\\{\\{(\\w+)\\}\\}/g, (_, k) => captures[k] || '');`,
    `  const res = await fetch(url, {`,
    `    method,`,
    `    headers: { 'Content-Type': 'application/json', ...options.headers },`,
    `    body: options.body ? JSON.stringify(options.body) : undefined,`,
    `  });`,
    `  const data = await res.json().catch(() => ({}));`,
    `  return { status: res.status, data, headers: Object.fromEntries(res.headers) };`,
    `}`,
    ``,
  ];

  for (const sc of scenarios) {
    lines.push(`describe('${sc.name}', () => {`);
    for (const step of (sc.steps || [])) {
      lines.push(`  test('${step.name}', async () => {`);
      lines.push(`    const res = await request('${step.method}', \`${step.path}\`, {`);
      if (Object.keys(step.headers || {}).length) {
        lines.push(`      headers: ${JSON.stringify(step.headers)},`);
      }
      if (step.body && Object.keys(step.body).length) {
        lines.push(`      body: ${JSON.stringify(step.body)},`);
      }
      lines.push(`    });`);

      for (const a of (step.assertions || [])) {
        if (a.type === "status")   lines.push(`    expect(res.status).toBe(${a.expected});`);
        if (a.type === "jsonpath") lines.push(`    // expect: ${a.path} ${a.exists ? "exists" : `= ${a.expected}`}`);
        if (a.type === "duration") lines.push(`    // expect response within ${a.max}ms`);
      }

      if (step.captureFrom) {
        for (const [varName, path] of Object.entries(step.captureFrom)) {
          lines.push(`    // capture ${varName} from ${path}`);
          lines.push(`    // captures['${varName}'] = ...`);
        }
      }

      lines.push(`  });`);
    }
    lines.push(`});`);
    lines.push(``);
  }

  return lines.join("\n");
}

// ── Postman test script generator ─────────────────────────────────────────────
function generatePostmanTests(assertions = []) {
  const lines = [`pm.test('Response checks', function() {`];
  for (const a of assertions) {
    if (a.type === "status")   lines.push(`  pm.response.to.have.status(${a.expected});`);
    if (a.type === "duration") lines.push(`  pm.expect(pm.response.responseTime).to.be.below(${a.max});`);
    if (a.type === "jsonpath" && a.exists) {
      lines.push(`  pm.expect(pm.response.json()).to.have.nested.property('${a.path.replace("$.","")}');`);
    }
  }
  lines.push(`});`);
  return lines;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function extractJSONArray(raw) {
  if (!raw?.trim()) return [];
  try { const r = JSON.parse(raw.trim()); return Array.isArray(r) ? r : (r.scenarios || r.tests || []); } catch {}
  const s = raw.indexOf("["), e = raw.lastIndexOf("]");
  if (s !== -1 && e > s) {
    try { const r = JSON.parse(raw.slice(s, e + 1)); return Array.isArray(r) ? r : []; } catch {}
  }
  console.error("[ScenarioBuilder] Failed to parse JSON array. Raw length:", raw.length, "First 200:", raw.slice(0,200));
  return [];
}

/**
 * Recover complete scenario objects from a truncated JSON array.
 * Extracts all fully-formed { ... } objects from the partial array.
 */
function recoverPartialJSONArray(raw) {
  const start = raw.indexOf("[");
  if (start === -1) return [];

  const recovered = [];
  let depth = 0;
  let objStart = -1;

  for (let i = start + 1; i < raw.length; i++) {
    const ch = raw[i];
    // Skip strings
    if (ch === '"') {
      i++;
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === "\\") i++; // skip escaped chars
        i++;
      }
      continue;
    }
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          const obj = JSON.parse(raw.slice(objStart, i + 1));
          if (obj.name && obj.steps) recovered.push(obj);
        } catch {}
        objStart = -1;
      }
    }
  }

  return recovered;
}
