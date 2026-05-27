/**
 * ATP Centralised Error Handling
 *
 * One place that:
 * - Classifies errors by type (network, auth, not-found, validation, etc.)
 * - Picks the right HTTP status code
 * - Logs consistently with context
 * - Returns a structured, human-readable response to the client
 * - Never leaks stack traces to clients in production
 */

// ── Error types ───────────────────────────────────────────────────────────────
export const ErrorType = {
  VALIDATION:    "validation",    // bad input from caller
  NOT_FOUND:     "not_found",     // resource doesn't exist
  AUTH:          "auth",          // missing/invalid credentials
  FORBIDDEN:     "forbidden",     // authenticated but not allowed
  NETWORK:       "network",       // can't reach external service
  TIMEOUT:       "timeout",       // external call timed out
  RATE_LIMIT:    "rate_limit",    // too many requests
  EXTERNAL:      "external",      // third-party API error
  INTERNAL:      "internal",      // unexpected server error
  PARSE:         "parse",         // JSON/response parse failure
  CONFIG:        "config",        // missing env var / bad config
};

// ── HTTP status map ───────────────────────────────────────────────────────────
const STATUS_MAP = {
  [ErrorType.VALIDATION]:  400,
  [ErrorType.NOT_FOUND]:   404,
  [ErrorType.AUTH]:        401,
  [ErrorType.FORBIDDEN]:   403,
  [ErrorType.RATE_LIMIT]:  429,
  [ErrorType.NETWORK]:     502,
  [ErrorType.TIMEOUT]:     504,
  [ErrorType.EXTERNAL]:    502,
  [ErrorType.INTERNAL]:    500,
  [ErrorType.PARSE]:       502,
  [ErrorType.CONFIG]:      500,
};

// ── Structured error class ────────────────────────────────────────────────────
export class ATPError extends Error {
  constructor(message, type = ErrorType.INTERNAL, { context, cause, hint } = {}) {
    super(message);
    this.name    = "ATPError";
    this.type    = type;
    this.context = context || null; // e.g. { integrationId, url }
    this.cause   = cause   || null; // original error
    this.hint    = hint    || null; // actionable hint for the user
  }
}

// ── Classify any error into an ATPError ──────────────────────────────────────
export function classifyError(err, context = {}) {
  if (err instanceof ATPError) return err;

  const msg = (err.message || "").toLowerCase();
  const status = err.status || err.statusCode || err.response?.status;

  // Network / connection
  if (msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("connection refused")) {
    return new ATPError(`Cannot connect to ${context.service || "external service"}: ${err.message}`, ErrorType.NETWORK, {
      cause: err, context,
      hint: "Check the service URL and that the service is running",
    });
  }
  if (msg.includes("timeout") || msg.includes("etimedout") || msg.includes("timed out")) {
    return new ATPError(`Request to ${context.service || "external service"} timed out`, ErrorType.TIMEOUT, {
      cause: err, context,
      hint: "The service may be slow or unreachable",
    });
  }
  if (msg.includes("connection error") || msg.includes("fetch failed") || msg.includes("network")) {
    return new ATPError(`Network error reaching ${context.service || "external service"}`, ErrorType.NETWORK, {
      cause: err, context,
      hint: "Check internet connection and TLS settings (NODE_TLS_REJECT_UNAUTHORIZED)",
    });
  }

  // Auth
  if (status === 401 || msg.includes("unauthorized") || msg.includes("invalid api key") || msg.includes("authentication")) {
    return new ATPError(`Authentication failed for ${context.service || "service"}`, ErrorType.AUTH, {
      cause: err, context,
      hint: "Check your API key or credentials in Settings → Vault",
    });
  }
  if (status === 403 || msg.includes("forbidden") || msg.includes("permission denied")) {
    return new ATPError(`Access denied to ${context.resource || "resource"}`, ErrorType.FORBIDDEN, {
      cause: err, context,
      hint: "Your API key may not have the required permissions",
    });
  }

  // Rate limiting
  if (status === 429 || msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("quota")) {
    return new ATPError(`Rate limit exceeded for ${context.service || "service"}`, ErrorType.RATE_LIMIT, {
      cause: err, context,
      hint: "Wait a moment and try again, or check your plan limits",
    });
  }

  // Not found
  if (status === 404 || msg.includes("not found") || msg.includes("does not exist")) {
    return new ATPError(`${context.resource || "Resource"} not found`, ErrorType.NOT_FOUND, {
      cause: err, context,
    });
  }

  // Parse errors
  if (msg.includes("json") || msg.includes("parse") || msg.includes("unexpected token") || msg.includes("syntax")) {
    return new ATPError(`Could not parse response from ${context.service || "service"}`, ErrorType.PARSE, {
      cause: err, context,
      hint: "The service may have returned an unexpected format",
    });
  }

  // Config / setup
  if (msg.includes("api key") || msg.includes("not set") || msg.includes("not configured") || msg.includes("missing")) {
    return new ATPError(err.message, ErrorType.CONFIG, {
      cause: err, context,
      hint: "Check your .env file and Settings",
    });
  }

  // External service error (4xx/5xx we didn't handle above)
  if (status >= 400 && status < 600) {
    return new ATPError(`${context.service || "External service"} returned ${status}`, ErrorType.EXTERNAL, {
      cause: err, context,
    });
  }

  // Unknown
  return new ATPError(err.message || "An unexpected error occurred", ErrorType.INTERNAL, {
    cause: err, context,
  });
}

// ── Format error for API response ─────────────────────────────────────────────
export function formatError(err, context = {}) {
  const atp    = err instanceof ATPError ? err : classifyError(err, context);
  const status = STATUS_MAP[atp.type] || 500;
  const isDev  = process.env.NODE_ENV !== "production";

  const body = {
    ok:      false,
    error:   atp.message,
    type:    atp.type,
    ...(atp.hint    ? { hint:    atp.hint }    : {}),
    ...(atp.context ? { context: atp.context } : {}),
    // Only include stack in dev
    ...(isDev && atp.cause?.stack ? { stack: atp.cause.stack.split("\n").slice(0,5) } : {}),
  };

  return { status, body };
}

// ── Central logger ─────────────────────────────────────────────────────────────
export function logError(err, context = {}) {
  const atp  = err instanceof ATPError ? err : classifyError(err, context);
  const tag  = context.route ? `[${context.route}]` : "[ATP]";
  const icon = atp.type === ErrorType.INTERNAL ? "🔴" :
               atp.type === ErrorType.NETWORK   ? "📡" :
               atp.type === ErrorType.AUTH       ? "🔑" :
               atp.type === ErrorType.TIMEOUT    ? "⏱" :
               atp.type === ErrorType.RATE_LIMIT ? "🚦" : "⚠️";

  console.error(`${icon} ${tag} ${atp.type.toUpperCase()}: ${atp.message}`);
  if (atp.context && Object.keys(atp.context).length) {
    console.error(`   context:`, atp.context);
  }
  if (atp.hint) {
    console.error(`   hint: ${atp.hint}`);
  }
  if (atp.cause && atp.type === ErrorType.INTERNAL) {
    console.error(`   caused by:`, atp.cause.message);
  }
}

// ── Express route handler wrapper ─────────────────────────────────────────────
/**
 * Wraps an async route handler with consistent error handling.
 * Usage: app.get('/path', handle('route-name', async (req, res) => { ... }))
 */
export function handle(routeName, fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const context = { route: routeName, url: req.url, method: req.method };
      logError(err, context);
      const { status, body } = formatError(err, context);
      if (!res.headersSent) res.status(status).json(body);
    }
  };
}

// ── SSE error sender ──────────────────────────────────────────────────────────
export function sendSSEError(res, err, context = {}) {
  const atp = err instanceof ATPError ? err : classifyError(err, context);
  logError(atp, context);
  try {
    res.write(`data: ${JSON.stringify({
      type:    "error",
      error:   atp.message,
      errType: atp.type,
      hint:    atp.hint || null,
    })}\n\n`);
  } catch {}
}

// ── Validation helpers ────────────────────────────────────────────────────────
export function requireFields(obj, fields) {
  const missing = fields.filter(f => !obj[f]);
  if (missing.length) {
    throw new ATPError(
      `Missing required field(s): ${missing.join(", ")}`,
      ErrorType.VALIDATION,
      { context: { missing } }
    );
  }
}

export function requireEnv(name) {
  if (!process.env[name]) {
    throw new ATPError(
      `${name} is not set`,
      ErrorType.CONFIG,
      { hint: `Add ${name} to your backend/.env file` }
    );
  }
  return process.env[name];
}
