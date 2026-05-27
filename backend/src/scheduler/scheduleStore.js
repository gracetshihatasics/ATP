import fs      from "fs";
import path    from "path";
import crypto  from "crypto";
import https   from "https";

const STORE_FILE = path.resolve(process.cwd(), ".schedules.json");

/**
 * Scheduler — runs test suites on a cron schedule and posts results to Slack.
 *
 * Schedule record:
 * {
 *   id, name, url, credentialId,
 *   cron: "daily|nightly|hourly|weekly|custom",
 *   cronExpression: "0 2 * * *",  // for custom
 *   enabled: true,
 *   lastRun: ISO string | null,
 *   nextRun: ISO string | null,
 *   lastStatus: "pass"|"fail"|null,
 *   lastRunId: string | null,
 *   slack: { webhookUrl, channel, notifyOn: "always|fail|pass" },
 *   suiteFilter: "all|critical|high",
 *   maxTests: 20,
 * }
 */

// ── Cron presets ──────────────────────────────────────────────────────────────
export const CRON_PRESETS = {
  hourly:  { label:"Every hour",       expression:"0 * * * *",     intervalMs: 60*60*1000 },
  nightly: { label:"Nightly (2am)",    expression:"0 2 * * *",     intervalMs: 24*60*60*1000 },
  daily:   { label:"Daily (9am)",      expression:"0 9 * * *",     intervalMs: 24*60*60*1000 },
  weekly:  { label:"Weekly (Mon 9am)", expression:"0 9 * * 1",     intervalMs: 7*24*60*60*1000 },
  custom:  { label:"Custom cron",      expression:"",              intervalMs: 0 },
};

// ── Store ─────────────────────────────────────────────────────────────────────
function read() {
  try {
    if (!fs.existsSync(STORE_FILE)) return { schedules: [] };
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch { return { schedules: [] }; }
}

function write(data) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf8");
}

export const scheduleStore = {
  list()    { return read().schedules; },
  get(id)   { return read().schedules.find(s => s.id === id) || null; },

  save(data) {
    const store = read();
    const id    = data.id || `sched-${crypto.randomUUID().slice(0,8)}`;
    const entry = { ...data, id, updatedAt: new Date().toISOString() };
    if (!entry.createdAt) entry.createdAt = entry.updatedAt;
    const idx = store.schedules.findIndex(s => s.id === id);
    if (idx >= 0) store.schedules[idx] = entry;
    else store.schedules.push(entry);
    write(store);
    return entry;
  },

  update(id, updates) {
    const store = read();
    const idx   = store.schedules.findIndex(s => s.id === id);
    if (idx < 0) return null;
    store.schedules[idx] = { ...store.schedules[idx], ...updates, updatedAt: new Date().toISOString() };
    write(store);
    return store.schedules[idx];
  },

  delete(id) {
    const store = read();
    store.schedules = store.schedules.filter(s => s.id !== id);
    write(store);
  },
};

// ── Next run time calculator ──────────────────────────────────────────────────
export function calcNextRun(schedule) {
  const now    = Date.now();
  const preset = CRON_PRESETS[schedule.cron];
  if (!preset || !preset.intervalMs) return null;

  if (!schedule.lastRun) {
    // First run — use interval from now
    return new Date(now + preset.intervalMs).toISOString();
  }

  const last = new Date(schedule.lastRun).getTime();
  const next = last + preset.intervalMs;
  return new Date(Math.max(next, now + 60_000)).toISOString(); // at least 1 min from now
}

export function isDue(schedule) {
  if (!schedule.enabled) return false;
  if (!schedule.nextRun)  return false;
  return new Date(schedule.nextRun).getTime() <= Date.now();
}

// ── Slack notification ────────────────────────────────────────────────────────
export async function sendSlackNotification(webhookUrl, payload) {
  if (!webhookUrl) return;

  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const url  = new URL(webhookUrl);

    const req = https.request({
      hostname: url.hostname,
      port:     443,
      path:     url.pathname + url.search,
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      res.on("data", () => {});
      res.on("end", resolve);
    });

    req.on("error", () => resolve()); // don't crash on Slack errors
    req.setTimeout(10_000, () => { req.destroy(); resolve(); });
    req.write(body);
    req.end();
  });
}

export function buildSlackMessage(schedule, result) {
  const passed   = result.passed || 0;
  const failed   = result.failed || 0;
  const total    = result.total  || 0;
  const passRate = total > 0 ? Math.round(passed / total * 100) : 100;
  const status   = result.status;
  const emoji    = status === "pass" ? "✅" : status === "fail" ? "❌" : "⚠️";
  const color    = status === "pass" ? "#4caf50" : "#ff3b3b";
  const duration = result.duration ? `${(result.duration/1000).toFixed(1)}s` : "—";

  return {
    text: `${emoji} ATP Scheduled Run: *${schedule.name}*`,
    attachments: [{
      color,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${emoji} *${schedule.name}* — ${status?.toUpperCase()}\n<${schedule.url}|${schedule.url}>`,
          },
        },
        {
          type: "section",
          fields: [
            { type:"mrkdwn", text:`*Pass Rate*\n${passRate}% (${passed}/${total})` },
            { type:"mrkdwn", text:`*Duration*\n${duration}` },
            { type:"mrkdwn", text:`*Status*\n${status?.toUpperCase()}` },
            { type:"mrkdwn", text:`*Schedule*\n${CRON_PRESETS[schedule.cron]?.label || schedule.cron}` },
          ],
        },
        failed > 0 ? {
          type: "section",
          text: { type:"mrkdwn", text:`*Failed Tests (${failed}):*\n${(result.failedTests || []).slice(0,5).map(t => `• ${t}`).join("\n") || "See ATP for details"}` },
        } : null,
        {
          type: "actions",
          elements: [{
            type: "button",
            text: { type:"plain_text", text:"View in ATP" },
            url:  `${process.env.ATP_BASE_URL || "http://localhost:5173"}#results`,
          }],
        },
        {
          type: "context",
          elements: [{ type:"mrkdwn", text:`Scheduled by ATP · Run ID: ${result.runId || "—"} · ${new Date().toLocaleString()}` }],
        },
      ].filter(Boolean),
    }],
  };
}
