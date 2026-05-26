const BACKEND = "http://localhost:3579";

export async function discoverPlan({ url, username, password, credentialId }) {
  const res = await fetch(`${BACKEND}/api/discover`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ url, username, password, credentialId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.detail || err.error || `Discovery failed (${res.status})`);
  }
  const data = await res.json();
  if (!data.plan) throw new Error("Backend returned no plan");
  return data.plan;
}

export async function generateScenario({ useCase }) {
  const res = await fetch(`${BACKEND}/api/scenario`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ useCase }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Scenario failed (${res.status})`);
  }
  return (await res.json()).scenario;
}
