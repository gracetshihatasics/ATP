import fs   from "fs";
import path from "path";

const CONFIG_FILE = path.resolve(process.cwd(), ".git-config.json");

/**
 * Git integration config — stored locally, never committed.
 * Replaces manual .env editing for GitHub integration.
 */

const DEFAULTS = {
  githubToken:      "",
  webhookSecret:    "",
  atpBaseUrl:       "",
  tunnelProvider:   "none",   // none | cloudflared | localtunnel
  tunnelUrl:        "",
  tunnelActive:     false,
  autoRunOnPR:      true,
  autoRunOnPush:    false,
  maxTestsPerRun:   10,
  targetBranches:   ["main", "master"],
  notifyOnFail:     true,
  repos:            [],       // { owner, name, enabled }
};

export const gitConfig = {
  read() {
    try {
      if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
    } catch { return { ...DEFAULTS }; }
  },

  write(updates) {
    const current = this.read();
    const merged  = { ...current, ...updates };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), "utf8");
    return merged;
  },

  get(key) {
    return this.read()[key];
  },

  // Resolve token — UI config takes priority over .env
  getToken() {
    const cfg = this.read();
    return cfg.githubToken || process.env.GITHUB_TOKEN || "";
  },

  getWebhookSecret() {
    const cfg = this.read();
    return cfg.webhookSecret || process.env.GITHUB_WEBHOOK_SECRET || "";
  },

  getBaseUrl() {
    const cfg = this.read();
    return cfg.tunnelUrl || cfg.atpBaseUrl || process.env.ATP_BASE_URL || "";
  },
};
