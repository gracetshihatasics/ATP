import Anthropic from "@anthropic-ai/sdk";
import { config }             from "../config/index.js";
import { integrationStore }   from "./integrationStore.js";
import { confluenceConnector, confluenceToContext } from "./connectors/confluenceConnector.js";
import { jiraConnector, jiraToContext }             from "./connectors/jiraConnector.js";
import { dbConnector, dbToContext }                 from "./connectors/dbConnector.js";
import { notionConnector, notionToContext }         from "./connectors/notionConnector.js";
import { restConnector, restToContext }             from "./connectors/restConnector.js";

const client    = new Anthropic({ apiKey: config.apiKey });
const cache     = new Map(); // simple in-memory cache per integration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch fresh data from a single integration.
 */
export async function syncIntegration(integrationId) {
  const integration = integrationStore.get(integrationId);
  if (!integration) throw new Error("Integration not found");
  if (!integration.enabled) throw new Error("Integration is disabled");

  let result;
  switch (integration.type) {
    case "confluence": result = await confluenceConnector(integration.config); break;
    case "jira":       result = await jiraConnector(integration.config);       break;
    case "postgres":
    case "mysql":
    case "mongodb":    result = await dbConnector({ ...integration.config, type: integration.type }); break;
    case "notion":     result = await notionConnector(integration.config);     break;
    case "rest":       result = await restConnector(integration.config);       break;
    default: throw new Error(`Unknown integration type: ${integration.type}`);
  }

  cache.set(integrationId, { data: result, ts: Date.now() });
  integrationStore.updateStatus(integrationId, "connected");
  return result;
}

/**
 * Get cached or fresh data for an integration.
 */
async function getIntegrationData(integrationId) {
  const cached = cache.get(integrationId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  return syncIntegration(integrationId);
}

/**
 * Build full context from all enabled integrations for a given URL/goal.
 * Returns a structured context object ready to inject into Claude prompts.
 */
export async function buildContext(url = "", goal = "") {
  const integrations = integrationStore.list().filter(i => i.enabled);
  if (!integrations.length) return { text: "", sections: [], isEmpty: true };

  const sections = [];
  const errors   = [];

  await Promise.allSettled(
    integrations.map(async (int) => {
      try {
        const data = await getIntegrationData(int.id);
        let text   = "";
        switch (int.type) {
          case "confluence": text = confluenceToContext(data); break;
          case "jira":       text = jiraToContext(data);       break;
          case "postgres":
          case "mysql":
          case "mongodb":    text = dbToContext(data);         break;
          case "notion":     text = notionToContext(data);     break;
          case "rest":       text = restToContext(data);       break;
        }
        if (text) sections.push({ type: int.type, name: int.name, text, data });
      } catch (err) {
        errors.push({ name: int.name, error: err.message });
        integrationStore.updateStatus(int.id, "error", err.message);
      }
    })
  );

  if (!sections.length) return { text: "", sections: [], isEmpty: true, errors };

  const text = [
    `=== ATP Context for ${url || "this application"} ===`,
    goal ? `Testing goal: ${goal}` : "",
    ...sections.map(s => `\n--- ${s.name} (${s.type}) ---\n${s.text}`),
    `=== End Context ===`,
  ].filter(Boolean).join("\n");

  return { text, sections, isEmpty: false, errors };
}

/**
 * Ask Claude to extract test data from context that's relevant for a use case.
 */
export async function extractTestData(context, useCase) {
  if (context.isEmpty) return { fields: {}, suggestions: [] };

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 1000,
    messages: [{
      role:    "user",
      content: `Given this context about a system under test, extract relevant test data for the use case.

Context:
${context.text.slice(0, 4000)}

Use case: ${useCase.title}
Steps: ${useCase.steps?.join(", ") || ""}

Extract specific test data values from the context that should be used when running this test.
Prefer real data from the database/API over made-up data.

Raw JSON only:
{
  "fields": {
    "fieldName": "value to use"
  },
  "suggestions": [
    "specific suggestion for this test based on context"
  ],
  "warnings": [
    "any data conflicts or things to watch out for"
  ]
}`,
    }],
  });

  const raw = response.content[0]?.text ?? "";
  const s   = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) {
    try { return JSON.parse(raw.slice(s, e + 1)); } catch {}
  }
  return { fields: {}, suggestions: [] };
}

/**
 * Get a summarised context string suitable for injecting into discovery prompts.
 */
export async function getContextSummary(url = "") {
  const ctx = await buildContext(url);
  if (ctx.isEmpty) return "";
  return ctx.text.slice(0, 6000);
}
