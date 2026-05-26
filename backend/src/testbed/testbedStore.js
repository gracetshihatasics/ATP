import fs   from "fs";
import path from "path";

const STORE_FILE = path.resolve(process.cwd(), ".testbed.json");

const DEFAULTS = {
  suites:         [],   // imported test suites
  generatedTests: [],   // ATP-generated test files
  lastScan:       null,
};

export const testbedStore = {
  read() {
    try {
      if (!fs.existsSync(STORE_FILE)) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) };
    } catch { return { ...DEFAULTS }; }
  },

  write(data) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf8");
  },

  // ── Suites ──────────────────────────────────────────────────────────────────
  listSuites() {
    return this.read().suites.map(s => ({
      id:          s.id,
      name:        s.name,
      path:        s.path,
      framework:   s.framework,
      language:    s.language,
      summary:     s.summary,
      testCount:   s.testFiles?.length || 0,
      fileCount:   s.testFiles?.reduce((n, f) => n + f.tests.length, 0) || 0,
      lastScanned: s.lastScanned,
      analysis:    s.analysis,
    }));
  },

  getSuite(id) {
    return this.read().suites.find(s => s.id === id) || null;
  },

  saveSuite(suite) {
    const data = this.read();
    const id   = suite.id || `suite-${Date.now()}`;
    const now  = new Date().toISOString();
    const entry = { ...suite, id, lastScanned: now };
    const idx  = data.suites.findIndex(s => s.id === id || s.path === suite.path);
    if (idx >= 0) data.suites[idx] = entry;
    else data.suites.push(entry);
    data.lastScan = now;
    this.write(data);
    return entry;
  },

  deleteSuite(id) {
    const data = this.read();
    data.suites = data.suites.filter(s => s.id !== id);
    this.write(data);
  },

  // ── Generated tests ──────────────────────────────────────────────────────────
  listGeneratedTests() {
    return this.read().generatedTests;
  },

  saveGeneratedTest(test) {
    const data = this.read();
    const id   = test.id || `gen-${Date.now()}`;
    const entry = { ...test, id, createdAt: new Date().toISOString() };
    data.generatedTests.push(entry);
    this.write(data);
    return entry;
  },

  deleteGeneratedTest(id) {
    const data = this.read();
    data.generatedTests = data.generatedTests.filter(t => t.id !== id);
    this.write(data);
  },

  clearGeneratedTests() {
    const data = this.read();
    data.generatedTests = [];
    this.write(data);
  },

  // ── Projects ────────────────────────────────────────────────────────────────
  listProjects() {
    return (this.read().projects || []).map(p => ({
      id: p.id, name: p.name, url: p.url, framework: p.framework,
      language: p.language, fileCount: p.files?.length || 0, createdAt: p.createdAt,
    }));
  },

  getProject(id) {
    return (this.read().projects || []).find(p => p.id === id) || null;
  },

  saveGeneratedProject(project) {
    const data = this.read();
    if (!data.projects) data.projects = [];
    const idx = data.projects.findIndex(p => p.id === project.id);
    if (idx >= 0) data.projects[idx] = project;
    else data.projects.push(project);
    this.write(data);
    return project;
  },

  deleteProject(id) {
    const data = this.read();
    data.projects = (data.projects || []).filter(p => p.id !== id);
    this.write(data);
  },
};
