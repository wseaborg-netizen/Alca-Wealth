"use client";
import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  LYNX — Walking silhouette logo
//  Single dark cat figure, no box, no animation.
//  Sized by `height` prop; width auto-scales at 2.2:1 ratio.
//
//  Anatomy (ViewBox 0 0 242 110):
//    tail (left) → body → neck → head → tufted ears → nose
//    4 legs: BL angled back · BR straight · FL straight · FR raised forward
//    internal white highlights: shoulder + flank + ruff lines
// ─────────────────────────────────────────────────────────────────────────────

interface LynxProps { height?: number }

export function LynxMark({ height = 28 }: LynxProps) {
  const w = Math.round(height * 2.2);

  return (
    <svg
      width={w}
      height={height}
      viewBox="0 0 242 110"
      fill="none"
      style={{ display: "block", flexShrink: 0 }}
      aria-label="Lynx"
    >
      {/* ── Dark silhouette shapes (all same color → merge into one form) ── */}
      <g fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">

        {/* Body — wide low oval */}
        <ellipse cx="106" cy="56" rx="78" ry="26" />

        {/* Neck — trapezoid bridging body to head */}
        <polygon points="156,34 178,26 190,62 166,68" />

        {/* Head — main oval */}
        <ellipse cx="200" cy="50" rx="26" ry="24" />

        {/* Ruff — wider ellipse at jaw (key lynx feature: big cheek ruff) */}
        <ellipse cx="200" cy="62" rx="31" ry="16" />

        {/* Rear ear — very sharp tufted point */}
        <polygon points="183,28 172,3 196,26" />

        {/* Front ear — very sharp tufted point */}
        <polygon points="196,26 209,1 221,24" />

        {/* Tail — short bobbed, angled upward at tip */}
        <path d="M 32,38 C 22,30 10,32 8,39 C 6,46 14,52 26,50 C 30,48 32,42 32,38 Z" />

        {/* Raised front-right leg — upper arm (swings forward/up) */}
        <polygon points="181,62 209,49 213,59 185,72" />

        {/* Raised front-right leg — forearm (hangs forward/down) */}
        <polygon points="209,49 222,46 232,73 219,76" />

        {/* FR paw (forward, roughly at belly height — the "raised" look) */}
        <ellipse cx="227" cy="75" rx="9" ry="5" />

        {/* Front-left leg — mostly straight down */}
        <rect x="166" y="70" width="14" height="40" rx="6" />
        <ellipse cx="173" cy="110" rx="10" ry="4" />

        {/* Back-right leg — straight down, slightly forward */}
        <rect x="92" y="74" width="13" height="36" rx="5" />
        <ellipse cx="98" cy="110" rx="9" ry="4" />

        {/* Back-left leg — parallelogram angled backward */}
        <polygon points="42,74 24,108 13,106 32,72" />
        <ellipse cx="18" cy="107" rx="10" ry="4" />

      </g>

      {/* ── White internal highlights — muscle/ruff definition ── */}
      <g fill="white" stroke="none">

        {/* Shoulder / neck muscle line */}
        <path d="M 170,40 C 164,48 163,60 168,66 C 173,60 173,48 170,40 Z" />

        {/* Mid-body flank highlight */}
        <path d="M 124,42 C 118,52 117,62 123,68 C 128,62 128,52 124,42 Z" />

        {/* Ruff left streak */}
        <path d="M 188,64 C 184,70 183,78 184,82 C 188,78 189,70 188,64 Z" />

        {/* Ruff right streak */}
        <path d="M 212,64 C 216,70 217,78 216,82 C 212,78 211,70 212,64 Z" />

      </g>
    </svg>
  );
}

// Alias so existing imports keep compiling
export const AlphaMark = LynxMark;
export const HeroMark  = ({ size = 52 }: { size?: number }) => <LynxMark height={size * 0.55} />;

// ─────────────────────────────────────────────────────────────────────────────

export function LynxWordmark({
  size = 32,
  color = "currentColor",
  sub = true,
  subText = "Fund Analytics",
}: {
  size?: number; color?: string; sub?: boolean; subText?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
      <span style={{
        fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif",
        fontSize: size, fontWeight: 300, letterSpacing: "0.06em",
        color, lineHeight: 1, textTransform: "uppercase",
      }}>
        Lynx
      </span>
      {sub && (
        <span style={{
          fontFamily: "'Geist', -apple-system, sans-serif",
          fontSize: size * 0.28, fontWeight: 400, letterSpacing: "0.05em",
          color: "var(--c-muted)", textTransform: "uppercase",
          marginTop: size * 0.14, lineHeight: 1,
        }}>
          {subText}
        </span>
      )}
    </div>
  );
}

export const WraithWordmark = LynxWordmark;

export function AlphaLogo({ markSize = 34, fontSize = 22, sub = true }: { markSize?: number; fontSize?: number; sub?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
      <LynxMark height={markSize * 0.6} />
      <LynxWordmark size={fontSize} sub={sub} />
    </div>
  );
}
