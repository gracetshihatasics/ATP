#!/usr/bin/env node
import "dotenv/config";
/**
 * ATP MCP Server
 *
 * Exposes all ATP capabilities as MCP tools so Claude can call them directly.
 * Uses stdio transport — Claude spawns this process and talks over stdin/stdout.
 *
 * Add to Claude settings:
 * {
 *   "mcpServers": {
 *     "atp": {
 *       "command": "node",
 *       "args": ["/absolute/path/to/atp/backend/mcp-server.js"],
 *       "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
 *     }
 *   }
 * }
 */

import { ATP_TOOLS }          from "./src/mcp/tools.js";
import {
  discoverUsecases,
  runUsecase,
  runSuite,
  getTestPlan,
  getRunResults,
  updateTestsFromDiff,
} from "./src/mcp/handlers.js";

// ── MCP stdio transport ───────────────────────────────────────────────────────
let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop(); // keep incomplete line
  for (const line of lines) {
    if (line.trim()) handleLine(line.trim());
  }
});

process.stdin.on("end", () => process.exit(0));

function respond(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function error(id, code, message) {
  respond({ jsonrpc: "2.0", id, error: { code, message } });
}

// ── JSON-RPC message handler ──────────────────────────────────────────────────
async function handleLine(line) {
  let req;
  try { req = JSON.parse(line); } catch { return; }

  const { id, method, params } = req;

  try {
    switch (method) {

      // ── MCP handshake ──────────────────────────────────────────────────────
      case "initialize":
        respond({
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities:    { tools: {} },
            serverInfo:      { name: "atp", version: "0.2.0" },
          },
        });
        break;

      case "notifications/initialized":
        break; // no response needed

      // ── Tool listing ───────────────────────────────────────────────────────
      case "tools/list":
        respond({ jsonrpc: "2.0", id, result: { tools: ATP_TOOLS } });
        break;

      // ── Tool execution ─────────────────────────────────────────────────────
      case "tools/call": {
        const { name, arguments: args } = params;
        const result = await dispatch(name, args);
        respond({
          jsonrpc: "2.0", id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
        break;
      }

      default:
        error(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    error(id, -32603, err.message);
  }
}

// ── Dispatch tool name → handler ──────────────────────────────────────────────
async function dispatch(name, args) {
  switch (name) {
    case "discover_usecases":      return discoverUsecases(args);
    case "run_usecase":            return runUsecase(args);
    case "run_suite":              return runSuite(args);
    case "get_test_plan":          return getTestPlan(args);
    case "get_run_results":        return getRunResults(args);
    case "update_tests_from_diff": return updateTestsFromDiff(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}
