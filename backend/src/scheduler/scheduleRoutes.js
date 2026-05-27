import { handle, sendSSEError, ATPError, ErrorType, logError } from "../utils/errors.js";
import { scheduleStore, calcNextRun, CRON_PRESETS, sendSlackNotification, buildSlackMessage } from "./scheduleStore.js";
import { startScheduler } from "./scheduleRunner.js";

export function scheduleRoutes(app) {

  // ── List all schedules ────────────────────────────────────────────────────
  app.get("/api/schedules", (_, res) => {
    const schedules = scheduleStore.list().map(s => ({
      ...s,
      // Mask Slack webhook URL
      slack: s.slack ? { ...s.slack, webhookUrl: s.slack.webhookUrl ? "••••••••" : "" } : null,
      nextRunHuman: s.nextRun ? formatNextRun(s.nextRun) : null,
    }));
    res.json({ ok: true, schedules });
  });

  // ── Get one schedule ──────────────────────────────────────────────────────
  app.get("/api/schedules/:id", (req, res) => {
    const s = scheduleStore.get(req.params.id);
    if (!s) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, schedule: s });
  });

  // ── Create schedule ───────────────────────────────────────────────────────
  app.post("/api/schedules", (req, res) => {
    const { name, url, credentialId, cron, cronExpression, enabled = true,
            slack, suiteFilter = "all", maxTests = 20 } = req.body;

    if (!name || !url || !cron) {
      return res.status(400).json({ ok:false, error:"name, url, cron required", type:"validation" });
    }

    const entry = scheduleStore.save({
      name, url, credentialId: credentialId || null,
      cron, cronExpression: cronExpression || CRON_PRESETS[cron]?.expression || "",
      enabled, slack: slack || null,
      suiteFilter, maxTests,
      lastRun: null, nextRun: null, lastStatus: null, lastRunId: null,
    });

    // Calculate first nextRun
    const withNext = scheduleStore.update(entry.id, {
      nextRun: calcNextRun({ ...entry, lastRun: null }),
    });

    res.json({ ok: true, schedule: withNext });
  });

  // ── Update schedule ───────────────────────────────────────────────────────
  app.put("/api/schedules/:id", (req, res) => {
    const existing = scheduleStore.get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const updated = scheduleStore.save({ ...existing, ...req.body, id: req.params.id });
    // Recalculate nextRun if cron changed
    if (req.body.cron || req.body.enabled !== undefined) {
      scheduleStore.update(req.params.id, { nextRun: calcNextRun(updated) });
    }
    res.json({ ok: true, schedule: scheduleStore.get(req.params.id) });
  });

  // ── Toggle enabled ────────────────────────────────────────────────────────
  app.post("/api/schedules/:id/toggle", (req, res) => {
    const s = scheduleStore.get(req.params.id);
    if (!s) return res.status(404).json({ error: "Not found" });
    const updated = scheduleStore.update(req.params.id, {
      enabled: !s.enabled,
      nextRun: !s.enabled ? calcNextRun(s) : null,
    });
    res.json({ ok: true, schedule: updated });
  });

  // ── Delete schedule ───────────────────────────────────────────────────────
  app.delete("/api/schedules/:id", (req, res) => {
    scheduleStore.delete(req.params.id);
    res.json({ ok: true });
  });

  // ── Manual trigger ────────────────────────────────────────────────────────
  app.post("/api/schedules/:id/run", async (req, res) => {
    const s = scheduleStore.get(req.params.id);
    if (!s) return res.status(404).json({ error: "Not found" });

    res.json({ ok: true, msg: `Running schedule "${s.name}"` });

    const { executeSchedule } = await import("./scheduleRunner.js");
    // Force-mark as due and run
    scheduleStore.update(s.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
    import("./scheduleRunner.js").then(({ startScheduler }) => startScheduler());
  });

  // ── Test Slack webhook ────────────────────────────────────────────────────
  app.post("/api/schedules/test-slack", async (req, res) => {
    const { webhookUrl } = req.body;
    if (!webhookUrl) return res.status(400).json({ ok:false, error:"webhookUrl required", type:"validation" });

    try {
      await sendSlackNotification(webhookUrl, {
        text: "✅ ATP Slack test — your webhook is working!",
        attachments: [{
          color: "#4caf50",
          text: "ATP scheduled runs will post results here.",
        }],
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok:false, error:err.message, type:"internal" });
    }
  });

  // ── Cron presets ──────────────────────────────────────────────────────────
  app.get("/api/schedules/presets", (_, res) => {
    res.json({ ok: true, presets: CRON_PRESETS });
  });
}

function formatNextRun(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "overdue";
  const mins = Math.round(diff / 60_000);
  if (mins < 60)  return `in ${mins}m`;
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24)   return `in ${hrs}h`;
  const days = Math.round(diff / 86_400_000);
  return `in ${days}d`;
}
