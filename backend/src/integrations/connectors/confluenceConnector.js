/**
 * Confluence connector
 * Fetches pages, spaces, and documentation to give ATP context about the app.
 */
export async function confluenceConnector(config) {
  const { baseUrl, email, apiToken, spaceKeys = "" } = config;
  if (!baseUrl || !email || !apiToken) throw new Error("Missing baseUrl, email, or apiToken");

  const auth    = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const base    = baseUrl.replace(/\/$/, "");

  // Test connection
  const meRes = await fetch(`${base}/rest/api/user/current`, { headers });
  if (!meRes.ok) throw new Error(`Auth failed: ${meRes.status}`);
  const me = await meRes.json();

  // Fetch spaces
  const spaces     = spaceKeys ? spaceKeys.split(",").map(s => s.trim()) : [];
  const allContent = [];

  // If no spaces specified, get recent pages
  const searchUrl = spaces.length
    ? `${base}/rest/api/content?spaceKey=${spaces[0]}&type=page&limit=20&expand=body.storage,metadata.labels`
    : `${base}/rest/api/content/search?cql=type=page+ORDER+BY+lastmodified+DESC&limit=20&expand=body.storage,metadata.labels`;

  const contentRes = await fetch(spaces.length
    ? `${base}/rest/api/content?spaceKey=${spaces[0]}&type=page&limit=20`
    : `${base}/rest/api/search?cql=type%3Dpage%20ORDER%20BY%20lastmodified%20DESC&limit=15`,
    { headers }
  );

  if (contentRes.ok) {
    const data    = await contentRes.json();
    const results = data.results || [];
    for (const page of results.slice(0, 10)) {
      // Get page body
      const bodyRes = await fetch(`${base}/rest/api/content/${page.id}?expand=body.view`, { headers });
      if (bodyRes.ok) {
        const body = await bodyRes.json();
        const text = body.body?.view?.value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000);
        allContent.push({
          id:       page.id,
          title:    page.title,
          space:    page.space?.key || "",
          url:      `${base}/wiki/pages/${page.id}`,
          excerpt:  text,
          labels:   page.metadata?.labels?.results?.map(l => l.name) || [],
        });
      }
    }
  }

  return {
    user:    { displayName: me.displayName, accountId: me.accountId },
    pages:   allContent,
    summary: `${allContent.length} Confluence pages fetched`,
  };
}

export function confluenceToContext(data) {
  if (!data?.pages?.length) return "";
  return `Confluence Documentation (${data.pages.length} pages):\n` +
    data.pages.map(p => `- "${p.title}" [${p.space}]: ${p.excerpt?.slice(0, 200) || "no content"}`).join("\n");
}
