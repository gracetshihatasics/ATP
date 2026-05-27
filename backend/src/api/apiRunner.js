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

    // Emit step start — show what variables this step needs
    const neededVars = findUsedVars(step);
    onEvent({
      type:"step_start", stepIndex:i, stepId:step.id,
      name:step.name, method:step.method, path:step.path,
      neededVars, totalSteps: scenario.steps.length,
    });

    try {
      // ── Execute step and WAIT for full response before continuing ──────────
      const result = await runStep(step, baseUrl, context);

      // ── Only after full response received — extract captures ───────────────
      const captures = [];
      if (step.captureFrom && result.responseBody) {
        for (const [varName, jsonPath] of Object.entries(step.captureFrom)) {
          const value = extractByJsonPath(result.responseBody, jsonPath);
          if (value !== undefined && value !== null) {
            context[varName] = value;
            const masked = isSensitiveKey(varName) ? "••••••••" : String(value).slice(0, 80);
            captures.push({ varName, jsonPath, value:masked, sensitive:isSensitiveKey(varName) });
            captureLog.push({ step:step.name, varName, jsonPath });
            onEvent({ type:"capture", stepId:step.id, varName, value:masked, jsonPath });
          } else {
            onEvent({ type:"capture_miss", stepId:step.id, varName, jsonPath,
              note:`Path "${jsonPath}" not found in response — next steps using {{${varName}}} may fail` });
          }
        }
      }

      const stepResult = {
        ...result,
        stepIndex:   i,
        captures,
        usedVars:    neededVars,
        captureFrom: step.captureFrom || {},
        dependsOn:   step.dependsOn || null,
      };

      stepResults.push(stepResult);
      onEvent({ type:"step_done", stepIndex:i, stepId:step.id, ...stepResult });

      // ── Only proceed to next step after this one is fully complete ─────────
      // (the await above ensures this — no parallelism)

    } catch (err) {
      const fail = {
        stepIndex:i, stepId:step.id, name:step.name,
        status:"error", error:err.message, assertions:[],
        method:step.method, path:step.path, captures:[],
      };
      stepResults.push(fail);
      onEvent({ type:"step_error", stepIndex:i, stepId:step.id, error:err.message, name:step.name });

      // Stop scenario execution on critical failure if step is required
      if (step.stopOnFailure !== false) {
        onEvent({ type:"log", msg:`⚠ Step ${i+1} failed — remaining ${scenario.steps.length - i - 1} step(s) skipped`, level:"warn" });
        break;
      }
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

const STEP_TIMEOUT_MS  = 30_000; // 30s per step
const MAX_RETRIES      = 2;      // retry network errors
const RETRY_DELAY_MS   = 1_000;

async function runStep(step, baseUrl, context) {
  // ── 1. Substitute all {{variables}} before making any call ───────────────
  const resolvedPath = substitute(step.path || "", context);
  const resolvedBody = step.body
    ? JSON.parse(substitute(JSON.stringify(step.body), context))
    : undefined;
  const resolvedHeaders = JSON.parse(substitute(
    JSON.stringify(step.headers ?? { "Content-Type": "application/json" }), context
  ));
  const resolvedParams = step.params
    ? Object.fromEntries(
        Object.entries(step.params).map(([k, v]) => [k, substitute(String(v), context)])
      )
    : {};
  const queryString = Object.keys(resolvedParams).length
    ? "?" + new URLSearchParams(resolvedParams).toString()
    : "";

  const fullUrl = `${baseUrl}${resolvedPath}${queryString}`;

  const fetchOptions = {
    method:  step.method,
    headers: resolvedHeaders,
  };
  if (resolvedBody && !["GET", "HEAD"].includes(step.method)) {
    fetchOptions.body = JSON.stringify(resolvedBody);
  }

  // ── 2. Execute with timeout + automatic retry on network error ────────────
  let response     = null;
  let responseText = null;
  let lastError    = null;
  const startTime  = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Brief pause before retry
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
    }

    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);

      // ── AWAIT the full response — do not proceed until complete ──────────
      response = await fetch(fullUrl, { ...fetchOptions, signal: controller.signal });

      // ── AWAIT the full response body before doing anything else ──────────
      responseText = await response.text();

      clearTimeout(timeoutId);
      lastError = null;
      break; // success — exit retry loop

    } catch (err) {
      lastError = err;
      const isRetryable = err.name === "AbortError"
        || err.message?.includes("ECONNRESET")
        || err.message?.includes("ECONNREFUSED")
        || err.message?.includes("ETIMEDOUT")
        || err.message?.includes("network");

      if (!isRetryable || attempt === MAX_RETRIES) {
        const msg = err.name === "AbortError"
          ? `Step timed out after ${STEP_TIMEOUT_MS / 1000}s — no response received`
          : `Network error on attempt ${attempt + 1}: ${err.message}`;
        throw new Error(msg);
      }
      // else: retry
    }
  }

  const duration = Date.now() - startTime;

  // ── 3. Parse response body — fully awaited above ──────────────────────────
  let responseBody = null;
  let parseError   = null;
  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch (e) {
    parseError  = `Response is not JSON: ${responseText?.slice(0, 100)}`;
    responseBody = { _raw: responseText?.slice(0, 500) };
  }

  // ── 4. Run assertions against the complete response ───────────────────────
  const assertionResults = runAssertions(step.assertions ?? [], response.status, responseBody, duration);
  const allPassed        = assertionResults.every(a => a.passed);

  return {
    stepId:          step.id,
    name:            step.name,
    method:          step.method,
    path:            resolvedPath,
    url:             fullUrl,
    statusCode:      response.status,
    duration,
    requestHeaders:  maskSensitive(resolvedHeaders),
    requestBody:     resolvedBody ? maskSensitive(resolvedBody) : null,
    requestParams:   resolvedParams,
    responseBody,
    responseHeaders: Object.fromEntries(
      [...response.headers.entries()].filter(([k]) => !isSensitiveKey(k))
    ),
    parseError:      parseError || null,
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
