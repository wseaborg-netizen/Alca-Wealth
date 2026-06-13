import React from "react";

/**
 * WraithMark — Wraith Finance logo mark.
 *
 * Design language: futuristic / institutional
 * - Outer octagonal ring (precision, structure)
 * - Inner "W" formed by three ascending shards
 * - Scan-line accent suggesting data / signal
 * - Monochrome so it works on any background
 */
export function AlphaMark({ size = 34, radius }: { size?: number; radius?: number }) {
  const r = radius ?? Math.round(size * 0.2);
  const s = size;
  const c = s / 2; // center

  // Octagon points — inset 8% from edges
  const o = s * 0.08;
  const cut = s * 0.22;
  const octagon = [
    [o + cut, o],
    [s - o - cut, o],
    [s - o, o + cut],
    [s - o, s - o - cut],
    [s - o - cut, s - o],
    [o + cut, s - o],
    [o, s - o - cut],
    [o, o + cut],
  ].map(([x, y]) => `${x},${y}`).join(" ");

  // W made of three shards — base at 68%, tips at 20%, 44%, 20%
  const base = s * 0.72;
  const mid  = s * 0.44;
  const top1 = s * 0.20;
  const top2 = s * 0.32;   // middle shard tip (slightly lower)
  const w    = s * 0.13;   // half-width of each shard
  const gap  = s * 0.06;

  // Left shard
  const L = `${c - w * 2.6 - gap},${base} ${c - w * 2.6 - gap - w * 0.5},${top1} ${c - w * 2.6 - gap + w * 0.5},${top1} ${c - w * 2.6 - gap + w},${base}`;
  // Middle shard (taller w-valley center — goes lower)
  const M = `${c - w * 0.5},${base} ${c},${top2} ${c + w * 0.5},${base}`;
  // Right shard (mirror of left)
  const Rx = `${c + w * 2.6 + gap - w},${base} ${c + w * 2.6 + gap - w * 0.5},${top1} ${c + w * 2.6 + gap + w * 0.5},${top1} ${c + w * 2.6 + gap},${base}`;

  // Thin horizontal scan line across the W
  const scanY = s * 0.53;

  return (
    <div style={{
      width: size, height: size, borderRadius: r, flexShrink: 0, overflow: "hidden",
      background: "#0A0A0B",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative",
    }}>
      <svg width={size} height={size} viewBox={`0 0 ${s} ${s}`} style={{ display: "block" }}>
        {/* Outer octagonal ring */}
        <polygon
          points={octagon}
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={s * 0.028}
          strokeLinejoin="miter"
        />

        {/* Inner ring — tighter, dimmer */}
        <polygon
          points={octagon}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={s * 0.07}
          strokeLinejoin="miter"
        />

        {/* Left shard */}
        <polygon points={L} fill="#FFFFFF" opacity={0.92} />
        {/* Middle valley shard */}
        <polygon points={M} fill="#FFFFFF" opacity={0.55} />
        {/* Right shard */}
        <polygon points={Rx} fill="#FFFFFF" opacity={0.92} />

        {/* Horizontal scan line */}
        <line
          x1={o + cut * 0.6} y1={scanY}
          x2={s - o - cut * 0.6} y2={scanY}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={s * 0.018}
          strokeLinecap="round"
        />

        {/* Corner accent dots — top-right and bottom-left of octagon */}
        <circle cx={s - o - cut * 0.5} cy={o + cut * 0.5} r={s * 0.025} fill="rgba(255,255,255,0.5)" />
        <circle cx={o + cut * 0.5} cy={s - o - cut * 0.5} r={s * 0.025} fill="rgba(255,255,255,0.5)" />
      </svg>
    </div>
  );
}

/**
 * WraithWordmark — "WRAITH FINANCE" in Cormorant Garamond.
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

/**
 * HeroMark — large version for the splash page hero.
 * Standalone mark, no box — just the SVG geometry on transparent bg.
 */
export function HeroMark({ size = 120 }: { size?: number }) {
  const s = size;
  const c = s / 2;

  const o = s * 0.04;
  const cut = s * 0.18;
  const octagon = [
    [o + cut, o],
    [s - o - cut, o],
    [s - o, o + cut],
    [s - o, s - o - cut],
    [s - o - cut, s - o],
    [o + cut, s - o],
    [o, s - o - cut],
    [o, o + cut],
  ].map(([x, y]) => `${x},${y}`).join(" ");

  const base = s * 0.72;
  const top1 = s * 0.22;
  const top2 = s * 0.34;
  const w    = s * 0.12;
  const gap  = s * 0.055;

  const L  = `${c - w * 2.6 - gap},${base} ${c - w * 2.6 - gap - w * 0.45},${top1} ${c - w * 2.6 - gap + w * 0.45},${top1} ${c - w * 2.6 - gap + w},${base}`;
  const M  = `${c - w * 0.45},${base} ${c},${top2} ${c + w * 0.45},${base}`;
  const Rx = `${c + w * 2.6 + gap - w},${base} ${c + w * 2.6 + gap - w * 0.45},${top1} ${c + w * 2.6 + gap + w * 0.45},${top1} ${c + w * 2.6 + gap},${base}`;

  const scanY = s * 0.53;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${s} ${s}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="wf-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.55)" />
        </linearGradient>
        <filter id="wf-glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Outer octagonal ring */}
      <polygon
        points={octagon}
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={s * 0.022}
        strokeLinejoin="miter"
      />
      {/* Second ring — glow layer */}
      <polygon
        points={octagon}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={s * 0.055}
        strokeLinejoin="miter"
      />

      {/* W shards */}
      <polygon points={L}  fill="url(#wf-grad)" filter="url(#wf-glow)" />
      <polygon points={M}  fill="rgba(255,255,255,0.5)" />
      <polygon points={Rx} fill="url(#wf-grad)" filter="url(#wf-glow)" />

      {/* Scan line */}
      <line
        x1={o + cut * 0.5} y1={scanY}
        x2={s - o - cut * 0.5} y2={scanY}
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={s * 0.015}
        strokeLinecap="round"
      />

      {/* Corner dots */}
      <circle cx={s - o - cut * 0.4} cy={o + cut * 0.4} r={s * 0.022} fill="rgba(255,255,255,0.6)" />
      <circle cx={o + cut * 0.4} cy={s - o - cut * 0.4} r={s * 0.022} fill="rgba(255,255,255,0.6)" />
      <circle cx={s - o - cut * 0.4} cy={s - o - cut * 0.4} r={s * 0.014} fill="rgba(255,255,255,0.25)" />
      <circle cx={o + cut * 0.4} cy={o + cut * 0.4} r={s * 0.014} fill="rgba(255,255,255,0.25)" />
    </svg>
  );
}
