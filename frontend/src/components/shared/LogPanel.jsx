import { LOG_COLORS, LOG_ICONS } from "../../constants/theme.js";

export function LogPanel({ log, logRef, isLoading, emptyText }) {
  return (
    <div ref={logRef} style={{ flex:1, overflowY:"auto", padding:"8px 14px" }}>
      {log.length === 0 && (
        <div style={{ fontSize:10, color:"#1e3a5f", textAlign:"center", marginTop:22, lineHeight:1.9 }}>
          {emptyText || "No log entries yet."}
        </div>
      )}
      {log.map((l, i) => (
        <div key={i} className="fi" style={{ fontSize:10, marginBottom:4, display:"flex", gap:6, color: LOG_COLORS[l.type || l.level] || LOG_COLORS.info }}>
          <span style={{ color:"#2d6aad", flexShrink:0 }}>
            {LOG_ICONS[l.type || l.level] || LOG_ICONS.default}
          </span>
          <span>{l.msg}</span>
        </div>
      ))}
      {isLoading && (
        <div style={{ display:"flex", gap:3, padding:"4px 0" }}>
          {[0, 0.2, 0.4].map((d, i) => (
            <div key={i} style={{ width:4, height:4, borderRadius:"50%", background:"#4d9de0", animation:`pulse 1s ${d}s infinite` }} />
          ))}
        </div>
      )}
    </div>
  );
}
