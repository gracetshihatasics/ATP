import { verifyWebhookSignature, parseWebhookEvent, fetchPRFiles } from "../git/webhookHandler.js";
import { analyseDiff, updateTestsFromDiff }   from "../git/diffAnalyser.js";
import { postCommitStatus, postPRComment }    from "../git/prReporter.js";
import { gitConfig }                          from "../git/gitConfig.js";
import { tunnelManager }                      from "../git/tunnelManager.js";
import { resultsStore }                       from "../results/store.js";
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
    if (!token) return res.status(400).json({ error: "token required" });
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
    if (!repoFullName) return res.status(400).json({ error: "repoFullName required" });
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
    diffAnalysis: null, changedFiles: [], affectedTests: [], newTests: [], testResults: [],
  };
  prRunStore.set(runId, run);

  const log = (msg, level = "info") => {
    run.log.push({ msg, level, ts: Date.now() });
    prRunStore.set(runId, { ...run });
  };

  try {
    const token = gitConfig.getToken();
    log(`Starting CI for PR #${prEvent.prNumber}: ${prEvent.prTitle}`, "system");
    await postCommitStatus(prEvent, "running", "ATP tests running...", token);

    // Fetch files
    run.phase = "diff";
    log(`Fetching changed files...`, "info");
    const changedFiles = await fetchPRFiles(prEvent, token);
    run.changedFiles   = changedFiles;
    log(`${changedFiles.length} file(s) changed`, "info");
    changedFiles.forEach(f => log(`  ${f.status}: ${f.filename} (+${f.additions}/-${f.deletions})`, "info"));

    // AI analysis
    run.phase = "analysis";
    log("◈ AI analysing diff...", "ai");
    const existingTests = resultsStore.getAll({ limit: 100 }).records
      .filter(r => r.type === "usecase")
      .map(r => ({ id: r.id, title: r.name, category: r.category, priority: r.priority }));
    const diffAnalysis  = await analyseDiff(prEvent, changedFiles, existingTests);
    run.diffAnalysis    = diffAnalysis;
    log(`Risk: ${diffAnalysis.riskLevel?.toUpperCase()} — ${diffAnalysis.summary}`, diffAnalysis.riskLevel === "critical" ? "error" : diffAnalysis.riskLevel === "high" ? "warn" : "info");
    diffAnalysis.affectedFeatures?.forEach(f => log(`  Affected: ${f.feature} (${f.confidence})`, "ai"));
    diffAnalysis.concerns?.forEach(c => log(`  ⚠ ${c}`, "warn"));

    // Update tests
    run.phase = "update";
    const affectedRecords = resultsStore.getAll({ limit: 100 }).records
      .filter(r => r.type === "usecase" && diffAnalysis.affectedTestIds?.includes(r.id));
    const updatedTests = await updateTestsFromDiff(affectedRecords, changedFiles, diffAnalysis);
    run.affectedTests  = updatedTests;
    run.newTests       = diffAnalysis.newTestsNeeded || [];
    updatedTests.filter(t => t.isBroken).forEach(t => log(`  💔 Broken: ${t.title}`, "error"));
    if (run.newTests.length) log(`${run.newTests.length} new test(s) suggested`, "ai");

    // Run tests
    run.phase    = "testing";
    const toRun  = affectedRecords.slice(0, cfg.maxTestsPerRun || 10);
    run.testResults = toRun;
    if (toRun.length) log(`Would run ${toRun.length} affected test(s) (re-run from runner)`, "info");
    else log("No existing tests matched — diff analysis only", "info");

    // Report
    run.phase = "reporting";
    const passed   = run.testResults.filter(r => r.status === "pass").length;
    const total    = run.testResults.length;
    const passRate = total ? Math.round(passed/total*100) : 100;
    const broken   = updatedTests.filter(t => t.isBroken).length;
    const finalStatus = broken > 0 || (total > 0 && passRate < 80) ? "fail" : "pass";

    await postCommitStatus(prEvent, finalStatus,
      total > 0 ? `ATP: ${passed}/${total} passed (${passRate}%) — Risk: ${diffAnalysis.riskLevel}` : `ATP: Analysis done — Risk: ${diffAnalysis.riskLevel}`,
      token
    );
    await postPRComment(prEvent, { diffAnalysis, testResults: run.testResults, updatedTests, newTests: run.newTests }, token);

    run.status = finalStatus; run.phase = "done";
    run.completedAt = Date.now(); run.duration = run.completedAt - run.startedAt;
    prRunStore.set(runId, { ...run });
    log(`Done — ${finalStatus.toUpperCase()} (${(run.duration/1000).toFixed(1)}s)`, finalStatus === "pass" ? "success" : "error");

    resultsStore.save({
      type: "ci", name: `PR #${prEvent.prNumber} — ${prEvent.prTitle}`,
      url: prEvent.htmlUrl || "", status: finalStatus,
      passed, failed: total - passed, total, duration: run.duration,
      steps: run.changedFiles.map(f => ({ description: `${f.status}: ${f.filename}`, status: "pass" })),
      assertions: [], prRunId: runId, diffAnalysis,
      startedAt: new Date(run.startedAt).toISOString(), completedAt: new Date().toISOString(),
    });

  } catch (err) {
    log(`Fatal: ${err.message}`, "error");
    run.status = "error"; run.error = err.message; run.phase = "error";
    prRunStore.set(runId, { ...run });
    await postCommitStatus(prEvent, "fail", `ATP error: ${err.message.slice(0,100)}`, gitConfig.getToken()).catch(()=>{});
  }
}

function rawBodyMiddleware(req, res, next) {
  let data = "";
  req.on("data", chunk => { data += chunk; });
  req.on("end",  () => { req.rawBody = data; next(); });
}
