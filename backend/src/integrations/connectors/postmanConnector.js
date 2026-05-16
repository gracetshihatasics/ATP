/**
 * Postman connector
 * Fetches collections, environments, and test scripts from Postman API.
 * Gives ATP awareness of existing API tests and how the API works.
 */
export async function postmanConnector(config) {
  const { apiKey, workspaceId = "" } = config;
  if (!apiKey) throw new Error("Missing Postman API key");

  const headers = { "X-Api-Key": apiKey, Accept: "application/json" };

  // Verify key
  const meRes = await fetch("https://api.getpostman.com/me", { headers });
  if (!meRes.ok) throw new Error(`Postman auth failed: ${meRes.status}`);
  const me = await meRes.json();

  // Fetch collections
  const colUrl = workspaceId
    ? `https://api.getpostman.com/collections?workspace=${workspaceId}`
    : "https://api.getpostman.com/collections";
  const colRes = await fetch(colUrl, { headers });
  if (!colRes.ok) throw new Error(`Failed to fetch collections: ${colRes.status}`);
  const { collections } = await colRes.json();

  const result = [];

  for (const col of (collections || []).slice(0, 5)) {
    // Get full collection
    const detailRes = await fetch(`https://api.getpostman.com/collections/${col.uid}`, { headers });
    if (!detailRes.ok) continue;
    const { collection } = await detailRes.json();

    const endpoints = [];
    function extractEndpoints(items, parentName = "") {
      for (const item of items || []) {
        if (item.item) {
          extractEndpoints(item.item, item.name);
        } else if (item.request) {
          endpoints.push({
            folder:  parentName,
            name:    item.name,
            method:  item.request.method,
            url:     typeof item.request.url === "string" ? item.request.url : item.request.url?.raw || "",
            hasTests: !!(item.event?.find(e => e.listen === "test")),
          });
        }
      }
    }
    extractEndpoints(collection.item);

    result.push({
      id:          col.uid,
      name:        collection.info.name,
      description: collection.info.description?.slice(0, 200) || "",
      endpoints,
    });
  }

  // Fetch environments
  const envRes = await fetch("https://api.getpostman.com/environments", { headers });
  const environments = [];
  if (envRes.ok) {
    const data = await envRes.json();
    for (const env of (data.environments || []).slice(0, 3)) {
      const envDetail = await fetch(`https://api.getpostman.com/environments/${env.uid}`, { headers });
      if (envDetail.ok) {
        const { environment } = await envDetail.json();
        environments.push({
          name:   env.name,
          values: (environment.values || [])
            .filter(v => v.enabled && !v.key.toLowerCase().includes("secret") && !v.key.toLowerCase().includes("password") && !v.key.toLowerCase().includes("token"))
            .map(v => ({ key: v.key, value: v.value }))
            .slice(0, 10),
        });
      }
    }
  }

  return {
    user:         { username: me.user?.username },
    collections:  result,
    environments,
    summary:      `${result.length} collection(s), ${result.reduce((s,c) => s+c.endpoints.length, 0)} endpoints`,
  };
}

export function postmanToContext(data) {
  if (!data?.collections?.length) return "";
  const lines = [`Postman (${data.collections.length} collection(s)):`];

  for (const col of data.collections) {
    lines.push(`\nCollection: "${col.name}"`);
    if (col.description) lines.push(`Description: ${col.description}`);
    lines.push(`Endpoints (${col.endpoints.length}):`);
    col.endpoints.slice(0, 20).forEach(e =>
      lines.push(`  [${e.method}] ${e.name} — ${e.url.slice(0, 60)}${e.hasTests ? " ✓ has tests" : ""}`)
    );
  }

  if (data.environments?.length) {
    lines.push(`\nEnvironments: ${data.environments.map(e => e.name).join(", ")}`);
    const firstEnv = data.environments[0];
    if (firstEnv?.values?.length) {
      lines.push(`${firstEnv.name} variables: ${firstEnv.values.map(v => v.key).join(", ")}`);
    }
  }

  return lines.join("\n");
}
