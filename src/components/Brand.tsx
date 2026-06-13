"use client";
import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  LYNX — Brand Components
//  Geometric lynx face: tufted ears · slit pupils · scan-line animation
// ─────────────────────────────────────────────────────────────────────────────

const ANIM_CSS = `
  @keyframes lynxEyePulse {
    0%,100% { opacity:1; }
    50%      { opacity:0.35; }
  }
  @keyframes lynxEyePulseR {
    0%,100% { opacity:1; }
    60%      { opacity:0.35; }
  }
  @keyframes lynxBlink {
    0%,91%,100% { transform:scaleY(1); }
    94%,97%     { transform:scaleY(0.06); }
  }
  @keyframes lynxBlinkR {
    0%,93%,100% { transform:scaleY(1); }
    96%,99%     { transform:scaleY(0.06); }
  }
  @keyframes lynxScan {
    0%   { transform:translateY(-44px); opacity:0; }
    12%  { opacity:0.55; }
    88%  { opacity:0.55; }
    100% { transform:translateY(44px); opacity:0; }
  }
  @keyframes lynxOuter {
    0%,100% { opacity:0.55; }
    50%     { opacity:1; }
  }
  @keyframes lynxInner {
    0%,100% { opacity:0.08; }
    50%     { opacity:0.18; }
  }
  .lynx-eye-l { animation: lynxEyePulse 3.4s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
  .lynx-eye-r { animation: lynxEyePulseR 3.4s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
  .lynx-blink-l { animation: lynxBlink 6s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
  .lynx-blink-r { animation: lynxBlinkR 6s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
  .lynx-scan { animation: lynxScan 4s ease-in-out infinite; }
  .lynx-outer { animation: lynxOuter 4s ease-in-out infinite; }
  .lynx-inner { animation: lynxInner 4s ease-in-out infinite; }
`;

// Face polygon points (100×100 viewBox)
const FACE_PTS =
  "16,26 29,5 38,26 62,26 71,5 84,26 89,52 80,77 65,89 50,93 35,89 20,77 11,52";

interface MarkProps { size?: number; radius?: number; animated?: boolean }

/**
 * LynxMark — the core logo mark.
 * `animated` prop enables eye-glow + scan-line (use on splash; leave off in sidebar).
 */
export function LynxMark({ size = 34, radius, animated = false }: MarkProps) {
  const r = radius ?? Math.round(size * 0.2);

  return (
    <div style={{
      width: size, height: size, borderRadius: r, flexShrink: 0,
      background: "#0A0A0B",
      border: "1px solid rgba(255,255,255,0.09)",
      boxShadow: "0 2px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      <svg
        width={size * 0.84}
        height={size * 0.84}
        viewBox="0 0 100 100"
        style={{ display: "block", overflow: "visible" }}
      >
        {animated && <style>{ANIM_CSS}</style>}

        <defs>
          <clipPath id="lx-face-clip">
            <polygon points={FACE_PTS} />
          </clipPath>
          <filter id="lx-eye-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* ── Outer face ring (animated pulse) ── */}
        <polygon
          points={FACE_PTS}
          fill="none"
          stroke="rgba(255,255,255,0.62)"
          strokeWidth="1.6"
          strokeLinejoin="miter"
          className={animated ? "lynx-outer" : undefined}
          style={!animated ? { opacity: 0.62 } : undefined}
        />

        {/* ── Inner face fill (very dark, subtle) ── */}
        <polygon
          points={FACE_PTS}
          fill="rgba(255,255,255,0.07)"
          className={animated ? "lynx-inner" : undefined}
        />

        {/* ── Ear tufts (inner line detail) ── */}
        <line x1="26" y1="22" x2="29" y2="9"  stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="74" y1="22" x2="71" y2="9"  stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round"/>

        {/* ── Eyes — outer almond ── */}
        <g filter={animated ? "url(#lx-eye-glow)" : undefined}>
          {/* Left eye */}
          <ellipse cx="35" cy="46" rx="10.5" ry="6.5"
            fill="rgba(255,255,255,0.9)"
            className={animated ? "lynx-eye-l" : undefined}
          />
          {/* Right eye */}
          <ellipse cx="65" cy="46" rx="10.5" ry="6.5"
            fill="rgba(255,255,255,0.9)"
            className={animated ? "lynx-eye-r" : undefined}
          />
        </g>

        {/* ── Pupils (vertical slit) ── */}
        <ellipse cx="35" cy="46" rx="2.4" ry="5.5"
          fill="#0A0A0B"
          className={animated ? "lynx-blink-l" : undefined}
        />
        <ellipse cx="65" cy="46" rx="2.4" ry="5.5"
          fill="#0A0A0B"
          className={animated ? "lynx-blink-r" : undefined}
        />

        {/* ── Eye highlight flecks ── */}
        <circle cx="31" cy="43" r="1.6" fill="rgba(255,255,255,0.55)" />
        <circle cx="61" cy="43" r="1.6" fill="rgba(255,255,255,0.55)" />

        {/* ── Nose bridge ── */}
        <line x1="50" y1="53" x2="50" y2="61" stroke="rgba(255,255,255,0.35)" strokeWidth="1.1" strokeLinecap="round"/>

        {/* ── Nose ── */}
        <polygon points="46,61 54,61 50,66" fill="rgba(255,255,255,0.6)" />

        {/* ── Mouth lines ── */}
        <line x1="50" y1="66" x2="41" y2="72" stroke="rgba(255,255,255,0.4)" strokeWidth="1.1" strokeLinecap="round"/>
        <line x1="50" y1="66" x2="59" y2="72" stroke="rgba(255,255,255,0.4)" strokeWidth="1.1" strokeLinecap="round"/>

        {/* ── Whiskers ── */}
        <line x1="9"  y1="62" x2="29" y2="61" stroke="rgba(255,255,255,0.22)" strokeWidth="0.9" strokeLinecap="round"/>
        <line x1="7"  y1="67" x2="28" y2="66" stroke="rgba(255,255,255,0.16)" strokeWidth="0.9" strokeLinecap="round"/>
        <line x1="71" y1="61" x2="91" y2="62" stroke="rgba(255,255,255,0.22)" strokeWidth="0.9" strokeLinecap="round"/>
        <line x1="72" y1="66" x2="93" y2="67" stroke="rgba(255,255,255,0.16)" strokeWidth="0.9" strokeLinecap="round"/>

        {/* ── Scan line (animated only) ── */}
        {animated && (
          <line
            x1="11" y1="50" x2="89" y2="50"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="0.9"
            strokeLinecap="round"
            clipPath="url(#lx-face-clip)"
            className="lynx-scan"
          />
        )}
      </svg>
    </div>
  );
}

/** Alias so existing imports don't break */
export const AlphaMark = LynxMark;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * HeroMark — large animated version for the splash page.
 * Transparent background, just the SVG mark.
 */
export function HeroMark({ size = 120 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      background: "#0A0A0B",
      borderRadius: Math.round(size * 0.18),
      border: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      <svg
        width={size * 0.82}
        height={size * 0.82}
        viewBox="0 0 100 100"
        style={{ display: "block", overflow: "visible" }}
      >
        <style>{ANIM_CSS}</style>

        <defs>
          <clipPath id="lx-hero-clip">
            <polygon points={FACE_PTS} />
          </clipPath>
          <filter id="lx-hero-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="lx-hero-eye" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.8" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Outer glow ring */}
        <polygon
          points={FACE_PTS}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="5"
          filter="url(#lx-hero-glow)"
          className="lynx-outer"
        />

        {/* Face outline */}
        <polygon
          points={FACE_PTS}
          fill="rgba(255,255,255,0.06)"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1.5"
          strokeLinejoin="miter"
          className="lynx-outer"
        />

        {/* Ear tufts */}
        <line x1="26" y1="22" x2="29" y2="9"  stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="74" y1="22" x2="71" y2="9"  stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="25" y1="19" x2="28" y2="12" stroke="rgba(255,255,255,0.25)" strokeWidth="0.9" strokeLinecap="round"/>
        <line x1="75" y1="19" x2="72" y2="12" stroke="rgba(255,255,255,0.25)" strokeWidth="0.9" strokeLinecap="round"/>

        {/* Eyes — glow layer */}
        <g filter="url(#lx-hero-eye)">
          <ellipse cx="35" cy="46" rx="10.5" ry="6.5" fill="rgba(255,255,255,0.85)" className="lynx-eye-l"/>
          <ellipse cx="65" cy="46" rx="10.5" ry="6.5" fill="rgba(255,255,255,0.85)" className="lynx-eye-r"/>
        </g>

        {/* Eyes — sharp layer on top */}
        <ellipse cx="35" cy="46" rx="10.5" ry="6.5" fill="rgba(255,255,255,0.88)" className="lynx-eye-l"/>
        <ellipse cx="65" cy="46" rx="10.5" ry="6.5" fill="rgba(255,255,255,0.88)" className="lynx-eye-r"/>

        {/* Pupils */}
        <ellipse cx="35" cy="46" rx="2.4" ry="5.5" fill="#0A0A0B" className="lynx-blink-l"/>
        <ellipse cx="65" cy="46" rx="2.4" ry="5.5" fill="#0A0A0B" className="lynx-blink-r"/>

        {/* Eye highlights */}
        <circle cx="31" cy="43" r="1.8" fill="rgba(255,255,255,0.6)" />
        <circle cx="61" cy="43" r="1.8" fill="rgba(255,255,255,0.6)" />

        {/* Nose bridge */}
        <line x1="50" y1="53" x2="50" y2="61" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinecap="round"/>

        {/* Nose */}
        <polygon points="46,61 54,61 50,66" fill="rgba(255,255,255,0.65)" />

        {/* Mouth */}
        <line x1="50" y1="66" x2="41" y2="72" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="50" y1="66" x2="59" y2="72" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round"/>

        {/* Whiskers */}
        <line x1="9"  y1="62" x2="29" y2="61" stroke="rgba(255,255,255,0.28)" strokeWidth="1" strokeLinecap="round"/>
        <line x1="7"  y1="67" x2="28" y2="66" stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeLinecap="round"/>
        <line x1="71" y1="61" x2="91" y2="62" stroke="rgba(255,255,255,0.28)" strokeWidth="1" strokeLinecap="round"/>
        <line x1="72" y1="66" x2="93" y2="67" stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeLinecap="round"/>

        {/* Scan line */}
        <line
          x1="11" y1="50" x2="89" y2="50"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1"
          strokeLinecap="round"
          clipPath="url(#lx-hero-clip)"
          className="lynx-scan"
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
  size?: number;
  color?: string;
  sub?: boolean;
  subText?: string;
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

/** Alias for compat */
export const WraithWordmark = LynxWordmark;

export function AlphaLogo({ markSize = 34, fontSize = 22, sub = true }: { markSize?: number; fontSize?: number; sub?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
      <LynxMark size={markSize} />
      <LynxWordmark size={fontSize} sub={sub} />
    </div>
  );
}
