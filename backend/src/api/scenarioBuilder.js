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
  const endpointList = spec.endpoints
    .map(e => `  [${e.method}] ${e.path}${e.summary ? ` — ${e.summary}` : ""}${e.tags?.length ? ` (${e.tags[0]})` : ""}`)
    .join("\n");

  const groups = [...new Set(spec.endpoints.flatMap(e => e.tags || e.folder ? [e.tags?.[0] || e.folder] : ["default"]))];
  const groupList = groups.join(", ");

  const credNote = credentials.username
    ? `Test credentials available: username="${credentials.username}", password="[provided]"`
    : "No test credentials provided — generate plausible test data";

  // Build context block from all sources
  const contextParts = [];
  if (context) contextParts.push(`Integration context (Jira/Confluence/Notion):\n${context.slice(0, 3000)}`);
  if (credentials.username) contextParts.push(credNote);

  // Add schema hints for AI
  const schemasWithExamples = spec.endpoints
    .filter(e => e.requestBody || e.responses)
    .slice(0, 10)
    .map(e => {
      const parts = [`[${e.method}] ${e.path}:`];
      if (e.requestBody) parts.push(`  body schema: ${JSON.stringify(e.requestBody).slice(0, 200)}`);
      const resp200 = e.responses?.["200"] || e.responses?.["201"];
      if (resp200?.schema) parts.push(`  response schema: ${JSON.stringify(resp200.schema).slice(0, 200)}`);
      return parts.join("\n");
    }).join("\n\n");

  if (schemasWithExamples) {
    contextParts.push(`Schema hints:\n${schemasWithExamples}`);
  }

  const contextNote = contextParts.length
    ? `\n\n${contextParts.join("\n\n---\n\n")}\n`
    : "";

  const userPrompt = mode === "deep"
    ? DEEP_PROMPT(spec, contextNote, endpointList, groupList)
    : QUICK_PROMPT(spec, contextNote, endpointList);

  const maxTokens = mode === "deep" ? 12000 : 6000;

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: maxTokens,
    system:     BASE_SYSTEM,
    messages:   [{ role: "user", content: userPrompt }],
  });

  const raw       = response.content[0]?.text ?? "";
  const scenarios = extractJSONArray(raw);

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
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("["), e = raw.lastIndexOf("]");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  return [];
}
