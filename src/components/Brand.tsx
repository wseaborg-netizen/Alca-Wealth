"use client";
import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  LYNX — Walking silhouette logo
//  One dark figure, no box, no animation. Uses currentColor so the negative-space
//  cuts are TRUE transparency (work on any background, light or dark).
//
//  Pose: walking lynx, facing right — sharp tufted ears, cheek ruff, short
//  bobbed tail, four legs mid-stride. Single evenodd path: outer body outline
//  + interior holes for the muscle/leg-separation cuts.
//  ViewBox 0 0 320 175  (≈1.83:1)
// ─────────────────────────────────────────────────────────────────────────────

const LYNX_D = `
  M 60,64
  C 57,55 57,46 62,46 C 67,46 67,55 66,62
  C 71,55 80,51 90,50 C 100,49 109,51 117,55
  C 139,46 163,44 187,47 C 199,48 209,51 217,54
  C 223,53 229,52 234,50 C 238,48 242,47 245,47
  L 249,25 L 259,47 L 267,42 L 277,24 L 284,49
  C 291,55 298,62 301,70 C 302,75 300,80 295,82
  C 291,83 288,82 286,79
  C 287,89 284,99 277,106 C 274,109 270,109 267,106
  C 268,112 264,114 261,111
  C 263,123 265,143 267,160 C 268,166 269,170 270,173
  L 250,173
  C 249,158 248,140 247,119
  C 243,120 237,120 232,118
  C 232,140 232,158 232,173
  L 214,173
  C 214,158 214,140 214,117
  C 198,107 172,102 150,103 C 138,104 130,107 124,115
  C 130,140 130,158 130,173
  L 112,173
  C 112,158 112,140 112,117
  C 108,119 102,119 97,117
  C 95,140 90,158 84,173
  L 66,173
  C 70,156 76,138 82,119
  C 75,113 67,103 63,91 C 61,82 60,72 60,64 Z
  M 232,69 C 238,83 239,101 234,115 C 233,101 228,87 223,77 C 225,73 229,71 232,69 Z
  M 98,69  C 105,83 106,101 101,115 C 100,101 95,87 90,77 C 92,73 95,71 98,69 Z
`;

interface LynxProps { height?: number | string; className?: string }

export function LynxMark({ height = 26, className }: LynxProps) {
  // Numeric → fixed px width. String (e.g. clamp()) → width:auto, aspect kept by viewBox.
  const isNum = typeof height === "number";
  return (
    <svg
      {...(isNum
        ? { width: Math.round((height as number) * (320 / 180)), height }
        : { height, width: "auto", preserveAspectRatio: "xMidYMid meet" })}
      viewBox="0 0 320 180"
      style={{ display: "block", flexShrink: 0 }}
      className={className}
      aria-label="Lynx"
    >
      <path d={LYNX_D} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

// Aliases so existing imports keep compiling
export const AlphaMark = LynxMark;
export const HeroMark  = ({ size = 52 }: { size?: number }) => <LynxMark height={size * 0.6} />;

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
