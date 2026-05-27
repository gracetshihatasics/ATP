
import { config } from "../config/index.js";

import { anthropic as client } from "../ai/client.js";

const SYSTEM = `You are an expert API test architect. Given an API spec, build realistic multi-step business transaction test scenarios.

CRITICAL: Respond with ONLY a raw JSON array. Start with [ end with ]. No markdown. No backticks.

Each scenario:
{
  "id": "S-001",
  "name": "string (business transaction name)",
  "description": "string (what business flow this tests)",
  "priority": "Critical|High|Medium|Low",
  "category": "Authentication|CRUD|Business Flow|Edge Case|Performance",
  "steps": [
    {
      "id": "step-1",
      "name": "string",
      "method": "GET|POST|PUT|PATCH|DELETE",
      "path": "/api/endpoint",
      "headers": { "Content-Type": "application/json" },
      "body": {},
      "params": {},
      "captureFrom": { "variableName": "jsonpath.to.value" },
      "assertions": [
        { "type": "status", "expected": 200 },
        { "type": "jsonpath", "path": "$.token", "exists": true },
        { "type": "schema", "field": "id", "dataType": "string" }
      ],
      "dependsOn": "step-id-of-previous-step-if-any"
    }
  ]
}

Rules:
- Build 4-6 scenarios covering: happy path, auth flow, error cases, edge cases
- Chain data between steps using captureFrom (e.g. capture auth token from login, use in next step as {{token}})
- Use {{variableName}} syntax to reference captured values in subsequent steps
- Make scenarios realistic for the actual API domain
- Cover both success (2xx) and error (4xx) assertions`;

/**
 * Use Claude to build business transaction scenarios from a normalised API spec.
 * @param {import('./swaggerParser.js').NormalisedSpec} spec
 * @param {{ username?: string, password?: string }} credentials
 * @returns {Promise<object[]>}
 */
export async function buildScenarios(spec, credentials = {}, context = "") {
  const endpointSummary = spec.endpoints
    .slice(0, 40)
    .map(e => `${e.method} ${e.path} — ${e.summary || e.description}`)
    .join("\n");

  const credNote = credentials.username
    ? `\nTest credentials: username="${credentials.username}", password="${credentials.password}"`
    : "";

  const contextNote = context
    ? `\n\nIntegration context (Jira, Confluence, etc.):\n${context.slice(0, 2000)}`
    : "";

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 6000,
    system:     SYSTEM,
    messages: [{
      role:    "user",
      content: `API: ${spec.title} (${spec.source})
Base URL: ${spec.baseUrl || "provided at runtime"}
Description: ${spec.description}${credNote}${contextNote}

Endpoints:
${endpointSummary}

Build comprehensive business transaction test scenarios for this API.`,
    }],
  });

  const raw = response.content[0]?.text ?? "";
  return extractJSONArray(raw);
}

/**
 * Build a single detailed scenario for a specific endpoint.
 */
export async function buildEndpointScenario(endpoint, spec) {
  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 2000,
    system: `You are an API test expert. Generate a single detailed test scenario for one endpoint.
CRITICAL: Respond ONLY with a raw JSON object (single scenario, not array). Start { end }.`,
    messages: [{
      role:    "user",
      content: `API: ${spec.title}, Base URL: ${spec.baseUrl}
Endpoint: ${endpoint.method} ${endpoint.path}
Summary: ${endpoint.summary}
Parameters: ${JSON.stringify(endpoint.parameters)}
Request body schema: ${JSON.stringify(endpoint.requestBody)}
Responses: ${JSON.stringify(endpoint.responses)}

Generate a detailed test scenario with multiple assertions.`,
    }],
  });

  const raw = response.content[0]?.text ?? "";
  return extractJSONObject(raw);
}

function extractJSONArray(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("["), e = raw.lastIndexOf("]");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  return [];
}

function extractJSONObject(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  return {};
}
