"use client";
import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  LYNX — Brand System
//  Walking lynx silhouette: detailed 2D profile, head right, tail left
// ─────────────────────────────────────────────────────────────────────────────

// Single compound path — full outer boundary of a walking lynx silhouette.
// ViewBox 0 0 200 95. Traced clockwise starting at front-right paw tip.
// Legs from left → right: BL (x≈2-16), BR (x≈46-60), FL (x≈124-138), FR (x≈156-170)
const LYNX_PATH = `
  M 170,90
  C 170,83 170,75 169,67 C 168,61 167,56 165,52
  C 162,49 158,47 155,48 C 153,48 150,47 149,45
  C 151,43 156,41 161,39 C 166,36 170,32 172,28
  C 174,24 174,20 172,17 C 170,14 167,13 165,13
  C 163,10 161,5 159,3
  C 158,1 156,1 155,4
  C 154,8 154,14 155,16
  C 154,15 152,14 151,15
  C 150,13 148,8 146,5
  C 145,2 143,2 142,5
  C 141,9 141,15 142,19
  C 140,22 134,24 128,24
  C 114,22 98,22 82,24
  C 68,26 54,30 44,34
  C 36,36 28,38 22,40
  C 14,41 6,44 3,49
  C 1,53 1,57 4,59
  C 8,60 14,57 20,54
  C 26,51 32,48 36,48
  C 34,51 26,60 18,70
  C 14,76 10,82 8,90
  L 2,90
  C 4,83 8,76 14,68
  C 18,62 22,58 28,56
  C 36,59 44,61 50,61
  C 56,61 60,62 62,64
  C 63,70 62,76 60,83
  C 59,86 58,90 56,90
  L 46,90
  C 47,83 49,76 51,70
  C 53,64 54,61 56,61
  C 65,61 82,61 98,61
  C 112,61 122,61 130,61
  C 132,61 136,62 138,64
  C 140,70 140,77 139,83
  C 138,86 137,90 135,90
  L 124,90
  C 125,83 127,77 129,71
  C 131,65 132,61 134,61
  C 140,60 148,58 154,56
  C 158,54 162,53 165,52
  C 166,54 168,60 169,68
  C 170,74 170,80 170,87
  L 170,90 Z
`;

// CSS keyframes injected once per render (negligible cost, deduped by browser)
const SWEEP_CSS = `
  @keyframes lynxSweep {
    0%   { transform: translateX(-220px); }
    100% { transform: translateX(220px); }
  }
  @keyframes lynxPulse {
    0%,100% { opacity: 0.9; }
    50%     { opacity: 1; }
  }
  @keyframes lynxGlow {
    0%,100% { filter: drop-shadow(0 0 0px rgba(255,255,255,0)); }
    50%     { filter: drop-shadow(0 0 6px rgba(255,255,255,0.22)); }
  }
  .lynx-mark-shape { animation: lynxPulse 3.5s ease-in-out infinite, lynxGlow 3.5s ease-in-out infinite; }
  .lynx-sweep { animation: lynxSweep 2.8s ease-in-out infinite; }
`;

// ─────────────────────────────────────────────────────────────────────────────

interface MarkProps { size?: number; radius?: number; animated?: boolean }

/**
 * LynxMark — the walking lynx silhouette in a dark rounded box.
 * Pass `animated` for the HeroMark-style glow + sweep (used on splash).
 */
export function LynxMark({ size = 34, radius, animated = false }: MarkProps) {
  const r = radius ?? Math.round(size * 0.2);
  // Inner SVG is proportionally wide: viewBox 200x95 → width > height
  const svgW = size * 1.1;
  const svgH = size * 0.62;

  return (
    <div style={{
      width: size * 1.4, height: size, borderRadius: r, flexShrink: 0,
      background: "#0A0A0B",
      border: "1px solid rgba(255,255,255,0.09)",
      boxShadow: "0 2px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", position: "relative",
    }}>
      <svg
        width={svgW}
        height={svgH}
        viewBox="0 0 200 95"
        style={{ display: "block" }}
      >
        {animated && (
          <>
            <style>{SWEEP_CSS}</style>
            <defs>
              <clipPath id="lx-clip-sm">
                <path d={LYNX_PATH} />
              </clipPath>
              <linearGradient id="lx-sweep-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="white" stopOpacity="0" />
                <stop offset="40%"  stopColor="white" stopOpacity="0.18" />
                <stop offset="60%"  stopColor="white" stopOpacity="0.18" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </defs>
          </>
        )}

        {/* Silhouette */}
        <path
          d={LYNX_PATH}
          fill="white"
          opacity={0.92}
          className={animated ? "lynx-mark-shape" : undefined}
        />

        {/* Highlight sweep (animated only) */}
        {animated && (
          <rect
            x="0" y="0" width="80" height="95"
            fill="url(#lx-sweep-grad)"
            clipPath="url(#lx-clip-sm)"
            className="lynx-sweep"
          />
        )}
      </svg>
    </div>
  );
}

/** Alias so existing imports keep working */
export const AlphaMark = LynxMark;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * HeroMark — larger animated version for the login card & splash hero.
 */
export function HeroMark({ size = 52 }: { size?: number }) {
  const svgW = size * 2.2;
  const svgH = size * 1.24;
  const r = Math.round(size * 0.22);

  return (
    <div style={{
      width: size * 2.4, height: size * 1.4, flexShrink: 0,
      background: "#0A0A0B",
      borderRadius: r,
      border: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", position: "relative",
    }}>
      <svg
        width={svgW}
        height={svgH}
        viewBox="0 0 200 95"
        style={{ display: "block" }}
      >
        <style>{SWEEP_CSS}</style>
        <defs>
          <clipPath id="lx-clip-hero">
            <path d={LYNX_PATH} />
          </clipPath>
          <linearGradient id="lx-sweep-hero" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="white" stopOpacity="0" />
            <stop offset="35%"  stopColor="white" stopOpacity="0.25" />
            <stop offset="65%"  stopColor="white" stopOpacity="0.25" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <filter id="lx-hero-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Glow layer behind silhouette */}
        <path
          d={LYNX_PATH}
          fill="rgba(255,255,255,0.15)"
          filter="url(#lx-hero-glow)"
          className="lynx-mark-shape"
        />

        {/* Main silhouette */}
        <path
          d={LYNX_PATH}
          fill="white"
          opacity={0.95}
          className="lynx-mark-shape"
        />

        {/* Sweep highlight */}
        <rect
          x="0" y="0" width="80" height="95"
          fill="url(#lx-sweep-hero)"
          clipPath="url(#lx-clip-hero)"
          className="lynx-sweep"
        />
      </svg>
    </div>
  );
}

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
      <LynxMark size={markSize} />
      <LynxWordmark size={fontSize} sub={sub} />
    </div>
  );
}
