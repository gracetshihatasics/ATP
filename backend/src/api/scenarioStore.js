import fs   from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.resolve(__dirname, "../../../.api-scenarios.json");

function read() {
  try {
    if (!fs.existsSync(STORE_FILE)) return { suites: [] };
    const raw = fs.readFileSync(STORE_FILE, "utf8").trim();
    return raw ? JSON.parse(raw) : { suites: [] };
  } catch { return { suites: [] }; }
}

function write(data) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Suite record:
 * {
 *   id, name, specTitle, specSource, baseUrl,
 *   mode: "quick"|"deep",
 *   scenarios: [...],
 *   spec: { title, baseUrl, endpoints: [...] },
 *   integrationId: string|null,
 *   collectionId:  string|null,
 *   createdAt, updatedAt,
 * }
 */
export const scenarioStore = {
  listSuites() {
    return read().suites.map(s => ({
      id:           s.id,
      name:         s.name,
      specTitle:    s.specTitle,
      specSource:   s.specSource,
      baseUrl:      s.baseUrl,
      mode:         s.mode,
      scenarioCount: s.scenarios?.length || 0,
      integrationId: s.integrationId || null,
      collectionId:  s.collectionId  || null,
      createdAt:    s.createdAt,
      updatedAt:    s.updatedAt,
    }));
  },

  getSuite(id) {
    return read().suites.find(s => s.id === id) || null;
  },

  saveSuite(data) {
    const store = read();
    const id    = data.id || `suite-${crypto.randomUUID().slice(0,8)}`;
    const now   = new Date().toISOString();
    const entry = { ...data, id, updatedAt: now, createdAt: data.createdAt || now };
    const idx   = store.suites.findIndex(s => s.id === id);
    if (idx >= 0) store.suites[idx] = entry;
    else store.suites.unshift(entry); // newest first
    write(store);
    return entry;
  },

  deleteSuite(id) {
    const store = read();
    store.suites = store.suites.filter(s => s.id !== id);
    write(store);
  },

  updateSuiteResults(suiteId, scenarioId, result) {
    const store = read();
    const suite = store.suites.find(s => s.id === suiteId);
    if (!suite) return;
    suite.scenarios = suite.scenarios.map(sc =>
      sc.id === scenarioId ? { ...sc, lastResult: result, lastRun: new Date().toISOString() } : sc
    );
    suite.updatedAt = new Date().toISOString();
    write(store);
  },

  count() { return read().suites.length; },
};
