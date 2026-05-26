import crypto from "crypto";
import { readRepoTestSuite, listAccessibleRepos, createFileInRepo, createBranch, openPullRequest } from "./repoReader.js";
import { analyseTestSuite, suiteToContext } from "./suiteContextBuilder.js";
import { generateTestFile, modifyTestFile, generateTestsForPR } from "./testWriter.js";
import { testbedStore }  from "./testbedStore.js";
import { gitConfig }     from "../git/gitConfig.js";

export function testbedRoutes(app) {

  // ── List connected repos ──────────────────────────────────────────────────
  app.get("/api/testbed/repos/available", async (req, res) => {
    const token = req.query.token || gitConfig.getToken();
    if (!token) return res.json({ ok: false, error: "No GitHub token. Configure in Git CI or Integrations.", repos: [] });
    try {
      const repos = await listAccessibleRepos(token);
      res.json({ ok: true, repos });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, repos: [] });
    }
  });

  // ── List imported suites ──────────────────────────────────────────────────
  app.get("/api/testbed/suites", (_, res) => {
    res.json({ ok: true, suites: testbedStore.listSuites() });
  });

  // ── Get one suite ─────────────────────────────────────────────────────────
  app.get("/api/testbed/suites/:id", (req, res) => {
    const suite = testbedStore.getSuite(req.params.id);
    if (!suite) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, suite });
  });

  // ── Connect a GitHub repo as a test suite ─────────────────────────────────
  app.post("/api/testbed/suites/connect", async (req, res) => {
    const { repoFullName, branch, name, token } = req.body;
    if (!repoFullName) return res.status(400).json({ error: "repoFullName required" });

    // SSE for live progress
    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection",    "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      send({ type:"log", msg:`Connecting to ${repoFullName}...`, level:"system" });
      send({ type:"log", msg:`Reading file tree from ${branch || "default branch"}...`, level:"info" });

      const suite    = await readRepoTestSuite(repoFullName, { branch, token });
      send({ type:"log", msg:`Found ${suite.testFiles.length} test files`, level:"info" });
      send({ type:"log", msg:`Framework: ${suite.framework} (${suite.testLanguage})`, level:"success" });
      if (suite.pageObjects.length) send({ type:"log", msg:`${suite.pageObjects.length} page objects`, level:"info" });
      if (suite.helpers.length)     send({ type:"log", msg:`${suite.helpers.length} helpers`, level:"info" });

      send({ type:"log", msg:"◈ AI analysing test patterns and conventions...", level:"ai" });
      const analysis = await analyseTestSuite(suite);

      if (analysis.quality)              send({ type:"log", msg:`◈ Quality: ${analysis.quality}`, level:"ai" });
      if (analysis.generationGuidance)   send({ type:"log", msg:`◈ ${analysis.generationGuidance}`, level:"ai" });
      if (analysis.gaps?.length)         analysis.gaps.slice(0,3).forEach(g => send({ type:"log", msg:`⚠ Gap: ${g}`, level:"warn" }));
      if (analysis.conventions?.selectorPreference) send({ type:"log", msg:`◈ Selectors: ${analysis.conventions.selectorPreference}`, level:"ai" });

      const saved = testbedStore.saveSuite({
        id:           `suite-${crypto.randomUUID().slice(0,8)}`,
        name:         name || repoFullName,
        repoFullName,
        branch:       suite.branch,
        repoUrl:      suite.repoUrl,
        framework:    suite.framework,
        language:     suite.testLanguage,
        summary:      suite.summary,
        testFiles:    suite.testFiles,
        configFiles:  suite.configFiles,
        packageInfo:  suite.packageInfo,
        pageObjects:  suite.pageObjects,
        helpers:      suite.helpers,
        patterns:     suite.patterns,
        analysis,
      });

      send({ type:"log", msg:`✓ ${repoFullName} connected and ready as context source`, level:"success" });
      send({ type:"done", suite: saved });

    } catch (err) {
      send({ type:"log", msg:`✗ ${err.message}`, level:"error" });
      send({ type:"error", error: err.message });
    }
    res.end();
  });

  // ── Resync a suite from GitHub ────────────────────────────────────────────
  app.post("/api/testbed/suites/:id/sync", async (req, res) => {
    const existing = testbedStore.getSuite(req.params.id);
    if (!existing)    return res.status(404).json({ error: "Not found" });
    if (!existing.repoFullName) return res.status(400).json({ error: "No repo connected to this suite" });

    try {
      const suite    = await readRepoTestSuite(existing.repoFullName, { branch: existing.branch });
      const analysis = await analyseTestSuite(suite);
      const saved    = testbedStore.saveSuite({ ...existing, ...suite, analysis, lastScanned: new Date().toISOString() });
      res.json({ ok: true, suite: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Delete suite ──────────────────────────────────────────────────────────
  app.delete("/api/testbed/suites/:id", (req, res) => {
    testbedStore.deleteSuite(req.params.id);
    res.json({ ok: true });
  });

  // ── Context string for a suite ────────────────────────────────────────────
  app.get("/api/testbed/suites/:id/context", (req, res) => {
    const suite = testbedStore.getSuite(req.params.id);
    if (!suite) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, context: suiteToContext(suite) });
  });

  // ── Generate a new test file ──────────────────────────────────────────────
  app.post("/api/testbed/generate", async (req, res) => {
    const { useCase, suiteId, url, diff } = req.body;
    if (!useCase) return res.status(400).json({ error: "useCase required" });

    const suite    = suiteId ? testbedStore.getSuite(suiteId) : getDefaultSuite();
    const analysis = suite?.analysis || null;

    try {
      const result = await generateTestFile({ useCase, suite, analysis, url, diff });
      const saved  = testbedStore.saveGeneratedTest({ ...result, suiteId, url, generatedFor: useCase.id });
      res.json({ ok: true, test: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Generate tests for a PR + optionally push back ───────────────────────
  app.post("/api/testbed/generate-for-pr", async (req, res) => {
    const { suiteId, prNumber, repoFullName, changedFiles, diffAnalysis, pushBack = false } = req.body;

    const suite    = suiteId ? testbedStore.getSuite(suiteId) : getDefaultSuite();
    const analysis = suite?.analysis || null;
    const prEvent  = { prNumber, repoFullName };

    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection",    "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      send({ type:"log", msg:`Generating tests for PR #${prNumber}...`, level:"system" });
      const results = await generateTestsForPR({ prEvent, changedFiles, diffAnalysis, suite, analysis });

      send({ type:"log", msg:`Generated ${results.newFiles.length} new test file(s)`, level:"success" });
      send({ type:"log", msg:`Modified ${results.modifiedFiles.length} existing test file(s)`, level:"success" });

      // Save generated tests
      for (const f of results.newFiles) {
        testbedStore.saveGeneratedTest({ ...f, prNumber, repoFullName });
      }

      // Push back to GitHub if requested
      if (pushBack && suite?.repoFullName) {
        send({ type:"log", msg:"◈ Pushing tests back to GitHub...", level:"ai" });
        const branchName = `atp/tests-for-pr-${prNumber}`;
        try {
          await createBranch({ fullName: suite.repoFullName, newBranch: branchName, fromBranch: suite.branch || "main" });
          send({ type:"log", msg:`Created branch: ${branchName}`, level:"info" });

          for (const f of results.newFiles) {
            const dir = getTestDir(suite);
            await createFileInRepo({
              fullName: suite.repoFullName,
              branch:   branchName,
              filePath: `${dir}/${f.fileName}`,
              content:  f.content,
              message:  `[ATP] Add tests for PR #${prNumber}: ${f.useCase?.title || f.fileName}`,
            });
            send({ type:"log", msg:`Pushed: ${dir}/${f.fileName}`, level:"success" });
          }

          for (const f of results.modifiedFiles) {
            await createFileInRepo({
              fullName: suite.repoFullName,
              branch:   branchName,
              filePath: f.path,
              content:  f.modifiedContent,
              message:  `[ATP] Update ${f.path} for PR #${prNumber}`,
            });
            send({ type:"log", msg:`Updated: ${f.path}`, level:"success" });
          }

          // Open PR
          const pr = await openPullRequest({
            fullName: suite.repoFullName,
            title:    `[ATP] Tests for PR #${prNumber}`,
            body:     buildPRBody(prNumber, results, diffAnalysis),
            head:     branchName,
            base:     suite.branch || "main",
          });
          send({ type:"log", msg:`✓ ATP PR opened: ${pr.html_url}`, level:"success" });
          send({ type:"pr_created", url: pr.html_url, number: pr.number });
        } catch (err) {
          send({ type:"log", msg:`⚠ Push failed: ${err.message}`, level:"error" });
        }
      }

      send({ type:"done", results: { newFiles: results.newFiles.length, modifiedFiles: results.modifiedFiles.length } });
    } catch (err) {
      send({ type:"log", msg:`✗ ${err.message}`, level:"error" });
    }
    res.end();
  });

  // ── Modify an existing test file ──────────────────────────────────────────
  app.post("/api/testbed/modify", async (req, res) => {
    const { suiteId, testFilePath, diff, reason } = req.body;
    if (!suiteId || !testFilePath || !diff) return res.status(400).json({ error: "suiteId, testFilePath, diff required" });

    const suite    = testbedStore.getSuite(suiteId);
    if (!suite)    return res.status(404).json({ error: "Suite not found" });
    const testFile = suite.testFiles?.find(f => f.path === testFilePath);
    if (!testFile) return res.status(404).json({ error: "Test file not found" });

    try {
      const result = await modifyTestFile({ testFile, diff, reason, suite, analysis: suite.analysis });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── List generated tests ──────────────────────────────────────────────────
  app.get("/api/testbed/generated", (_, res) => {
    res.json({ ok: true, tests: testbedStore.listGeneratedTests() });
  });

  // ── Download one generated test ───────────────────────────────────────────
  app.get("/api/testbed/generated/:id/download", (req, res) => {
    const test = testbedStore.listGeneratedTests().find(t => t.id === req.params.id);
    if (!test) return res.status(404).json({ error: "Not found" });
    res.setHeader("Content-Disposition", `attachment; filename="${test.fileName}"`);
    res.setHeader("Content-Type", "text/plain");
    res.send(test.content);
  });

  // ── Download all as manifest ──────────────────────────────────────────────
  app.get("/api/testbed/generated/download-all", (_, res) => {
    const tests = testbedStore.listGeneratedTests();
    if (!tests.length) return res.status(404).json({ error: "No generated tests" });
    res.json({ ok: true, tests: tests.map(t => ({ fileName: t.fileName, content: t.content, framework: t.framework })) });
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  app.delete("/api/testbed/generated/:id", (req, res) => {
    testbedStore.deleteGeneratedTest(req.params.id);
    res.json({ ok: true });
  });

  app.delete("/api/testbed/generated", (_, res) => {
    testbedStore.clearGeneratedTests();
    res.json({ ok: true });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getDefaultSuite() {
  const suites = testbedStore.listSuites();
  if (!suites.length) return null;
  return testbedStore.getSuite(
    suites.sort((a,b) => new Date(b.lastScanned) - new Date(a.lastScanned))[0].id
  );
}

function getTestDir(suite) {
  const dirs = suite.testFiles?.map(f => f.path.split("/").slice(0,-1).join("/")).filter(Boolean);
  if (!dirs?.length) return "tests";
  const counts = {};
  dirs.forEach(d => { counts[d] = (counts[d]||0)+1; });
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}

function buildPRBody(prNumber, results, diffAnalysis) {
  return `## 🧪 ATP — Automated Test Generation

Generated by **Autonomous Test Platform** in response to PR #${prNumber}.

### Summary
- **${results.newFiles.length}** new test file(s) added
- **${results.modifiedFiles.length}** existing test file(s) updated
- Risk level: **${diffAnalysis?.riskLevel || "unknown"}**

### Changes
${results.newFiles.map(f => `- ✅ Added: \`${f.fileName}\` — ${f.useCase?.title}`).join("\n")}
${results.modifiedFiles.map(f => `- 🔄 Updated: \`${f.path}\` — ${f.reason}`).join("\n")}

${diffAnalysis?.summary ? `\n### AI Analysis\n${diffAnalysis.summary}` : ""}

---
*Generated by [ATP](https://github.com/gracetshihatasics/atp) · Tests match your existing codebase conventions*`;
}

export function getActiveSuiteContext() {
  const suite = getDefaultSuite();
  return suite ? suiteToContext(suite) : "";
}

// ── Export project from plan ────────────────────────────────────────────────
import { generateProjectFromPlan, pushProjectToGitHub } from "./projectExporter.js";

export function testbedExportRoutes(app) {

  // Generate full test project from a discovery plan — SSE stream
  app.post("/api/testbed/export", async (req, res) => {
    const { plan, url, suiteId } = req.body;
    if (!plan || !url) return res.status(400).json({ error: "plan and url required" });

    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection",    "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const project = await generateProjectFromPlan({
        plan, url, suiteId,
        onProgress: send,
      });

      // Store in testbed store
      testbedStore.saveGeneratedProject(project);
      send({ type:"done", project });
    } catch (err) {
      send({ type:"log", msg:`✗ ${err.message}`, level:"error" });
      send({ type:"error", error: err.message });
    }
    res.end();
  });

  // Get stored generated projects
  app.get("/api/testbed/projects", (_, res) => {
    res.json({ ok: true, projects: testbedStore.listProjects() });
  });

  // Download project as JSON manifest (frontend zips it)
  app.get("/api/testbed/projects/:id/download", (req, res) => {
    const project = testbedStore.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, project });
  });

  // Push project to GitHub
  app.post("/api/testbed/projects/:id/push", async (req, res) => {
    const { targetRepo, targetBranch, baseBranch = "main", createPR = true } = req.body;
    if (!targetRepo) return res.status(400).json({ error: "targetRepo required" });

    const project = testbedStore.getProject(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection",    "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const branch = targetBranch || `atp/tests-${project.name}-${Date.now()}`;
      const result = await pushProjectToGitHub({
        project, targetRepo, targetBranch: branch, baseBranch, createPR,
        onProgress: send,
      });
      send({ type:"done", ...result });
    } catch (err) {
      send({ type:"log", msg:`✗ ${err.message}`, level:"error" });
    }
    res.end();
  });

  // Delete project
  app.delete("/api/testbed/projects/:id", (req, res) => {
    testbedStore.deleteProject(req.params.id);
    res.json({ ok: true });
  });
}
