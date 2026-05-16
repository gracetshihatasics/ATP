/**
 * Swagger / OpenAPI connector
 * Fetches a live OpenAPI spec and parses it for context.
 * Unlike the API Agent (which builds scenarios), this connector
 * gives ATP persistent awareness of the API schema.
 */
export async function swaggerConnector(config) {
  const { specUrl, authType = "none", authValue = "" } = config;
  if (!specUrl) throw new Error("Missing specUrl");

  const headers = { Accept: "application/json, text/yaml, */*" };
  if (authType === "bearer" && authValue) headers.Authorization = `Bearer ${authValue}`;
  if (authType === "basic"  && authValue) headers.Authorization = `Basic ${Buffer.from(authValue).toString("base64")}`;
  if (authType === "api-key" && authValue) headers["X-Api-Key"] = authValue;

  const res = await fetch(specUrl, { headers });
  if (!res.ok) throw new Error(`Cannot fetch spec: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get("content-type") || "";
  let spec;

  if (contentType.includes("yaml") || specUrl.endsWith(".yaml") || specUrl.endsWith(".yml")) {
    // Parse YAML — use basic regex extraction (no yaml dep required)
    const text = await res.text();
    spec = parseYAMLBasic(text);
  } else {
    spec = await res.json();
  }

  const version  = spec.openapi || spec.swagger || "unknown";
  const info     = spec.info || {};
  const servers  = spec.servers || (spec.host ? [{ url: `${spec.schemes?.[0] || "https"}://${spec.host}${spec.basePath || ""}` }] : []);
  const paths    = spec.paths || {};

  const endpoints = [];
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!["get","post","put","patch","delete","head","options"].includes(method)) continue;
      endpoints.push({
        method:      method.toUpperCase(),
        path,
        summary:     op.summary || "",
        description: op.description?.slice(0, 100) || "",
        tags:        op.tags || [],
        operationId: op.operationId || "",
        parameters:  (op.parameters || []).map(p => ({ name: p.name, in: p.in, required: p.required })),
        hasBody:     !!(op.requestBody || op.parameters?.some(p => p.in === "body")),
      });
    }
  }

  const tags = [...new Set(endpoints.flatMap(e => e.tags))].slice(0, 20);

  return {
    version,
    title:       info.title || "API",
    description: info.description?.slice(0, 500) || "",
    apiVersion:  info.version || "",
    baseUrl:     servers[0]?.url || "",
    endpoints,
    tags,
    summary:     `${endpoints.length} endpoints across ${tags.length} tags`,
  };
}

export function swaggerToContext(data) {
  if (!data?.endpoints?.length) return "";
  const lines = [
    `OpenAPI Spec: "${data.title}" v${data.apiVersion} (${data.summary})`,
    `Base URL: ${data.baseUrl}`,
  ];
  if (data.description) lines.push(`Description: ${data.description.slice(0, 200)}`);
  if (data.tags?.length) lines.push(`Tags: ${data.tags.join(", ")}`);
  lines.push(`\nEndpoints (${data.endpoints.length}):`);
  data.endpoints.slice(0, 30).forEach(e => {
    lines.push(`  [${e.method}] ${e.path}${e.summary ? ` — ${e.summary}` : ""}`);
  });
  return lines.join("\n");
}

// Basic YAML → JSON for common OpenAPI structures (no external dep)
function parseYAMLBasic(yaml) {
  try {
    // Most OpenAPI YAML specs also have a JSON equivalent — try to extract key fields
    const title       = yaml.match(/title:\s*(.+)/)?.[1]?.trim() || "";
    const version     = yaml.match(/version:\s*(.+)/)?.[1]?.trim() || "";
    const description = yaml.match(/description:\s*(.+)/)?.[1]?.trim() || "";
    const openapi     = yaml.match(/openapi:\s*(.+)/)?.[1]?.trim() || "";
    const swagger     = yaml.match(/swagger:\s*(.+)/)?.[1]?.trim() || "";

    // Extract paths
    const pathMatches = [...yaml.matchAll(/^  (\/[^\s:]+):\s*$/gm)];
    const paths       = {};
    for (const match of pathMatches) {
      paths[match[1]] = {};
    }

    return {
      openapi: openapi || swagger,
      info: { title, version, description },
      paths,
    };
  } catch {
    return { info: { title: "API" }, paths: {} };
  }
}
