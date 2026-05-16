/**
 * Notion connector — fetches pages and database entries for test context.
 */
export async function notionConnector(config) {
  const { apiToken, databaseIds = "" } = config;
  if (!apiToken) throw new Error("Missing apiToken");

  const headers = {
    Authorization:    `Bearer ${apiToken}`,
    "Notion-Version": "2022-06-28",
    Accept:           "application/json",
  };

  // Test connection
  const meRes = await fetch("https://api.notion.com/v1/users/me", { headers });
  if (!meRes.ok) throw new Error(`Auth failed: ${meRes.status}`);
  const me = await meRes.json();

  const pages = [];

  // Search for relevant pages
  const searchRes = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ filter: { value: "page", property: "object" }, page_size: 20 }),
  });

  if (searchRes.ok) {
    const data = await searchRes.json();
    for (const result of (data.results || []).slice(0, 10)) {
      const title   = result.properties?.title?.title?.[0]?.plain_text || result.properties?.Name?.title?.[0]?.plain_text || "Untitled";
      const editedAt = result.last_edited_time;

      // Get page content
      const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${result.id}/children?page_size=20`, { headers });
      let text = "";
      if (blocksRes.ok) {
        const blocks = await blocksRes.json();
        text = (blocks.results || [])
          .map(b => b.paragraph?.rich_text?.map(t => t.plain_text).join("") || b.heading_1?.rich_text?.map(t => t.plain_text).join("") || b.bulleted_list_item?.rich_text?.map(t => t.plain_text).join("") || "")
          .filter(Boolean)
          .join(" ")
          .slice(0, 500);
      }
      pages.push({ id: result.id, title, editedAt, excerpt: text });
    }
  }

  // Fetch specified databases
  const dbIds   = databaseIds.split(",").map(d => d.trim()).filter(Boolean);
  const dbData  = [];
  for (const dbId of dbIds.slice(0, 3)) {
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method:  "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body:    JSON.stringify({ page_size: 20 }),
    });
    if (dbRes.ok) {
      const db   = await dbRes.json();
      const rows = (db.results || []).map(r => {
        const props = {};
        for (const [k, v] of Object.entries(r.properties || {})) {
          if (v.title)       props[k] = v.title[0]?.plain_text || "";
          if (v.rich_text)   props[k] = v.rich_text[0]?.plain_text || "";
          if (v.select)      props[k] = v.select?.name || "";
          if (v.number)      props[k] = v.number;
          if (v.checkbox)    props[k] = v.checkbox;
        }
        return props;
      });
      dbData.push({ id: dbId, rows });
    }
  }

  return {
    user:    { name: me.name, type: me.type },
    pages,
    databases: dbData,
    summary:   `${pages.length} Notion pages, ${dbData.length} databases`,
  };
}

export function notionToContext(data) {
  if (!data?.pages?.length) return "";
  const lines = [`Notion (${data.pages.length} pages):`];
  data.pages.forEach(p => lines.push(`- "${p.title}": ${p.excerpt?.slice(0, 150) || ""}`));
  return lines.join("\n");
}
