import { PRIORITY_COLORS } from "../../constants/theme.js";

export function UseCaseDetail({ useCase, scenario, scenLoading, onRun }) {
  if (!useCase) {
    return (
      <div style={{ textAlign:"center", marginTop:60, color:"#2d6aad", fontSize:11 }}>
        ← Select a use case · click ▶ to run in browser
      </div>
    );
  }

  const pc = PRIORITY_COLORS[useCase.priority] ?? PRIORITY_COLORS.Medium;

  return (
    <div className="fi">
      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ display:"flex", gap:7, alignItems:"center" }}>
          <span style={{ fontSize:9, color:"#2d6aad" }}>{useCase.id}</span>
          <span className="pill" style={{ background:pc.bg, border:`0.5px solid ${pc.border}`, color:pc.text }}>{useCase.priority}</span>
          <span style={{ fontSize:9, color:"#4a7fa5" }}>{useCase.category}</span>
        </div>
        <button className="rb" onClick={() => onRun(useCase)}>▶ RUN IN BROWSER</button>
      </div>

      <div style={{ fontSize:14, fontWeight:600, color:"#e0f0ff", marginBottom:5, lineHeight:1.4 }}>{useCase.title}</div>
      <div style={{ fontSize:11, color:"#6a9ab8", lineHeight:1.7, marginBottom:12 }}>{useCase.description}</div>

      {/* Steps */}
      <Section label="Steps">
        {useCase.steps?.map((step, i) => (
          <div key={i} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:"0.5px solid #0d1a2a", fontSize:11 }}>
            <StepNum n={i+1} />
            <div style={{ color:"#a0c0d8", lineHeight:1.5 }}>{step}</div>
          </div>
        ))}
      </Section>

      {/* Assertions */}
      <Section label="Assertions">
        {useCase.assertions?.map((a, i) => (
          <div key={i} style={{ display:"flex", gap:8, padding:"5px 0", borderBottom:"0.5px solid #0d1a2a", fontSize:11, color:"#7ec87f" }}>
            <span style={{ color:"#4caf50" }}>✓</span><span>{a}</span>
          </div>
        ))}
      </Section>

      {/* AI Scenario */}
      <div style={{ borderTop:"0.5px solid #1e3a5f", paddingTop:12 }}>
        <div style={{ fontSize:9, color:"#c8a0f0", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7 }}>◈ AI Test Scenario</div>
        {scenLoading && <Spinner />}
        {scenario && !scenLoading && (
          <div className="fi">
            <div style={{ background:"#0a1220", border:"0.5px solid #1e3a5f", borderRadius:6, padding:11, marginBottom:8 }}>
              <div style={{ fontSize:9, color:"#2d6aad", marginBottom:5 }}>// playwright pseudocode</div>
              <pre style={{ fontSize:11, color:"#a0e0a0", margin:0, whiteSpace:"pre-wrap", lineHeight:1.7, fontFamily:"'IBM Plex Mono',monospace" }}>{scenario.testCode}</pre>
            </div>
            {scenario.notes && <div style={{ fontSize:10, color:"#4a7fa5", lineHeight:1.6, fontStyle:"italic" }}>Note: {scenario.notes}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:9, color:"#2d6aad", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>{label}</div>
      {children}
    </div>
  );
}

function StepNum({ n }) {
  return (
    <div style={{ minWidth:17, height:17, borderRadius:"50%", background:"#1a3050", border:"0.5px solid #2d6aad", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"#4d9de0", flexShrink:0 }}>{n}</div>
  );
}

function Spinner() {
  return (
    <div style={{ fontSize:10, color:"#c8a0f0", display:"flex", gap:5, alignItems:"center" }}>
      <div style={{ display:"flex", gap:3 }}>
        {[0, 0.15, 0.3].map((d, i) => (
          <div key={i} style={{ width:4, height:4, borderRadius:"50%", background:"#c8a0f0", animation:`pulse 0.8s ${d}s infinite` }} />
        ))}
      </div>
      Generating…
    </div>
  );
}
