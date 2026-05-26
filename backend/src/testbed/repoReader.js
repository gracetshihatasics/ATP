/**
 * GitHub Repo Test Suite Reader
 * Reads test files directly from GitHub repos via the API.
 * No local clone needed — works with multiple repos simultaneously.
 */
import { gitConfig } from "../git/gitConfig.js";

const GH_API = "https://api.github.com";

const TEST_PATTERNS = [
  /\.spec\.(ts|js|tsx)$/,
  /\.test\.(ts|js|tsx)$/,
  /\.cy\.(ts|js)$/,
  /test_.*\.py$/,
  /.*_test\.py$/,
  /.*_spec\.rb$/,
];

const CONFIG_NAMES = [
  "playwright.config.ts", "playwright.config.js",
  "cypress.config.ts",    "cypress.config.js",
  "jest.config.ts",       "jest.config.js",
  "vitest.config.ts",     "vitest.config.js",
  "pytest.ini",           "conftest.py",
  "package.json",         "requirements.txt",
  "tsconfig.json",
];

const IGNORE_DIRS = ["node_modules", "dist", "build", "coverage", ".git", "__pycache__", ".pytest_cache", "vendor"];

// ── Fetch helpers ──────────────────────────────────────────────────────────────
async function ghFetch(path, token) {
  const res = await fetch(`${GH_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        "application/vnd.github.v3+json",
      "User-Agent":  "ATP-Bot",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json();
}

async function ghFetchContent(owner, repo, filePath, token) {
  try {
    const data = await ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`, token);
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch { return ""; }
}

// ── Walk repo tree ─────────────────────────────────────────────────────────────
async function getRepoTree(owner, repo, branch, token) {
  const branchData = await ghFetch(`/repos/${owner}/${repo}/branches/${branch}`, token);
  const sha        = branchData.commit.sha;
  const tree       = await ghFetch(`/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`, token);
  return tree.tree || [];
}

// ── Read a single repo ────────────────────────────────────────────────────────
export async function readRepoTestSuite(fullName, options = {}) {
  const token  = options.token || gitConfig.getToken();
  if (!token)  throw new Error("No GitHub token configured. Add one in 🔗 Integrations → 🧪 Testbed or ⚙ Git CI.");

  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo: ${fullName}`);

  // Repo info
  const repoInfo = await ghFetch(`/repos/${owner}/${repo}`, token);
  const branch   = options.branch || repoInfo.default_branch;

  // Get full file tree
  const tree = await getRepoTree(owner, repo, branch, token);

  const result = {
    repoFullName: fullName,
    repoUrl:      repoInfo.html_url,
    branch,
    defaultBranch: repoInfo.default_branch,
    description:  repoInfo.description || "",
    language:     repoInfo.language || "",
    lastPushed:   repoInfo.pushed_at,
    framework:    null,
    testLanguage: null,
    testFiles:    [],
    configFiles:  [],
    packageInfo:  null,
    pageObjects:  [],
    helpers:      [],
    patterns:     {},
    summary:      "",
  };

  // Filter tree — skip ignored dirs
  const relevant = tree.filter(item =>
    item.type === "blob" &&
    !IGNORE_DIRS.some(d => item.path.includes(`${d}/`))
  );

  // Read config files first (for framework detection)
  for (const item of relevant) {
    const name = item.path.split("/").pop();
    if (CONFIG_NAMES.includes(name)) {
      const content = await ghFetchContent(owner, repo, item.path, token);
      result.configFiles.push({ name, path: item.path, content: content.slice(0, 2000) });
    }
  }

  // Detect framework from package.json
  const pkgFile = result.configFiles.find(f => f.name === "package.json");
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content);
      result.packageInfo = {
        name:            pkg.name,
        version:         pkg.version,
        scripts:         pkg.scripts || {},
        dependencies:    pkg.dependencies    || {},
        devDependencies: pkg.devDependencies || {},
        testScript:      pkg.scripts?.test || pkg.scripts?.["test:e2e"] || null,
        hasTypeScript:   !!(pkg.devDependencies?.typescript || pkg.dependencies?.typescript),
      };
      result.framework    = detectFramework(result.packageInfo);
      result.testLanguage = result.packageInfo.hasTypeScript ? "typescript" : "javascript";
    } catch {}
  }

  // Detect Python
  if (result.configFiles.find(f => f.name === "requirements.txt" || f.name === "conftest.py")) {
    result.framework    = result.framework || "pytest";
    result.testLanguage = "python";
  }

  // Find and read test files (cap at 60)
  const testItems = relevant.filter(item => TEST_PATTERNS.some(p => p.test(item.path)));
  for (const item of testItems.slice(0, 60)) {
    const content  = await ghFetchContent(owner, repo, item.path, token);
    const tests    = extractTestNames(content);
    const imports  = extractImports(content);
    const selectors = extractSelectors(content);
    result.testFiles.push({
      path:      item.path,
      name:      item.path.split("/").pop(),
      sha:       item.sha,
      content:   content.slice(0, 3000),
      tests,
      imports,
      selectors: selectors.slice(0, 20),
      lineCount: content.split("\n").length,
    });
  }

  // Page objects
  const pageItems = relevant.filter(item =>
    /pages?[/\\]/i.test(item.path) || /\.page\.(ts|js)$/.test(item.path)
  ).slice(0, 15);
  for (const item of pageItems) {
    const content = await ghFetchContent(owner, repo, item.path, token);
    result.pageObjects.push({ name: item.path.split("/").pop(), path: item.path, content: content.slice(0, 1500) });
  }

  // Helpers
  const helperItems = relevant.filter(item =>
    /helpers?[/\\]|utils?[/\\]|support[/\\]/i.test(item.path) &&
    !TEST_PATTERNS.some(p => p.test(item.path))
  ).slice(0, 10);
  for (const item of helperItems) {
    const content = await ghFetchContent(owner, repo, item.path, token);
    result.helpers.push({ name: item.path.split("/").pop(), path: item.path, content: content.slice(0, 1500) });
  }

  // Extract patterns
  result.patterns = extractPatterns(result.testFiles, result.framework);
  result.summary  = buildSummary(result);

  return result;
}

// ── List repos the token has access to ───────────────────────────────────────
export async function listAccessibleRepos(token) {
  const t = token || gitConfig.getToken();
  if (!t) return [];
  const data = await ghFetch("/user/repos?sort=updated&per_page=50&type=all", t);
  return (data || []).map(r => ({
    fullName:      r.full_name,
    name:          r.name,
    description:   r.description || "",
    language:      r.language || "",
    defaultBranch: r.default_branch,
    private:       r.private,
    pushedAt:      r.pushed_at,
  }));
}

// ── Read multiple repos ───────────────────────────────────────────────────────
export async function readMultipleRepos(repoNames, options = {}) {
  const results = [];
  for (const name of repoNames) {
    try {
      const suite = await readRepoTestSuite(name, options);
      results.push(suite);
    } catch (err) {
      results.push({ repoFullName: name, error: err.message });
    }
  }
  return results;
}

// ── Create a file in a repo (for PR back-writing) ─────────────────────────────
export async function createFileInRepo({ fullName, branch, filePath, content, message, token }) {
  const t = token || gitConfig.getToken();
  const [owner, repo] = fullName.split("/");

  // Check if file already exists
  let sha;
  try {
    const existing = await ghFetch(`/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`, t);
    sha = existing.sha;
  } catch {}

  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${filePath}`, {
    method:  "PUT",
    headers: {
      Authorization:  `Bearer ${t}`,
      Accept:         "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent":   "ATP-Bot",
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(content).toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Failed to create file: ${await res.text()}`);
  return res.json();
}

// ── Create a branch ───────────────────────────────────────────────────────────
export async function createBranch({ fullName, newBranch, fromBranch, token }) {
  const t = token || gitConfig.getToken();
  const [owner, repo] = fullName.split("/");
  const ref  = await ghFetch(`/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`, t);
  const sha  = ref.object.sha;
  const res  = await fetch(`${GH_API}/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { Authorization:`Bearer ${t}`, Accept:"application/vnd.github.v3+json", "Content-Type":"application/json", "User-Agent":"ATP-Bot" },
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
  });
  if (!res.ok) throw new Error(`Failed to create branch: ${await res.text()}`);
  return res.json();
}

// ── Open a pull request ───────────────────────────────────────────────────────
export async function openPullRequest({ fullName, title, body, head, base, token }) {
  const t = token || gitConfig.getToken();
  const [owner, repo] = fullName.split("/");
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: { Authorization:`Bearer ${t}`, Accept:"application/vnd.github.v3+json", "Content-Type":"application/json", "User-Agent":"ATP-Bot" },
    body: JSON.stringify({ title, body, head, base }),
  });
  if (!res.ok) throw new Error(`Failed to open PR: ${await res.text()}`);
  return res.json();
}

// ── Extraction helpers ─────────────────────────────────────────────────────────
function extractTestNames(content) {
  const patterns = [
    /(?:it|test|describe)\s*\(\s*['"`]([^'"`]{3,80})['"`]/g,
    /def\s+test_([a-zA-Z_][a-zA-Z0-9_]{2,60})/g,
    /scenario\s+['"]([^'"]{3,80})['"]/g,
  ];
  const names = [];
  for (const p of patterns) { let m; while ((m = p.exec(content)) !== null && names.length < 20) names.push(m[1]); }
  return names;
}
function extractImports(content) {
  const imports = [];
  const patterns = [
    /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const p of patterns) { let m; while ((m = p.exec(content)) !== null && imports.length < 15) imports.push(m[1]); }
  return [...new Set(imports)];
}
function extractSelectors(content) {
  const selectors = [];
  const patterns = [
    /getByRole\s*\(\s*['"]([^'"]+)['"]/g,
    /getByTestId\s*\(\s*['"]([^'"]+)['"]/g,
    /locator\s*\(\s*['"]([^'"]+)['"]/g,
    /data-testid=["']([^"']+)["']/g,
    /cy\.get\s*\(\s*['"]([^'"]+)['"]/g,
  ];
  for (const p of patterns) { let m; while ((m = p.exec(content)) !== null && selectors.length < 20) selectors.push(m[1]); }
  return [...new Set(selectors)];
}
function extractPatterns(testFiles, framework) {
  const all = testFiles.map(f => f.content).join("\n");
  const allImports = testFiles.flatMap(f => f.imports);
  return {
    selectorStyle:  detectSelectorStyle(all),
    assertionStyle: detectAssertionStyle(all, framework),
    fileNaming:     detectFileNaming(testFiles),
    usesPageObjects: /new \w+Page\(|PageObject/.test(all),
    usesFixtures:    /fixtures?[/\\]|fixture\s*\(/.test(all),
    usesHelpers:     allImports.some(i => /helper|util|support/.test(i)),
    hasBeforeEach:   /beforeEach|before_each/.test(all),
    commonImports:   mostCommon(allImports, 8),
    totalTests:      testFiles.reduce((s,f) => s + f.tests.length, 0),
  };
}
function detectFramework(pkg) {
  const d = { ...pkg.dependencies, ...pkg.devDependencies };
  if (d["@playwright/test"] || d.playwright) return "playwright";
  if (d.cypress)  return "cypress";
  if (d.jest)     return "jest";
  if (d.vitest)   return "vitest";
  if (d.mocha)    return "mocha";
  return "unknown";
}
function detectSelectorStyle(c) {
  if (/getByRole|getByLabel|getByText/.test(c))  return "playwright-aria";
  if (/getByTestId|\[data-testid\]/.test(c))      return "test-id";
  if (/cy\.get\s*\(\s*['"][.#]/.test(c))          return "css";
  return "mixed";
}
function detectAssertionStyle(c, fw) {
  if (/\.toBeVisible|\.toHaveText|\.toHaveURL/.test(c)) return "playwright-expect";
  if (/\.toBe\(|\.toEqual\(|\.toContain\(/.test(c))    return "jest-expect";
  if (/should\(|\.should\./.test(c))                    return "chai";
  return "expect";
}
function detectFileNaming(files) {
  const names = files.map(f => f.name);
  if (names.some(n => /\.spec\.ts$/.test(n))) return "*.spec.ts";
  if (names.some(n => /\.spec\.js$/.test(n))) return "*.spec.js";
  if (names.some(n => /\.test\.ts$/.test(n))) return "*.test.ts";
  if (names.some(n => /test_.*\.py$/.test(n))) return "test_*.py";
  return "*.spec.ts";
}
function mostCommon(arr, n) {
  const c = {};
  arr.forEach(v => { c[v] = (c[v]||0)+1; });
  return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k])=>k);
}
function buildSummary(r) {
  return [
    `${r.framework}/${r.testLanguage}`,
    `${r.testFiles.length} test files`,
    `${r.patterns.totalTests} tests`,
    r.pageObjects.length ? `${r.pageObjects.length} page objects` : null,
    `selectors: ${r.patterns.selectorStyle}`,
  ].filter(Boolean).join(" · ");
}
