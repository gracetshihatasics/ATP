/**
 * Generic REST API connector
 * Lets ATP connect to any custom API endpoint to fetch test data or context.
 */
export async function restConnector(config) {
  const { baseUrl, authType, authValue, endpoints = "[]", headers: extraHeaders = "{}" } = config;
  if (!baseUrl) throw new Error("Missing baseUrl");

  let parsedEndpoints = [];
  let parsedHeaders   = {};
  try { parsedEndpoints = JSON.parse(endpoints); } catch {}
  try { parsedHeaders   = JSON.parse(extraHeaders); } catch {}

  const authHeader = buildAuthHeader(authType, authValue);
  const headers    = { Accept: "application/json", ...authHeader, ...parsedHeaders };

  // Test connection with a HEAD request
  const testRes = await fetch(baseUrl, { method: "HEAD", headers }).catch(() =>
    fetch(baseUrl, { headers })
  );
  if (!testRes.ok && testRes.status >= 500) throw new Error(`Cannot reach ${baseUrl}: ${testRes.status}`);

  // Fetch each configured endpoint
  const results = [];
  for (const ep of parsedEndpoints.slice(0, 5)) {
    const url     = `${baseUrl}${ep.path}`;
    const res     = await fetch(url, { headers }).catch(e => ({ ok: false, statusText: e.message }));
    if (!res.ok)  { results.push({ path: ep.path, error: res.statusText }); continue; }
    const data    = await res.json().catch(() => null);
    results.push({ path: ep.path, label: ep.label || ep.path, data });
  }

  return {
    baseUrl,
    endpoints: results,
    summary:   `${results.filter(r => !r.error).length}/${results.length} endpoints fetched`,
  };
}

export function restToContext(data) {
  if (!data?.endpoints?.length) return "";
  const lines = [`REST API (${data.baseUrl}):`];
  for (const ep of data.endpoints) {
    if (ep.error) { lines.push(`- ${ep.path}: ERROR ${ep.error}`); continue; }
    const preview = ep.data ? JSON.stringify(ep.data).slice(0, 150) : "no data";
    lines.push(`- ${ep.label || ep.path}: ${preview}`);
  }
  return lines.join("\n");
}

function buildAuthHeader(type, value) {
  if (!type || !value) return {};
  switch (type) {
    case "bearer":  return { Authorization: `Bearer ${value}` };
    case "basic":   return { Authorization: `Basic ${Buffer.from(value).toString("base64")}` };
    case "api-key": return { "X-API-Key": value };
    case "header":  { const [k, v] = value.split(":"); return { [k?.trim()]: v?.trim() }; }
    default: return {};
  }
}
