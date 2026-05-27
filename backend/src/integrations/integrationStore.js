import fs     from "fs";
import path   from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

// Always resolve relative to the backend root, not cwd
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.resolve(__dirname, "../../../.integrations.json");
const SECRET     = process.env.VAULT_SECRET || "atp-default-secret-change-me";
const ALG        = "aes-256-gcm";

// Log where we're storing on first load
let _logged = false;
function logStorePath() {
  if (_logged) return; _logged = true;
  console.log(`[Integrations] Store: ${STORE_FILE}`);
}

function encryptVal(val) {
  if (!val) return "";
  const iv     = crypto.randomBytes(16);
  const key    = crypto.pbkdf2Sync(SECRET, "atp-int-salt", 100_000, 32, "sha256");
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc    = Buffer.concat([cipher.update(String(val), "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), enc.toString("hex")].join(":");
}

function isEncrypted(val) {
  if (!val) return false;
  const parts = val.split(":");
  return parts.length === 3 && parts[0].length === 32; // iv is 16 bytes = 32 hex chars
}

function decryptVal(enc) {
  if (!enc) return "";
  if (!isEncrypted(enc)) return enc; // plain text (shouldn't happen but safe fallback)
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
 *   type:      "postman"|"swagger"|"confluence"|"jira"|"github"|"notion"|"postgres"|"mysql"|"mongodb"|"rest"|"miro",
 *   name:      string,
 *   enabled:   boolean,
 *   config:    { [key]: encrypted_value },
 *   lastSync:  string | null,
 *   status:    "connected"|"error"|"pending",
 *   error:     string | null,
 * }
 */

function read() {
  logStorePath();
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    const raw = fs.readFileSync(STORE_FILE, "utf8").trim();
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("[Integrations] Read error:", e.message);
    return [];
  }
}

function write(entries) {
  logStorePath();
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(entries, null, 2), "utf8");
  } catch (e) {
    console.error("[Integrations] Write error:", e.message);
  }
}

export const integrationStore = {
  list() {
    return read().map(e => ({
      ...e,
      // Mask secret fields for list view
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

  // Returns config with sensitive fields masked for display — URL/non-secret fields shown
  getForDisplay(id) {
    const entry = read().find(e => e.id === id);
    if (!entry) return null;
    const SENSITIVE = ["apikey","password","token","secret","connectionstring","apitoken"];
    return {
      ...entry,
      config: Object.fromEntries(
        Object.entries(entry.config || {}).map(([k, v]) =>
          SENSITIVE.some(s => k.toLowerCase().includes(s))
            ? [k, v ? "••••••••" : ""]
            : [k, decryptVal(v)]
        )
      ),
    };
  },

  getByType(type) {
    return read()
      .filter(e => e.type === type && e.enabled !== false)
      .map(e => ({
        ...e,
        config: Object.fromEntries(
          Object.entries(e.config || {}).map(([k, v]) => [k, decryptVal(v)])
        ),
      }));
  },

  save(data) {
    const entries   = read();
    const id        = data.id || `int-${crypto.randomUUID().slice(0, 8)}`;
    const existing  = entries.find(e => e.id === id);
    const now       = new Date().toISOString();

    const encConfig = {};
    for (const [k, v] of Object.entries(data.config || {})) {
      if (!v || v === "••••••••") {
        // Keep existing encrypted value — user didn't change this field
        encConfig[k] = existing?.config?.[k] || "";
      } else if (isEncrypted(v)) {
        // Already encrypted (shouldn't happen from frontend but handle it)
        encConfig[k] = v;
      } else {
        // Plain text — encrypt it
        encConfig[k] = encryptVal(v);
      }
    }

    const entry = {
      id,
      type:      data.type,
      name:      data.name,
      enabled:   data.enabled ?? true,
      config:    encConfig,
      lastSync:  data.lastSync  || existing?.lastSync  || null,
      status:    data.status    || existing?.status    || "pending",
      error:     data.error     || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const idx = entries.findIndex(e => e.id === id);
    if (idx >= 0) entries[idx] = entry;
    else entries.push(entry);

    write(entries);
    console.log(`[Integrations] Saved: ${entry.type} — ${entry.name} (${id})`);

    // Return with masked config
    return { ...entry, config: Object.fromEntries(Object.keys(encConfig).map(k => [k, "••••••••"])) };
  },

  updateStatus(id, status, error = null) {
    const entries = read();
    const idx     = entries.findIndex(e => e.id === id);
    if (idx < 0) return;
    entries[idx].status   = status;
    entries[idx].error    = error;
    entries[idx].updatedAt = new Date().toISOString();
    if (status === "connected") entries[idx].lastSync = new Date().toISOString();
    write(entries);
  },

  delete(id) {
    write(read().filter(e => e.id !== id));
    console.log(`[Integrations] Deleted: ${id}`);
  },

  // Diagnostic — how many integrations are stored
  count() {
    return read().length;
  },
};
