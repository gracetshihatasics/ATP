# Autonomous Test Platform (ATP)

AI-powered autonomous test discovery and execution. Connects to Claude as an MCP server or runs standalone with a WebSocket backend.

---

## Project Structure

```
atp/
├── README.md
├── backend/
│   ├── server.js                    Entry — Express + WebSocket (UI runner)
│   ├── mcp-server.js                Entry — MCP stdio server (Claude tool use)
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── config/index.js          All env vars and runtime config
│       ├── ws/
│       │   ├── send.js              WS send helper
│       │   ├── sessionManager.js    Active browser session map
│       │   └── messageRouter.js     Routes WS messages to handlers
│       ├── browser/
│       │   ├── launcher.js          chromium.launch → { browser, page }
│       │   ├── executor.js          Runs one AI-generated action
│       │   ├── assertions.js        Keyword-based assertion runner
│       │   └── screenshot.js        JPEG screenshot → base64
│       ├── ai/
│       │   └── actionGenerator.js   Claude SDK → Playwright action array
│       ├── routes/
│       │   ├── useCaseRunner.js     Full use-case run
│       │   └── suiteRunner.js       Sequential suite execution
│       └── mcp/
│           ├── tools.js             MCP tool schemas (what Claude sees)
│           └── handlers.js          MCP tool implementations
│
└── frontend/
    └── src/
        ├── App.jsx                  Root — wires hooks to views
        ├── constants/
        │   ├── prompts.js           AI system prompts
        │   └── theme.js             Colors, CSS
        ├── utils/
        │   ├── claude.js            callClaude(), extractJSON()
        │   └── helpers.js           sleep()
        ├── services/websocket.js    WS connection factory
        ├── hooks/
        │   ├── useDiscovery.js      Discovery state + logic
        │   └── useRunner.js         Runner state + WS events
        └── components/
            ├── shared/              Header, LogPanel, Pill
            ├── discovery/           DiscoveryView + sub-components
            └── runner/              RunnerView + sub-components
```

---

## Option A — Run as MCP Server (connect to Claude directly)

Add to your Claude Desktop / Claude.ai MCP settings:

```json
{
  "mcpServers": {
    "atp": {
      "command": "node",
      "args": ["/absolute/path/to/atp/backend/mcp-server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Then in any Claude conversation:
> *"Discover test cases for asics.com"*
> *"Run the checkout use case on asics.com"*
> *"Update tests based on this PR diff: ..."*

### MCP Tools exposed

| Tool | What it does |
|---|---|
| `discover_usecases` | Analyse a URL → full test plan |
| `run_usecase` | Run one use case in headless browser |
| `run_suite` | Run multiple use cases sequentially |
| `get_test_plan` | Retrieve a previously discovered plan |
| `get_run_results` | Get results of a completed run |
| `update_tests_from_diff` | Update tests from a PR git diff |

---

## Option B — Run standalone with WebSocket UI

```bash
cd backend
npm install
npx playwright install chromium
cp .env.example .env   # set ANTHROPIC_API_KEY
npm run dev            # starts on ws://localhost:3579
```

Open the Claude artifact in this conversation → click **connect**.

---

## Roadmap

| # | Feature | Status |
|---|---------|--------|
| 1 | AI use-case discovery | ✅ Done |
| 2 | Browser automation panel | ✅ Done |
| 3 | MCP server integration | ✅ Done |
| 4 | API Automation Agent (Swagger/Postman) | 🔜 Next |
| 5 | Credential Vault | 🔜 |
| 6 | Results Dashboard + CI export | 🔜 |
| 7 | PR/Git Hook auto-update | 🔜 |
