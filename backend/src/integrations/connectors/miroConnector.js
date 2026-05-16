/**
 * Miro connector
 * Fetches boards, frames, sticky notes, and shapes for visual context.
 * Useful when user journeys, wireframes, or flowcharts are in Miro.
 */
export async function miroConnector(config) {
  const { accessToken, boardIds = "" } = config;
  if (!accessToken) throw new Error("Missing Miro access token");

  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  // Verify token
  const meRes = await fetch("https://api.miro.com/v2/users/me", { headers });
  if (!meRes.ok) throw new Error(`Miro auth failed: ${meRes.status}`);
  const me = await meRes.json();

  // Fetch boards
  let boards = [];
  const specifiedIds = boardIds.split(",").map(b => b.trim()).filter(Boolean);

  if (specifiedIds.length) {
    boards = specifiedIds.map(id => ({ id, name: `Board ${id}` }));
  } else {
    const boardRes = await fetch("https://api.miro.com/v2/boards?limit=10&sort=last_modified", { headers });
    if (boardRes.ok) {
      const data = await boardRes.json();
      boards = (data.data || []).slice(0, 5);
    }
  }

  const results = [];

  for (const board of boards.slice(0, 3)) {
    const boardData = { id: board.id, name: board.name || "Unknown", items: [] };

    // Get board items — sticky notes, text, shapes
    const itemRes = await fetch(`https://api.miro.com/v2/boards/${board.id}/items?limit=50`, { headers });
    if (itemRes.ok) {
      const items = await itemRes.json();
      for (const item of (items.data || []).slice(0, 30)) {
        const content = item.data?.content || item.data?.title || "";
        const text    = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (text && text.length > 2) {
          boardData.items.push({
            type:    item.type,
            text:    text.slice(0, 200),
            x:       Math.round(item.position?.x || 0),
            y:       Math.round(item.position?.y || 0),
          });
        }
      }
    }

    // Get frames (sections of the board)
    const frameRes = await fetch(`https://api.miro.com/v2/boards/${board.id}/frames`, { headers });
    if (frameRes.ok) {
      const frames = await frameRes.json();
      boardData.frames = (frames.data || []).slice(0, 10).map(f => ({
        title: f.data?.title || "Untitled frame",
        id:    f.id,
      }));
    }

    results.push(boardData);
  }

  return {
    user:    { name: me.name, email: me.email },
    boards:  results,
    summary: `${results.length} Miro board(s), ${results.reduce((s,b) => s+b.items.length, 0)} items`,
  };
}

export function miroToContext(data) {
  if (!data?.boards?.length) return "";
  const lines = [`Miro (${data.boards.length} board(s)):`];

  for (const board of data.boards) {
    lines.push(`\nBoard: "${board.name}"`);
    if (board.frames?.length) {
      lines.push(`Frames: ${board.frames.map(f => f.title).join(" | ")}`);
    }
    if (board.items?.length) {
      lines.push(`Content (${board.items.length} items):`);
      // Group sticky notes as they contain the most useful text
      const stickies = board.items.filter(i => i.type === "sticky_note");
      const texts    = board.items.filter(i => i.type === "text");
      const shapes   = board.items.filter(i => i.type === "shape");

      if (stickies.length) {
        lines.push(`  Sticky notes: ${stickies.map(s => s.text.slice(0, 60)).join(" | ")}`);
      }
      if (texts.length) {
        lines.push(`  Text items: ${texts.map(t => t.text.slice(0, 60)).join(" | ")}`);
      }
    }
  }

  return lines.join("\n");
}
