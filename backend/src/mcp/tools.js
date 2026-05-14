/**
 * All MCP tool definitions for the Autonomous Test Platform.
 * Each entry maps directly to a tool Claude can call.
 */
export const ATP_TOOLS = [
  {
    name: "discover_usecases",
    description: "Analyse a web application URL and autonomously discover all test use cases, API endpoints, and suggested test suites. Returns a full structured test plan.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL of the application to analyse (e.g. https://asics.com)",
        },
        username: {
          type: "string",
          description: "Optional login username/email if the app requires authentication",
        },
        password: {
          type: "string",
          description: "Optional login password if the app requires authentication",
        },
      },
      required: ["url"],
    },
  },

  {
    name: "run_usecase",
    description: "Execute a single test use case in a headless browser. Navigates to the URL, performs all steps via AI-generated Playwright actions, captures screenshots at each step, and runs assertions. Returns pass/fail results with screenshot data.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The application URL to test",
        },
        useCase: {
          type: "object",
          description: "The use case object from discover_usecases (must include id, title, steps, assertions)",
          properties: {
            id:          { type: "string" },
            title:       { type: "string" },
            steps:       { type: "array", items: { type: "string" } },
            assertions:  { type: "array", items: { type: "string" } },
            requiresAuth:{ type: "boolean" },
          },
          required: ["id", "title", "steps"],
        },
        credentials: {
          type: "object",
          description: "Optional login credentials",
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          },
        },
      },
      required: ["url", "useCase"],
    },
  },

  {
    name: "run_suite",
    description: "Execute multiple use cases sequentially as a test suite. Returns aggregated results for all use cases including pass/fail counts and screenshots.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The application URL to test",
        },
        useCases: {
          type: "array",
          description: "Array of use case objects to run in sequence",
          items: {
            type: "object",
            properties: {
              id:         { type: "string" },
              title:      { type: "string" },
              steps:      { type: "array", items: { type: "string" } },
              assertions: { type: "array", items: { type: "string" } },
            },
            required: ["id", "title", "steps"],
          },
        },
        credentials: {
          type: "object",
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          },
        },
      },
      required: ["url", "useCases"],
    },
  },

  {
    name: "get_test_plan",
    description: "Retrieve a previously discovered test plan by URL. Returns null if the URL has not been analysed yet.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL whose test plan to retrieve",
        },
      },
      required: ["url"],
    },
  },

  {
    name: "get_run_results",
    description: "Get the results of a completed test run including step-by-step pass/fail status, assertion results, and screenshot URLs.",
    input_schema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "The run ID returned by run_usecase or run_suite",
        },
      },
      required: ["runId"],
    },
  },

  {
    name: "update_tests_from_diff",
    description: "Given a Git diff (pull request changes), analyse which test cases are affected and update or regenerate them automatically. Use this when a PR is opened or merged.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The application URL the tests belong to",
        },
        diff: {
          type: "string",
          description: "The raw git diff string from the pull request",
        },
        affectedFiles: {
          type: "array",
          items: { type: "string" },
          description: "List of changed file paths from the PR",
        },
      },
      required: ["url", "diff"],
    },
  },
];
