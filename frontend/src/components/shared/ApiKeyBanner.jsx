/**
 * Shows a prominent banner when the Anthropic API key is missing,
 * revoked, quota-exceeded, or unreachable.
 * Sits just below the header — visible on every page.
 */

const STATUS_CONFIG = {
  "no-key": {
    color:  "#ff3b3b",
    bg:     "#1a0808",
    border: "#ff3b3b",
    icon:   "🔑",
    title:  "API key not configured",
    msg:    "Add ANTHROPIC_API_KEY to backend/.env and restart the backend.",
    action: "Get a key at console.anthropic.com → API Keys",
    link:   "https://console.anthropic.com/settings/keys",
  },
  "invalid-key": {
    color:  "#ff3b3b",
    bg:     "#1a0808",
    border: "#ff3b3b",
    icon:   "❌",
    title:  "API key is invalid or revoked",
    msg:    "Your ANTHROPIC_API_KEY in backend/.env is no longer valid.",
    action: "Generate a new key at console.anthropic.com → API Keys",
    link:   "https://console.anthropic.com/settings/keys",
  },
  "quota": {
    color:  "#ff8c00",
    bg:     "#1a0f00",
    border: "#ff8c00",
    icon:   "💳",
    title:  "API quota exceeded or billing issue",
    msg:    "Your Anthropic account has run out of credits or has a billing problem.",
    action: "Check billing at console.anthropic.com → Billing",
    link:   "https://console.anthropic.com/settings/billing",
  },
  "network": {
    color:  "#f0c040",
    bg:     "#1a1500",
    border: "#f0c040",
    icon:   "📡",
    title:  "Cannot reach Anthropic API",
    msg:    "ATP cannot connect to api.anthropic.com — check your internet connection.",
    action: null,
    link:   null,
  },
  "unknown": {
    color:  "#f0c040",
    bg:     "#1a1500",
    border: "#f0c040",
    icon:   "⚠️",
    title:  "Anthropic API error",
    msg:    null, // uses error directly
    action: "Check backend terminal for details",
    link:   null,
  },
};

export function ApiKeyBanner({ apiHealth, onRecheck }) {
  const { status, error, detail, checking } = apiHealth;

  if (!status || status === "ok" || status === "checking") return null;
  if (status === "network" && !error) return null;

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;

  return (
    <div style={{
      background: cfg.bg,
      borderBottom: `1px solid ${cfg.border}`,
      padding: "10px 18px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{cfg.icon}</span>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: cfg.color, marginBottom: 2 }}>
          {cfg.title}
        </div>
        <div style={{ fontSize: 10, color: "#a08070" }}>
          {cfg.msg || error}
          {status === "unknown" && error ? ` — ${error}` : ""}
          {detail ? <span style={{ color:"#6a5a50" }}> ({detail})</span> : null}
          {status === "unknown" && error && ` — ${error}`}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {cfg.link && (
          <a href={cfg.link} target="_blank" rel="noreferrer"
            style={{ fontSize: 10, color: cfg.color, textDecoration: "none", border: `0.5px solid ${cfg.border}`, borderRadius: 5, padding: "5px 12px" }}>
            {cfg.action} →
          </a>
        )}
        {!cfg.link && cfg.action && (
          <span style={{ fontSize: 10, color: "#4a7fa5" }}>{cfg.action}</span>
        )}
        <button onClick={onRecheck} disabled={checking}
          style={{ background: "none", border: `0.5px solid ${cfg.color}60`, borderRadius: 5, color: checking ? "#4a7fa5" : cfg.color, cursor: checking ? "default" : "pointer", fontSize: 10, padding: "5px 12px", fontFamily: "inherit" }}>
          {checking ? "Checking..." : "↻ Retry"}
        </button>
      </div>
    </div>
  );
}
