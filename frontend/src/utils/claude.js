const BACKEND = "http://localhost:3579";

export async function discoverPlan({ url, username, password }) {
  const res = await fetch(`${BACKEND}/api/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, username, password }),
  });
  if (!res.ok) throw new Error(`Discovery failed: ${(await res.json()).error}`);
  return (await res.json()).plan;
}

export async function generateScenario({ useCase }) {
  const res = await fetch(`${BACKEND}/api/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ useCase }),
  });
  if (!res.ok) throw new Error(`Scenario failed: ${(await res.json()).error}`);
  return (await res.json()).scenario;
}
