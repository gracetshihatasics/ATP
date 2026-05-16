import { spawn } from "child_process";
import { gitConfig } from "./gitConfig.js";

let activeTunnel = null;
let tunnelUrl    = null;
let tunnelStatus = "stopped"; // stopped | starting | active | error
let tunnelLog    = [];

const addLog = (msg) => {
  tunnelLog.push({ msg, ts: Date.now() });
  if (tunnelLog.length > 50) tunnelLog = tunnelLog.slice(-50);
};

export const tunnelManager = {
  getStatus() {
    return { status: tunnelStatus, url: tunnelUrl, log: tunnelLog.slice(-20) };
  },

  async start(provider = "localtunnel", port = 3579) {
    if (tunnelStatus === "active") return { ok: true, url: tunnelUrl };
    tunnelStatus = "starting"; tunnelLog = [];
    addLog(`Starting ${provider} tunnel on port ${port}...`);

    try {
      if (provider === "localtunnel") {
        return await startLocaltunnel(port);
      } else if (provider === "cloudflared") {
        return await startCloudflared(port);
      }
      return { ok: false, error: "Unknown provider" };
    } catch (err) {
      tunnelStatus = "error";
      addLog(`Error: ${err.message}`);
      return { ok: false, error: err.message };
    }
  },

  stop() {
    if (activeTunnel) {
      activeTunnel.kill();
      activeTunnel = null;
    }
    tunnelStatus = "stopped";
    tunnelUrl    = null;
    addLog("Tunnel stopped");
    gitConfig.write({ tunnelUrl: "", tunnelActive: false });
  },
};

async function startLocaltunnel(port) {
  // Try to use localtunnel npm package
  try {
    const lt = await import("localtunnel");
    const tunnel = await lt.default({ port });
    tunnelUrl    = tunnel.url;
    tunnelStatus = "active";
    addLog(`✓ Tunnel active: ${tunnel.url}`);
    gitConfig.write({ tunnelUrl: tunnel.url, tunnelActive: true });

    tunnel.on("close", () => {
      tunnelStatus = "stopped"; tunnelUrl = null;
      addLog("Tunnel closed");
      gitConfig.write({ tunnelUrl: "", tunnelActive: false });
    });
    tunnel.on("error", (err) => {
      tunnelStatus = "error";
      addLog(`Tunnel error: ${err.message}`);
    });

    return { ok: true, url: tunnel.url };
  } catch {
    // Fallback: spawn localtunnel CLI
    return startViaCLI("lt", ["--port", String(port)], /your url is: (https:\/\/\S+)/i);
  }
}

async function startCloudflared(port) {
  return startViaCLI(
    "cloudflared",
    ["tunnel", "--url", `http://localhost:${port}`],
    /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i
  );
}

function startViaCLI(cmd, args, urlPattern) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { shell: true });
    activeTunnel = proc;
    let resolved = false;

    const tryResolve = (data) => {
      const text = data.toString();
      addLog(text.trim().slice(0, 100));
      const match = text.match(urlPattern);
      if (match && !resolved) {
        resolved     = true;
        tunnelUrl    = match[0];
        tunnelStatus = "active";
        addLog(`✓ Tunnel active: ${tunnelUrl}`);
        gitConfig.write({ tunnelUrl, tunnelActive: true });
        resolve({ ok: true, url: tunnelUrl });
      }
    };

    proc.stdout.on("data", tryResolve);
    proc.stderr.on("data", tryResolve);
    proc.on("close", () => {
      tunnelStatus = "stopped"; tunnelUrl = null;
      gitConfig.write({ tunnelUrl: "", tunnelActive: false });
      if (!resolved) resolve({ ok: false, error: `${cmd} exited` });
    });
    proc.on("error", (err) => {
      tunnelStatus = "error";
      addLog(`Failed to start ${cmd}: ${err.message}`);
      if (!resolved) resolve({ ok: false, error: err.message });
    });

    // Timeout after 20s
    setTimeout(() => {
      if (!resolved) {
        resolved     = true;
        tunnelStatus = "error";
        resolve({ ok: false, error: `Timeout waiting for ${cmd} URL` });
      }
    }, 20_000);
  });
}
