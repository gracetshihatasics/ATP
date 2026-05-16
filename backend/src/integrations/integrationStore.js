import fs     from "fs";
import path   from "path";
import crypto from "crypto";

const STORE_FILE = path.resolve(process.cwd(), ".integrations.json");
const SECRET     = process.env.VAULT_SECRET || "atp-default-secret-change-me";
const ALG        = "aes-256-gcm";

function encryptVal(val) {
  if (!val) return "";
  const iv     = crypto.randomBytes(16);
  const key    = crypto.pbkdf2Sync(SECRET, "atp-int-salt", 100_000, 32, "sha256");
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc    = Buffer.concat([cipher.update(String(val), "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), enc.toString("hex")].join(":");
}

function decryptVal(enc) {
  if (!enc) return "";
  try {
    const [ivH, tagH, dataH] = enc.split(":");
    const key    = crypto.pbkdf2Sync(SECRET, "atp-int-salt", 100_000, 32, "sha256");
    const dec    = crypto.createDecipheriv(ALG, key, Buffer.from(ivH, "hex"));
    dec.setAuthTag(Buffer.from(tagH, "hex"));
    return Buffer.concat([dec.update(Buffer.from(dataH, "hex")), dec.final()]).toString("utf8");
  } catch { return ""; }
}

/**
 * Integration record shape:
 * {
 *   id:        string,
 *   type:      "confluence"|"jira"|"github"|"notion"|"postgres"|"mysql"|"mongodb"|"rest",
 *   name:      string,
 *   enabled:   boolean,
 *   config:    { [key]: encrypted_value },
 *   lastSync:  string | null,
 *   status:    "connected"|"error"|"pending",
 *   error:     string | null,
 * }
 */

function read() {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch { return []; }
}

function write(entries) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(entries, null, 2), "utf8");
}

export const integrationStore = {
  list() {
    return read().map(e => ({
      ...e,
      config: Object.fromEntries(
        Object.keys(e.config || {}).map(k => [k, "••••••••"])
      ),
    }));
  },

  get(id) {
    const entry = read().find(e => e.id === id);
    if (!entry) return null;
    return {
      ...entry,
      config: Object.fromEntries(
        Object.entries(entry.config || {}).map(([k, v]) => [k, decryptVal(v)])
      ),
    };
  },

  getByType(type) {
    return read()
      .filter(e => e.type === type && e.enabled)
      .map(e => ({
        ...e,
        config: Object.fromEntries(
          Object.entries(e.config || {}).map(([k, v]) => [k, decryptVal(v)])
        ),
      }));
  },

  save(data) {
    const entries = read();
    const id      = data.id || `int-${crypto.randomUUID().slice(0, 8)}`;
    const now     = new Date().toISOString();

    const encConfig = {};
    for (const [k, v] of Object.entries(data.config || {})) {
      // Don't re-encrypt already-encrypted or masked values
      if (v && !v.includes("••••")) encConfig[k] = encryptVal(v);
      else {
        const existing = entries.find(e => e.id === id);
        encConfig[k]   = existing?.config?.[k] || encryptVal(v);
      }
    }

    const entry = {
      id, type: data.type, name: data.name,
      enabled:  data.enabled ?? true,
      config:   encConfig,
      lastSync: data.lastSync || null,
      status:   data.status || "pending",
      error:    data.error || null,
      createdAt: now, updatedAt: now,
    };

    const idx = entries.findIndex(e => e.id === id);
    if (idx >= 0) entries[idx] = { ...entries[idx], ...entry };
    else entries.push(entry);

    write(entries);
    return { ...entry, config: Object.fromEntries(Object.keys(encConfig).map(k => [k, "••••••••"])) };
  },

  updateStatus(id, status, error = null) {
    const entries = read();
    const idx     = entries.findIndex(e => e.id === id);
    if (idx < 0) return;
    entries[idx].status  = status;
    entries[idx].error   = error;
    entries[idx].lastSync = status === "connected" ? new Date().toISOString() : entries[idx].lastSync;
    write(entries);
  },

  delete(id) {
    write(read().filter(e => e.id !== id));
  },
};
