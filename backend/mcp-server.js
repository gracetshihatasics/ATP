#!/usr/bin/env node
/**
 * ATP MCP Server — stdio transport
 * Must be run from the backend/ directory OR with --prefix pointing to it.
 *
 * Claude Desktop config:
 * {
 *   "mcpServers": {
 *     "atp": {
 *       "command": "/opt/homebrew/Cellar/node/26.0.0/bin/node",
 *       "args": ["/absolute/path/to/atp/backend/mcp-server.js"],
 *       "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
 *     }
 *   }
 * }
 */

// ── Set working directory to backend/ so all relative imports resolve ─────────
import { fileURLToPath } from "url";
import path from "path";
import process from "process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(__dirname); // ensure CWD = backend/

// ── Now load everything else ──────────────────────────────────────────────────
import "dotenv/config";

import { ATP_TOOLS }            from "./src/mcp/tools.js";
import {
  discoverUsecases,
  runUsecase,
  runSuite,
  getResults,
  analyseFailureHandler,
  listCredentials,
  getContext,
  updateTestsFromDiff,
  scanCodeIntelligence,
} from "./src/mcp/handlers.js";

// ── Quick setup helper ────────────────────────────────────────────────────────
if (process.argv.includes("--setup")) {
  const serverPath = path.resolve(__dirname, "mcp-server.js");
  const nodePath   = process.execPath;
  const homeDir    = process.env.HOME || process.env.USERPROFILE || "~";
  const configPath = process.platform === "win32"
    ? `${process.env.APPDATA}\\Claude\\claude_desktop_config.json`
    : `${homeDir}/Library/Application Support/Claude/claude_desktop_config.json`;

  const config = {
    mcpServers: {
      atp: {
        command: nodePath,
        args:    [serverPath],
        env: {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "sk-ant-...",
          PORT: process.env.PORT || "3579",
        },
      },
    },
  };

  console.error("\n✓ ATP MCP Server setup\n");
  console.error(`Config file: ${configPath}\n`);
  console.error("Add this to claude_desktop_config.json:\n");
  console.error(JSON.stringify(config, null, 2));
  console.error("\nThen restart Claude Desktop (Cmd+Q on Mac).\n");
  process.exit(0);
}

// ── Verify ANTHROPIC_API_KEY is set ─────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("[ATP MCP] ERROR: ANTHROPIC_API_KEY is not set.\nAdd it to the 'env' section of your claude_desktop_config.json.");
  process.exit(1);
}

// ── MCP stdio transport ───────────────────────────────────────────────────────
let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop();
  for (const line of lines) {
    if (line.trim()) handleLine(line.trim());
  }
});

process.stdin.on("end", () => process.exit(0));

function respond(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function respondError(id, code, message) {
  respond({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleLine(line) {
  let req;
  try { req = JSON.parse(line); } catch { return; }

  const { id, method, params } = req;

  try {
    switch (method) {
      case "initialize":
        respond({
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities:    { tools: {} },
            serverInfo:      { name: "atp", version: "0.5.0" },
          },
        });
        break;

      case "notifications/initialized":
        break;

      case "tools/list":
        respond({ jsonrpc: "2.0", id, result: { tools: ATP_TOOLS } });
        break;

      case "tools/call": {
        const { name, arguments: args } = params;
        const result = await dispatch(name, args || {});
        respond({
          jsonrpc: "2.0", id,
          result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
        });
        break;
      }

      default:
        respondError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    console.error(`[ATP MCP] Error handling ${method}:`, err.message);
    respondError(id, -32603, err.message);
  }
}

async function dispatch(name, args) {
  switch (name) {
    case "discover_usecases":      return discoverUsecases(args);
    case "run_usecase":            return runUsecase(args);
    case "run_suite":              return runSuite(args);
    case "get_results":            return getResults(args);
    case "analyse_failure":        return analyseFailureHandler(args);
    case "list_credentials":       return listCredentials();
    case "get_context":            return getContext(args);
    case "update_tests_from_diff": return updateTestsFromDiff(args);
    case "scan_code_intelligence": return scanCodeIntelligence(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
