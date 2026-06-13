import React from "react";

/**
 * WraithMark — the Wraith Finance logo mark.
 * A clean black chip with a minimal cat-eye / diamond geometry.
 * Sharp, precise, institutional.
 */
export function AlphaMark({ size = 34, radius }: { size?: number; radius?: number }) {
  const rad = radius ?? Math.round(size * 0.22);
  const s = size;
  const cx = s * 0.5, cy = s * 0.5;
  const rx = s * 0.34, ry = s * 0.18;
  const top    = `${cx},${cy - ry}`;
  const right  = `${cx + rx},${cy}`;
  const bottom = `${cx},${cy + ry}`;
  const left   = `${cx - rx},${cy}`;
  const pr = s * 0.07;

  return (
    <div style={{
      width: size, height: size, borderRadius: rad, flexShrink: 0, overflow: "hidden",
      background: "#0A0A0B",
      border: "1px solid #1A1A1D",
      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width={s * 0.72} height={s * 0.72} viewBox={`0 0 ${s} ${s}`} style={{ display: "block" }}>
        <polygon
          points={`${top} ${right} ${bottom} ${left}`}
          fill="none" stroke="#FFFFFF"
          strokeWidth={s * 0.045} strokeLinejoin="round"
        />
        <circle cx={cx} cy={cy} r={pr} fill="#FFFFFF" opacity={0.9} />
        <line
          x1={cx - rx} y1={cy} x2={cx + rx} y2={cy}
          stroke="#FFFFFF" strokeWidth={s * 0.022} opacity={0.25}
        />
      </svg>
    </div>
  );
}

/**
 * WraithWordmark — "Wraith Finance" in Playfair Display.
 * Thin, sharp, editorial. The statement piece of the brand.
 */
export function WraithWordmark({
  size = 32,
  color = "currentColor",
  sub = true,
  subText = "Fund Analytics",
}: {
  size?: number;
  color?: string;
  sub?: boolean;
  subText?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
      <span style={{
        fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif",
        fontSize: size,
        fontWeight: 300,
        letterSpacing: "0.06em",
        color,
        lineHeight: 1,
        textTransform: "uppercase",
      }}>
        Wraith Finance
      </span>
      {sub && (
        <span style={{
          fontFamily: "'Geist', -apple-system, sans-serif",
          fontSize: size * 0.28,
          fontWeight: 400,
          letterSpacing: "0.05em",
          color: "var(--c-muted)",
          textTransform: "uppercase",
          marginTop: size * 0.14,
          lineHeight: 1,
        }}>
          {subText}
        </span>
      )}
    </div>
  );
}

/** Full lockup: mark + wordmark */
export function AlphaLogo({
  markSize = 34,
  fontSize = 22,
  sub = true,
}: {
  markSize?: number;
  fontSize?: number;
  sub?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
      <AlphaMark size={markSize} />
      <WraithWordmark size={fontSize} sub={sub} />
    </div>
  );
}
