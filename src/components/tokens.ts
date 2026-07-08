import React from "react";

// ── ALCA - Design tokens (institutional wealth platform) ──────────────
// Surface tokens are CSS variables so the whole app switches light/dark.
export const T = {
  bg:      "var(--c-bg)",
  sidebar: "var(--c-sidebar)",
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
  // ALCA primary accent is one confident institutional teal, used everywhere a
  // primary action / active state appears (buttons, nav, chips, focus).
  blue:    "#0E7490",   // ALCA primary accent → deep teal
  blueD:   "#0B5A70",   // hover / active (darker)
  blueL:   "var(--c-blueL)",   // light teal tint for active bg (themed)
  data:    "#0E7490",   // DATA accent → same teal (charts, scores)
  dataD:   "#0B5A70",
  dataL:   "var(--c-dataL)",
  cyan:    "#0891B2",
  amber:   "#B45309",
  red:     "#DC2626",   // negative returns / risk
  green:   "#16A34A",   // positive returns
  gold:    "#B45309",   // #1 rank
} as const;

// ── Design scale - use these instead of ad-hoc pixel values ──
export const R = { sm: 6, md: 8, lg: 10, xl: 12 } as const;   // border radius
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const; // spacing

// ── Elevation - the only shadows in the product (themed in globals.css) ──
// flush → resting card → raised/hover → overlay (modals, dark hero cards)
export const ELEV = {
  flush:   "var(--elev-0)",
  rest:    "var(--elev-1)",
  raised:  "var(--elev-2)",
  overlay: "var(--elev-3)",
} as const;

// ── Motion - one rhythm product-wide; pair fast with hover, base with layout ──
export const MOTION = {
  fast: "var(--dur-fast)",   // 150ms - hovers, presses
  base: "var(--dur-base)",   // 220ms - reveals, layout shifts
  ease: "var(--ease-out)",   // decisive ease-out
} as const;

// Display font - Libre Caslon Display, the sharp "banking" serif (wordmark + page titles).
export const lynx: React.CSSProperties = {
  fontFamily: "var(--font-display)",
};

// UI / prose - the same executive serif as the wordmark, used site-wide.
// Geist Mono is kept separately for figures/tickers where tabular alignment matters.
export const ui: React.CSSProperties = {
  fontFamily: "var(--font-text)",
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
    fontFamily: "var(--font-text)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  },
  labelStyle: { color: "var(--c-dim)", fontFamily: "var(--font-text)" },
  itemStyle: { fontFamily: "'Geist Mono', monospace", fontSize: 12 },
};

// Premium surface: 12px radius, hairline border, and a whisper of elevation
// (themed via --c-card-shadow so it disappears cleanly in dark mode).
export const cardStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: "var(--c-panel)",
  border: "1px solid var(--c-line)",
  borderRadius: R.xl,
  boxShadow: "var(--c-card-shadow)",
  ...extra,
});

export const cardHighlight: React.CSSProperties = { display: "none" };
