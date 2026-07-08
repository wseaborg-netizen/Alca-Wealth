"use client";
import React from "react";
import { T, ui } from "./tokens";
import { PageHeader } from "./ui";
import ScreenTab from "./ScreenTab";
import { FromFundMode, ProfileMode } from "./RecommendTab";

export type IdeasMode = "all" | "find" | "fromfund" | "profile";

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconAll = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
    <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
    <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
    <rect x="9" y="9" width="5.5" height="5.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);
const IconFind = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const IconHeld = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4" />
    <line x1="9.5" y1="9.5" x2="13.5" y2="13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <line x1="4.7" y1="6.5" x2="8.3" y2="6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <line x1="6.5" y1="4.7" x2="6.5" y2="8.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);
const IconProfile = (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.3" />
    <path d="M3 13.5c0-2.5 2.2-4.2 5-4.2s5 1.7 5 4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export type DiscoverSection = {
  id: IdeasMode; label: string; short: string; icon: React.ReactNode; desc: string; tag: string;
};

export const DISCOVER_SECTIONS: DiscoverSection[] = [
  { id: "all", label: "All", short: "All", icon: IconAll, tag: "",
    desc: "The whole Discover toolkit in one place." },
  { id: "find", label: "Screen", short: "Screen", icon: IconFind, tag: "Screener",
    desc: "Screen the whole universe by style box, cost, alpha, Sharpe and the factors you weight." },
  { id: "fromfund", label: "Similar to a ticker", short: "Similar to a ticker", icon: IconHeld, tag: "From a reference",
    desc: "Enter a fund a client owns - get the top-fit alternatives and the best option for each goal." },
  { id: "profile", label: "Match a client profile", short: "Client profile", icon: IconProfile, tag: "From a reference",
    desc: "Describe risk, horizon, income & cost - get funds ranked to the client's profile." },
];

const TOOLS = DISCOVER_SECTIONS.filter((s) => s.id !== "all");

// ── Hub landing ("All") - every option as a clickable card ──────────────────────
// Capability bullets per tool
const BULLETS: Record<string, string[]> = {
  find: ["Style box + 16 metrics", "Weight by the factors you care about", "Ranked composite score"],
  fromfund: ["Top-fit alternatives to a held fund", "Best option for each goal", "Fit score vs the original"],
  profile: ["Risk, horizon, income & cost inputs", "Ranked matches with the reasoning", "One click to compare or analyze"],
};

// A finance mini-graphic per tool, drawn over a dark gradient header band.
function CardGraphic({ id, accent }: { id: string; accent: string }) {
  return (
    <div style={{ height: 78, borderRadius: 10, marginBottom: 13, overflow: "hidden", position: "relative",
      background: "linear-gradient(135deg, #0F0F11 0%, #1A1A1D 100%)", border: "1px solid #262628" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.06,
        backgroundImage: "radial-gradient(circle, #FFFFFF 1px, transparent 1px)", backgroundSize: "14px 14px" }} />
      <svg width="100%" height="78" viewBox="0 0 240 78" preserveAspectRatio="xMidYMid meet"
        style={{ position: "relative", filter: `drop-shadow(0 0 6px ${accent}66)` }}>
        {id === "find" && (
          <g>
            {[[60, 30], [96, 18], [132, 40], [168, 12], [204, 26]].map(([x, h], i) => (
              <rect key={i} x={x} y={58 - h} width="20" height={h} rx="2" fill={accent} opacity={0.45 + i * 0.11} />
            ))}
            <line x1="44" y1="58" x2="220" y2="58" stroke="#3A3A3E" strokeWidth="1" />
          </g>
        )}
        {id === "fromfund" && (
          <g>
            <polyline points="40,52 70,40 100,46 130,26 160,32 196,16" fill="none" stroke={accent} strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="150" cy="34" r="15" fill="none" stroke="#7B8190" strokeWidth="2" />
            <line x1="161" y1="45" x2="172" y2="56" stroke="#7B8190" strokeWidth="2.4" strokeLinecap="round" />
          </g>
        )}
        {id === "profile" && (
          <g>
            <path d="M70 56 A40 40 0 0 1 170 56" fill="none" stroke="#3A3A3E" strokeWidth="6" strokeLinecap="round" />
            <path d="M70 56 A40 40 0 0 1 138 27" fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" />
            <line x1="120" y1="56" x2="146" y2="34" stroke="#E5E7EB" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="120" cy="56" r="4" fill="#E5E7EB" />
          </g>
        )}
      </svg>
    </div>
  );
}

function HubCard({ s, onClick }: { s: DiscoverSection; onClick: () => void }) {
  const [hover, setHover] = React.useState(false);
  const accent = T.blue;
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ textAlign: "left", cursor: "pointer", borderRadius: 12, padding: "16px 16px 18px",
        background: T.panel, border: `1px solid ${hover ? T.blue : T.line}`,
        boxShadow: hover ? `0 8px 24px rgba(16,24,40,0.08)` : "var(--c-card-shadow)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "all 0.16s cubic-bezier(0.4,0,0.2,1)",
        display: "flex", flexDirection: "column", minWidth: 0 }}>
      <CardGraphic id={s.id} accent={accent} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: hover ? T.blue : T.panel2, border: `1px solid ${hover ? T.blue : T.line2}`,
            color: hover ? "#fff" : T.dim, display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.16s" }}>
            {s.icon}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, ...ui }}>{s.label}</div>
        </div>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase",
          color: T.muted, background: T.panel3, border: `1px solid ${T.line2}`,
          borderRadius: 5, padding: "3px 7px", whiteSpace: "nowrap", ...ui }}>{s.tag}</span>
      </div>
      <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.5, ...ui, marginBottom: 11 }}>{s.desc}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 13 }}>
        {(BULLETS[s.id] ?? []).map((b) => (
          <div key={b} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ color: accent, flexShrink: 0, display: "flex", marginTop: 1 }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span style={{ fontSize: 11.5, color: T.dim, lineHeight: 1.45, ...ui }}>{b}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.blue, ...ui, marginTop: "auto",
        display: "flex", alignItems: "center", gap: 5 }}>
        Open {s.label} <span style={{ transform: hover ? "translateX(2px)" : "none", transition: "transform 0.16s" }}>→</span>
      </div>
    </button>
  );
}

export default function IdeasTab({
  mode, setMode, seedTicker, onAddToCompare, onAnalyze, onFindSimilar,
}: {
  mode: IdeasMode;
  setMode: (m: IdeasMode) => void;
  seedTicker?: string;
  onAddToCompare: (t: string) => void;
  onAnalyze?: (t: string) => void;
  onFindSimilar?: (t: string) => void;
}) {
  const active = DISCOVER_SECTIONS.find((s) => s.id === mode);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        title={mode === "all" ? "Discover" : `Discover · ${active?.label}`}
        subtitle={mode === "all"
          ? "Source funds for clients - screen the universe, find funds like a ticker they hold, or match a client profile."
          : active?.desc} />

      {/* Hub landing - all options */}
      {mode === "all" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {TOOLS.map((s) => <HubCard key={s.id} s={s} onClick={() => setMode(s.id)} />)}
        </div>
      )}

      {/* Tools - all mounted, hidden when inactive so state persists */}
      <div style={{ display: mode === "find" ? "block" : "none" }}>
        <ScreenTab onAddToCompare={onAddToCompare} onAnalyze={onAnalyze} onFindSimilar={onFindSimilar} />
      </div>
      <div style={{ display: mode === "fromfund" ? "block" : "none" }}>
        <FromFundMode seedTicker={seedTicker} onAddToCompare={onAddToCompare} onAnalyze={onAnalyze} />
      </div>
      <div style={{ display: mode === "profile" ? "block" : "none" }}>
        <ProfileMode onAddToCompare={onAddToCompare} onAnalyze={onAnalyze} />
      </div>
    </div>
  );
}
