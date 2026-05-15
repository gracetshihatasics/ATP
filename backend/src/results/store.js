import fs   from "fs";
import path  from "path";
import crypto from "crypto";

const RESULTS_FILE = path.resolve(process.cwd(), ".results.json");

/**
 * Run record shape:
 * {
 *   id:          string,
 *   type:        "usecase" | "suite" | "api",
 *   name:        string,
 *   url:         string,
 *   status:      "pass" | "fail" | "error",
 *   passed:      number,
 *   failed:      number,
 *   total:       number,
 *   duration:    number (ms),
 *   steps:       StepResult[],
 *   assertions:  AssertionResult[],
 *   screenshots: string[],   -- base64 data URIs (stored separately)
 *   tags:        string[],
 *   credentialId: string | null,
 *   startedAt:   string (ISO),
 *   completedAt: string (ISO),
 * }
 */

function read() {
  try {
    if (!fs.existsSync(RESULTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8"));
  } catch { return []; }
}

function write(records) {
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(records, null, 2), "utf8");
}

export const resultsStore = {

  save(run) {
    const records = read();
    const id      = run.id || `run-${crypto.randomUUID().slice(0, 8)}`;
    const record  = { ...run, id };
    records.unshift(record); // newest first
    // Keep last 500 runs to avoid file growing too large
    write(records.slice(0, 500));
    return record;
  },

  getAll({ limit = 50, offset = 0, type, status, url } = {}) {
    let records = read();
    if (type)   records = records.filter(r => r.type === type);
    if (status) records = records.filter(r => r.status === status);
    if (url)    records = records.filter(r => r.url?.includes(url));
    return {
      total:   records.length,
      records: records.slice(offset, offset + limit),
    };
  },

  getById(id) {
    return read().find(r => r.id === id) ?? null;
  },

  getByName(name) {
    return read().filter(r => r.name === name);
  },

  /** Trend data — pass rate over time for a given test name */
  getTrend(name, days = 14) {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const runs   = read()
      .filter(r => r.name === name && r.startedAt >= cutoff)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    return runs.map(r => ({
      date:   r.startedAt.slice(0, 10),
      status: r.status,
      passed: r.passed,
      failed: r.failed,
      total:  r.total,
      duration: r.duration,
    }));
  },

  /** Summary stats across all runs */
  getSummary() {
    const records = read();
    if (records.length === 0) return { total: 0, passed: 0, failed: 0, passRate: 0, avgDuration: 0, flaky: [] };

    const passed   = records.filter(r => r.status === "pass").length;
    const failed   = records.filter(r => r.status !== "pass").length;
    const avgDuration = Math.round(records.reduce((s, r) => s + (r.duration || 0), 0) / records.length);

    // Flaky = tests that have both pass and fail in recent history
    const byName = {};
    records.slice(0, 100).forEach(r => {
      if (!byName[r.name]) byName[r.name] = { pass: 0, fail: 0 };
      if (r.status === "pass") byName[r.name].pass++;
      else byName[r.name].fail++;
    });
    const flaky = Object.entries(byName)
      .filter(([, v]) => v.pass > 0 && v.fail > 0)
      .map(([name, v]) => ({ name, passRate: Math.round(v.pass / (v.pass + v.fail) * 100) }));

    return { total: records.length, passed, failed, passRate: Math.round(passed / records.length * 100), avgDuration, flaky };
  },

  delete(id) {
    const records = read().filter(r => r.id !== id);
    write(records);
  },

  clearAll() {
    write([]);
  },
};
