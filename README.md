# Autonomous Test Platform (ATP)

> AI-powered test discovery, execution, and CI integration. ATP uses Claude to understand your application, generate test cases, run them in a real browser, analyse failures, and close the CI loop on every pull request.

Built by [@gracetshihatasics](https://github.com/gracetshihatasics) · [GitHub](https://github.com/gracetshihatasics/atp)

---

## What ATP Does

ATP replaces manual test writing with autonomous AI-driven testing. Point it at a URL and it will:

1. **Discover** — navigate your app, understand every feature, generate comprehensive test cases
2. **Execute** — run tests in a real Chromium browser with AI vision to handle popups, forms, and dynamic content
3. **Analyse** — understand why tests fail, detect flaky tests, scan for dead code
4. **Integrate** — connect to Jira, Confluence, your database, and GitHub to have full context
5. **Report** — multi-audience dashboards, CI export, and automatic PR comments

---

## Architecture Overview

```
atp/
├── backend/                          Node.js + Express + Playwright + WebSocket
│   ├── server.js                     HTTP server entry point
│   ├── mcp-server.js                 MCP stdio server for Claude Desktop
│   ├── .env.example                  Environment variable template
│   └── src/
│       ├── config/index.js           All timeouts, model, settings
│       ├── ai/
│       │   └── actionGenerator.js    Converts use case steps → Playwright actions
│       ├── api/                      API Agent
│       │   ├── swaggerParser.js      OpenAPI 2/3 + Postman normaliser
│       │   ├── scenarioBuilder.js    AI builds multi-step business scenarios
│       │   └── apiRunner.js          Executes with {{variable}} data chaining
│       ├── browser/                  Execution Intelligence Layer
│       │   ├── launcher.js           Stealth Chromium launch (bypasses bot detection)
│       │   ├── executor.js           Smart action executor
│       │   ├── assertions.js         Assertion runner
│       │   ├── screenshot.js         JPEG screenshot → base64
│       │   ├── popupHandler.js       2-layer popup dismiss: selectors + AI vision
│       │   ├── smartObserver.js      AI vision page readiness checks
│       │   ├── pageIntelligence.js   Understands forms, tabs, wizards at runtime
│       │   ├── adaptiveRunner.js     Adaptive execution with form intelligence
│       │   ├── retryEngine.js        Retry + deferred confirmation system
│       │   └── codeIntelligence.js   Detects hidden/dead code in DOM
│       ├── discovery/                Discovery Engine
│       │   ├── surfaceScanner.js     Phase 1: DOM analysis, nav mapping
│       │   ├── authResolver.js       Phase 2: vault → auto-register → guest
│       │   ├── featureMapper.js      Phase 3: navigate each feature area
│       │   └── deepDiscovery.js      Orchestrates 4 phases + context injection
│       ├── git/                      CI Integration
│       │   ├── webhookHandler.js     GitHub webhook HMAC verification + parsing
│       │   ├── diffAnalyser.js       AI analyses PR diffs → affected tests
│       │   ├── prReporter.js         Posts status checks + comments to GitHub PRs
│       │   ├── gitConfig.js          Persistent git integration config store
│       │   └── tunnelManager.js      One-click tunnel (localtunnel/cloudflared)
│       ├── integrations/             Context Layer
│       │   ├── integrationStore.js   Encrypted config store for all integrations
│       │   ├── contextBuilder.js     Assembles context from all sources
│       │   └── connectors/
│       │       ├── confluenceConnector.js
│       │       ├── jiraConnector.js
│       │       ├── dbConnector.js    Postgres + MySQL + MongoDB
│       │       ├── notionConnector.js
│       │       └── restConnector.js
│       ├── mcp/
│       │   ├── tools.js              MCP tool schemas
│       │   └── handlers.js           MCP tool implementations
│       ├── results/
│       │   ├── store.js              File-based run persistence (.results.json)
│       │   ├── ciExport.js           JUnit XML, Allure JSON, JSON summary
│       │   ├── failureAnalyser.js    AI root cause + suite insight
│       │   └── routes.js             Results CRUD + export + analysis endpoints
│       ├── routes/
│       │   ├── useCaseRunner.js      Full browser use case run via WebSocket
│       │   ├── suiteRunner.js        Sequential suite with suite-level record
│       │   ├── aiRoutes.js           Quick discovery + scenario generation
│       │   ├── advancedDiscoveryRoute.js  SSE streaming advanced discovery
│       │   ├── apiAgentRoutes.js     Import/build/run API scenarios (SSE)
│       │   ├── codeIntelligenceRoute.js   DOM dead code scanner (SSE)
│       │   ├── integrationRoutes.js  Integration CRUD + sync + context build
│       │   └── webhookRoute.js       GitHub webhook + CI loop + tunnel mgmt
│       ├── vault/
│       │   ├── encryption.js         AES-256-GCM encrypt/decrypt
│       │   ├── store.js              Single credentials + credential sets
│       │   └── vaultRoutes.js        CRUD + /context resolution endpoint
│       └── ws/
│           ├── send.js               WebSocket send helper
│           ├── sessionManager.js     Active browser session map
│           └── messageRouter.js      Routes WS messages to handlers
│
└── frontend/                         React + Vite
    └── src/
        ├── App.jsx                   Root router — all views
        ├── constants/
        │   ├── prompts.js            AI system prompts
        │   └── theme.js              Global CSS + colour tokens
        ├── utils/
        │   ├── claude.js             Backend proxy helpers
        │   └── helpers.js            sleep() etc.
        ├── services/
        │   ├── websocket.js          WS connection factory
        │   ├── apiAgent.js           API Agent HTTP service
        │   ├── vault.js              Vault HTTP service
        │   └── results.js            Results + analysis HTTP service
        ├── hooks/
        │   ├── useDiscovery.js       Quick discovery state + vault resolution
        │   ├── useAdvancedDiscovery.js  SSE streaming + phase tracking
        │   ├── useRunner.js          Runner state + all 20+ WS event types
        │   └── useApiAgent.js        API Agent state
        └── components/
            ├── shared/               Header, LogPanel, Pill, CredentialPicker
            ├── discovery/            DiscoveryView, InputPanel, AdvancedDiscoveryPanel,
            │                         UseCaseList, UseCaseDetail, EndpointList, SuiteList
            ├── runner/               RunnerView, StepsPanel (retry/uncertain/recovered),
            │                         BrowserView (screenshot grid + lightbox)
            ├── api/                  ApiAgentView (import → build → run)
            ├── vault/                VaultView (single creds + multi-user sets)
            ├── results/              ResultsView (Grafana-style, 3-audience)
            ├── intelligence/         CodeIntelligencePanel
            ├── git/                  GitIntegrationPanel (setup wizard + PR history)
            └── integrations/         IntegrationsPanel (7 connector types + context preview)
```

---

## Quick Start

### Prerequisites

- Node.js 20+
- Anthropic API key ([get one here](https://console.anthropic.com))

### 1. Install and configure

```bash
cd backend
npm install
npx playwright install chromium
cp .env.example .env
```

Edit `backend/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3579
VAULT_SECRET=change-this-to-a-long-random-string
```

### 2. Start the backend

```bash
cd backend
npm run dev
# ✓ ATP backend running at http://localhost:3579
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
# ✓ Frontend running at http://localhost:5173
```

### 4. Open ATP

Navigate to `http://localhost:5173` and click **connect** in the header.

---

## Features

### ◈ Discovery

#### Quick Discover

Enter a URL, AI analyses the app structure and generates 7 prioritised test use cases in seconds. Returns use cases with steps, assertions, priority, and category, plus an API endpoint map and suggested test suites.

#### Advanced Discover — 4-Phase Autonomous Engine

| Phase | What happens |
|-------|-------------|
| **1 — Surface scan** | Playwright navigates the URL, extracts DOM, maps all nav links, detects UI signals (loyalty, cart, checkout, auth, etc.) |
| **2 — Auth resolution** | Tries vault credential → attempts auto-registration (generates `atp_test_xxx@mailinator.com`) → falls back to guest |
| **3 — Feature mapping** | Navigates into every detected feature area, screenshots each, derives all flows |
| **4 — AI generation** | Claude generates unlimited use cases grouped by feature (minimum 5 per area), informed by all integration context |

Discovery streams progress live including screenshots of every page visited, feature map, and phase indicators.

#### Code Intelligence Scanner

Scans any page's DOM for hidden and dead code, then asks Claude to analyse each finding:

- Elements hidden via `display:none`, `visibility:hidden`, `opacity:0`, zero-size
- Feature flags disabled in code (`data-enabled="false"`, `data-feature`)
- Dead links (`href="#"`, `javascript:void(0)`)
- Orphaned components rendered but immediately hidden
- Empty containers that should have content
- Buttons and links with no accessible label
- HTML comments suggesting removed features

For each finding: severity (critical/warning/info), type, engineering recommendation, business impact, and a test decision — skip, ignore-always, test-when-enabled, or investigate.

---

### ▶ Runner

Executes use cases in a real Chromium browser with a full intelligence stack:

#### Stealth Mode

Launches Chromium with headers and fingerprinting that bypasses Akamai, Cloudflare, and similar bot detection systems:
- `--disable-blink-features=AutomationControlled`
- Removes `navigator.webdriver`
- Realistic `sec-ch-ua`, `Accept-Language`, `Sec-Fetch-*` headers
- Fake plugins and languages

#### Page Intelligence

Before executing steps, ATP screenshots the page and asks Claude to analyse it:
- Page type (checkout wizard, category listing, login form, dashboard, etc.)
- All forms — fields, types, required status, fill order, test values
- Tabs, wizards, multi-step flows
- Key interactive elements
- Potential testing issues

This analysis is fed into action generation so selectors are accurate and fill order is correct.

#### Smart Observer

Instead of `sleep()` calls, ATP observes the page state:
1. Polls DOM for `readyState`, visible spinners (`[aria-busy]`, `[class*="spinner"]`), skeleton loaders
2. If still uncertain → screenshots and asks Claude: *"Is this page ready for the next action?"*
3. Claude returns: ready/not-ready, reason, how long to wait

#### Action Executor

| Action type | Smart behaviour |
|-------------|----------------|
| `navigate` | `networkidle` → `domcontentloaded` fallback → smart wait + popup dismiss |
| `click` | Check visible → check in viewport → scroll if needed → wait animation stable → click |
| `fill` | Scroll into view → clear → fill |
| `scroll` | Smooth scroll → wait for lazy content + page stable |
| `scroll_to` | Scroll specific element into viewport |
| `wait_for` | Wait for selector to appear (dynamic content, search results, modals) |
| `wait_navigation` | Full page load after form submit |
| `hover` | Wait for menus/tooltips to appear after hover |

#### Popup Handler — 2 Layers

**Layer 1 (fast, no AI):** 40+ static selectors covering OneTrust, cookie banners, GDPR dialogs, newsletter overlays, region selectors, age gates, app download banners, ASICS-specific selectors.

**Layer 2 (AI vision):** If an overlay is still detected after layer 1:
1. Screenshots the page
2. Sends to Claude: *"What is this popup? What button dismisses it safely?"*
3. Claude returns: popup type, message, action (accept/decline/close), exact button text
4. ATP clicks by text → falls back to close button patterns → force-removes DOM element

Runs after every `navigate`, `click`, and `press`. Native browser `alert()`, `confirm()`, and `prompt()` dismissed immediately via `page.on("dialog")`.

#### Retry Engine

Every step uses the retry engine:

1. Execute action
2. Check DOM signals — errors visible? spinners running? success elements present?
3. If uncertain → AI vision: *"Did this action succeed, fail, or is it still loading?"*
4. If `pending` → wait 3s and recheck
5. Up to 3 attempts with exponential backoff (1.5s → 3s → 5s)
6. If action ran but outcome unconfirmable → mark `uncertain` (treated as pass)

**Deferred Recheck:** After the entire run, ATP revisits every failed step and asks Claude: *"Looking at the current page, did this step actually succeed?"* False-fails become `pass-deferred`.

**Adaptive Recovery:** When a step fails, ATP re-analyses the current page and generates alternative actions.

#### Step States

| State | Colour | Meaning |
|-------|--------|---------|
| `pass` | green | Confirmed success |
| `pass-deferred` | blue | Confirmed success on post-run recheck |
| `fail` | red | Failed after all retries |
| `recovered` | yellow | Failed then succeeded via recovery action |
| `uncertain` | blue badge `?` | Action ran, outcome unconfirmed |
| `running` | animated orange | Currently executing |

The StepsPanel also shows: retry count badge (`2×`, `3×`), AI observation text, recovery action description, and deferred recheck evidence.

---

### 🔌 API Agent

Import any Swagger/OpenAPI spec or Postman collection:

1. **Parse** — normalises OpenAPI 2/3 (JSON or YAML) and Postman collections into a unified endpoint list
2. **Build scenarios** — AI generates multi-step business transaction scenarios (register → login → browse → add to cart → checkout)
3. **Run** — executes with `{{variable}}` data chaining (capture `userId` from POST /users → use in GET /users/{{userId}})
4. **Assert** — status codes, JSON path existence, data types, response structure

Credentials from the vault are automatically injected. Every run (scenario + suite) is saved to the results store.

---

### 🔐 Credential Vault

AES-256-GCM encrypted storage in `backend/.vault.json` (gitignored).

**Single credentials** — basic auth, bearer token, API key, OAuth2. Linked to a target URL for auto-matching.

**Credential Sets** — multiple named users under one set for multi-role tests:

```
Set: "ASICS Checkout Test"
├── admin        → basic: admin@asics.com
├── existingUser → bearer token
├── newUser      → (captured at runtime via POST /users response)
└── guest        → none (anonymous flow)
```

Reference in test steps as `{{admin.username}}`, `{{existingUser.token}}`, etc.

The **CredentialPicker** shared component appears in Discovery, API Agent — credentials are never duplicated across panels.

---

### 📊 Results Dashboard

Live Grafana-style dashboard with three audience views.

#### ⚙️ Engineering View

- 6 KPI cards: pass rate, failures, avg duration, total steps run, flaky count, all-time runs
- Daily stacked pass/fail bar chart (last 14 days)
- Pass/fail donut chart (CSS conic-gradient)
- By-type breakdown — Browser vs Suite vs API pass rates
- By-application pass rates
- Duration histogram (0-1s, 1-2s, 2-5s, 5-10s, 10-60s buckets)
- Recent failures with first error message inline
- Most-run tests frequency table with per-test pass rate bars
- Flaky test alert section

#### 📦 Product View

Feature coverage grouped by application URL — which tests cover which app, pass rates per test.

#### 📈 Executive View

Clean summary with auto-generated key takeaways: overall health rating, failure count, flaky test warning, average duration.

**Live mode** — auto-refreshes every 5 seconds. Toggle in sidebar.

#### AI Failure Analysis

Click any failed run → **◈ AI Analyse Failure**:

```
Root cause:    Checkout button not found — selector expired after UI update
Category:      selector
Severity:      high
App bug:       false
Flaky:         false
Business impact: Users cannot complete purchases on mobile viewport
Recommendations:
  1. Update selector to button[data-testid="checkout-submit"]
  2. Add viewport size to test configuration
  3. Verify button is present in DOM before clicking
```

**Suite AI Insight** — for suite runs: overall health, common failure pattern, top priority, recommendations.

#### CI Export

| Format | Integration |
|--------|------------|
| JUnit XML | GitHub Actions, Jenkins, Azure DevOps, CircleCI |
| Allure JSON | Allure Report with history and trends |
| JSON Summary | Slack webhooks, monitoring, custom dashboards |

Includes a ready-to-paste GitHub Actions workflow example.

---

### 🔗 Integrations

Connect ATP to external data sources so Claude has full context when discovering and running tests.

| Connector | Config fields | What it provides |
|-----------|---------------|-----------------|
| **Confluence** | baseUrl, email, API token, space keys | Page content, feature specs, architecture docs |
| **Jira** | baseUrl, email, API token, project keys | Sprint tickets, acceptance criteria, open bugs, sprint goals |
| **PostgreSQL** | host, port, database, username, password | Table schemas, row counts, sample data |
| **MySQL** | host, port, database, username, password | Same as PostgreSQL |
| **MongoDB** | connection string | Collection structure and sample documents |
| **Notion** | integration token, database IDs | Pages, database rows, any documentation |
| **REST API** | baseUrl, auth type/value, endpoint list | Any custom internal API or data service |

All credentials AES-256-GCM encrypted in `backend/.integrations.json` (gitignored).

#### Context Builder

Before every advanced discovery or test run:

1. Pulls data from all enabled integrations (5-minute cache)
2. Converts each source to a compact text summary
3. Assembles into a structured context block
4. Injects into every Claude prompt automatically

**Context Preview tab** shows the exact context string ATP has at any time — see what Claude will know before running a test.

**Test Data Extraction** — ATP can also extract specific test values from context for a given use case:
```
POST /api/integrations/test-data
→ { fields: { email: "test@asics.com", userId: "47203" }, suggestions: [...] }
```

---

### ⚙ Git / CI Integration

#### Setup (all in ATP UI — no `.env` editing required)

1. **GitHub Token** — paste token → click Verify → ATP shows your avatar and loads your repos
2. **Webhook Secret** — type or click Generate for a random 24-char secret
3. **Tunnel** — click **▶ Start Tunnel** — ATP starts localtunnel in the background, gets a public URL, saves it automatically
4. **GitHub Webhook** — click the webhook URL to copy → paste in GitHub → Settings → Webhooks

#### CI Loop (fires on every PR open/push)

```
PR opened or updated
    ↓
GitHub sends webhook → ATP verifies HMAC signature
    ↓
Fetch changed files + patches from GitHub API
    ↓
AI diff analysis
  - Risk level: critical / high / medium / low
  - Affected features and confidence
  - Which existing tests to re-run
  - New test cases to create
  - Specific concerns and edge cases
    ↓
Update affected test cases
  - Review each against the diff
  - Flag tests broken by the change
  - Update steps where relevant
    ↓
Run affected tests (capped at maxTestsPerRun for CI speed)
    ↓
Post GitHub commit status check ✓/✗ on the PR
    ↓
Post/update PR comment:
  - Results table (pass rate, risk level, duration)
  - AI change analysis
  - Affected features list
  - Broken test list with reasons
  - Suggested new test cases
  (Updates same comment on re-push — no duplicates)
```

PR run history shows: risk icon, changed files, affected tests, AI analysis summary, and full run log.

---

### MCP Server

ATP exposes 6 tools to Claude Desktop via the Model Context Protocol (stdio transport).

| Tool | Description |
|------|-------------|
| `discover_usecases` | Analyse a URL and generate a full test plan |
| `run_usecase` | Run one use case in headless Chromium |
| `run_suite` | Run multiple use cases sequentially |
| `get_test_plan` | Retrieve a previously discovered plan |
| `get_run_results` | Get results of a completed run |
| `update_tests_from_diff` | Update tests based on a PR git diff |

**Claude Desktop config** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

In any Claude conversation:
> *"Discover test cases for asics.com"*
> *"Run the loyalty checkout test on staging"*
> *"What broke in the last PR?"*
> *"Update our tests for this PR diff: ..."*

---

## Environment Variables

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Server (optional — defaults shown)
PORT=3579
VAULT_SECRET=change-this-to-a-long-random-string

# GitHub CI integration (configurable in UI — .env optional)
GITHUB_TOKEN=ghp_...
GITHUB_WEBHOOK_SECRET=your-webhook-secret
ATP_BASE_URL=https://your-public-url

# Network / TLS (see Troubleshooting below if you get "Connection error")
NODE_TLS_REJECT_UNAUTHORIZED=0   # Add this if on a corporate network or VPN
HTTPS_PROXY=http://127.0.0.1:8080  # Add this if behind a proxy
```

> **Important:** After editing `backend/.env` you must **restart the backend** for changes to take effect. The `.env` file is only read on startup — it is not hot-reloaded.
>
> ```bash
> # Stop the backend (Ctrl+C), then restart:
> cd ~/atp/backend && npm run dev
> ```

---

## Troubleshooting

### "Connection error" / Cannot reach Anthropic API

ATP calls `api.anthropic.com` from the Node.js backend. If you see `Connection error` in the discovery log or the header shows "API unreachable", the issue is a **network or TLS problem on your machine** — not the API key.

#### Diagnose

Run these in your terminal to identify the cause:

```bash
# 1. Can curl reach Anthropic?
curl -I https://api.anthropic.com

# 2. Can Node reach Anthropic?
node -e "fetch('https://api.anthropic.com').then(r=>console.log('OK',r.status)).catch(e=>console.log('FAIL:',e.cause?.message||e.message))"

# 3. Is there a system proxy?
scutil --proxy | grep -E "HTTP|HTTPS|Enable"   # Mac
echo $https_proxy $HTTPS_PROXY                  # Linux/Mac
```

#### Fix A — Corporate network / SSL inspection proxy (most common)

Symptoms: `curl` works but `node` fails with `fetch failed`, or you get a TLS/certificate error.

Your network is doing SSL inspection (common on corporate WiFi, VPNs, and managed Macs). Node.js rejects the intercepted certificate.

**Fix:**
```bash
# Add to backend/.env
echo "NODE_TLS_REJECT_UNAUTHORIZED=0" >> ~/atp/backend/.env

# Restart the backend
cd ~/atp/backend && npm run dev
```

Then verify it works:
```bash
curl http://localhost:3579/api/health/anthropic
# Should return: {"ok":true,"model":"claude-sonnet-4-6"}
```

#### Fix B — Behind a proxy

Symptoms: `echo $https_proxy` shows a URL, or `scutil --proxy` shows `HTTPSEnable: 1`.

```bash
# Add to backend/.env (replace with your actual proxy URL and port)
echo "HTTPS_PROXY=http://127.0.0.1:8080" >> ~/atp/backend/.env

# Restart the backend
cd ~/atp/backend && npm run dev
```

#### Fix C — VPN blocking Anthropic

Symptoms: both `curl` and `node` fail with `ECONNREFUSED` or `ETIMEDOUT`.

Your VPN is blocking outbound connections to `api.anthropic.com`. Options:
- Disconnect VPN, run ATP, reconnect after
- Ask your network admin to whitelist `api.anthropic.com` port 443
- Use a split-tunnel VPN configuration

#### Fix D — API key issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ANTHROPIC_API_KEY not set` | Missing from `.env` | Add `ANTHROPIC_API_KEY=sk-ant-...` to `backend/.env` and restart |
| `invalid x-api-key` or 401 | Key is wrong or revoked | Generate a new key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| `quota exceeded` or 429 | Out of API credits | Check billing at [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing) |

#### Why Advanced Discovery works but Quick Discover fails

Advanced Discovery uses Playwright (a full Chromium browser) to visit your app before calling Claude. The browser has its own network stack and certificate handling separate from Node.js. Quick Discover calls the Anthropic SDK directly from Node.js, which is what gets blocked.

Adding `NODE_TLS_REJECT_UNAUTHORIZED=0` to `.env` fixes both.

#### Full reset — if nothing works

```bash
# Check your .env has the key and the fix
cat ~/atp/backend/.env

# Expected output includes:
# ANTHROPIC_API_KEY=sk-ant-...
# NODE_TLS_REJECT_UNAUTHORIZED=0

# Hard restart (kill everything and start fresh)
pkill -f "node.*server.js" 2>/dev/null
cd ~/atp/backend && npm run dev

# Test the API connection directly
curl http://localhost:3579/api/health/anthropic
```

---

## Local Data Files (all gitignored)

| File | Contents | Encrypted |
|------|----------|-----------|
| `backend/.vault.json` | Credentials and credential sets | ✅ AES-256-GCM |
| `backend/.results.json` | All test run results (last 500) | ❌ |
| `backend/.integrations.json` | Integration configs | ✅ AES-256-GCM |
| `backend/.git-config.json` | GitHub token, secret, tunnel URL | ✅ AES-256-GCM |

---

## Full API Reference

### Discovery
```
POST /api/discover                    Quick 7-case discovery
POST /api/discover/advanced           4-phase advanced discovery (SSE)
POST /api/scenario                    Generate scenario for one use case
POST /api/code-intelligence           DOM dead code scan (SSE)
```

### API Agent
```
POST /api/agent/import                Parse Swagger / OpenAPI / Postman
POST /api/agent/build                 AI build business scenarios
POST /api/agent/run                   Run one scenario (SSE)
POST /api/agent/run-all               Run all scenarios (SSE)
GET  /api/agent/results/:runId        Get API run results
```

### Vault
```
GET    /api/vault                     List (secrets masked)
GET    /api/vault/:id                 Get one (decrypted)
POST   /api/vault                     Create
PUT    /api/vault/:id                 Update
DELETE /api/vault/:id                 Delete
POST   /api/vault/sets                Create credential set
PUT    /api/vault/sets/:id            Update credential set
GET    /api/vault/:id/context         Resolve for test injection
GET    /api/vault/match?url=          Find credential matching URL
```

### Results
```
GET    /api/results                   List (filterable: status, type, url)
GET    /api/results/summary           Aggregate stats + flaky detection
GET    /api/results/trend             Pass rate trend for a test name
GET    /api/results/:id               Single run
POST   /api/results                   Save run
DELETE /api/results/:id               Delete run
DELETE /api/results                   Clear all
GET    /api/results/:id/analyse       AI failure analysis
POST   /api/results/analyse-suite     AI suite-level insight
GET    /api/results/export/junit      JUnit XML
GET    /api/results/export/allure     Allure JSON
GET    /api/results/export/summary    JSON summary
```

### Integrations
```
GET    /api/integrations              List all (secrets masked)
GET    /api/integrations/:id          Get one
POST   /api/integrations              Save
PUT    /api/integrations/:id          Update
DELETE /api/integrations/:id          Delete
POST   /api/integrations/:id/sync     Test + sync
POST   /api/integrations/:id/toggle   Enable / disable
GET    /api/integrations/context      Build full context for URL
POST   /api/integrations/test-data    Extract test data for use case
```

### Git / CI
```
POST /webhook/github                  GitHub webhook (HMAC verified)
GET  /api/git/config                  Config (secrets masked)
POST /api/git/config                  Save config
POST /api/git/tunnel/start            Start localtunnel
POST /api/git/tunnel/stop             Stop tunnel
GET  /api/git/tunnel/status           Status + URL
POST /api/git/verify-token            Verify GitHub token
GET  /api/git/repos                   List user's repos
GET  /api/git/runs                    PR run history
GET  /api/git/runs/:id                Single PR run detail
POST /api/git/trigger                 Manual CI loop trigger
```

### WebSocket Protocol

**Client → Server:**
```json
{ "type": "run_usecase", "useCase": {}, "url": "string", "credentials": {} }
{ "type": "run_suite",   "useCases": [], "url": "string", "credentials": {} }
{ "type": "stop" }
```

**Server → Client:**
```json
{ "type": "run_start",       "ucId": "string", "title": "string" }
{ "type": "actions_ready",   "count": 5 }
{ "type": "step_start",      "index": 0, "total": 5, "description": "string" }
{ "type": "step_done",       "index": 0, "status": "pass|fail", "screenshot": "base64",
                              "attempts": 1, "uncertain": false, "observation": "string" }
{ "type": "step_recovered",  "index": 0, "description": "string", "recoveryAction": "string" }
{ "type": "step_recheck",    "description": "string", "actuallySucceeded": true, "evidence": "string" }
{ "type": "page_analysis",   "analysis": { "pageType": "string", "forms": [], ... } }
{ "type": "form_analysis",   "analysis": { "formPurpose": "string", "fields": [], ... } }
{ "type": "assertion",       "passed": true, "assertion": "string" }
{ "type": "screenshot",      "data": "base64", "step": "string" }
{ "type": "run_complete",    "ucId": "string", "passed": 3, "failed": 0, "total": 3, "runId": "string" }
{ "type": "suite_start",     "total": 5 }
{ "type": "suite_complete",  "ran": [], "passed": 4, "failed": 1 }
{ "type": "log",             "level": "info|warn|error|ai|system|action", "msg": "string" }
```

---

## Feature Status

| Feature | Status |
|---------|--------|
| Quick AI discovery | ✅ |
| Advanced 4-phase autonomous discovery | ✅ |
| Browser automation via Playwright | ✅ |
| Stealth mode (bot detection bypass) | ✅ |
| Page intelligence (forms, tabs, wizards) | ✅ |
| Smart observer (AI vision wait) | ✅ |
| Universal popup / overlay AI handler | ✅ |
| Retry engine + deferred confirmation | ✅ |
| Adaptive recovery on failure | ✅ |
| API Automation Agent (Swagger/Postman) | ✅ |
| Credential Vault (AES-256-GCM) | ✅ |
| Credential Sets (multi-user) | ✅ |
| Results dashboard (multi-audience) | ✅ |
| AI failure analysis | ✅ |
| CI export (JUnit / Allure / JSON) | ✅ |
| Code Intelligence Scanner | ✅ |
| PR / Git CI loop | ✅ |
| One-click tunnel (localtunnel) | ✅ |
| Integrations (Jira, Confluence, DB, Notion, REST) | ✅ |
| Context injection into all prompts | ✅ |
| MCP Server (Claude Desktop) | 🟡 Built — needs Desktop config |
| Scheduled runs + Slack notifications | 🔜 |
| Visual regression (screenshot diff) | 🔜 |
| Cross-browser (Firefox, Safari) | 🔜 |
