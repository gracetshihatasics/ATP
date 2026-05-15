import fs    from "fs";
import path  from "path";
import crypto from "crypto";
import { encrypt, decrypt } from "./encryption.js";

const VAULT_FILE = path.resolve(process.cwd(), ".vault.json");
const SECRET     = process.env.VAULT_SECRET || "atp-default-secret-change-me";

/**
 * Two entry types live in the same file:
 *
 * Credential (single user):
 * {
 *   kind: "credential",
 *   id, name, environment, type, url,
 *   fields: { [key]: encryptedValue },
 *   createdAt, updatedAt
 * }
 *
 * CredentialSet (multiple named users):
 * {
 *   kind: "set",
 *   id, name, environment, url,
 *   users: [
 *     { alias: "admin",        type: "basic",  fields: { username: enc, password: enc } },
 *     { alias: "existingUser", type: "bearer", fields: { token: enc } },
 *     { alias: "guest",        type: "none",   fields: {} },
 *   ],
 *   createdAt, updatedAt
 * }
 *
 * At runtime, a set injects variables as {{alias.fieldName}}
 * e.g. {{admin.username}}, {{existingUser.token}}
 */

function readVault() {
  try {
    if (!fs.existsSync(VAULT_FILE)) return [];
    return JSON.parse(fs.readFileSync(VAULT_FILE, "utf8"));
  } catch { return []; }
}

function writeVault(entries) {
  fs.writeFileSync(VAULT_FILE, JSON.stringify(entries, null, 2), "utf8");
}

function encryptFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    out[k] = encrypt(String(v), SECRET);
  }
  return out;
}

function decryptFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    try { out[k] = decrypt(v, SECRET); } catch { out[k] = ""; }
  }
  return out;
}

// ── Single credential ─────────────────────────────────────────────────────────
export const vaultStore = {
  list() {
    return readVault().map(e => {
      if (e.kind === "set") {
        return { ...e, users: e.users.map(u => ({ ...u, fields: Object.keys(u.fields) })) };
      }
      return { ...e, fields: Object.keys(e.fields ?? {}) };
    });
  },

  get(id) {
    const entry = readVault().find(e => e.id === id);
    if (!entry) return null;
    if (entry.kind === "set") {
      return {
        ...entry,
        users: entry.users.map(u => ({ ...u, fields: decryptFields(u.fields) })),
      };
    }
    return { ...entry, fields: decryptFields(entry.fields) };
  },

  findForUrl(url) {
    const match = readVault().find(e => e.url && url.startsWith(e.url));
    return match ? vaultStore.get(match.id) : null;
  },

  /**
   * Resolve a credential or set into a flat context map for test injection.
   * Single credential → { username, password, token, ... }
   * Set              → { admin.username, admin.password, existingUser.token, ... }
   */
  resolveContext(id) {
    const entry = vaultStore.get(id);
    if (!entry) return {};
    if (entry.kind === "set") {
      const ctx = {};
      for (const user of entry.users) {
        for (const [k, v] of Object.entries(user.fields ?? {})) {
          ctx[`${user.alias}.${k}`] = v;
        }
      }
      return ctx;
    }
    return { ...entry.fields };
  },

  // ── Single credential CRUD ──────────────────────────────────────────────────
  create({ name, environment, type, url, fields }) {
    const entries = readVault();
    const id      = `cred-${crypto.randomUUID().slice(0, 8)}`;
    const now     = new Date().toISOString();
    const entry   = { kind: "credential", id, name, environment, type, url, fields: encryptFields(fields), createdAt: now, updatedAt: now };
    entries.push(entry);
    writeVault(entries);
    return { ...entry, fields: Object.keys(entry.fields) };
  },

  update(id, updates) {
    const entries = readVault();
    const index   = entries.findIndex(e => e.id === id);
    if (index === -1) return null;
    const existing        = entries[index];
    const encryptedFields = { ...existing.fields };
    if (updates.fields) {
      for (const [k, v] of Object.entries(updates.fields)) {
        encryptedFields[k] = encrypt(String(v), SECRET);
      }
    }
    entries[index] = { ...existing, ...updates, fields: encryptedFields, updatedAt: new Date().toISOString() };
    writeVault(entries);
    return { ...entries[index], fields: Object.keys(encryptedFields) };
  },

  delete(id) {
    const entries  = readVault();
    const filtered = entries.filter(e => e.id !== id);
    if (filtered.length === entries.length) return false;
    writeVault(filtered);
    return true;
  },

  // ── Credential set CRUD ─────────────────────────────────────────────────────
  createSet({ name, environment, url, users }) {
    const entries = readVault();
    const id      = `set-${crypto.randomUUID().slice(0, 8)}`;
    const now     = new Date().toISOString();
    const encUsers = (users ?? []).map(u => ({ ...u, fields: encryptFields(u.fields) }));
    const entry   = { kind: "set", id, name, environment, url, users: encUsers, createdAt: now, updatedAt: now };
    entries.push(entry);
    writeVault(entries);
    return { ...entry, users: encUsers.map(u => ({ ...u, fields: Object.keys(u.fields) })) };
  },

  updateSet(id, { name, environment, url, users }) {
    const entries = readVault();
    const index   = entries.findIndex(e => e.id === id);
    if (index === -1) return null;
    const encUsers = (users ?? []).map(u => ({ ...u, fields: encryptFields(u.fields) }));
    entries[index] = { ...entries[index], name, environment, url, users: encUsers, updatedAt: new Date().toISOString() };
    writeVault(entries);
    return { ...entries[index], users: encUsers.map(u => ({ ...u, fields: Object.keys(u.fields) })) };
  },
};
