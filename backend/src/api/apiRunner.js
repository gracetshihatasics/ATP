/**
 * Executes API test scenarios step by step.
 * Handles data chaining via {{variable}} substitution between steps.
 */

/**
 * Run a full scenario.
 * @param {object} scenario
 * @param {string} baseUrl
 * @param {{ username?: string, password?: string }} credentials
 * @param {(event: object) => void} onEvent — streaming callback
 * @returns {Promise<ScenarioResult>}
 */
export async function runScenario(scenario, baseUrl, credentials = {}, onEvent = () => {}) {
  const context = {
    // Seed context with credentials so steps can reference {{username}} etc.
    username: credentials.username ?? "",
    password: credentials.password ?? "",
  };

  const stepResults = [];
  onEvent({ type: "scenario_start", scenarioId: scenario.id, name: scenario.name });

  for (const step of scenario.steps ?? []) {
    onEvent({ type: "step_start", stepId: step.id, name: step.name, method: step.method, path: step.path });

    try {
      const result = await runStep(step, baseUrl, context);
      stepResults.push(result);

      // Capture values from response into context for next steps
      if (step.captureFrom && result.body) {
        for (const [varName, jsonPath] of Object.entries(step.captureFrom)) {
          const value = extractByJsonPath(result.body, jsonPath);
          if (value !== undefined) {
            context[varName] = value;
            onEvent({ type: "capture", varName, value: typeof value === "string" ? value.slice(0, 50) : value });
          }
        }
      }

      onEvent({ type: "step_done", stepId: step.id, status: result.status, assertions: result.assertions });

    } catch (err) {
      const failResult = { stepId: step.id, name: step.name, status: "error", error: err.message, assertions: [] };
      stepResults.push(failResult);
      onEvent({ type: "step_error", stepId: step.id, error: err.message });
    }
  }

  const passed = stepResults.filter(s => s.status === "pass").length;
  const failed = stepResults.filter(s => s.status !== "pass").length;

  const result = {
    scenarioId: scenario.id,
    name:       scenario.name,
    status:     failed === 0 ? "pass" : "fail",
    passed,
    failed,
    total:      stepResults.length,
    steps:      stepResults,
    context:    sanitiseContext(context),
    completedAt: new Date().toISOString(),
  };

  onEvent({ type: "scenario_done", ...result });
  return result;
}

/**
 * Run a single step — substitute variables, make HTTP request, validate assertions.
 */
async function runStep(step, baseUrl, context) {
  // Substitute {{variable}} placeholders in path, body, headers
  const path    = substitute(step.path, context);
  const body    = step.body ? JSON.parse(substitute(JSON.stringify(step.body), context)) : undefined;
  const headers = substitute(JSON.stringify(step.headers ?? { "Content-Type": "application/json" }), context);
  const parsedHeaders = JSON.parse(headers);

  // Build query string from params
  const params = step.params ? new URLSearchParams(
    Object.fromEntries(
      Object.entries(step.params).map(([k, v]) => [k, substitute(String(v), context)])
    )
  ).toString() : "";

  const fullUrl = `${baseUrl}${path}${params ? `?${params}` : ""}`;

  const fetchOptions = {
    method:  step.method,
    headers: parsedHeaders,
  };

  if (body && !["GET","HEAD"].includes(step.method)) {
    fetchOptions.body = JSON.stringify(body);
  }

  const startTime = Date.now();
  const response  = await fetch(fullUrl, fetchOptions);
  const duration  = Date.now() - startTime;

  let responseBody = null;
  try {
    const text = await response.text();
    responseBody = text ? JSON.parse(text) : null;
  } catch {
    responseBody = null;
  }

  // Run assertions
  const assertionResults = runAssertions(step.assertions ?? [], response.status, responseBody);
  const allPassed = assertionResults.every(a => a.passed);

  return {
    stepId:     step.id,
    name:       step.name,
    method:     step.method,
    url:        fullUrl,
    statusCode: response.status,
    duration,
    body:       responseBody,
    status:     allPassed ? "pass" : "fail",
    assertions: assertionResults,
  };
}

/**
 * Validate a list of assertions against the response.
 */
function runAssertions(assertions, statusCode, body) {
  return assertions.map(assertion => {
    try {
      switch (assertion.type) {
        case "status":
          return {
            ...assertion,
            passed:  statusCode === assertion.expected,
            actual:  statusCode,
          };

        case "jsonpath": {
          const value = extractByJsonPath(body, assertion.path);
          const exists = value !== undefined && value !== null;
          if (assertion.exists !== undefined) {
            return { ...assertion, passed: exists === assertion.exists, actual: value };
          }
          if (assertion.expected !== undefined) {
            return { ...assertion, passed: value == assertion.expected, actual: value };
          }
          return { ...assertion, passed: exists, actual: value };
        }

        case "schema": {
          const value = body?.[assertion.field];
          const passed = typeof value === assertion.dataType;
          return { ...assertion, passed, actual: typeof value };
        }

        case "contains": {
          const bodyStr = JSON.stringify(body ?? "");
          return { ...assertion, passed: bodyStr.includes(assertion.value), actual: bodyStr.slice(0, 100) };
        }

        case "not_empty": {
          const value = extractByJsonPath(body, assertion.path);
          const passed = value !== null && value !== undefined && value !== "" &&
            !(Array.isArray(value) && value.length === 0);
          return { ...assertion, passed, actual: value };
        }

        default:
          return { ...assertion, passed: true, note: "unknown assertion type — skipped" };
      }
    } catch (err) {
      return { ...assertion, passed: false, error: err.message };
    }
  });
}

/**
 * Extract a value from an object using a simple dot-notation or JSONPath-lite.
 * Supports: $.field, $.nested.field, $.array[0].field
 */
function extractByJsonPath(obj, path) {
  if (!obj || !path) return undefined;
  // Strip leading $. 
  const clean = path.replace(/^\$\.?/, "");
  if (!clean) return obj;

  const parts = clean.split(/\.|\[(\d+)\]/).filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const index = parseInt(part);
    current = isNaN(index) ? current[part] : current[index];
  }
  return current;
}

/**
 * Substitute {{variable}} placeholders in a string using the context map.
 */
function substitute(str, context) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = context[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

/**
 * Remove sensitive values from context before returning to client.
 */
function sanitiseContext(context) {
  const safe = { ...context };
  for (const key of ["password", "secret", "apiSecret"]) delete safe[key];
  return safe;
}
