/**
 * RunStore — persistent job store for API test runs.
 *
 * Runs survive server restarts and frontend navigation.
 * Each run has: id, status, steps[], log[], startedAt, completedAt
 *
 * Status lifecycle: queued → running → done | failed | cancelled
 */
import fs   from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.resolve(__dirname, "../../../.api-runs.json");
const MAX_RUNS   = 50; // keep last 50 runs

function read() {
  try {
    if (!fs.existsSync(STORE_FILE)) return { runs: [] };
    const raw = fs.readFileSync(STORE_FILE, "utf8").trim();
    return raw ? JSON.parse(raw) : { runs: [] };
  } catch { return { runs: [] }; }
}

function write(data) {
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf8"); } catch {}
}

// In-memory abort controllers — survives page nav, not server restart
const abortControllers = new Map();

export const runStore = {
  create({ suiteId, scenarioId, scenarioName, specBaseUrl, mode = "single" }) {
    const store = read();
    const id    = `run-${crypto.randomUUID().slice(0, 8)}`;
    const run   = {
      id, suiteId, scenarioId, scenarioName, specBaseUrl, mode,
      status:      "queued",
      steps:       [],
      log:         [],
      captures:    [],
      passed:      0,
      failed:      0,
      total:       0,
      duration:    0,
      startedAt:   new Date().toISOString(),
      completedAt: null,
      error:       null,
    };
    store.runs.unshift(run);
    // Trim to max
    if (store.runs.length > MAX_RUNS) store.runs = store.runs.slice(0, MAX_RUNS);
    write(store);
    return run;
  },

  get(id) { return read().runs.find(r => r.id === id) || null; },
  list()   { return read().runs; },

  update(id, updates) {
    const store = read();
    const idx   = store.runs.findIndex(r => r.id === id);
    if (idx < 0) return null;
    store.runs[idx] = { ...store.runs[idx], ...updates };
    write(store);
    return store.runs[idx];
  },

  appendLog(id, entry) {
    const store = read();
    const idx   = store.runs.findIndex(r => r.id === id);
    if (idx < 0) return;
    store.runs[idx].log = [...(store.runs[idx].log || []).slice(-200), entry]; // cap at 200
    write(store);
  },

  appendStep(id, step) {
    const store = read();
    const idx   = store.runs.findIndex(r => r.id === id);
    if (idx < 0) return;
    store.runs[idx].steps = [...(store.runs[idx].steps || []), step];
    write(store);
  },

  markRunning(id) {
    return this.update(id, { status: "running", startedAt: new Date().toISOString() });
  },

  markDone(id, { passed, failed, total, duration, captures }) {
    return this.update(id, {
      status: "done", passed, failed, total, duration, captures,
      completedAt: new Date().toISOString(),
    });
  },

  markFailed(id, error) {
    return this.update(id, { status: "failed", error, completedAt: new Date().toISOString() });
  },

  markCancelled(id) {
    return this.update(id, { status: "cancelled", completedAt: new Date().toISOString() });
  },

  delete(id) {
    this.cancel(id);
    const store = read();
    store.runs = store.runs.filter(r => r.id !== id);
    write(store);
  },

  cancel(id) {
    const ctrl = abortControllers.get(id);
    if (ctrl) { ctrl.abort(); abortControllers.delete(id); }
    const run = this.get(id);
    if (run && ["queued","running"].includes(run.status)) {
      this.markCancelled(id);
    }
  },

  setAbortController(id, ctrl) { abortControllers.set(id, ctrl); },
  getAbortController(id)        { return abortControllers.get(id); },

  // Active runs that were interrupted by a server restart
  getInterrupted() {
    return read().runs.filter(r => ["queued","running"].includes(r.status));
  },
};
