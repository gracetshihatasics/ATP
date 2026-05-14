const BACKEND = "http://localhost:3579";

export async function importSpec({ swaggerUrl, postmanJson, baseUrl }) {
  const res = await fetch(`${BACKEND}/api/agent/import`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ swaggerUrl, postmanJson, baseUrl }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

export async function buildScenarios({ specId, credentials }) {
  const res = await fetch(`${BACKEND}/api/agent/build`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ specId, credentials }),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

/**
 * Run a scenario — streams SSE events, calls onEvent for each.
 */
export async function runScenario({ specId, scenarioId, baseUrl, credentials }, onEvent) {
  const res = await fetch(`${BACKEND}/api/agent/run`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ specId, scenarioId, baseUrl, credentials }),
  });

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { onEvent(JSON.parse(line.slice(6))); } catch {}
      }
    }
  }
}

/**
 * Run all scenarios — streams SSE events.
 */
export async function runAllScenarios({ specId, baseUrl, credentials }, onEvent) {
  const res = await fetch(`${BACKEND}/api/agent/run-all`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ specId, baseUrl, credentials }),
  });

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { onEvent(JSON.parse(line.slice(6))); } catch {}
      }
    }
  }
}
