/**
 * Executes API test scenarios step by step.
 * Handles data chaining via {{variable}} substitution between steps.
 * Emits full request/response details for each step.
 */

const SENSITIVE_KEYS = ["password","secret","token","apikey","api_key","authorization","x-api-key","bearer","auth","credential","key"];

function isSensitiveKey(k) {
  const lower = k.toLowerCase();
  return SENSITIVE_KEYS.some(s => lower.includes(s));
}

function maskSensitive(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = isSensitiveKey(k) ? "••••••••" : (typeof v === "object" ? maskSensitive(v) : v);
  }
  return out;
}

export async function runScenario(scenario, baseUrl, credentials = {}, onEvent = () => {}) {
  const context = {
    username: credentials.username ?? "",
    password: credentials.password ?? "",
    ...Object.fromEntries(
      Object.entries(credentials).filter(([k]) => !["username","password"].includes(k))
    ),
  };

  const stepResults = [];
  const captureLog  = []; // track all captures across the run

  onEvent({ type:"scenario_start", scenarioId:scenario.id, name:scenario.name });

  for (let i = 0; i < (scenario.steps ?? []).length; i++) {
    const step = scenario.steps[i];
    onEvent({ type:"step_start", stepIndex:i, stepId:step.id, name:step.name, method:step.method, path:step.path });

    try {
      const result = await runStep(step, baseUrl, context);

      // Capture values from response into context for next steps
      const captures = [];
      if (step.captureFrom && result.responseBody) {
        for (const [varName, jsonPath] of Object.entries(step.captureFrom)) {
          const value = extractByJsonPath(result.responseBody, jsonPath);
          if (value !== undefined) {
            context[varName] = value;
            const masked = isSensitiveKey(varName) ? "••••••••" : String(value).slice(0,80);
            captures.push({ varName, jsonPath, value: masked, sensitive: isSensitiveKey(varName) });
            captureLog.push({ step: step.name, varName, jsonPath });
            onEvent({ type:"capture", stepId:step.id, varName, value:masked, jsonPath });
          }
        }
      }

      const stepResult = {
        ...result,
        stepIndex:   i,
        captures,
        usedVars:    findUsedVars(step),
        captureFrom: step.captureFrom || {},
        dependsOn:   step.dependsOn || null,
      };

      stepResults.push(stepResult);
      onEvent({ type:"step_done", stepIndex:i, stepId:step.id, ...stepResult });

    } catch (err) {
      const fail = {
        stepIndex: i, stepId:step.id, name:step.name,
        status:"error", error:err.message, assertions:[],
        method:step.method, path:step.path, captures:[],
      };
      stepResults.push(fail);
      onEvent({ type:"step_error", stepIndex:i, stepId:step.id, error:err.message, name:step.name });
    }
  }

  const passed = stepResults.filter(s => s.status==="pass").length;
  const failed = stepResults.filter(s => s.status!=="pass").length;
  const totalDuration = stepResults.reduce((s,r) => s+(r.duration||0), 0);

  const result = {
    scenarioId:  scenario.id,
    name:        scenario.name,
    description: scenario.description,
    status:      failed===0 ? "pass" : "fail",
    passed, failed,
    total:       stepResults.length,
    duration:    totalDuration,
    steps:       stepResults,
    captureLog,
    completedAt: new Date().toISOString(),
  };

  onEvent({ type:"scenario_done", ...result });
  return result;
}

async function runStep(step, baseUrl, context) {
  const path    = substitute(step.path || "", context);
  const rawBody = step.body ? JSON.parse(substitute(JSON.stringify(step.body), context)) : undefined;
  const rawHeaders = JSON.parse(substitute(
    JSON.stringify(step.headers ?? { "Content-Type":"application/json" }), context
  ));
  const params = step.params
    ? new URLSearchParams(Object.fromEntries(
        Object.entries(step.params).map(([k,v]) => [k, substitute(String(v), context)])
      )).toString()
    : "";

  const fullUrl = `${baseUrl}${path}${params ? `?${params}` : ""}`;

  const fetchOptions = { method:step.method, headers:rawHeaders };
  if (rawBody && !["GET","HEAD"].includes(step.method)) {
    fetchOptions.body = JSON.stringify(rawBody);
  }

  const startTime = Date.now();
  let response, responseText;
  try {
    response     = await fetch(fullUrl, fetchOptions);
    responseText = await response.text();
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }
  const duration = Date.now() - startTime;

  let responseBody = null;
  try { responseBody = responseText ? JSON.parse(responseText) : null; } catch {}

  const assertionResults = runAssertions(step.assertions ?? [], response.status, responseBody, duration);
  const allPassed = assertionResults.every(a => a.passed);

  // Mask sensitive headers/body for display
  const safeHeaders  = maskSensitive(rawHeaders);
  const safeReqBody  = rawBody ? maskSensitive(rawBody) : null;
  const safeRespBody = responseBody;

  return {
    stepId:          step.id,
    name:            step.name,
    method:          step.method,
    path,
    url:             fullUrl,
    statusCode:      response.status,
    duration,
    // Request details (safe for display)
    requestHeaders:  safeHeaders,
    requestBody:     safeReqBody,
    requestParams:   step.params || {},
    // Response details
    responseBody:    safeRespBody,
    responseHeaders: Object.fromEntries([...response.headers.entries()].filter(([k])=>!isSensitiveKey(k))),
    responseText:    responseText?.slice(0, 2000),
    status:          allPassed ? "pass" : "fail",
    assertions:      assertionResults,
  };
}

function runAssertions(assertions, statusCode, body, duration) {
  return assertions.map(a => {
    try {
      switch (a.type) {
        case "status":
          return { ...a, passed: statusCode===a.expected, actual:statusCode,
            message: statusCode===a.expected ? null : `Expected ${a.expected}, got ${statusCode}` };
        case "jsonpath": {
          const value = extractByJsonPath(body, a.path);
          const exists = value !== undefined && value !== null;
          let passed;
          if (a.exists !== undefined) passed = exists === a.exists;
          else if (a.expected !== undefined) passed = value == a.expected;
          else if (a.contains !== undefined) passed = String(value||"").includes(a.contains);
          else passed = exists;
          return { ...a, passed, actual:value, message:passed?null:`Path ${a.path}: expected ${a.expected??a.exists??"exists"}, got ${value}` };
        }
        case "schema": {
          const value = body?.[a.field];
          const passed = typeof value === a.dataType;
          return { ...a, passed, actual:typeof value, message:passed?null:`Field "${a.field}" is ${typeof value}, expected ${a.dataType}` };
        }
        case "duration":
          return { ...a, passed:duration<=a.max, actual:duration, message:duration<=a.max?null:`Took ${duration}ms, limit is ${a.max}ms` };
        case "header": {
          const val = body?.headers?.[a.name] || "";
          const passed = a.contains ? val.includes(a.contains) : !!val;
          return { ...a, passed, actual:val };
        }
        case "not_empty": {
          const value = extractByJsonPath(body, a.path);
          const passed = value!==null && value!==undefined && value!=="" && !(Array.isArray(value)&&value.length===0);
          return { ...a, passed, actual:value, message:passed?null:`Path ${a.path} is empty` };
        }
        default:
          return { ...a, passed:true, note:"unknown type — skipped" };
      }
    } catch (err) {
      return { ...a, passed:false, error:err.message };
    }
  });
}

function findUsedVars(step) {
  const str = JSON.stringify({ path:step.path, headers:step.headers, body:step.body, params:step.params });
  const matches = str.matchAll(/\{\{(\w+)\}\}/g);
  return [...new Set([...matches].map(m => m[1]))].filter(v => !["username","password"].includes(v));
}

function extractByJsonPath(obj, path) {
  if (!obj || !path) return undefined;
  const clean = path.replace(/^\$\.?/, "");
  if (!clean) return obj;
  let current = obj;
  for (const part of clean.split(/\.|\[(\d+)\]/).filter(Boolean)) {
    if (current===null||current===undefined) return undefined;
    const idx = parseInt(part);
    current = isNaN(idx) ? current[part] : current[idx];
  }
  return current;
}

function substitute(str, context) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = context[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

function sanitiseContext(context) {
  const safe = { ...context };
  for (const key of Object.keys(safe)) {
    if (/password|secret|token|apikey|api_key|auth|bearer/i.test(key)) delete safe[key];
  }
  return safe;
}
