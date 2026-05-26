import { anthropic as client } from "../ai/client.js";
import { config }              from "../config/index.js";
import { buildSuitePromptContext } from "./suiteContextBuilder.js";

/**
 * Generates new test code that matches the existing codebase conventions.
 * Used when:
 * - A new PR needs tests written
 * - ATP discovers new features that have no coverage
 * - An existing test needs to be updated
 */

// ── Generate a new test file for a use case ───────────────────────────────────
export async function generateTestFile({ useCase, suite, analysis, url, diff }) {
  const suiteContext = buildSuitePromptContext(suite, analysis);

  // Find the most relevant existing test as a style reference
  const styleRef = suite?.testFiles?.find(f =>
    f.tests.some(t => t.toLowerCase().includes(useCase.category?.toLowerCase() || "")) ||
    f.path.toLowerCase().includes(useCase.category?.toLowerCase() || "")
  ) || suite?.testFiles?.[0];

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 4000,
    messages: [{
      role:    "user",
      content: `You are an expert test engineer. Write a complete, runnable test file for the following use case.

Use case: ${useCase.title}
Category: ${useCase.category}
Priority: ${useCase.priority}
URL: ${url}
Steps:
${useCase.steps?.map((s, i) => `${i + 1}. ${s}`).join("\n") || ""}
Assertions:
${useCase.assertions?.map((a, i) => `${i + 1}. ${a}`).join("\n") || ""}

${suiteContext ? `\nExisting test suite context:\n${suiteContext}` : ""}

${styleRef ? `\nStyle reference (match this exactly):\n\`\`\`\n${styleRef.content.slice(0, 1200)}\n\`\`\`` : ""}

${diff ? `\nCode changes this test covers:\n${diff.slice(0, 1000)}` : ""}

Write a COMPLETE, RUNNABLE test file:
- Match the framework: ${suite?.framework || "playwright"}
- Match the language: ${suite?.language || "typescript"}
- Match their naming conventions exactly
- Use their page objects and helpers if available
- Follow their selector style (${analysis?.conventions?.selectorPreference || "data-testid"})
- Follow their assertion style (${analysis?.conventions?.assertionLibrary || "playwright-expect"})
- Include proper imports
- Include describe block with meaningful name
- Include beforeEach/afterEach if they use them
- Include at least ${useCase.priority === "Critical" ? 5 : 3} test cases covering the happy path and edge cases

Return ONLY the raw file content. No explanation. No markdown fences.`,
    }],
  });

  const content   = response.content[0]?.text ?? "";
  const framework = suite?.framework || "playwright";
  const language  = suite?.language  || "typescript";
  const fileName  = generateFileName(useCase, framework, language);

  return { fileName, content, framework, language, useCase };
}

// ── Modify an existing test file based on a diff ──────────────────────────────
export async function modifyTestFile({ testFile, diff, reason, suite, analysis }) {
  const suiteContext = buildSuitePromptContext(suite, analysis);

  const response = await client.messages.create({
    model:      config.model,
    max_tokens: 4000,
    messages: [{
      role:    "user",
      content: `You are an expert test engineer. Modify this existing test file based on the code changes.

EXISTING TEST FILE (${testFile.path}):
\`\`\`
${testFile.content}
\`\`\`

CODE CHANGES (diff):
${diff.slice(0, 2000)}

REASON FOR MODIFICATION:
${reason}

${suiteContext ? `\nCodebase context:\n${suiteContext}` : ""}

Instructions:
- Keep all existing tests that are still valid
- Update tests that are broken by the code changes
- Add new tests for any new functionality in the diff
- Remove or comment out tests for removed functionality
- Preserve all existing imports, helpers, and patterns
- Add a comment // ATP: modified - <reason> next to each changed test

Return ONLY the complete modified file content. No explanation. No markdown fences.`,
    }],
  });

  const modifiedContent = response.content[0]?.text ?? "";

  return {
    path:            testFile.path,
    originalContent: testFile.content,
    modifiedContent,
    reason,
  };
}

// ── Generate tests for a whole PR diff ───────────────────────────────────────
export async function generateTestsForPR({ prEvent, changedFiles, diffAnalysis, suite, analysis }) {
  const suiteContext = buildSuitePromptContext(suite, analysis);
  const results = { newFiles: [], modifiedFiles: [], skipped: [] };

  // 1. Generate new test files for new features
  for (const feature of (diffAnalysis.affectedFeatures || []).slice(0, 5)) {
    if (feature.confidence === "low") { results.skipped.push(feature.feature); continue; }

    const useCase = {
      id:       `PR-${prEvent.prNumber}-${feature.feature.replace(/\s+/g, "-").toLowerCase()}`,
      title:    `Test ${feature.feature} — PR #${prEvent.prNumber}`,
      category: "Core Workflow",
      priority: diffAnalysis.riskLevel === "critical" ? "Critical" : "High",
      steps:    [`Navigate to the affected ${feature.feature} area`, `Verify the changed behaviour works correctly`, `Test edge cases introduced by the PR`],
      assertions: [`New functionality works as expected`, `No regression in existing behaviour`],
    };

    const diff = changedFiles.find(f => feature.files?.includes(f.filename))?.patch || "";
    const testFile = await generateTestFile({ useCase, suite, analysis, url: "", diff });
    results.newFiles.push(testFile);
  }

  // 2. Update existing test files that are affected
  for (const testId of (diffAnalysis.affectedTestIds || []).slice(0, 5)) {
    const existing = suite?.testFiles?.find(f => f.path.includes(testId));
    if (!existing) continue;

    const relevantDiff = changedFiles.map(f => f.patch || "").join("\n---\n").slice(0, 2000);
    const modified = await modifyTestFile({
      testFile: existing,
      diff:     relevantDiff,
      reason:   `PR #${prEvent.prNumber}: ${diffAnalysis.summary}`,
      suite,
      analysis,
    });
    results.modifiedFiles.push(modified);
  }

  return results;
}

// ── Generate file name based on use case ─────────────────────────────────────
function generateFileName(useCase, framework, language) {
  const base = useCase.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const ext = language === "python" ? `test_${base}.py`
    : language === "ruby"           ? `${base}_spec.rb`
    : framework === "cypress"       ? `${base}.cy.${language === "typescript" ? "ts" : "js"}`
    : `${base}.spec.${language === "typescript" ? "ts" : "js"}`;

  return ext;
}
