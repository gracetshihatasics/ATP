import fs   from "fs";
import path from "path";

const KNOWLEDGE_FILE = path.resolve(process.cwd(), ".app-knowledge.json");

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

function read() {
  try {
    if (!fs.existsSync(KNOWLEDGE_FILE)) return {};
    return JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, "utf8"));
  } catch { return {}; }
}

function write(data) {
  fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(data, null, 2), "utf8");
}

function emptyEntry() {
  return {
    pages: {},
    selectorHistory: {},
    learnedPatterns: [],
    runHistory: { totalRuns: 0, passRate: 0, avgConfidence: 0 },
    updatedAt: new Date().toISOString(),
  };
}

export const appKnowledge = {
  getKnowledge(url) {
    const key  = normalizeUrl(url);
    const data = read();
    return data[key] ?? emptyEntry();
  },

  updatePage(url, urlPath, pageData) {
    const key  = normalizeUrl(url);
    const data = read();
    if (!data[key]) data[key] = emptyEntry();
    data[key].pages[urlPath] = { ...(data[key].pages[urlPath] ?? {}), ...pageData };
    data[key].updatedAt = new Date().toISOString();
    write(data);
  },

  recordSelectorResult(url, selector, hit) {
    if (!selector) return;
    const key  = normalizeUrl(url);
    const data = read();
    if (!data[key]) data[key] = emptyEntry();
    const h = data[key].selectorHistory[selector] ?? { hitCount: 0, missCount: 0, lastSeen: null, alternatives: [] };
    if (hit) h.hitCount++;
    else     h.missCount++;
    h.lastSeen = new Date().toISOString();
    data[key].selectorHistory[selector] = h;
    data[key].updatedAt = new Date().toISOString();
    write(data);
  },

  addLearnedPattern(url, pattern) {
    const key  = normalizeUrl(url);
    const data = read();
    if (!data[key]) data[key] = emptyEntry();
    data[key].learnedPatterns.push({ ...pattern, addedAt: new Date().toISOString() });
    // keep last 100 patterns
    if (data[key].learnedPatterns.length > 100) {
      data[key].learnedPatterns = data[key].learnedPatterns.slice(-100);
    }
    data[key].updatedAt = new Date().toISOString();
    write(data);
  },

  getConfidenceBoost(url, selector) {
    if (!selector) return 0;
    const key   = normalizeUrl(url);
    const data  = read();
    const entry = data[key]?.selectorHistory?.[selector];
    if (!entry) return 0;
    const total = entry.hitCount + entry.missCount;
    if (total < 3) return 0;
    // 0–15 proportional to hit rate
    return Math.round((entry.hitCount / total) * 15);
  },

  recordRun(url, passed, avgConfidence) {
    const key  = normalizeUrl(url);
    const data = read();
    if (!data[key]) data[key] = emptyEntry();
    const rh = data[key].runHistory;
    const n  = rh.totalRuns;
    rh.passRate      = ((rh.passRate * n) + (passed ? 1 : 0)) / (n + 1);
    rh.avgConfidence = ((rh.avgConfidence * n) + (avgConfidence ?? 0)) / (n + 1);
    rh.totalRuns     = n + 1;
    data[key].updatedAt = new Date().toISOString();
    write(data);
  },
};
