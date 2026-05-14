import { METHOD_COLORS } from "../../constants/theme.js";

export function EndpointList({ endpoints = [] }) {
  return (
    <div style={{ flex:1, overflowY:"auto", padding:"12px 16px" }}>
      {endpoints.map((ep, i) => {
        const c = METHOD_COLORS[ep.method] ?? METHOD_COLORS.GET;
        return (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderBottom:"0.5px solid #0d1a2a", fontSize:11 }}>
            <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:3, background:c.bg, border:`0.5px solid ${c.border}`, color:c.text, minWidth:44, textAlign:"center" }}>
              {ep.method}
            </span>
            <span style={{ color:"#a0d0e8", fontWeight:500, flex:1 }}>{ep.path}</span>
            <span style={{ color:"#4a7fa5", fontSize:10 }}>{ep.purpose}</span>
          </div>
        );
      })}
    </div>
  );
}
