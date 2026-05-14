export function Pill({ label, bg, border, color, style = {} }) {
  return (
    <span className="pill" style={{ background:bg, border:`0.5px solid ${border}`, color, ...style }}>
      {label}
    </span>
  );
}
