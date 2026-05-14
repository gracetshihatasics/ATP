import fs   from "fs";
import path  from "path";
import crypto from "crypto";
import { encrypt, decrypt } from "./encryption.js";

const VAULT_FILE = path.resolve(process.cwd(), ".vault.json");
const SECRET     = process.env.VAULT_SECRET || "atp-default-secret-change-me";

/**
 * Vault entry shape:
 * {
 *   id:          string,
 *   name:        string,       — display label e.g. "ASICS Staging"
 *   environment: string,       — dev | staging | prod | custom
 *   type:        string,       — basic | bearer | apikey | oauth2
 *   url:         string,       — target URL this credential is for
 *   fields:      { [key]: encryptedValue },
 *   createdAt:   string,
 *   updatedAt:   string,
 * }
 */

function readVault() {
  try {
    if (!fs.existsSync(VAULT_FILE)) return [];
    const raw = fs.readFileSync(VAULT_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeVault(entries) {
  fs.writeFileSync(VAULT_FILE, JSON.stringify(entries, null, 2), "utf8");
}

export const vaultStore = {
  /** List all entries (fields remain encrypted). */
  list() {
    return readVault().map(e => ({ ...e, fields: Object.keys(e.fields) }));
  },

  /** Get one entry with decrypted fields. */
  get(id) {
    const entry = readVault().find(e => e.id === id);
    if (!entry) return null;
    const fields = {};
    for (const [k, v] of Object.entries(entry.fields)) {
      try { fields[k] = decrypt(v, SECRET); } catch { fields[k] = ""; }
    }
    return { ...entry, fields };
  },

  /** Find credentials matching a URL (partial match). */
  findForUrl(url) {
    const entries = readVault();
    const match   = entries.find(e => e.url && url.startsWith(e.url));
    if (!match) return null;
    return vaultStore.get(match.id);
  },

  /** Create a new credential entry. */
  create({ name, environment, type, url, fields }) {
    const entries  = readVault();
    const id       = `cred-${crypto.randomUUID().slice(0, 8)}`;
    const now      = new Date().toISOString();

    const encryptedFields = {};
    for (const [k, v] of Object.entries(fields ?? {})) {
      encryptedFields[k] = encrypt(String(v), SECRET);
    }

    const entry = { id, name, environment, type, url, fields: encryptedFields, createdAt: now, updatedAt: now };
    entries.push(entry);
    writeVault(entries);
    return { ...entry, fields: Object.keys(encryptedFields) };
  },

  /** Update an existing entry. */
  update(id, updates) {
    const entries = readVault();
    const index   = entries.findIndex(e => e.id === id);
    if (index === -1) return null;

    const existing = entries[index];
    const encryptedFields = { ...existing.fields };

    if (updates.fields) {
      for (const [k, v] of Object.entries(updates.fields)) {
        encryptedFields[k] = encrypt(String(v), SECRET);
      }
    }

    entries[index] = {
      ...existing,
      ...updates,
      fields:    encryptedFields,
      updatedAt: new Date().toISOString(),
    };

    writeVault(entries);
    return { ...entries[index], fields: Object.keys(encryptedFields) };
  },

  /** Delete a credential entry. */
  delete(id) {
    const entries  = readVault();
    const filtered = entries.filter(e => e.id !== id);
    if (filtered.length === entries.length) return false;
    writeVault(filtered);
    return true;
  },
};
