/**
 * ATP MCP Tool definitions — all tools Claude can call.
 */
export const ATP_TOOLS = [
  {
    name: "discover_usecases",
    description: "Analyse a web application and autonomously discover all test use cases, features, API endpoints, and test suites. Use this before running tests on a new URL. Returns a full structured test plan with prioritised use cases.",
    input_schema: {
      type: "object",
      properties: {
        url:          { type: "string",  description: "Full URL of the application (e.g. https://asics.com)" },
        credentialId: { type: "string",  description: "Optional vault credential ID to use for authenticated discovery" },
        advanced:     { type: "boolean", description: "Use advanced 4-phase discovery (slower but finds more features). Default: false" },
      },
      required: ["url"],
    },
  },

  {
    name: "run_usecase",
    description: "Execute a single test use case in a real Chromium browser. Uses AI vision, smart waiting, retry engine, and form intelligence. Returns pass/fail with step details and screenshots.",
    input_schema: {
      type: "object",
      properties: {
        url:     { type: "string", description: "Application URL to test" },
        useCase: {
          type: "object",
          description: "Use case from discover_usecases",
          properties: {
            id:         { type: "string" },
            title:      { type: "string" },
            steps:      { type: "array", items: { type: "string" } },
            assertions: { type: "array", items: { type: "string" } },
          },
          required: ["id", "title", "steps"],
        },
        credentialId: { type: "string", description: "Optional vault credential ID for authentication" },
      },
      required: ["url", "useCase"],
    },
  },

  {
    name: "run_suite",
    description: "Execute multiple use cases sequentially as a test suite. Returns aggregated pass/fail results with AI suite-level insight.",
    input_schema: {
      type: "object",
      properties: {
        url:          { type: "string",  description: "Application URL to test" },
        useCases:     { type: "array",   description: "Array of use case objects", items: { type: "object" } },
        credentialId: { type: "string",  description: "Optional vault credential ID" },
        suiteFilter:  { type: "string",  description: "Optional: 'critical', 'high', 'auth', or a category name to filter use cases" },
      },
      required: ["url", "useCases"],
    },
  },

  {
    name: "get_results",
    description: "Get test results — recent runs, summary stats, or a specific run by ID. Use this to check what passed/failed.",
    input_schema: {
      type: "object",
      properties: {
        runId:  { type: "string",  description: "Specific run ID to retrieve (optional)" },
        limit:  { type: "number",  description: "Number of recent results to return (default 10)" },
        status: { type: "string",  description: "Filter by 'pass' or 'fail' (optional)" },
        url:    { type: "string",  description: "Filter by application URL (optional)" },
      },
    },
  },

  {
    name: "analyse_failure",
    description: "AI-powered failure analysis for a specific run. Returns root cause, category, severity, whether it is an app bug or flaky test, and recommended fixes.",
    input_schema: {
      type: "object",
      properties: {
        runId: { type: "string", description: "The run ID to analyse" },
      },
      required: ["runId"],
    },
  },

  {
    name: "list_credentials",
    description: "List all credentials and credential sets in the vault (secrets are masked). Use this to find the right credential ID for a test.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },

  {
    name: "get_context",
    description: "Build the full integration context for a URL — pulls data from all connected integrations (Jira, Confluence, DB, GitHub, etc.). Useful to understand what ATP knows before running tests.",
    input_schema: {
      type: "object",
      properties: {
        url:  { type: "string", description: "Application URL to build context for" },
        goal: { type: "string", description: "Optional testing goal to focus the context" },
      },
      required: ["url"],
    },
  },

  {
    name: "update_tests_from_diff",
    description: "Given a git diff, identify which tests are affected and update them. Use when a PR is merged or code changes.",
    input_schema: {
      type: "object",
      properties: {
        url:           { type: "string", description: "Application URL the tests belong to" },
        diff:          { type: "string", description: "Raw git diff string" },
        affectedFiles: { type: "array",  items: { type: "string" }, description: "Changed file paths" },
      },
      required: ["url", "diff"],
    },
  },

  {
    name: "scan_code_intelligence",
    description: "Scan a web page for hidden elements, dead code, disabled feature flags, and unreachable UI. Returns findings with severity and recommendations.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Page URL to scan" },
      },
      required: ["url"],
    },
  },
];
