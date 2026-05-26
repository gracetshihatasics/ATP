import { anthropic as client } from "../ai/client.js";
import { config }              from "../config/index.js";

/**
 * Converts a read test suite into AI context ATP can use when:
 * - Generating new tests (match style/patterns)
 * - Modifying existing tests (understand what exists)
 * - Writing PRs (understand the codebase conventions)
 */
export function suiteToContext(suite) {
  if (!suite) return "";

  const lines = [
    `=== Existing Test Suite Context ===`,
    `Framework: ${suite.framework} | Language: ${suite.language}`,
    `Structure: ${suite.summary}`,
    "",
  ];

  // Package info
  if (suite.packageInfo) {
    const deps = { ...suite.packageInfo.dependencies, ...suite.packageInfo.devDependencies };
    const testDeps = Object.keys(deps).filter(d => /playwright|cypress|jest|vitest|mocha|chai|testing/.test(d));
    if (testDeps.length) lines.push(`Testing packages: ${testDeps.join(", ")}`);
    if (suite.packageInfo.testScript) lines.push(`Test command: ${suite.packageInfo.testScript}`);
    lines.push("");
  }

  // Patterns
  const p = suite.patterns;
  if (p) {
    lines.push("Coding patterns:");
    lines.push(`  Selector style: ${p.selectorStyle}`);
    lines.push(`  Assertion style: ${p.assertionStyle}`);
    lines.push(`  File naming: ${p.fileNaming}`);
    if (p.usesPageObjects) lines.push(`  Uses page object pattern`);
    if (p.usesFixtures)    lines.push(`  Uses fixtures`);
    if (p.usesHelpers)     lines.push(`  Uses helper utilities`);
    if (p.hasBeforeEach)   lines.push(`  Uses beforeEach/setUp hooks`);
    if (p.commonImports?.length) lines.push(`  Common imports: ${p.commonImports.slice(0,5).join(", ")}`);
    lines.push("");
  }

  // Page objects
  if (suite.pageObjects?.length) {
    lines.push(`Page objects (${suite.pageObjects.length}):`);
    suite.pageObjects.slice(0, 5).forEach(po => {
      lines.push(`  ${po.name} (${po.path})`);
      // Extract public methods
      const methods = [...po.content.matchAll(/(?:async\s+)?(?:public\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/g)]
        .map(m => m[1]).filter(m => !["constructor","if","for","while","switch"].includes(m));
      if (methods.length) lines.push(`    methods: ${methods.slice(0,6).join(", ")}`);
    });
    lines.push("");
  }

  // Helpers
  if (suite.helpers?.length) {
    lines.push(`Helpers/utilities (${suite.helpers.length}):`);
    suite.helpers.slice(0, 5).forEach(h => lines.push(`  ${h.name} (${h.path})`));
    lines.push("");
  }

  // Test file overview
  if (suite.testFiles?.length) {
    lines.push(`Test files (${suite.testFiles.length} total, showing first 10):`);
    suite.testFiles.slice(0, 10).forEach(f => {
      lines.push(`  ${f.path} — ${f.tests.length} tests`);
      if (f.tests.length) lines.push(`    e.g. "${f.tests[0]}"`);
    });
    lines.push("");
  }

  // Config
  if (suite.configFiles?.length) {
    lines.push(`Config files: ${suite.configFiles.map(c => c.name).join(", ")}`);
    const mainConfig = suite.configFiles[0];
    if (mainConfig) lines.push(`${mainConfig.name} excerpt:\n${mainConfig.content.slice(0, 300)}`);
    lines.push("");
  }

  lines.push("=== End Test Suite Context ===");
  return lines.join("\n");
}

/**
 * AI-powered analysis of the test suite.
 * Returns deep understanding: coverage gaps, test quality, patterns to follow.
 */
export async function analyseTestSuite(suite) {
  const context = suiteToContext(suite);

  // Show a sample of actual test code for AI to analyse
  const sampleCode = suite.testFiles.slice(0, 3).map(f =>
    `// ${f.path}\n${f.content.slice(0, 800)}`
  ).join("\n\n---\n\n");

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 2000,
    messages: [{
      role:    "user",
      content: `Analyse this existing test suite and provide deep insights for ATP to use when generating new tests.

${context}

Sample test code:
${sampleCode}

Provide a detailed analysis. Raw JSON only:
{
  "framework": "string",
  "language": "string",
  "quality": "excellent|good|fair|poor",
  "coverage": {
    "hasAuth":        false,
    "hasAPITests":    false,
    "hasE2E":         false,
    "hasUnitTests":   false,
    "hasAccessibility": false,
    "estimatedCoverage": "low|medium|high"
  },
  "conventions": {
    "selectorPreference": "string — e.g. data-testid, aria roles, CSS",
    "assertionLibrary":   "string",
    "testStructure":      "string — e.g. describe/it, test blocks",
    "namingConvention":   "string — e.g. should verb, given-when-then",
    "pageObjectPattern":  false,
    "exampleTestName":    "string — example of their naming style"
  },
  "imports": {
    "commonHelpers": ["string"],
    "pageObjects":   ["string"],
    "fixtures":      ["string"]
  },
  "codeStyle": {
    "usesAsync":        true,
    "usesTypeScript":   true,
    "indentation":      "2 spaces|4 spaces|tabs",
    "quotStyle":        "single|double"
  },
  "gaps": ["string — areas not tested that should be"],
  "strengths": ["string — what they do well"],
  "recommendations": ["string — how to improve"],
  "generationGuidance": "string — specific instructions for ATP when writing new tests to match this codebase"
}`,
    }],
  });

  const raw = response.content[0]?.text ?? "";
  const s   = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) {
    try { return JSON.parse(raw.slice(s, e + 1)); } catch {}
  }
  return { framework: suite.framework, language: suite.language, quality: "unknown" };
}

/**
 * Build a compact context string suitable for injecting into generation prompts.
 * Used by actionGenerator, deepDiscovery, diffAnalyser etc.
 */
export function buildSuitePromptContext(suite, analysis) {
  if (!suite) return "";

  const lines = [`Existing test suite: ${suite.summary}`];

  if (analysis?.conventions) {
    const c = analysis.conventions;
    lines.push(`Write tests to match their style:`);
    lines.push(`  - Selectors: ${c.selectorPreference}`);
    lines.push(`  - Assertions: ${c.assertionLibrary}`);
    lines.push(`  - Structure: ${c.testStructure}`);
    lines.push(`  - Naming: ${c.namingConvention}`);
    if (c.exampleTestName) lines.push(`  - Example name: "${c.exampleTestName}"`);
  }

  if (analysis?.imports?.pageObjects?.length) {
    lines.push(`Available page objects: ${analysis.imports.pageObjects.join(", ")}`);
  }

  if (analysis?.imports?.commonHelpers?.length) {
    lines.push(`Available helpers: ${analysis.imports.commonHelpers.join(", ")}`);
  }

  if (analysis?.generationGuidance) {
    lines.push(`Generation guidance: ${analysis.generationGuidance}`);
  }

  if (analysis?.gaps?.length) {
    lines.push(`Coverage gaps to fill: ${analysis.gaps.slice(0,3).join("; ")}`);
  }

  return lines.join("\n");
}
