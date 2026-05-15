const BACKEND = "http://localhost:3579";

export async function listCredentials() {
  const res = await fetch(`${BACKEND}/api/vault`);
  if (!res.ok) throw new Error("Failed to list credentials");
  return (await res.json()).credentials;
}

export async function getCredential(id) {
  const res = await fetch(`${BACKEND}/api/vault/${id}`);
  if (!res.ok) throw new Error("Credential not found");
  return (await res.json()).credential;
}

export async function findCredentialForUrl(url) {
  const res = await fetch(`${BACKEND}/api/vault/match?url=${encodeURIComponent(url)}`);
  if (!res.ok) return null;
  return (await res.json()).credential;
}

export async function resolveContext(id) {
  const res = await fetch(`${BACKEND}/api/vault/${id}/context`);
  if (!res.ok) return {};
  return (await res.json()).context;
}

export async function createCredential(data) {
  const res = await fetch(`${BACKEND}/api/vault`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return (await res.json()).credential;
}

export async function updateCredential(id, data) {
  const res = await fetch(`${BACKEND}/api/vault/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return (await res.json()).credential;
}

export async function createCredentialSet(data) {
  const res = await fetch(`${BACKEND}/api/vault/sets`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return (await res.json()).credential;
}

export async function updateCredentialSet(id, data) {
  const res = await fetch(`${BACKEND}/api/vault/sets/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return (await res.json()).credential;
}

export async function deleteCredential(id) {
  const res = await fetch(`${BACKEND}/api/vault/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
  return true;
}
