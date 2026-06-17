"use client";
import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  Alca — Brand mark (/public/razorbill-logo.png)
//
//  TEMPORARY: this is the razorbill illustration (cropped) standing in until a
//  flat black silhouette is dropped in. White background is blended out via CSS:
//    • light surfaces → mix-blend-mode: multiply
//    • dark surfaces  → invert + screen
//  (rules live in globals.css, keyed off [data-theme="dark"])
//
//  Asset aspect ratio: 496 × 600  ≈ 0.83 : 1 (taller than wide)
// ─────────────────────────────────────────────────────────────────────────────

const LYNX_RATIO = 496 / 600;

interface LynxProps { height?: number | string; className?: string }

export function LynxMark({ height = 26, className }: LynxProps) {
  const isNum = typeof height === "number";
  const cls = "lynx-logo" + (className ? " " + className : "");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/razorbill-logo.png"
      alt="Alca"
      className={cls}
      style={
        isNum
          ? { height: height as number, width: Math.round((height as number) * LYNX_RATIO), display: "block", flexShrink: 0 }
          : { height: height as string, width: "auto", display: "block", flexShrink: 0 }
      }
    />
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
        Alca
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
