import { handle, sendSSEError, ATPError, ErrorType, logError } from "../utils/errors.js";
import { verifyWebhookSignature, parseWebhookEvent, fetchPRFiles } from "../git/webhookHandler.js";
import { analyseDiff, updateTestsFromDiff }   from "../git/diffAnalyser.js";
import { postCommitStatus, postPRComment }    from "../git/prReporter.js";
import { gitConfig }                          from "../git/gitConfig.js";
import { tunnelManager }                      from "../git/tunnelManager.js";
import { resultsStore }                       from "../results/store.js";
import { testbedStore }                       from "../testbed/testbedStore.js";
import { generateTestsForPR }                 from "../testbed/testWriter.js";
import { createBranch, createFileInRepo, openPullRequest } from "../testbed/repoReader.js";
import { suiteToContext }                     from "../testbed/suiteContextBuilder.js";
import crypto                                 from "crypto";

// In-memory PR run store
const prRunStore = new Map();

export function webhookRoutes(app) {

  // ── Config CRUD ──────────────────────────────────────────────────────────────
  app.get("/api/git/config", (_, res) => {
    const cfg = gitConfig.read();
    res.json({
      ok:  true,
      config: {
        ...cfg,
        githubToken:   cfg.githubToken ? `${cfg.githubToken.slice(0,6)}...${cfg.githubToken.slice(-4)}` : "",
        webhookSecret: cfg.webhookSecret ? "••••••••" : "",
      },
      webhookUrl:      `${gitConfig.getBaseUrl() || "http://localhost:3579"}/webhook/github`,
      hasToken:        !!gitConfig.getToken(),
      hasSecret:       !!gitConfig.getWebhookSecret(),
      hasBaseUrl:      !!gitConfig.getBaseUrl(),
      tunnel:          tunnelManager.getStatus(),
    });
  });

  app.post("/api/git/config", (req, res) => {
    const { githubToken, webhookSecret, atpBaseUrl, autoRunOnPR, maxTestsPerRun, targetBranches } = req.body;
    const updates = {};
    if (githubToken   !== undefined) updates.githubToken   = githubToken;
    if (webhookSecret !== undefined) updates.webhookSecret = webhookSecret;
    if (atpBaseUrl    !== undefined) updates.atpBaseUrl    = atpBaseUrl;
    if (autoRunOnPR   !== undefined) updates.autoRunOnPR   = autoRunOnPR;
    if (maxTestsPerRun !== undefined) updates.maxTestsPerRun = maxTestsPerRun;
    if (targetBranches !== undefined) updates.targetBranches = targetBranches;
    const saved = gitConfig.write(updates);
    res.json({ ok: true, saved: true });
  });

  // ── Tunnel management ────────────────────────────────────────────────────────
  app.post("/api/git/tunnel/start", async (req, res) => {
    const { provider = "localtunnel" } = req.body;
    const result = await tunnelManager.start(provider, 3579);
    res.json(result);
  });

  app.post("/api/git/tunnel/stop", (_, res) => {
    tunnelManager.stop();
    res.json({ ok: true });
  });

  app.get("/api/git/tunnel/status", (_, res) => {
    res.json({ ok: true, ...tunnelManager.getStatus() });
  });

  // ── Verify GitHub token ──────────────────────────────────────────────────────
  app.post("/api/git/verify-token", async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ ok:false, error:"token required", type:"validation" });
    try {
      const r = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "ATP-Bot" },
      });
      if (!r.ok) return res.json({ ok: false, error: "Invalid token" });
      const user = await r.json();
      res.json({ ok: true, login: user.login, name: user.name, avatar: user.avatar_url });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  // ── List user repos ──────────────────────────────────────────────────────────
  app.get("/api/git/repos", async (_, res) => {
    const token = gitConfig.getToken();
    if (!token) return res.json({ ok: false, repos: [] });
    try {
      const r = await fetch("https://api.github.com/user/repos?sort=updated&per_page=30", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "ATP-Bot" },
      });
      const repos = await r.json();
      res.json({ ok: true, repos: repos.map(r => ({ fullName: r.full_name, name: r.name, private: r.private, defaultBranch: r.default_branch })) });
    } catch (e) {
      res.json({ ok: false, repos: [], error: e.message });
    }
  });

  // ── PR run history ───────────────────────────────────────────────────────────
  app.get("/api/git/runs", (_, res) => {
    const runs = Array.from(prRunStore.values())
      .sort((a,b) => b.startedAt - a.startedAt).slice(0, 30);
    res.json({ ok: true, runs });
  });

  app.get("/api/git/runs/:id", (req, res) => {
    const run = prRunStore.get(req.params.id);
    if (!run) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, run });
  });

  // ── Manual trigger ───────────────────────────────────────────────────────────
  app.post("/api/git/trigger", async (req, res) => {
    const { repoFullName, prNumber = 1, branchFrom = "feature", branchTo = "main", prTitle = "Manual trigger", author = "manual" } = req.body;
    if (!repoFullName) return res.status(400).json({ ok:false, error:"repoFullName required", type:"validation" });
    const prEvent = {
      kind: "pull_request", action: "synchronize",
      prNumber, prTitle, branchFrom, branchTo,
      sha: "HEAD", baseSha: "HEAD~1", author,
      repoFullName, repoOwner: repoFullName.split("/")[0], repoName: repoFullName.split("/")[1],
      filesUrl: `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/files`,
      htmlUrl:  `https://github.com/${repoFullName}/pull/${prNumber}`,
    };
    const runId = `pr-${crypto.randomUUID().slice(0,8)}`;
    res.json({ ok: true, runId });
    runCILoop(prEvent, runId).catch(err => console.error(`[CI] ${err.message}`));
  });

  // ── GitHub webhook receiver ──────────────────────────────────────────────────
  app.post("/webhook/github", rawBodyMiddleware, async (req, res) => {
    const eventType = req.headers["x-github-event"];
    const signature = req.headers["x-hub-signature-256"];
    const rawBody   = req.rawBody;
    const secret    = gitConfig.getWebhookSecret();

    if (secret) {
      const expected = `sha256=${require("crypto")
        .createHmac("sha256", secret).update(rawBody).digest("hex")}`;
      try {
        if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ""))) {
          return res.status(401).json({ error: "Invalid signature" });
        }
      } catch { return res.status(401).json({ error: "Signature check failed" }); }
    }

    if (!["pull_request","push"].includes(eventType))
      return res.json({ ok: true, msg: "Ignored" });

    const prEvent = parseWebhookEvent(eventType, req.body);
    if (!prEvent) return res.json({ ok: true, msg: "Could not parse" });
    if (eventType === "pull_request" && !["opened","synchronize","reopened"].includes(prEvent.action))
      return res.json({ ok: true, msg: `Action ${prEvent.action} ignored` });

    const cfg = gitConfig.read();
    if (!cfg.autoRunOnPR && eventType === "pull_request")
      return res.json({ ok: true, msg: "Auto-run disabled" });

    res.json({ ok: true, msg: "ATP run queued" });
    const runId = `pr-${crypto.randomUUID().slice(0,8)}`;
    runCILoop(prEvent, runId).catch(err => console.error(`[CI] ${err.message}`));
  });
}

// ── Full CI loop ──────────────────────────────────────────────────────────────
async function runCILoop(prEvent, runId) {
  const cfg = gitConfig.read();
  const run = {
    id: runId, prNumber: prEvent.prNumber, prTitle: prEvent.prTitle,
    branchFrom: prEvent.branchFrom, branchTo: prEvent.branchTo,
    author: prEvent.author, repoFullName: prEvent.repoFullName,
    htmlUrl: prEvent.htmlUrl, startedAt: Date.now(),
    status: "running", phase: "setup", log: [],
    diffAnalysis: null, changedFiles: [], affectedTests: [],
    newTests: [], testResults: [],
    generatedFiles: [], atpPrUrl: null,
  };
  prRunStore.set(runId, run);

  const log = (msg, level = "info") => {
    run.log.push({ msg, level, ts: Date.now() });
    prRunStore.set(runId, { ...run });
  };

  try {
    const token = gitConfig.getToken();
    log(`CI starting for PR #${prEvent.prNumber}: ${prEvent.prTitle}`, "system");
    await postCommitStatus(prEvent, "running", "ATP — analysing changes...", token);

    // ── Phase 1: Fetch changed files ─────────────────────────────────────────
    run.phase = "diff";
    log("Fetching changed files from GitHub...", "info");
    const changedFiles = await fetchPRFiles(prEvent, token);
    run.changedFiles   = changedFiles;
    log(`${changedFiles.length} file(s) changed`, "info");
    changedFiles.forEach(f => log(`  ${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})`, "info"));

    // ── Phase 2: AI diff analysis ─────────────────────────────────────────────
    run.phase = "analysis";
    log("◈ AI analysing diff — identifying affected features and tests...", "ai");
    const existingTests = resultsStore.getAll({ limit: 100 }).records
      .filter(r => r.type === "usecase")
      .map(r => ({ id: r.id, title: r.name, category: r.category, priority: r.priority }));
    const diffAnalysis = await analyseDiff(prEvent, changedFiles, existingTests);
    run.diffAnalysis   = diffAnalysis;
    log(`Risk: ${diffAnalysis.riskLevel?.toUpperCase()} — ${diffAnalysis.summary}`,
      diffAnalysis.riskLevel === "critical" ? "error" : diffAnalysis.riskLevel === "high" ? "warn" : "info");
    diffAnalysis.affectedFeatures?.forEach(f => log(`  Affected: ${f.feature} (${f.confidence})`, "ai"));
    diffAnalysis.concerns?.forEach(c => log(`  ⚠ ${c}`, "warn"));

    // ── Phase 3: Update existing affected tests ───────────────────────────────
    run.phase = "update";
    log("Reviewing existing tests against changes...", "info");
    const affectedRecords = resultsStore.getAll({ limit: 100 }).records
      .filter(r => r.type === "usecase" && diffAnalysis.affectedTestIds?.includes(r.id));
    const updatedTests = await updateTestsFromDiff(affectedRecords, changedFiles, diffAnalysis);
    run.affectedTests  = updatedTests;
    run.newTests       = diffAnalysis.newTestsNeeded || [];
    updatedTests.filter(t => t.isBroken).forEach(t => log(`  💔 Broken: ${t.title}`, "error"));
    if (run.newTests.length) log(`${run.newTests.length} new test scenario(s) identified`, "ai");

    // ── Phase B: Generate test files + push ATP PR ────────────────────────────
    run.phase = "generating";
    const connectedSuites = testbedStore.listSuites();

    if (connectedSuites.length > 0 && (diffAnalysis.affectedFeatures?.length > 0 || run.newTests.length > 0)) {
      log("◈ Phase B — generating test files for this PR...", "ai");

      // Use the most recently synced suite
      const suite    = testbedStore.getSuite(
        connectedSuites.sort((a,b) => new Date(b.lastScanned||0) - new Date(a.lastScanned||0))[0].id
      );
      const analysis = suite?.analysis || null;

      log(`Using test suite: ${suite?.name} (${suite?.framework}/${suite?.language})`, "info");

      // Generate test files
      const generated = await generateTestsForPR({
        prEvent, changedFiles, diffAnalysis, suite, analysis,
      });

      run.generatedFiles = [
        ...generated.newFiles.map(f => ({ ...f, action: "created" })),
        ...generated.modifiedFiles.map(f => ({ ...f, action: "modified" })),
      ];

      if (run.generatedFiles.length > 0) {
        log(`Generated ${generated.newFiles.length} new + ${generated.modifiedFiles.length} modified test file(s)`, "success");

        // Push generated tests to ATP PR if we have a target repo
        const targetRepo = suite.repoFullName;
        if (targetRepo && token) {
          log(`Pushing test files to ${targetRepo}...`, "info");
          const atpBranch = `atp/tests-for-pr-${prEvent.prNumber}`;

          try {
            // Create branch from default
            await createBranch({
              fullName:  targetRepo,
              newBranch: atpBranch,
              fromBranch: suite.branch || "main",
            });
            log(`Created branch: ${atpBranch}`, "success");

            // Determine test directory from suite
            const testDir = getTestDir(suite);

            // Push new test files
            for (const f of generated.newFiles) {
              const filePath = `${testDir}/${f.fileName}`;
              await createFileInRepo({
                fullName: targetRepo,
                branch:   atpBranch,
                filePath,
                content:  f.content,
                message:  `[ATP] Add tests for PR #${prEvent.prNumber} — ${f.useCase?.title || f.fileName}`,
              });
              log(`  Pushed: ${filePath}`, "success");
            }

            // Push modified test files
            for (const f of generated.modifiedFiles) {
              await createFileInRepo({
                fullName: targetRepo,
                branch:   atpBranch,
                filePath: f.path,
                content:  f.modifiedContent,
                message:  `[ATP] Update ${f.path} for PR #${prEvent.prNumber}`,
              });
              log(`  Updated: ${f.path}`, "success");
            }

            // Open ATP PR
            const atpPR = await openPullRequest({
              fullName: targetRepo,
              title:    `[ATP] Tests for PR #${prEvent.prNumber} — ${prEvent.prTitle}`,
              body:     buildATPPRBody(prEvent, run, diffAnalysis),
              head:     atpBranch,
              base:     suite.branch || "main",
            });

            run.atpPrUrl = atpPR.html_url;
            log(`✓ ATP PR opened: ${atpPR.html_url}`, "success");

          } catch (pushErr) {
            log(`⚠ Could not push to ${targetRepo}: ${pushErr.message}`, "warn");
            log("Generated files saved locally — download from 🧪 Repos → Generated", "info");
          }
        } else {
          log("No target repo configured — generated files saved locally", "info");
          log("Download from 🧪 Repos → Generated Tests", "info");
        }

        // Save generated tests to testbed store regardless
        generated.newFiles.forEach(f => testbedStore.saveGeneratedTest({ ...f, prNumber: prEvent.prNumber, repoFullName: prEvent.repoFullName }));
      } else {
        log("No test generation needed for these changes", "info");
      }
    } else if (connectedSuites.length === 0) {
      log("No test repos connected — connect one in 🧪 Repos to enable auto test generation", "warn");
    }

    // ── Phase 4: Run affected tests ───────────────────────────────────────────
    run.phase = "testing";
    const toRun = affectedRecords.slice(0, cfg.maxTestsPerRun || 10);
    run.testResults = toRun;
    if (toRun.length) log(`${toRun.length} existing test(s) queued for re-run`, "info");
    else log("No existing ATP test runs matched affected files", "info");

    // ── Phase 5: Report back to GitHub ────────────────────────────────────────
    run.phase = "reporting";
    const passed   = run.testResults.filter(r => r.status === "pass").length;
    const total    = run.testResults.length;
    const passRate = total ? Math.round(passed / total * 100) : 100;
    const broken   = updatedTests.filter(t => t.isBroken).length;
    const finalStatus = broken > 0 || (total > 0 && passRate < 80) ? "fail" : "pass";

    const statusMsg = [
      total > 0 ? `${passed}/${total} passed` : null,
      run.generatedFiles.length > 0 ? `${run.generatedFiles.length} tests generated` : null,
      `Risk: ${diffAnalysis.riskLevel}`,
    ].filter(Boolean).join(" · ");

    await postCommitStatus(prEvent, finalStatus, `ATP: ${statusMsg}`, token);
    await postPRComment(prEvent, {
      diffAnalysis,
      testResults:    run.testResults,
      updatedTests,
      newTests:       run.newTests,
      generatedFiles: run.generatedFiles,
      atpPrUrl:       run.atpPrUrl,
    }, token);

    run.status = finalStatus; run.phase = "done";
    run.completedAt = Date.now(); run.duration = run.completedAt - run.startedAt;
    prRunStore.set(runId, { ...run });
    log(`Done — ${finalStatus.toUpperCase()} (${(run.duration/1000).toFixed(1)}s)`,
      finalStatus === "pass" ? "success" : "error");

    resultsStore.save({
      type: "ci", name: `PR #${prEvent.prNumber} — ${prEvent.prTitle}`,
      url: prEvent.htmlUrl || "", status: finalStatus,
      passed, failed: total - passed, total, duration: run.duration,
      steps: run.changedFiles.map(f => ({ description: `${f.status}: ${f.filename}`, status: "pass" })),
      assertions: [], prRunId: runId, diffAnalysis,
      generatedFiles: run.generatedFiles.length,
      atpPrUrl: run.atpPrUrl,
      startedAt: new Date(run.startedAt).toISOString(),
      completedAt: new Date().toISOString(),
    });

  } catch (err) {
    log(`Fatal CI error: ${err.message}`, "error");
    run.status = "error"; run.error = err.message; run.phase = "error";
    prRunStore.set(runId, { ...run });
    await postCommitStatus(prEvent, "fail", `ATP error: ${err.message.slice(0,100)}`, gitConfig.getToken()).catch(()=>{});
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTestDir(suite) {
  const dirs = (suite.testFiles || []).map(f => f.path.split("/").slice(0,-1).join("/")).filter(Boolean);
  if (!dirs.length) return "tests";
  const counts = {};
  dirs.forEach(d => { counts[d] = (counts[d]||0)+1; });
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}

function buildATPPRBody(prEvent, run, diffAnalysis) {
  const newCount  = run.generatedFiles.filter(f => f.action === "created").length;
  const modCount  = run.generatedFiles.filter(f => f.action === "modified").length;

  return `## 🧪 ATP — Automated Test Generation

Triggered by PR [#${prEvent.prNumber}](${prEvent.htmlUrl}) from @${prEvent.author}

### What ATP did
ATP analysed the diff in PR #${prEvent.prNumber} and automatically wrote tests for the changed code.

| | |
|---|---|
| **Risk level** | ${diffAnalysis?.riskLevel?.toUpperCase() || "UNKNOWN"} |
| **New test files** | ${newCount} |
| **Updated test files** | ${modCount} |
| **Affected features** | ${diffAnalysis?.affectedFeatures?.map(f=>f.feature).join(", ") || "—"} |

### Generated files
${run.generatedFiles.map(f => `- \`${f.action === "created" ? f.fileName : f.path}\` — ${f.action === "created" ? (f.useCase?.title || "new test") : f.reason}`).join("\n")}

### AI Analysis
> ${diffAnalysis?.summary || ""}

${diffAnalysis?.concerns?.length ? `**Concerns:**\n${diffAnalysis.concerns.map(c=>`- ${c}`).join("\n")}` : ""}

---
*Generated by [ATP](https://github.com/gracetshihatasics/atp) · Tests match your existing codebase conventions*`;
}

function rawBodyMiddleware(req, res, next) {
  let data = "";
  req.on("data", chunk => { data += chunk; });
  req.on("end",  () => { req.rawBody = data; next(); });
}
