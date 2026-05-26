import path   from "path";
import crypto from "crypto";
import { anthropic as client } from "../ai/client.js";
import { config }              from "../config/index.js";
import { testbedStore }        from "./testbedStore.js";
import { buildSuitePromptContext } from "./suiteContextBuilder.js";
import { createBranch, createFileInRepo, openPullRequest } from "./repoReader.js";

/**
 * Project Exporter
 *
 * Takes a full discovery plan and generates a complete runnable
 * test automation project — one file per use case + config + helpers.
 *
 * Output matches the style of connected test repos (if any).
 * Can be downloaded as a zip manifest or pushed to GitHub.
 */

// ── Generate full project from a plan ─────────────────────────────────────────
export async function generateProjectFromPlan({ plan, url, suiteId, onProgress }) {
  const log  = (msg, level = "info") => onProgress?.({ type:"log", msg, level });
  const suite    = suiteId ? testbedStore.getSuite(suiteId) : getDefaultSuite();
  const analysis = suite?.analysis || null;
  const suiteCtx = buildSuitePromptContext(suite, analysis);

  const framework = suite?.framework || "playwright";
  const language  = suite?.language  || "typescript";
  const naming    = analysis?.conventions?.fileNaming || (language === "typescript" ? "*.spec.ts" : "*.spec.js");

  log(`Generating ${framework}/${language} test project for ${url}`, "system");
  log(`${plan.useCases?.length || 0} use cases → test files`, "info");

  const project = {
    id:         `proj-${crypto.randomUUID().slice(0,8)}`,
    name:       plan.appName || new URL(url).hostname.replace("www.", ""),
    url,
    framework,
    language,
    createdAt:  new Date().toISOString(),
    files:      [],
  };

  // 1. Config file
  log("Generating config file...", "info");
  const configFile = await generateConfigFile({ framework, language, url, suiteCtx });
  project.files.push(configFile);
  log(`✓ ${configFile.path}`, "success");

  // 2. Helpers / fixtures
  log("Generating shared helpers...", "info");
  const helpers = await generateHelpers({ framework, language, url, plan, suiteCtx, suite });
  project.files.push(...helpers);
  helpers.forEach(h => log(`✓ ${h.path}`, "success"));

  // 3. One test file per use case (or grouped by category)
  const grouped = groupByCategory(plan.useCases || []);
  for (const [category, useCases] of Object.entries(grouped)) {
    log(`◈ Generating ${category} tests (${useCases.length} cases)...`, "ai");
    const testFile = await generateCategoryTestFile({ category, useCases, framework, language, url, suiteCtx, suite, naming });
    project.files.push(testFile);
    log(`✓ ${testFile.path}`, "success");
    onProgress?.({ type:"file_done", path: testFile.path });
  }

  // 4. package.json / requirements.txt
  const pkgFile = generatePackageFile({ framework, language, name: project.name });
  project.files.push(pkgFile);
  log(`✓ ${pkgFile.path}`, "success");

  // 5. README
  const readme = generateReadme({ project, plan, url });
  project.files.push(readme);
  log(`✓ README.md`, "success");

  // 6. .gitignore
  project.files.push({ path: ".gitignore", content: "node_modules/\ndist/\n.env\ntest-results/\nplaywright-report/\n" });

  log(`Project ready — ${project.files.length} files`, "success");
  return project;
}

// ── Generate config file ──────────────────────────────────────────────────────
async function generateConfigFile({ framework, language, url, suiteCtx }) {
  if (framework === "playwright") {
    const ext  = language === "typescript" ? "ts" : "js";
    const content = language === "typescript" ? `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  use: {
    baseURL: '${url}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
` : `const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  use: {
    baseURL: '${url}',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
`;
    return { path: `playwright.config.${ext}`, content };
  }

  if (framework === "cypress") {
    return {
      path: "cypress.config.ts",
      content: `import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: '${url}',
    specPattern: 'cypress/e2e/**/*.cy.{ts,js}',
    supportFile: 'cypress/support/e2e.ts',
  },
});
`,
    };
  }

  if (framework === "jest" || framework === "vitest") {
    return { path: "jest.config.ts", content: `export default { testEnvironment: 'node', testMatch: ['**/*.test.ts'] };\n` };
  }

  if (framework === "pytest") {
    return { path: "pytest.ini", content: `[pytest]\ntestpaths = tests\npython_files = test_*.py\npython_classes = Test\npython_functions = test_\n` };
  }

  return { path: "test.config.js", content: `// Test configuration for ${url}\n` };
}

// ── Generate helpers ──────────────────────────────────────────────────────────
async function generateHelpers({ framework, language, url, plan, suiteCtx, suite }) {
  const helpers = [];
  const ext     = language === "typescript" ? "ts" : language === "python" ? "py" : "js";

  if (framework === "playwright") {
    // Auth helper if any use cases require auth
    const needsAuth = plan.useCases?.some(uc => uc.requiresAuth);
    if (needsAuth) {
      helpers.push({
        path: `tests/helpers/auth.${ext}`,
        content: language === "typescript"
          ? `import { Page } from '@playwright/test';

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/dashboard|home|account/);
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /logout|sign out/i }).click();
}
`
          : `export async function login(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
}
`,
      });
    }

    // Test data helper
    helpers.push({
      path: `tests/helpers/testData.${ext}`,
      content: language === "typescript"
        ? `export const testData = {
  user: {
    email: 'test@example.com',
    password: 'Test1234!',
    name: 'Test User',
  },
  // Add more test data as needed
};

export function randomEmail(): string {
  return \`test+\${Date.now()}@mailinator.com\`;
}

export function randomString(length = 8): string {
  return Math.random().toString(36).substring(2, length + 2);
}
`
        : `export const testData = {
  user: { email: 'test@example.com', password: 'Test1234!', name: 'Test User' },
};
export const randomEmail = () => \`test+\${Date.now()}@mailinator.com\`;
`,
    });
  }

  if (framework === "pytest") {
    helpers.push({
      path: "tests/conftest.py",
      content: `import pytest
from playwright.sync_api import Playwright, Browser, Page

@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {**browser_context_args, "base_url": "${url}"}

@pytest.fixture
def page(browser):
    page = browser.new_page()
    yield page
    page.close()
`,
    });
  }

  return helpers;
}

// ── Generate test file per category ──────────────────────────────────────────
async function generateCategoryTestFile({ category, useCases, framework, language, url, suiteCtx, suite, naming }) {
  const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const ext  = naming.replace("*", "").replace(/^\./, "");
  const dir  = framework === "cypress" ? "cypress/e2e" : "tests";
  const filePath = `${dir}/${slug}.${ext}`;

  // Build a prompt per category with all use cases
  const ucList = useCases.map((uc, i) => `
Use case ${i+1}: ${uc.title}
Priority: ${uc.priority}
Steps:
${uc.steps?.map((s,j) => `  ${j+1}. ${s}`).join("\n") || "  (explore feature)"}
Assertions:
${uc.assertions?.map(a => `  - ${a}`).join("\n") || "  - feature works correctly"}
RequiresAuth: ${uc.requiresAuth || false}`).join("\n---");

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 4000,
    messages: [{
      role:    "user",
      content: `Write a complete ${framework} test file in ${language} for these ${useCases.length} use cases.

App URL: ${url}
Category: ${category}

${suiteCtx ? `Existing codebase style:\n${suiteCtx}\n` : ""}

Use cases:
${ucList}

Requirements:
- Framework: ${framework}
- Language: ${language}
- File will be saved as: ${filePath}
- Use ${framework === "playwright" ? "getByRole, getByLabel, getByTestId selectors where possible" : "appropriate selectors"}
- Include proper imports at top
- One describe block for the category
- One test/it block per use case
- Use beforeEach for navigation if multiple tests start on same page
- Add comments explaining each test
- Make it immediately runnable with no modifications needed

Return ONLY the raw file content. No markdown. No explanation.`,
    }],
  });

  return { path: filePath, content: response.content[0]?.text || "" };
}

// ── package.json / requirements.txt ──────────────────────────────────────────
function generatePackageFile({ framework, language, name }) {
  if (framework === "playwright") {
    return {
      path: "package.json",
      content: JSON.stringify({
        name:    `${name}-tests`,
        version: "1.0.0",
        scripts: {
          test:      "playwright test",
          "test:ui": "playwright test --ui",
          "test:headed": "playwright test --headed",
          report:    "playwright show-report",
        },
        devDependencies: {
          "@playwright/test": "^1.44.0",
          ...(language === "typescript" ? { typescript: "^5.0.0" } : {}),
        },
      }, null, 2),
    };
  }
  if (framework === "cypress") {
    return {
      path: "package.json",
      content: JSON.stringify({
        name: `${name}-tests`, version: "1.0.0",
        scripts: { test: "cypress run", "test:open": "cypress open" },
        devDependencies: { cypress: "^13.0.0" },
      }, null, 2),
    };
  }
  if (framework === "pytest") {
    return { path: "requirements.txt", content: "pytest\npytest-playwright\nplaywright\n" };
  }
  return {
    path: "package.json",
    content: JSON.stringify({ name:`${name}-tests`, version:"1.0.0", scripts:{ test:"jest" }, devDependencies:{ jest:"^29.0.0" } }, null, 2),
  };
}

// ── README ────────────────────────────────────────────────────────────────────
function generateReadme({ project, plan, url }) {
  const installCmd = project.framework === "pytest"
    ? "pip install -r requirements.txt\nplaywright install"
    : "npm install\nnpx playwright install";
  const runCmd = project.framework === "pytest" ? "pytest" : "npm test";

  return {
    path:    "README.md",
    content: `# ${project.name} — Automated Tests

Generated by [ATP (Autonomous Test Platform)](https://github.com/gracetshihatasics/atp)

## Application
**URL:** ${url}
**App type:** ${plan.appType || "web application"}
**Framework:** ${project.framework}
**Language:** ${project.language}

## Setup

\`\`\`bash
${installCmd}
\`\`\`

## Run tests

\`\`\`bash
${runCmd}
\`\`\`

## Test suites

${Object.entries(groupByCategory(plan.useCases || [])).map(([cat, ucs]) =>
  `### ${cat}\n${ucs.map(uc => `- ${uc.title} (${uc.priority})`).join("\n")}`
).join("\n\n")}

## Generated by ATP
${new Date().toLocaleDateString()} · ${plan.useCases?.length || 0} test cases across ${Object.keys(groupByCategory(plan.useCases || [])).length} categories
`,
  };
}

// ── Push project to GitHub ────────────────────────────────────────────────────
export async function pushProjectToGitHub({ project, targetRepo, targetBranch, baseBranch, createPR, onProgress }) {
  const log = (msg, level = "info") => onProgress?.({ type:"log", msg, level });

  log(`Creating branch ${targetBranch} from ${baseBranch}...`, "info");
  await createBranch({ fullName: targetRepo, newBranch: targetBranch, fromBranch: baseBranch });
  log(`✓ Branch created: ${targetBranch}`, "success");

  for (const file of project.files) {
    log(`Pushing ${file.path}...`, "info");
    await createFileInRepo({
      fullName: targetRepo,
      branch:   targetBranch,
      filePath: file.path,
      content:  file.content,
      message:  `[ATP] Add ${file.path}`,
    });
  }

  log(`✓ All ${project.files.length} files pushed`, "success");

  if (createPR) {
    log("Opening pull request...", "info");
    const pr = await openPullRequest({
      fullName: targetRepo,
      title:    `[ATP] Add test automation project for ${project.name}`,
      body:     `## 🧪 ATP — Generated Test Project\n\nThis PR adds a complete **${project.framework}** test automation project for \`${project.url}\`.\n\n**${project.files.filter(f=>f.path.includes("tests/")).length}** test files · **${project.files.length}** total files\n\n---\n*Generated by [ATP](https://github.com/gracetshihatasics/atp)*`,
      head:     targetBranch,
      base:     baseBranch,
    });
    log(`✓ PR opened: ${pr.html_url}`, "success");
    return { pr };
  }

  return { pushed: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupByCategory(useCases) {
  const groups = {};
  for (const uc of useCases) {
    const cat = uc.category || "General";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(uc);
  }
  return groups;
}

function getDefaultSuite() {
  const suites = testbedStore.listSuites();
  if (!suites.length) return null;
  return testbedStore.getSuite(
    suites.sort((a,b) => new Date(b.lastScanned||0) - new Date(a.lastScanned||0))[0].id
  );
}
