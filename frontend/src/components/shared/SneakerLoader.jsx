/**
 * SneakerLoader — a techy running shoe animation for long AI operations.
 * Shows during discovery and Deep scenario building.
 */

import { useState, useEffect } from "react";

const MESSAGES = [
  "Lacing up the test runners...",
  "Warming up the endpoints...",
  "Stretching the API schemas...",
  "Jogging through your collections...",
  "Sprinting past the auth flows...",
  "Dodging rate limits...",
  "Leaping over null pointers...",
  "Hurdling the 500 errors...",
  "Pacing through edge cases...",
  "Hitting the assertion track...",
  "Lap 2: Coverage expanding...",
  "Full stride on error scenarios...",
  "Coming around the security bend...",
  "Final stretch: saving suite...",
];

const DEEP_MESSAGES = [
  "Deep run initiated. Shoes tied.",
  "Mapping every endpoint on the track...",
  "This is a marathon, not a sprint...",
  "Checking the CRUD circuit...",
  "Validating every baton handoff...",
  "Auth relay: token captured, passing forward...",
  "Lap 3: Edge cases getting weird...",
  "Racing through the 422 gauntlet...",
  "Security sprint — watching for shortcuts...",
  "Performance heat: timing every step...",
  "Almost there. Shoes still on.",
  "Final lap. Saving full coverage suite...",
];

export function SneakerLoader({ mode = "quick", phase, message }) {
  const [tick,    setTick]    = useState(0);
  const [msgIdx,  setMsgIdx]  = useState(0);
  const [step,    setStep]    = useState(0);

  const msgs = mode === "deep" ? DEEP_MESSAGES : MESSAGES;

  useEffect(() => {
    const anim = setInterval(() => setTick(t => t + 1), 80);
    const msg  = setInterval(() => setMsgIdx(i => (i + 1) % msgs.length), 3200);
    const st   = setInterval(() => setStep(s => s + 1), 120);
    return () => { clearInterval(anim); clearInterval(msg); clearInterval(st); };
  }, [msgs.length]);

  const bounce  = Math.sin(tick * 0.28) * 5;
  const legSwing = Math.sin(tick * 0.28);
  const armSwing = Math.cos(tick * 0.28);
  const groundDots = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => ({
    x: ((i * 42 - (step * 3.5)) % 380) + 10,
    opacity: 0.15 + Math.sin(i * 1.3) * 0.1,
  }));

  const label = message || msgs[msgIdx];
  const color = mode === "deep" ? "#c8a0f0" : "#7ec8ff";
  const glow  = mode === "deep" ? "#8b5cf6" : "#4d9de0";

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 20px", fontFamily:"'IBM Plex Mono',monospace" }}>

      {/* Mode badge */}
      <div style={{ fontSize:9, color:color, background:`${glow}18`, border:`0.5px solid ${glow}40`, borderRadius:20, padding:"3px 12px", marginBottom:20, letterSpacing:"0.15em", textTransform:"uppercase" }}>
        {mode === "deep" ? "🔬 Deep Coverage Run" : "⚡ Quick Critical-Path"}
      </div>

      {/* SVG runner */}
      <svg width="320" height="130" viewBox="0 0 320 130" style={{ overflow:"visible" }}>

        {/* Ground line */}
        <line x1="10" y1="105" x2="310" y2="105" stroke="#1e3a5f" strokeWidth="1" />

        {/* Ground dots (speed effect) */}
        {groundDots.map((d, i) => (
          <circle key={i} cx={d.x} cy={108} r="1.5" fill="#2d6aad" opacity={d.opacity} />
        ))}

        {/* Speed lines */}
        {[0,1,2].map(i => {
          const baseX = 60 - i * 18;
          const y     = 72 + i * 6;
          const len   = 22 - i * 5;
          const op    = 0.5 - i * 0.15;
          return <line key={i} x1={baseX} y1={y} x2={baseX - len} y2={y} stroke={color} strokeWidth={1.5 - i * 0.3} opacity={op} strokeLinecap="round" />;
        })}

        {/* Runner body — centred at x=160, ground at y=105 */}
        <g transform={`translate(160, ${95 + bounce})`}>

          {/* Shadow */}
          <ellipse cx="0" cy={10 - bounce * 0.4} rx={14 - Math.abs(bounce) * 0.5} ry="3" fill="#000" opacity="0.25" />

          {/* LEGS */}
          {/* Back leg */}
          <g transform={`rotate(${legSwing * 28}, 0, 0)`}>
            <line x1="0" y1="0" x2={-8 - legSwing * 4} y2="22" stroke="#a0c0e0" strokeWidth="4" strokeLinecap="round" />
            {/* Back lower leg */}
            <line
              x1={-8 - legSwing * 4} y1="22"
              x2={-8 - legSwing * 4 + Math.cos(tick * 0.28 + 1.5) * 10} y2="40"
              stroke="#a0c0e0" strokeWidth="3.5" strokeLinecap="round"
            />
          </g>
          {/* Front leg */}
          <g transform={`rotate(${-legSwing * 28}, 0, 0)`}>
            <line x1="0" y1="0" x2={8 - legSwing * 4} y2="22" stroke="#c8d8e8" strokeWidth="4" strokeLinecap="round" />
            {/* Front lower leg */}
            <line
              x1={8 - legSwing * 4} y1="22"
              x2={8 - legSwing * 4 - Math.cos(tick * 0.28 + 1.5) * 10} y2="40"
              stroke="#c8d8e8" strokeWidth="3.5" strokeLinecap="round"
            />
            {/* ── SNEAKER (front foot) ── */}
            <g transform={`translate(${8 - legSwing * 4 - Math.cos(tick * 0.28 + 1.5) * 10}, 40)`}>
              {/* Sole */}
              <rect x="-14" y="0" width="26" height="7" rx="3.5" fill={color} />
              {/* Upper */}
              <path d={`M -12 0 C -10 -9, 4 -11, 12 -4 L 12 0 Z`} fill={glow} />
              {/* Toe box */}
              <ellipse cx="10" cy="-2" rx="4" ry="3.5" fill={color} />
              {/* Tongue */}
              <rect x="-2" y="-10" width="6" height="8" rx="2" fill="#e0f0ff" opacity="0.6" />
              {/* Laces */}
              {[-8,-4,0,4].map((lx, li) => (
                <line key={li} x1={lx} y1={-3 - li * 0.5} x2={lx + 4} y2={-4 - li * 0.5} stroke="#fff" strokeWidth="0.8" opacity="0.7" />
              ))}
              {/* Swoosh-like stripe */}
              <path d="M -6 -1 C 0 -7, 8 -6, 11 -3" stroke="#fff" strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round" />
              {/* Sole grip dots */}
              {[-9,-4,1,6].map((gx, gi) => (
                <circle key={gi} cx={gx} cy="5" r="1" fill={glow} opacity="0.5" />
              ))}
            </g>
          </g>

          {/* BODY / TORSO */}
          <rect x="-7" y="-32" width="14" height="20" rx="5" fill="#4d9de0" />
          {/* Jersey detail */}
          <line x1="-3" y1="-30" x2="-3" y2="-14" stroke={color} strokeWidth="1" opacity="0.5" />
          <line x1="3"  y1="-30" x2="3"  y2="-14" stroke={color} strokeWidth="1" opacity="0.5" />

          {/* ARMS */}
          {/* Back arm */}
          <g transform={`rotate(${armSwing * 35}, 0, -24)`}>
            <line x1="0" y1="-24" x2={-14 + armSwing * 3} y2="-12" stroke="#a0c0e0" strokeWidth="3.5" strokeLinecap="round" />
          </g>
          {/* Front arm */}
          <g transform={`rotate(${-armSwing * 35}, 0, -24)`}>
            <line x1="0" y1="-24" x2={14 - armSwing * 3} y2="-14" stroke="#c8d8e8" strokeWidth="3.5" strokeLinecap="round" />
          </g>

          {/* HEAD */}
          <circle cx="0" cy="-42" r="11" fill="#4d9de0" />
          {/* Visor/headband */}
          <rect x="-11" y="-47" width="22" height="5" rx="2.5" fill={glow} />
          {/* Eyes */}
          <circle cx="-4" cy="-43" r="2" fill="#fff" />
          <circle cx="4"  cy="-43" r="2" fill="#fff" />
          <circle cx="-3.5" cy="-43" r="1" fill="#1a1a2e" />
          <circle cx="4.5"  cy="-43" r="1" fill="#1a1a2e" />
          {/* Determined mouth */}
          <path d="M -3 -38 L 3 -38" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          {/* Sweat drop */}
          {tick % 40 < 20 && (
            <ellipse cx="10" cy={-44 + tick % 20 * 0.3} rx="1.5" ry="2" fill="#7ec8ff" opacity={1 - (tick % 20) * 0.05} />
          )}

          {/* Back shoe */}
          <g transform={`translate(${-8 - legSwing * 4 + Math.cos(tick * 0.28 + 1.5) * 10 - 4}, 40)`}>
            <rect x="-12" y="0" width="22" height="6" rx="3" fill={`${glow}90`} />
            <path d={`M -10 0 C -8 -7, 2 -9, 10 -3 L 10 0 Z`} fill={`${glow}70`} />
          </g>
        </g>

        {/* AI sparkles */}
        {[0,1,2].map(i => {
          const t   = (tick + i * 25) % 60;
          const x   = 230 + i * 22;
          const y   = 40 + Math.sin((tick + i * 20) * 0.1) * 15;
          const op  = t < 30 ? t / 30 : (60 - t) / 30;
          return (
            <g key={i} transform={`translate(${x},${y})`} opacity={op}>
              <line x1="0" y1="-5" x2="0" y2="5" stroke={color} strokeWidth="1.5" />
              <line x1="-5" y1="0" x2="5" y2="0" stroke={color} strokeWidth="1.5" />
              <line x1="-3" y1="-3" x2="3" y2="3" stroke={color} strokeWidth="1" />
              <line x1="3" y1="-3" x2="-3" y2="3" stroke={color} strokeWidth="1" />
            </g>
          );
        })}

        {/* Endpoint count flying past */}
        {tick % 80 < 40 && (
          <text x={270 - (tick % 80) * 1.2} y="30" fontSize="8" fill={color} opacity={0.4} fontFamily="IBM Plex Mono">
            {tick % 3 === 0 ? "GET /api/user" : tick % 3 === 1 ? "POST /auth/token" : "PUT /orders/{id}"}
          </text>
        )}
      </svg>

      {/* Message */}
      <div style={{ fontSize:11, color, marginTop:8, textAlign:"center", minHeight:20, letterSpacing:"0.03em" }}>
        {label}
      </div>

      {/* Progress dots */}
      <div style={{ display:"flex", gap:5, marginTop:12 }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{
            width:6, height:6, borderRadius:"50%",
            background: (tick / 10 | 0) % 5 === i ? color : "#1e3a5f",
            transition:"background 0.2s",
            boxShadow: (tick / 10 | 0) % 5 === i ? `0 0 6px ${color}` : "none",
          }} />
        ))}
      </div>

      {mode === "deep" && (
        <div style={{ fontSize:8, color:"#2d6aad", marginTop:8 }}>
          Full coverage · this takes 30–60s · worth it
        </div>
      )}
    </div>
  );
}
