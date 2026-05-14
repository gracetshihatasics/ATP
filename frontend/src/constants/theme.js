export const PRIORITY_COLORS = {
  Critical: { bg: "#1a0a0a", border: "#ff3b3b", text: "#ff6b6b" },
  High:     { bg: "#1a0f00", border: "#ff8c00", text: "#ffaa44" },
  Medium:   { bg: "#0a1200", border: "#4caf50", text: "#7ec87f" },
  Low:      { bg: "#0a0a1a", border: "#5b8dee", text: "#8ab4f8" },
};

export const CATEGORY_ICONS = {
  Authentication:    "🔐",
  "Core Workflow":   "⚡",
  "Data Management": "🗄️",
  Integration:       "🔗",
  "Edge Case":       "🎯",
};

export const METHOD_COLORS = {
  GET:    { bg: "#0a2010", border: "#1a7a3a", text: "#4caf50" },
  POST:   { bg: "#0a1520", border: "#1a4a8a", text: "#4d9de0" },
  PUT:    { bg: "#1a1000", border: "#8a6a00", text: "#f0c040" },
  DELETE: { bg: "#1a0808", border: "#8a1a1a", text: "#e05050" },
  PATCH:  { bg: "#0a1020", border: "#2a4a7a", text: "#5a8aaa" },
};

export const LOG_COLORS = {
  error:   "#ff6b6b",
  success: "#7ec87f",
  warn:    "#ffaa44",
  ai:      "#c8a0f0",
  action:  "#7ec8ff",
  system:  "#4a7fa5",
  info:    "#8ab4c8",
};

export const LOG_ICONS = {
  error:   "✗",
  success: "✓",
  warn:    "⚠",
  ai:      "◈",
  action:  "→",
  default: "›",
};

/** Global CSS injected once at app root. */
export const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&display=swap');
* { box-sizing: border-box; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: #0d1117; }
::-webkit-scrollbar-thumb { background: #1e3a5f; border-radius: 2px; }
input, button { font-family: inherit; }

.uc-card { border: 0.5px solid #1e3a5f; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; background: #0d1520; }
.uc-card:hover { border-color: #2d6aad; background: #0f1c2e; transform: translateX(2px); }
.uc-card.sel  { border-color: #4d9de0; background: #0f1f35; }

.pill { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 3px; letter-spacing: 0.07em; text-transform: uppercase; }

.tab { background: none; border: none; color: #4a7fa5; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 11px; padding: 6px 12px; border-bottom: 2px solid transparent; letter-spacing: 0.05em; transition: all 0.15s; white-space: nowrap; }
.tab.on  { color: #7ec8ff; border-bottom-color: #4d9de0; }
.tab:hover:not(.on) { color: #8ab4d4; }

.fb { background: none; border: 0.5px solid #1e3a5f; border-radius: 4px; color: #4a7fa5; cursor: pointer; font-size: 10px; padding: 3px 8px; font-family: inherit; transition: all 0.1s; }
.fb.on { background: #1a3050; border-color: #4d9de0; color: #7ec8ff; }
.fb:hover:not(.on) { border-color: #2d6aad; color: #6ab0e0; }

.nb { background: none; border: 0.5px solid #1e3a5f; border-radius: 5px; color: #4a7fa5; cursor: pointer; font-size: 11px; padding: 5px 12px; font-family: inherit; transition: all 0.15s; letter-spacing: 0.04em; }
.nb.on { background: #1a3050; border-color: #4d9de0; color: #7ec8ff; }
.nb:hover:not(.on) { border-color: #2d6aad; color: #6ab0e0; }

.rb { background: linear-gradient(135deg, #0a3a20, #062a16); border: 0.5px solid #4caf50; border-radius: 5px; color: #7ec87f; cursor: pointer; font-family: inherit; font-size: 11px; font-weight: 600; padding: 5px 12px; letter-spacing: 0.06em; transition: all 0.15s; }
.rb:hover { box-shadow: 0 0 10px #4caf5040; }
.rb:disabled { opacity: 0.4; cursor: default; }

.sb { background: none; border: 0.5px solid #3a1a1a; border-radius: 5px; color: #ff6b6b; cursor: pointer; font-size: 11px; padding: 5px 10px; font-family: inherit; }

.disc { background: linear-gradient(135deg, #1a4a8a, #0d2a5a); border: 0.5px solid #4d9de0; border-radius: 6px; color: #7ec8ff; cursor: pointer; font-family: inherit; font-size: 13px; font-weight: 600; padding: 10px 0; letter-spacing: 0.08em; transition: all 0.2s; width: 100%; }
.disc:hover:not(:disabled) { box-shadow: 0 0 20px #1a4a8a80; }
.disc:disabled { opacity: 0.5; cursor: default; }

.srow { display: flex; align-items: center; gap: 8px; padding: 5px 12px; border-bottom: 0.5px solid #0d1a2a; font-size: 10px; cursor: pointer; transition: background 0.1s; }
.srow:hover { background: #0d1a2a; }

.ov { position: fixed; inset: 0; background: rgba(0,0,0,0.88); z-index: 1000; display: flex; align-items: center; justify-content: center; cursor: pointer; }

@keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
@keyframes fadeIn  { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:translateY(0)} }
.fi { animation: fadeIn 0.15s ease; }
`;
