const BACKEND = "http://localhost:3579";

export async function getResults(params = {}) {
  // Only include defined, non-empty params
  const clean = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== "all") clean[k] = v;
  }
  const q = new URLSearchParams(clean).toString();
  const res = await fetch(`${BACKEND}/api/results${q ? `?${q}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch results");
  return res.json();
}

export async function getSummary() {
  const res = await fetch(`${BACKEND}/api/results/summary`);
  if (!res.ok) throw new Error("Failed to fetch summary");
  return (await res.json()).summary;
}

export async function getTrend(name, days = 14) {
  const res = await fetch(`${BACKEND}/api/results/trend?name=${encodeURIComponent(name)}&days=${days}`);
  if (!res.ok) throw new Error("Failed to fetch trend");
  return (await res.json()).trend;
}

export async function getRun(id) {
  const res = await fetch(`${BACKEND}/api/results/${id}`);
  if (!res.ok) throw new Error("Run not found");
  return (await res.json()).run;
}

export async function deleteRun(id) {
  await fetch(`${BACKEND}/api/results/${id}`, { method: "DELETE" });
}

export async function clearAll() {
  await fetch(`${BACKEND}/api/results`, { method: "DELETE" });
}

export function exportJUnitURL(params = {}) {
  const q = new URLSearchParams(params).toString();
  return `${BACKEND}/api/results/export/junit${q ? `?${q}` : ""}`;
}

export function exportSummaryURL() {
  return `${BACKEND}/api/results/export/summary`;
}

export async function analyseRun(id) {
  const res = await fetch(`${BACKEND}/api/results/${id}/analyse`);
  if (!res.ok) throw new Error("Analysis failed");
  return (await res.json()).analysis;
}

export async function analyseSuiteRuns(runIds) {
  const res = await fetch(`${BACKEND}/api/results/analyse-suite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runIds }),
  });
  if (!res.ok) throw new Error("Suite analysis failed");
  return (await res.json()).insight;
}
