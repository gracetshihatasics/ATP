import fs   from "fs";
import path from "path";

/**
 * Reads an existing automation project and extracts:
 * - Framework (Playwright, Cypress, Jest, Pytest, etc.)
 * - Test patterns (selectors, assertions, helpers)
 * - File structure
 * - Package dependencies
 * - Config files
 * - Page objects / fixtures / helpers
 */

// Supported test file extensions
const TEST_EXTENSIONS = [".spec.ts", ".spec.js", ".test.ts", ".test.js", ".spec.cy.ts", ".spec.cy.js", "_test.py", ".test.py", "_spec.rb"];
const CONFIG_FILES    = ["playwright.config.ts", "playwright.config.js", "cypress.config.ts", "cypress.config.js", "jest.config.ts", "jest.config.js", "vitest.config.ts", "pytest.ini", "conftest.py", ".mocharc.js"];
const PACKAGE_FILES   = ["package.json", "requirements.txt", "Gemfile", "build.gradle", "pom.xml"];

export async function readTestSuite(rootPath) {
  if (!fs.existsSync(rootPath)) throw new Error(`Path not found: ${rootPath}`);

  const result = {
    rootPath,
    framework:    null,
    language:     null,
    testFiles:    [],
    configFiles:  [],
    packageInfo:  null,
    pageObjects:  [],
    helpers:      [],
    fixtures:     [],
    patterns:     {},
    summary:      "",
  };

  // 1. Read package files
  result.packageInfo = readPackageInfo(rootPath);
  result.framework   = detectFramework(result.packageInfo);
  result.language    = detectLanguage(rootPath, result.packageInfo);

  // 2. Find all test files
  const allFiles = walkDir(rootPath, 8);
  result.testFiles = allFiles
    .filter(f => isTestFile(f))
    .slice(0, 100) // cap at 100 files
    .map(f => readTestFile(f, rootPath));

  // 3. Find config files
  result.configFiles = CONFIG_FILES
    .map(cf => path.join(rootPath, cf))
    .filter(p => fs.existsSync(p))
    .map(p => ({ name: path.basename(p), content: fs.readFileSync(p, "utf8").slice(0, 2000) }));

  // Also check nested config
  allFiles.filter(f => CONFIG_FILES.some(c => f.endsWith(c))).forEach(f => {
    if (!result.configFiles.find(c => c.name === path.basename(f))) {
      result.configFiles.push({ name: path.basename(f), content: fs.readFileSync(f, "utf8").slice(0, 2000) });
    }
  });

  // 4. Find page objects, helpers, fixtures
  result.pageObjects = allFiles
    .filter(f => /page[s]?[/\\]/i.test(f) || /\.page\.(ts|js)$/.test(f) || /PageObject/i.test(f))
    .slice(0, 20)
    .map(f => ({ name: path.basename(f), path: path.relative(rootPath, f), content: fs.readFileSync(f, "utf8").slice(0, 1500) }));

  result.helpers = allFiles
    .filter(f => /helper[s]?[/\\]/i.test(f) || /util[s]?[/\\]/i.test(f) || /support[/\\]/i.test(f))
    .filter(f => !isTestFile(f))
    .slice(0, 15)
    .map(f => ({ name: path.basename(f), path: path.relative(rootPath, f), content: fs.readFileSync(f, "utf8").slice(0, 1500) }));

  result.fixtures = allFiles
    .filter(f => /fixture[s]?[/\\]/i.test(f) || /fixture[s]?\.(ts|js|json)$/.test(f))
    .slice(0, 10)
    .map(f => ({ name: path.basename(f), path: path.relative(rootPath, f), content: fs.readFileSync(f, "utf8").slice(0, 1000) }));

  // 5. Extract patterns from test files
  result.patterns = extractPatterns(result.testFiles, result.framework);

  // 6. Summary
  result.summary = buildSummary(result);

  return result;
}

// ── Read a single test file ───────────────────────────────────────────────────
function readTestFile(filePath, rootPath) {
  const content  = fs.readFileSync(filePath, "utf8");
  const relPath  = path.relative(rootPath, filePath);
  const tests    = extractTestNames(content);
  const imports  = extractImports(content);
  const selectors = extractSelectors(content);

  return {
    path:      relPath,
    name:      path.basename(filePath),
    size:      content.length,
    content:   content.slice(0, 3000), // first 3000 chars for context
    tests,
    imports,
    selectors: selectors.slice(0, 20),
    lineCount: content.split("\n").length,
  };
}

// ── Detect framework from package.json / config files ────────────────────────
function detectFramework(pkgInfo) {
  if (!pkgInfo) return "unknown";
  const deps = { ...pkgInfo.dependencies, ...pkgInfo.devDependencies };
  if (deps["@playwright/test"] || deps["playwright"]) return "playwright";
  if (deps["cypress"])                                  return "cypress";
  if (deps["jest"])                                     return "jest";
  if (deps["vitest"])                                   return "vitest";
  if (deps["mocha"])                                    return "mocha";
  if (deps["jasmine"])                                  return "jasmine";
  return "unknown";
}

function detectLanguage(rootPath, pkgInfo) {
  if (pkgInfo) return pkgInfo.hasTypeScript ? "typescript" : "javascript";
  if (fs.existsSync(path.join(rootPath, "requirements.txt"))) return "python";
  if (fs.existsSync(path.join(rootPath, "Gemfile")))          return "ruby";
  return "javascript";
}

// ── Read package.json ─────────────────────────────────────────────────────────
function readPackageInfo(rootPath) {
  const pkgPath = path.join(rootPath, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const hasTypeScript = !!(
      pkg.devDependencies?.typescript ||
      pkg.dependencies?.typescript ||
      fs.existsSync(path.join(rootPath, "tsconfig.json"))
    );
    return {
      name:         pkg.name,
      version:      pkg.version,
      scripts:      pkg.scripts || {},
      dependencies:    pkg.dependencies    || {},
      devDependencies: pkg.devDependencies || {},
      hasTypeScript,
      testScript:   pkg.scripts?.test || pkg.scripts?.["test:e2e"] || pkg.scripts?.["test:playwright"] || null,
    };
  } catch { return null; }
}

// ── Extract test names from file content ─────────────────────────────────────
function extractTestNames(content) {
  const patterns = [
    /(?:it|test|describe)\s*\(\s*['"`]([^'"`]{3,80})['"`]/g,          // JS/TS
    /def\s+test_([a-zA-Z_][a-zA-Z0-9_]{2,60})/g,                       // Python
    /scenario\s+['"]([^'"]{3,80})['"]/g,                                // Ruby
  ];
  const names = [];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(content)) !== null && names.length < 20) {
      names.push(m[1]);
    }
  }
  return names;
}

// ── Extract imports ───────────────────────────────────────────────────────────
function extractImports(content) {
  const imports = [];
  const patterns = [
    /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /from\s+([a-zA-Z_][a-zA-Z0-9_.]+)\s+import/g,
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(content)) !== null && imports.length < 15) {
      imports.push(m[1]);
    }
  }
  return [...new Set(imports)];
}

// ── Extract selectors used in tests ──────────────────────────────────────────
function extractSelectors(content) {
  const selectors = [];
  const patterns = [
    /getByRole\s*\(\s*['"]([^'"]+)['"]/g,
    /getByTestId\s*\(\s*['"]([^'"]+)['"]/g,
    /locator\s*\(\s*['"]([^'"]+)['"]/g,
    /data-testid=["']([^"']+)["']/g,
    /cy\.get\s*\(\s*['"]([^'"]+)['"]/g,
    /getElementById\s*\(\s*['"]([^'"]+)['"]/g,
  ];
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(content)) !== null && selectors.length < 20) {
      selectors.push(m[1]);
    }
  }
  return [...new Set(selectors)];
}

// ── Extract patterns across all test files ────────────────────────────────────
function extractPatterns(testFiles, framework) {
  const allContent  = testFiles.map(f => f.content).join("\n");
  const allImports  = testFiles.flatMap(f => f.imports);
  const allSelectors = testFiles.flatMap(f => f.selectors);

  return {
    selectorStyle:     detectSelectorStyle(allSelectors, allContent),
    assertionStyle:    detectAssertionStyle(allContent, framework),
    fileNaming:        detectFileNaming(testFiles),
    usesPageObjects:   /new \w+Page\(|PageObject|page_objects/.test(allContent),
    usesFixtures:      /fixtures?[/\\]|fixture\s*\(/.test(allContent),
    usesHelpers:       allImports.some(i => /helper|util|support/.test(i)),
    hasBeforeEach:     /beforeEach|before_each|setUp/.test(allContent),
    hasAfterEach:      /afterEach|after_each|tearDown/.test(allContent),
    commonImports:     mostCommon(allImports, 10),
    commonSelectors:   mostCommon(allSelectors, 10),
    describeBlocks:    (allContent.match(/describe\s*\(/g) || []).length,
    totalTests:        testFiles.reduce((s, f) => s + f.tests.length, 0),
  };
}

function detectSelectorStyle(selectors, content) {
  if (/getByRole|getByLabel|getByText/.test(content))  return "playwright-aria";
  if (/getByTestId|\[data-testid\]/.test(content))      return "test-id";
  if (/cy\.get\s*\(\s*['"][.#]/.test(content))          return "css";
  if (/\.querySelector|\.getElementById/.test(content)) return "dom";
  return "mixed";
}

function detectAssertionStyle(content, framework) {
  if (/expect\(.*\)\.toBeVisible|\.toHaveText|\.toHaveURL/.test(content)) return "playwright-expect";
  if (/expect\(.*\)\.toBe|\.toEqual|\.toContain/.test(content))           return "jest-expect";
  if (/should\(|\.should\./.test(content))                                 return "chai";
  if (/assert\./.test(content))                                            return "assert";
  return "expect";
}

function detectFileNaming(testFiles) {
  const names = testFiles.map(f => f.name);
  if (names.some(n => /\.spec\.ts$/.test(n)))   return "*.spec.ts";
  if (names.some(n => /\.spec\.js$/.test(n)))   return "*.spec.js";
  if (names.some(n => /\.test\.ts$/.test(n)))   return "*.test.ts";
  if (names.some(n => /\.test\.js$/.test(n)))   return "*.test.js";
  if (names.some(n => /test_.*\.py$/.test(n)))  return "test_*.py";
  return "*.spec.ts";
}

function mostCommon(arr, n) {
  const counts = {};
  arr.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, n).map(([k]) => k);
}

// ── Walk directory recursively ─────────────────────────────────────────────────
function walkDir(dir, maxDepth, depth = 0) {
  if (depth > maxDepth) return [];
  const IGNORE = ["node_modules", ".git", "dist", "build", "coverage", ".nyc_output", "__pycache__", ".pytest_cache", "vendor"];
  let files = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files = files.concat(walkDir(full, maxDepth, depth + 1));
      else files.push(full);
    }
  } catch {}
  return files;
}

function isTestFile(filePath) {
  return TEST_EXTENSIONS.some(ext => filePath.endsWith(ext)) ||
    /[/\\]tests?[/\\].*\.(ts|js|py|rb)$/.test(filePath) ||
    /[/\\]e2e[/\\].*\.(ts|js)$/.test(filePath) ||
    /[/\\]specs?[/\\].*\.(ts|js)$/.test(filePath) ||
    /[/\\]cypress[/\\].*\.(ts|js)$/.test(filePath);
}

function buildSummary(result) {
  const { framework, language, testFiles, pageObjects, helpers, patterns } = result;
  const parts = [
    `${framework} (${language})`,
    `${testFiles.length} test files`,
    `${patterns.totalTests} test cases`,
    pageObjects.length ? `${pageObjects.length} page objects` : null,
    helpers.length     ? `${helpers.length} helpers` : null,
    patterns.usesPageObjects ? "page object pattern" : null,
    `selectors: ${patterns.selectorStyle}`,
    `assertions: ${patterns.assertionStyle}`,
  ].filter(Boolean);
  return parts.join(" · ");
}
