import React from "react";

// ── Tool - Design tokens (black/white brand, clean editorial) ──────────────
// Surface tokens are CSS variables so the whole app switches light/dark.
export const T = {
  bg:      "var(--c-bg)",
  panel:   "var(--c-panel)",
  panel2:  "var(--c-panel2)",
  panel3:  "var(--c-panel3)",
  line:    "var(--c-line)",
  line2:   "var(--c-line2)",
  text:    "var(--c-text)",
  dim:     "var(--c-dim)",
  muted:   "var(--c-muted)",
  // Accents kept as HEX - composed with alpha suffixes like `${T.blue}18`
  // and used in SVG gradient ids. CSS vars cannot do this.
  blue:    "#0A0A0B",   // Tool primary accent → near-black (light mode)
  blueD:   "#262626",   // hover / active
  blueL:   "var(--c-blueL)",   // light tint for active bg (themed)
  data:    "#0E7490",   // DATA accent → teal (charts, scores)
  dataD:   "#155E75",
  dataL:   "var(--c-dataL)",
  cyan:    "#0891B2",
  amber:   "#B45309",
  red:     "#DC2626",   // negative returns / risk
  green:   "#16A34A",   // positive returns
  gold:    "#B45309",   // #1 rank
} as const;

// Tool display font - Cormorant Garamond (loaded in layout.tsx)
export const lynx: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif",
};

// UI / prose - Geist (sharp, technical)
export const ui: React.CSSProperties = {
  fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

// Data / numbers / tickers - Geist Mono with tabular figures
export const mono: React.CSSProperties = {
  fontFamily: "'Geist Mono', 'SF Mono', Consolas, monospace",
  fontVariantNumeric: "tabular-nums",
};

export const chartTooltip = {
  contentStyle: {
    background: "var(--c-panel)",
    border: "1px solid var(--c-line)",
    borderRadius: 8,
    color: "var(--c-text)",
    fontSize: 12,
    fontFamily: "'Geist', sans-serif",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  },
  labelStyle: { color: "var(--c-dim)", fontFamily: "'Geist', sans-serif" },
  itemStyle: { fontFamily: "'Geist Mono', monospace", fontSize: 12 },
};

export const cardStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "var(--c-panel)",
  border: "1px solid var(--c-line)",
  borderRadius: 8,
  boxShadow: "none",
  ...extra,
});

export const cardHighlight: React.CSSProperties = { display: "none" };
