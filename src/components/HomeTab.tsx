"use client";
import React from "react";
import dynamic from "next/dynamic";
import { ui, mono } from "./tokens";
import { UNIVERSE } from "@/lib/universe";
import { Reveal, CountUp, useMediaQuery, useInView, usePrefersReducedMotion } from "./motion";

// The Living World — lazy-loaded so the hero text renders immediately; the
// square placeholder reserves the layout, so there is no shift when it mounts.
const Globe = dynamic(() => import("./Globe"), {
  ssr: false,
  loading: () => <div style={{ width: "100%", aspectRatio: "1 / 1" }} />,
});

// ── ALCA Wealth homepage ─────────────────────────────────────────────────────
// The cinematic opening surface: hero → about workflow → two workspace gateways.
// Pure presentation + navigation; all data/logic lives in the workspaces it
// links into. Custom SVG visuals (no stock imagery), motion is scroll-driven and
// reduced-motion safe (globals.css neutralizes keyframe animations).

const UNIVERSE_COUNT = UNIVERSE.length;

// Arctic-light hero palette — white, icy, editorial (matches the Advisor
// Overview's arctic-sunrise identity: this is where ALCA lives).
const H = {
  bg: "#F4F8FC",
  text: "#0E1726",
  dim: "rgba(14,23,38,0.64)",
  muted: "rgba(14,23,38,0.40)",
  line: "rgba(14,23,38,0.08)",
  card: "rgba(255,255,255,0.6)",
  accent: "#2563EB",
  teal: "#0E7490",
};

// Wide arctic horizon — snowy ridge under a soft dawn glow, fading into the
// page. The homepage variant of the Advisor Overview's signature hero art.
function ArcticHorizon({ height = 260 }: { height?: number }) {
  return (
    <svg viewBox="0 0 1440 260" preserveAspectRatio="xMidYMax slice" aria-hidden
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height, pointerEvents: "none" }}>
      <defs>
        <radialGradient id="ha-dawn" cx="62%" cy="92%" r="52%">
          <stop offset="0%" stopColor="#FBD3B4" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#F6C9AE" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#F6C9AE" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ha-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D8E4F1" /><stop offset="100%" stopColor="#E9F0F8" />
        </linearGradient>
        <linearGradient id="ha-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C6D6E9" /><stop offset="100%" stopColor="#E0EAF4" />
        </linearGradient>
        <linearGradient id="ha-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4F8FC" stopOpacity="1" /><stop offset="100%" stopColor="#F4F8FC" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="1440" height="260" fill="url(#ha-dawn)" />
      <path d="M0 190 L150 138 L260 176 L420 122 L560 170 L730 128 L900 178 L1050 132 L1200 168 L1330 140 L1440 164 L1440 260 L0 260 Z"
        fill="url(#ha-back)" opacity="0.8" />
      <path d="M0 226 L190 164 L330 206 L520 152 L680 206 L860 162 L1040 214 L1220 164 L1360 200 L1440 182 L1440 260 L0 260 Z"
        fill="url(#ha-front)" />
      <g fill="#FFFFFF" opacity="0.6">
        <path d="M190 164 L216 180 L190 190 L168 178 Z" /><path d="M520 152 L548 170 L520 180 L496 168 Z" />
        <path d="M860 162 L886 178 L860 188 L838 176 Z" /><path d="M1220 164 L1244 179 L1220 189 L1200 178 Z" />
      </g>
      <rect width="1440" height="70" fill="url(#ha-fade)" />
    </svg>
  );
}

interface HomeProps {
  onEnterPlatform: () => void;
  onOpenResearch: () => void;
  onOpenPortfolio: () => void;
  onOpenModel: () => void;
  onExplore: () => void;
}

// ── Capability bullet ─────────────────────────────────────────────────────────
function Cap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="7" stroke="var(--c-accent)" strokeWidth="1.2" opacity="0.5" />
        <path d="M5 8.2l2 2 4-4.4" stroke="var(--c-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 13.5, color: "var(--c-dim)", ...ui, lineHeight: 1.4 }}>{children}</span>
    </div>
  );
}

// ── Scroll-driven showcase demonstrations ────────────────────────────────────
// Each showcase plays a short (~5-6s) staged sequence when ~30% of it enters
// the viewport, holds its completed state, and resets after the user scrolls
// well away. Reduced motion renders the completed state statically.
function useShowcasePlay() {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ once: false, threshold: 0.3, margin: "0px 0px -10% 0px" });
  return { ref, play: inView, reduced };
}
// Style helper: hidden until play, then run the keyframe; reduced = final state.
const seq = (play: boolean, reduced: boolean, name: string, delaySec: number, extra?: React.CSSProperties): React.CSSProperties =>
  reduced ? { ...extra } : play
    ? { animation: `${name} 0.6s cubic-bezier(0.4,0,0.2,1) ${delaySec}s both`, ...extra }
    : { opacity: 0, ...extra };

const SHOWCASE_KEYFRAMES = `
  @keyframes sw-in   { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes sw-on   { from { opacity: 0; } to { opacity: 1; } }
  @keyframes sw-dim  { from { opacity: 1; } to { opacity: 0.14; } }
  @keyframes sw-up1  { from { opacity: 1; transform: none; } to { opacity: 1; transform: translateY(-26px); } }
  @keyframes sw-up2  { from { opacity: 1; transform: none; } to { opacity: 1; transform: translateY(-52px); } }
  @keyframes sw-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes sw-draw { from { stroke-dashoffset: 260; opacity: 1; } to { stroke-dashoffset: 0; opacity: 1; } }
  @keyframes sw-flag { 0% { opacity: 0; } 25% { opacity: 1; } 50% { opacity: 0.4; } 75% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes sw-swap { from { opacity: 1; } to { opacity: 0; } }
`;

const SW = { txt: "#F4F5F7", dim: "rgba(244,245,247,0.6)", mut: "rgba(244,245,247,0.4)",
  line: "rgba(255,255,255,0.12)", teal: "#5EEAD4", cyan: "#38BDF8", deep: "#0E7490", amber: "#F5B04B" };

/** Research: a broad field of funds narrows to a focused shortlist. */
function ResearchDemo() {
  const { ref, play, reduced } = useShowcasePlay();
  const rows = [
    { t: "SCHD", cat: "US Value", er: "0.06%", keep: true },
    { t: "QQQM", cat: "Large Growth", er: "0.15%", keep: false },
    { t: "VTI",  cat: "US Blend", er: "0.03%", keep: true },
    { t: "ARKK", cat: "Thematic", er: "0.75%", keep: false },
    { t: "DGRO", cat: "Dividend Growth", er: "0.08%", keep: true },
    { t: "XYLD", cat: "Covered Call", er: "0.60%", keep: false },
  ];
  const chips = ["Expense < 0.20%", "Risk: Moderate", "US Equity"];
  let upIdx = 0;
  return (
    <div ref={ref} role="img" aria-label="Demonstration: screening a broad list of funds down to a focused shortlist for comparison">
      <svg viewBox="0 0 320 200" width="100%" style={{ display: "block" }}>
        <style>{SHOWCASE_KEYFRAMES}</style>
        {/* filters activate */}
        {chips.map((c, i) => (
          <g key={c}>
            <rect x={8 + i * 106} y="4" width="100" height="21" rx="10.5" fill="none" stroke={SW.line} strokeWidth="1" />
            <text x={58 + i * 106} y="18" textAnchor="middle" fontSize="9" fill={SW.mut} fontFamily="'Geist', sans-serif">{c}</text>
            <g style={seq(play, reduced, "sw-on", 1.3 + i * 0.3)}>
              <rect x={8 + i * 106} y="4" width="100" height="21" rx="10.5" fill="rgba(94,234,212,0.09)" stroke={SW.teal} strokeWidth="1" />
              <text x={58 + i * 106} y="18" textAnchor="middle" fontSize="9" fontWeight="600" fill={SW.teal} fontFamily="'Geist', sans-serif">{c}</text>
            </g>
          </g>
        ))}
        {/* fund rows */}
        {rows.map((r, i) => {
          const y = 36 + i * 26;
          const keepIdx = r.keep ? upIdx++ : -1; // 0,1,2 for the survivors
          // kept rows appear then slide up to close gaps; filtered rows appear then dim.
          const rowStyle: React.CSSProperties = reduced
            ? (r.keep ? { transform: `translateY(-${(i - keepIdx) * 26}px)` } : { opacity: 0.14 })
            : !play
              ? { opacity: 0 }
              : r.keep
                ? { animation: `sw-in 0.6s ${0.15 + i * 0.15}s both${i !== keepIdx ? `, ${keepIdx === 1 ? "sw-up1" : "sw-up2"} 0.7s cubic-bezier(0.4,0,0.2,1) 3.2s both` : ""}` }
                : { animation: `sw-in 0.6s ${0.15 + i * 0.15}s both, sw-dim 0.6s 2.5s both` };
          return (
            <g key={r.t} style={rowStyle}>
              <rect x="8" y={y} width="304" height="21" rx="6" fill="rgba(255,255,255,0.035)" stroke={SW.line} strokeWidth="1" />
              <text x="18" y={y + 14.5} fontSize="10" fontWeight="700" fill={SW.txt} fontFamily="'Geist Mono', monospace">{r.t}</text>
              <text x="62" y={y + 14.5} fontSize="8.5" fill={SW.dim} fontFamily="'Geist', sans-serif">{r.cat}</text>
              <text x="200" y={y + 14.5} fontSize="8.5" fill={SW.dim} fontFamily="'Geist Mono', monospace">{r.er}</text>
              {r.keep && (
                <g style={seq(play, reduced, "sw-on", 4.2)}>
                  <rect x="248" y={y + 4} width="54" height="13" rx="6.5" fill="rgba(94,234,212,0.1)" stroke="rgba(94,234,212,0.4)" strokeWidth="0.8" />
                  <text x="275" y={y + 13.5} textAnchor="middle" fontSize="7.5" fontWeight="600" fill={SW.teal} fontFamily="'Geist', sans-serif">Compare</text>
                </g>
              )}
            </g>
          );
        })}
        {/* highlight ring on the lead candidate */}
        <rect x="6.5" y="34.5" width="307" height="24" rx="7" fill="none" stroke={SW.teal} strokeWidth="1.3"
          style={seq(play, reduced, "sw-on", 5)} />
        <text x="8" y="196" fontSize="8" fill={SW.mut} fontFamily="'Geist', sans-serif" letterSpacing="0.8"
          style={seq(play, reduced, "sw-on", 5.2)}>ILLUSTRATIVE · SHORTLIST OF 3 FROM SCREEN</text>
      </svg>
    </div>
  );
}

/** Portfolio: selected funds assemble into an allocation and get diagnosed. */
function PortfolioDemo() {
  const { ref, play, reduced } = useShowcasePlay();
  const barsA = [[ "VTI", 150, SW.teal], ["VXUS", 96, SW.cyan], ["BND", 58, SW.deep]] as [string, number, string][];
  const barsB = [[ "VTI", 122, SW.teal], ["VXUS", 96, SW.cyan], ["BND", 88, SW.deep]] as [string, number, string][];
  const wA = ["52%", "31%", "17%"], wB = ["40%", "31%", "29%"];
  return (
    <div ref={ref} role="img" aria-label="Demonstration: funds assembling into a portfolio allocation, a concentration flag appearing, and the allocation adjusting into a proposed mix">
      <svg viewBox="0 0 320 200" width="100%" style={{ display: "block" }}>
        <style>{SHOWCASE_KEYFRAMES}</style>
        <text x="8" y="14" fontSize="8" fill={SW.mut} fontFamily="'Geist', sans-serif" letterSpacing="0.8">ALLOCATION</text>
        {barsA.map(([t, w, c], i) => (
          <g key={t as string} style={seq(play, reduced, "sw-in", 0.2 + i * 0.3)}>
            <text x="8" y={40 + i * 34} fontSize="10" fontWeight="700" fill={SW.txt} fontFamily="'Geist Mono', monospace">{t}</text>
            <rect x="52" y={30 + i * 34} width="210" height="14" rx="7" fill="rgba(255,255,255,0.06)" />
            {/* initial (concentrated) width */}
            <g style={reduced ? { opacity: 0 } : play ? { animation: "sw-swap 0.5s 3.9s both" } : undefined}>
              <rect x="52" y={30 + i * 34} width={w as number} height="14" rx="7" fill={c as string}
                style={{ transformOrigin: "52px 0", transformBox: "view-box" as never,
                  ...(reduced ? {} : play ? { animation: `sw-grow 0.9s ${1 + i * 0.25}s both cubic-bezier(0.16,1,0.3,1)` } : { opacity: 0 }) }} />
              <text x={58 + (w as number)} y={41 + i * 34} fontSize="8.5" fill={SW.dim} fontFamily="'Geist Mono', monospace"
                style={seq(play, reduced, "sw-on", 2.1)}>{wA[i]}</text>
            </g>
            {/* adjusted (balanced) width */}
            <g style={seq(play, reduced, "sw-on", 4.1)}>
              <rect x="52" y={30 + i * 34} width={barsB[i][1]} height="14" rx="7" fill={c as string} />
              <text x={58 + barsB[i][1]} y={41 + i * 34} fontSize="8.5" fill={SW.dim} fontFamily="'Geist Mono', monospace">{wB[i]}</text>
            </g>
          </g>
        ))}
        {/* concentration flag — appears, then resolves */}
        {!reduced && (
          <g style={play ? { animation: "sw-flag 1.6s 2.6s both" } : { opacity: 0 }}>
            <rect x="200" y="24" width="104" height="18" rx="6" fill="rgba(245,176,75,0.1)" stroke="rgba(245,176,75,0.5)" strokeWidth="0.8" />
            <text x="252" y="36.5" textAnchor="middle" fontSize="8.5" fontWeight="600" fill={SW.amber} fontFamily="'Geist', sans-serif">US concentration</text>
          </g>
        )}
        {/* current vs proposed mini summary */}
        <g style={seq(play, reduced, "sw-in", 4.7)}>
          <line x1="8" y1="140" x2="312" y2="140" stroke={SW.line} strokeWidth="1" />
          {["Current", "Proposed"].map((label, k) => (
            <g key={label} transform={`translate(${12 + k * 156}, 150)`}>
              <text y="10" fontSize="8.5" fontWeight="600" fill={k === 1 ? SW.teal : SW.dim} fontFamily="'Geist', sans-serif">{label}</text>
              {(k === 0 ? [78, 46, 26] : [58, 46, 42]).map((w, j) => (
                <rect key={j} y={16 + j * 8} width={w} height="5" rx="2.5"
                  fill={k === 1 ? [SW.teal, SW.cyan, SW.deep][j] : "rgba(255,255,255,0.22)"} />
              ))}
            </g>
          ))}
        </g>
        <text x="8" y="196" fontSize="8" fill={SW.mut} fontFamily="'Geist', sans-serif" letterSpacing="0.8"
          style={seq(play, reduced, "sw-on", 5.2)}>ILLUSTRATIVE · DIAGNOSED &amp; REBALANCED</text>
      </svg>
    </div>
  );
}

/** Model: one path branches into illustrative scenario ranges vs a benchmark. */
function ModelDemo() {
  const { ref, play, reduced } = useShowcasePlay();
  const d = (name: string, delay: number, dur = 1) =>
    reduced ? { strokeDashoffset: 0 } as React.CSSProperties
    : play ? { animation: `sw-draw ${dur}s cubic-bezier(0.4,0,0.2,1) ${delay}s both` } : { opacity: 0 };
  return (
    <div ref={ref} role="img" aria-label="Demonstration: a portfolio projection branching into optimistic, base, and stress scenario paths compared with a benchmark">
      <svg viewBox="0 0 320 200" width="100%" style={{ display: "block" }}>
        <style>{SHOWCASE_KEYFRAMES}</style>
        {/* axes */}
        <g style={seq(play, reduced, "sw-on", 0)}>
          <line x1="16" y1="8" x2="16" y2="168" stroke={SW.line} strokeWidth="1" />
          <line x1="16" y1="168" x2="308" y2="168" stroke={SW.line} strokeWidth="1" />
        </g>
        {/* base history to the branch point */}
        <path d="M16 150 C 60 144, 105 130, 148 112" fill="none" stroke={SW.teal} strokeWidth="2.2"
          strokeLinecap="round" pathLength={260} strokeDasharray="260" style={d("hist", 0.3, 1.1)} />
        {/* benchmark */}
        <path d="M16 152 C 80 146, 180 128, 300 96" fill="none" stroke="rgba(244,245,247,0.4)" strokeWidth="1.4"
          strokeDasharray="260" pathLength={260} strokeLinecap="round"
          style={reduced ? { strokeDashoffset: 0 } : play ? { animation: "sw-draw 1s 1.5s both", strokeDasharray: "260" } : { opacity: 0 }} />
        {/* assumption chip */}
        <g style={seq(play, reduced, "sw-in", 2.4)}>
          <rect x="34" y="20" width="132" height="19" rx="9.5" fill="rgba(56,189,248,0.08)" stroke="rgba(56,189,248,0.4)" strokeWidth="0.8" />
          <text x="100" y="33" textAnchor="middle" fontSize="8.5" fill={SW.cyan} fontFamily="'Geist', sans-serif">Assumption: return −1%</text>
        </g>
        {/* branch point */}
        <circle cx="148" cy="112" r="3.5" fill={SW.teal} style={seq(play, reduced, "sw-on", 1.4)} />
        {/* scenario band */}
        <path d="M148 112 C 200 96, 255 62, 300 34 L 300 138 C 255 132, 200 126, 148 112 Z"
          fill="rgba(94,234,212,0.08)" style={seq(play, reduced, "sw-on", 3.4)} />
        {/* branches */}
        <path d="M148 112 C 200 96, 255 62, 300 34" fill="none" stroke={SW.cyan} strokeWidth="1.6"
          strokeLinecap="round" pathLength={260} strokeDasharray="260" style={d("opt", 2.9, 1.1)} />
        <path d="M148 112 C 200 100, 255 82, 300 64" fill="none" stroke={SW.teal} strokeWidth="2.2"
          strokeLinecap="round" pathLength={260} strokeDasharray="260" style={d("base", 3.0, 1.1)} />
        <path d="M148 112 C 200 118, 255 128, 300 138" fill="none" stroke={SW.amber} strokeWidth="1.6"
          strokeDasharray="260" pathLength={260} strokeLinecap="round" style={d("stress", 3.1, 1.1)} />
        {/* labels */}
        {([["Optimistic", 30, SW.cyan], ["Base scenario", 60, SW.teal], ["Stress scenario", 142, SW.amber], ["Benchmark", 92, "rgba(244,245,247,0.5)"]] as [string, number, string][]).map(([l, y, c]) => (
          <text key={l as string} x="228" y={y as number} fontSize="8" fontWeight="600" fill={c as string}
            fontFamily="'Geist', sans-serif" style={seq(play, reduced, "sw-on", 4.4)}>{l}</text>
        ))}
        {/* ending range bracket */}
        <g style={seq(play, reduced, "sw-in", 4.9)}>
          <line x1="308" y1="34" x2="308" y2="138" stroke={SW.teal} strokeWidth="1.2" />
          <line x1="304" y1="34" x2="308" y2="34" stroke={SW.teal} strokeWidth="1.2" />
          <line x1="304" y1="138" x2="308" y2="138" stroke={SW.teal} strokeWidth="1.2" />
        </g>
        <text x="16" y="192" fontSize="8" fill={SW.mut} fontFamily="'Geist', sans-serif" letterSpacing="0.8"
          style={seq(play, reduced, "sw-on", 5.2)}>ILLUSTRATIVE · ASSUMPTION-BASED RANGE, NOT A FORECAST</text>
      </svg>
    </div>
  );
}

// ── Product showcase — large alternating storytelling section ─────────────────
function Showcase({
  step, title, desc, points, actionLabel, onAction, visual, chips, flip, badge, note,
}: {
  step: string; title: string; desc: string; points: string[];
  actionLabel: string; onAction: () => void; visual: React.ReactNode;
  chips: string[]; flip?: boolean; badge?: string; note?: string;
}) {
  const isMobile = useMediaQuery("(max-width: 880px)");
  const [hover, setHover] = React.useState(false);
  return (
    <section style={{ padding: isMobile ? "52px 22px" : "76px 48px", background: "var(--c-bg)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1.12fr", gap: isMobile ? 28 : 64, alignItems: "center" }}>

        {/* copy */}
        <Reveal y={20} style={{ order: isMobile ? 1 : flip ? 2 : 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--c-accent)", ...ui,
              letterSpacing: "0.2em", textTransform: "uppercase" }}>{step}</span>
            {badge && (
              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--c-amber)", background: "rgba(180,83,9,0.10)",
                border: "1px solid rgba(180,83,9,0.35)", borderRadius: 99, padding: "3px 9px",
                letterSpacing: "0.1em", textTransform: "uppercase", ...ui, whiteSpace: "nowrap" }}>{badge}</span>
            )}
          </div>
          <h2 style={{ fontSize: isMobile ? 34 : 46, fontWeight: 700, color: "var(--c-text)", ...ui,
            margin: "16px 0 0", letterSpacing: "-0.03em", lineHeight: 1.05 }}>{title}</h2>
          <p style={{ fontSize: isMobile ? 15.5 : 17.5, color: "var(--c-dim)", ...ui, margin: "16px 0 0",
            lineHeight: 1.6, maxWidth: 440 }}>{desc}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 24 }}>
            {points.map((p) => <Cap key={p}>{p}</Cap>)}
          </div>
          {note && (
            <p style={{ fontSize: 12, color: "var(--c-muted)", ...ui, margin: "16px 0 0", lineHeight: 1.55 }}>{note}</p>
          )}
          {/* one subtle contextual action */}
          <button onClick={onAction} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 26,
              background: "none", border: "none", cursor: "pointer", padding: 0,
              fontSize: 15, fontWeight: 700, color: "var(--c-accent)", ...ui,
              borderBottom: `1.5px solid ${hover ? "var(--c-accent)" : "transparent"}`,
              paddingBottom: 3, transition: "border-color 0.18s" }}>
            {actionLabel}
            <span style={{ transform: hover ? "translateX(4px)" : "none", transition: "transform 0.18s" }}>→</span>
          </button>
        </Reveal>

        {/* dark demo panel */}
        <Reveal y={26} delay={100} style={{ order: isMobile ? 2 : flip ? 1 : 2, minWidth: 0 }}>
          <div style={{ position: "relative", overflow: "hidden", borderRadius: 22,
            background: "linear-gradient(150deg, #0C0E13 0%, #12151D 60%, #0E1118 100%)",
            border: "1px solid #24262C",
            boxShadow: "0 22px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
            padding: isMobile ? "22px 20px 18px" : "30px 30px 24px" }}>
            <div style={{ position: "absolute", inset: 0, opacity: 0.05, pointerEvents: "none",
              backgroundImage: "radial-gradient(circle, #FFFFFF 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
            <div style={{ position: "absolute", top: -70, right: -70, width: 240, height: 240, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(94,234,212,0.14), transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "relative", background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "18px 18px 12px" }}>
              {visual}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, position: "relative" }}>
              {chips.map((c) => (
                <span key={c} style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(244,245,247,0.62)", ...ui,
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 99, padding: "5px 12px", letterSpacing: "0.04em" }}>{c}</span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function HomeTab({ onEnterPlatform, onOpenResearch, onOpenPortfolio, onOpenModel, onExplore }: HomeProps) {
  const isMobile = useMediaQuery("(max-width: 820px)");
  const gap = isMobile ? 24 : 40;

  // Live merged fund count (static base + verified dynamic funds added via the
  // Expansion Hub). Falls back to the build-time static count until it loads.
  const [fundCount, setFundCount] = React.useState<number>(UNIVERSE_COUNT);
  React.useEffect(() => {
    let alive = true;
    fetch("/api/universe/count", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && typeof d?.merged === "number" && d.merged > 0) setFundCount(d.merged); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    // Negative horizontal margins pull the homepage out of AppShell's padded
    // <main> so the hero can run full-bleed edge to edge.
    <div style={{ margin: "0 -32px", background: "var(--c-bg)" }}>
      {/* shared keyframes used by the showcase visuals below */}
      <style>{`
        @keyframes alca-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes alca-pulse { 0%,100% { opacity: 0.5; r: 3.2; } 50% { opacity: 1; r: 4.6; } }
      `}</style>

      {/* ── HERO ── */}
      <section style={{ position: "relative", overflow: "hidden", color: H.text,
        background: "linear-gradient(180deg, #EAF1F9 0%, #F2F1F4 55%, #FBF0E7 86%, #F4F8FC 100%)",
        borderBottom: `1px solid ${H.line}` }}>
        {/* pale icy lighting + a soft halo behind the globe so the dark earth
            sits naturally against the dawn sky */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
          background: isMobile
            ? "radial-gradient(120% 90% at 78% 8%, rgba(37,99,235,0.07), transparent 55%)"
            : "radial-gradient(120% 90% at 78% 8%, rgba(37,99,235,0.07), transparent 55%), radial-gradient(58% 64% at 80% 50%, rgba(14,60,120,0.16) 0%, rgba(14,60,120,0.05) 45%, transparent 70%)" }} />
        {/* fine grid — masked so the dots dissolve into the globe's atmosphere */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.05, pointerEvents: "none",
          backgroundImage: "radial-gradient(circle, #16233A 1px, transparent 1px)", backgroundSize: "26px 26px",
          ...(isMobile ? {} : {
            WebkitMaskImage: "radial-gradient(circle at 79% 52%, transparent 0, transparent 24%, rgba(0,0,0,0.45) 38%, black 52%)",
            maskImage: "radial-gradient(circle at 79% 52%, transparent 0, transparent 24%, rgba(0,0,0,0.45) 38%, black 52%)",
          }) }} />
        {/* signature arctic horizon along the hero's base */}
        <ArcticHorizon height={isMobile ? 170 : 250} />

        <div style={{ position: "relative", maxWidth: 1360, margin: "0 auto",
          padding: isMobile ? "120px 22px 64px" : "140px 48px 90px",
          display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.05fr 0.95fr", gap, alignItems: "center" }}>

          {/* copy */}
          <div>
            <Reveal y={12}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 600,
                letterSpacing: "0.2em", textTransform: "uppercase", color: H.accent,
                background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.22)",
                borderRadius: 99, padding: "6px 14px", ...ui }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: H.accent }} />
                The Advisor Operating System
              </span>
            </Reveal>
            <Reveal delay={80} y={16}>
              <h1 style={{ fontSize: isMobile ? "clamp(38px,10vw,54px)" : "clamp(52px,5.2vw,78px)", fontWeight: 700,
                lineHeight: 1.02, letterSpacing: "-0.03em", margin: "26px 0 0", ...ui, color: H.text }}>
                Research.<br />Construct.<br /><span style={{ background: "linear-gradient(120deg, #2563EB, #38BDF8)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Model.</span>
              </h1>
            </Reveal>
            <Reveal delay={160} y={16}>
              <p style={{ fontSize: isMobile ? 16 : 18.5, color: H.dim, lineHeight: 1.62, margin: "26px 0 0",
                maxWidth: 480, ...ui }}>
                ALCA Wealth brings investment research, portfolio construction, analytics,
                and scenario modeling into one unified platform.
              </p>
            </Reveal>
            <Reveal delay={240} y={16}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 36 }}>
                <button onClick={onEnterPlatform}
                  style={{ padding: "15px 30px", borderRadius: 13, border: "none", cursor: "pointer",
                    background: "linear-gradient(135deg, #3B82F6, #1D4ED8)", color: "#fff",
                    fontSize: 15.5, fontWeight: 700, ...ui, boxShadow: "0 10px 30px rgba(37,99,235,0.28)",
                    transition: "transform 0.18s, box-shadow 0.18s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 14px 38px rgba(37,99,235,0.36)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 10px 30px rgba(37,99,235,0.28)"; }}>
                  Enter Platform →
                </button>
                <button onClick={onExplore}
                  style={{ padding: "15px 28px", borderRadius: 13, cursor: "pointer",
                    background: "rgba(255,255,255,0.65)", border: `1px solid rgba(14,23,38,0.14)`,
                    color: H.text, fontSize: 15.5, fontWeight: 600, ...ui,
                    backdropFilter: "blur(8px)", transition: "all 0.18s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.92)"; e.currentTarget.style.borderColor = "rgba(14,23,38,0.28)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.65)"; e.currentTarget.style.borderColor = "rgba(14,23,38,0.14)"; }}>
                  Explore ALCA Wealth
                </button>
              </div>
            </Reveal>
            <Reveal delay={320}>
              <div style={{ display: "flex", gap: isMobile ? 28 : 44, marginTop: 52, flexWrap: "wrap" }}>
                {[
                  { v: fundCount, suffix: "", label: "Classified funds" },
                  { v: 16, suffix: "+", label: "Metrics per fund" },
                  { v: 3, suffix: "", label: "Research workspaces" },
                ].map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: 30, fontWeight: 700, color: H.text, ...mono, lineHeight: 1 }}>
                      <CountUp value={s.v} suffix={s.suffix} />
                    </div>
                    <div style={{ fontSize: 11, color: H.muted, ...ui, marginTop: 7, letterSpacing: "0.08em", textTransform: "uppercase" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* The Living World — one dominant globe, bleeding past the right edge */}
          <Reveal delay={200} y={24} style={{ minWidth: 0 }}>
            <div style={{ position: "relative",
              margin: isMobile ? "0 auto" : "0 -18% 0 0",
              maxWidth: isMobile ? 420 : "none",
              transform: isMobile ? "none" : "scale(1.12)" }}>
              <Globe simplified={isMobile} />
            </div>
          </Reveal>
        </div>

        {/* scroll cue */}
        <button onClick={onExplore} aria-label="Scroll to explore"
          style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)",
            display: isMobile ? "none" : "flex", flexDirection: "column", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer", color: H.muted, animation: "alca-cue 2.6s infinite" }}>
          <span style={{ fontSize: 9, letterSpacing: "0.14em", ...ui }}>EXPLORE</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <style>{`@keyframes alca-cue { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(6px); } }`}</style>
      </section>

      {/* ── ABOUT / INTRO — leads into the product story ── */}
      <section id="alca-about" style={{ padding: isMobile ? "68px 22px 8px" : "96px 48px 12px",
        background: "var(--c-bg)", scrollMarginTop: 90 }}>
        <Reveal>
          <div style={{ textAlign: "center", maxWidth: 760, margin: "0 auto" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--c-accent)", ...ui, letterSpacing: "0.18em", textTransform: "uppercase" }}>The Platform</span>
            <h2 style={{ fontSize: isMobile ? 30 : 42, fontWeight: 700, color: "var(--c-text)", ...ui,
              margin: "18px 0 0", letterSpacing: "-0.025em", lineHeight: 1.12 }}>
              One platform for the complete advisory process.
            </h2>
            <p style={{ fontSize: 16, color: "var(--c-dim)", ...ui, margin: "20px 0 0", lineHeight: 1.65 }}>
              <span style={{ color: "var(--c-text)", fontWeight: 600 }}>Research</span> identifies the investments.{" "}
              <span style={{ color: "var(--c-text)", fontWeight: 600 }}>Portfolio</span> combines and evaluates them.{" "}
              <span style={{ color: "var(--c-text)", fontWeight: 600 }}>Model</span> explores what could happen next.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── PRODUCT STORY — Research → Portfolio → Model ── */}
      <Showcase
        step="01 · Research"
        title="Research"
        desc="Find and evaluate the investments that belong in a portfolio."
        points={[
          "Screen and discover funds across the classified universe",
          "Compare funds side by side on every metric",
          "Performance, risk, expenses & holdings in one view",
          "Investment characteristics and quality at a glance",
        ]}
        chips={[`${fundCount} classified funds`, "16+ metrics", "Screening", "Comparison"]}
        actionLabel="Explore Research"
        onAction={onOpenResearch}
        visual={<ResearchDemo />}
        note="Animated product preview with illustrative sample values — live metrics inside the platform come from market data."
      />
      <Showcase
        flip
        step="02 · Portfolio"
        title="Portfolio"
        desc="Combine investments, identify weaknesses, and construct a complete recommendation."
        points={[
          "Allocation and fund weights, built visually",
          "Current versus proposed, side by side",
          "Diversification, overlap & expense checks",
          "Retirement projections for the plan behind the portfolio",
        ]}
        chips={["Allocation", "Current vs proposed", "Diversification", "Projections"]}
        actionLabel="Explore Portfolio"
        onAction={onOpenPortfolio}
        visual={<PortfolioDemo />}
        note="Animated product preview with illustrative sample values — live metrics inside the platform come from market data."
      />
      <Showcase
        step="03 · Model"
        title="Model"
        desc="Test funds and portfolios across benchmarks, assumptions, and market scenarios."
        points={[
          "Fund vs. benchmark comparison",
          "Illustrative portfolio projections",
          "Side-by-side scenario paths",
          "Stress tests & downside ranges",
        ]}
        chips={["Illustrative", "Assumption-based", "Benchmark overlay", "Stress scenarios"]}
        actionLabel="Explore Model"
        onAction={onOpenModel}
        visual={<ModelDemo />}
        note="Test possibilities before making a recommendation — modeled outcomes depend on assumptions and are not guarantees."
      />

      {/* ── FINAL ENTER PLATFORM ── */}
      <section style={{ position: "relative", overflow: "hidden", background: H.bg,
        borderTop: `1px solid ${H.line}`, padding: isMobile ? "72px 22px 120px" : "104px 48px 170px" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(90% 80% at 50% 0%, rgba(37,99,235,0.06), transparent 60%)" }} />
        <div style={{ position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none",
          backgroundImage: "radial-gradient(circle, #16233A 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
        <ArcticHorizon height={isMobile ? 120 : 160} />
        <Reveal>
          <div style={{ position: "relative", textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
            <h2 style={{ fontSize: isMobile ? 30 : 44, fontWeight: 700, color: H.text, ...ui,
              margin: 0, letterSpacing: "-0.03em", lineHeight: 1.08 }}>
              Ready to work?
            </h2>
            <p style={{ fontSize: 16, color: H.dim, ...ui, margin: "18px 0 0", lineHeight: 1.6 }}>
              Open your Advisor Overview — live markets, your three workspaces, and what needs attention today.
            </p>
            <button onClick={onEnterPlatform}
              style={{ marginTop: 32, padding: "16px 36px", borderRadius: 13, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #3B82F6, #1D4ED8)", color: "#fff",
                fontSize: 16, fontWeight: 700, ...ui, boxShadow: "0 12px 34px rgba(37,99,235,0.28)",
                transition: "transform 0.18s, box-shadow 0.18s" }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 16px 42px rgba(37,99,235,0.36)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 12px 34px rgba(37,99,235,0.28)"; }}>
              Enter Platform →
            </button>
            <p style={{ fontSize: 10.5, color: H.muted, ...ui, margin: "40px 0 0", letterSpacing: "0.03em" }}>
              Internal research aid · verify before client use
            </p>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
