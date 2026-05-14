const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

/**
 * Call the Claude API and return the first text content block.
 * @param {Array<{role:string,content:string}>} messages
 * @param {string} system
 * @param {AbortSignal} [signal]
 */
export async function callClaude(messages, system, signal) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system,
      messages,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const text = data.content?.find(b => b.type === "text")?.text ?? "";
  if (!text) throw new Error("Empty response from Claude");
  return text;
}

/**
 * Robustly extract a JSON value from a string that may contain markdown fences
 * or surrounding prose. Tries three strategies in order.
 * @param {string} raw
 * @returns {any}
 */
export function extractJSON(raw) {
  // 1. Direct parse
  try { return JSON.parse(raw.trim()); } catch {}

  // 2. Strip markdown fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch {} }

  // 3. Find first complete {...} or [...] block
  const firstBrace   = raw.indexOf("{");
  const lastBrace    = raw.lastIndexOf("}");
  const firstBracket = raw.indexOf("[");
  const lastBracket  = raw.lastIndexOf("]");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(raw.slice(firstBrace, lastBrace + 1)); } catch {}
  }
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try { return JSON.parse(raw.slice(firstBracket, lastBracket + 1)); } catch {}
  }

  throw new Error("Could not extract valid JSON from Claude response");
}
