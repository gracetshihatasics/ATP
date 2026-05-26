import { useState, useEffect, useCallback } from "react";

const BACKEND = "http://localhost:3579";

export function useApiHealth() {
  const [status,   setStatus]   = useState("checking");
  const [model,    setModel]    = useState(null);
  const [error,    setError]    = useState(null);
  const [detail,   setDetail]   = useState(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${BACKEND}/api/health/anthropic`, {
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        setStatus("network");
        setError(`Backend returned HTTP ${res.status}`);
        setChecking(false);
        return;
      }

      const data = await res.json();
      setModel(data.model || null);

      if (data.ok) {
        setStatus("ok");
        setError(null);
        setDetail(null);
      } else {
        const type = data.errorType || classifyError(data.error || "");
        setStatus(type === "model-error" ? "unknown" : type);
        setError(data.error || "Unknown API error");
        setDetail(data.detail || null);
      }
    } catch {
      // fetch failed — backend probably still starting, stay quiet
      setStatus("checking");
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      check();
      const iv = setInterval(check, 90_000);
      return () => clearInterval(iv);
    }, 2000);
    return () => clearTimeout(t);
  }, [check]);

  return { status, model, error, detail, checking, recheck: check };
}

function classifyError(msg) {
  if (!msg) return "unknown";
  const m = msg.toLowerCase();
  if (m.includes("not set") || m.includes("not configured"))           return "no-key";
  if (m.includes("401") || m.includes("authentication")
    || m.includes("invalid x-api-key") || m.includes("invalid_api_key")) return "invalid-key";
  if (m.includes("403") || m.includes("permission"))                   return "invalid-key";
  if (m.includes("429") || m.includes("quota")
    || m.includes("credit") || m.includes("billing"))                  return "quota";
  if (m.includes("model") || m.includes("not_found"))                  return "unknown";
  return "network";
}
