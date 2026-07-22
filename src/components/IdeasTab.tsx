"use client";
import React from "react";
import { T, ui } from "./tokens";
import ScreenTab from "./ScreenTab";
import { FromFundMode, ProfileMode } from "./RecommendTab";

// ── Find Funds — the fund-sourcing area of Research ──────────────────────────
// Three distinct tools over the existing engines (nothing rebuilt):
//   Screen Funds         → ScreenTab      (universe screener / factor builder)
//   Find Similar Funds   → FromFundMode   (similar & replacement engine — the
//                          ONE canonical home for ticker-based replacements)
//   Match Client Profile → ProfileMode    (client-profile matching)
// mode "all" is the Find Funds landing; each tool page stays focused, with a
// breadcrumb back and a compact switcher — no duplicate promo cards.

export type IdeasMode = "all" | "find" | "fromfund" | "profile";
type ToolMode = Exclude<IdeasMode, "all">;

const mkIcon = (p: React.ReactNode) => <svg width="17" height="17" viewBox="0 0 16 16" fill="none">{p}</svg>;

const TOOLS: { id: ToolMode; name: string; desc: string; bullets: string[]; icon: React.ReactNode }[] = [
  {
    id: "find", name: "Screen Funds",
    desc: "Filter the full fund universe using style, category, expenses, risk, performance, and investment characteristics.",
    bullets: ["Equity style box & fixed-income matrix", "16+ metrics with factor weighting", "Ranked composite results"],
    icon: mkIcon(<><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" /><line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>),
  },
  {
    id: "fromfund", name: "Find Similar Funds",
    desc: "Start with an existing investment and identify comparable or potentially better-fitting alternatives.",
    bullets: ["Top-fit alternatives to any ticker", "Lower-cost and better-fit candidates", "Owns all replacement searches"],
    icon: mkIcon(<><path d="M3 6a5 5 0 0 1 8.5-2.5M13 4v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M13 10a5 5 0 0 1-8.5 2.5M3 12V9h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></>),
  },
  {
    id: "profile", name: "Match Client Profile",
    desc: "Rank investments using the client's risk tolerance, time horizon, income needs, cost sensitivity, asset class, and vehicle preferences.",
    bullets: ["Risk, horizon, income & cost inputs", "Ranked matches with reasoning", "One click to Compare or Analyze"],
    icon: mkIcon(<><circle cx="8" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.3" /><path d="M3 13.5c0-2.5 2.2-4.2 5-4.2s5 1.7 5 4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>),
  },
];

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
  const active = TOOLS.find((t) => t.id === mode);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: mode === "all" ? 1180 : undefined, margin: mode === "all" ? "0 auto" : undefined }}>

      {/* ── Find Funds landing ── */}
      {mode === "all" && (
        <>
          <div>
            <div style={{ fontSize: 11.5, color: T.muted, ...ui, marginBottom: 8 }}>
              Research <span style={{ margin: "0 5px", color: T.line2 }}>/</span>
              <span style={{ color: T.dim, fontWeight: 600 }}>Find Funds</span>
            </div>
            <h1 style={{ fontSize: 25, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>Find Funds</h1>
            <p style={{ fontSize: 13.5, color: T.dim, ...ui, margin: "8px 0 0", maxWidth: 700, lineHeight: 1.55 }}>
              Three ways to source investment candidates — screen the whole universe, start from a fund
              you already know, or match a client&apos;s profile.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {TOOLS.map((t) => (
              <div key={t.id} style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14,
                boxShadow: "var(--c-card-shadow)", padding: "24px 24px 22px", display: "flex", flexDirection: "column", gap: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: T.blueL,
                    border: `1px solid ${T.blue}33`, color: T.blue, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.icon}</span>
                  <span style={{ fontSize: 16.5, fontWeight: 700, color: T.text, ...ui }}>{t.name}</span>
                </div>
                <p style={{ fontSize: 12.5, color: T.dim, ...ui, lineHeight: 1.6, margin: 0 }}>{t.desc}</p>
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                  {t.bullets.map((b) => <li key={b} style={{ fontSize: 11.5, color: T.muted, ...ui, lineHeight: 1.5 }}>{b}</li>)}
                </ul>
                <button onClick={() => setMode(t.id)}
                  style={{ alignSelf: "flex-start", padding: "10px 16px", borderRadius: 9, border: "none", cursor: "pointer",
                    background: T.blue, color: "#fff", fontSize: 13, fontWeight: 600, ...ui, transition: "background 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.blueD)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = T.blue)}>
                  Open {t.name}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Focused tool page ── */}
      {active && (
        <div>
          <div style={{ fontSize: 11.5, color: T.muted, ...ui, marginBottom: 8 }}>
            Research <span style={{ margin: "0 5px", color: T.line2 }}>/</span>
            <button onClick={() => setMode("all")}
              style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 11.5, color: T.blue, fontWeight: 600, ...ui }}>
              Find Funds
            </button>
            <span style={{ margin: "0 5px", color: T.line2 }}>/</span>
            <span style={{ color: T.dim, fontWeight: 600 }}>{active.name}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.02em" }}>{active.name}</h1>
              <p style={{ fontSize: 13, color: T.dim, ...ui, margin: "7px 0 0", maxWidth: 680, lineHeight: 1.55 }}>{active.desc}</p>
            </div>
            {/* compact tool switcher — small, no promo cards */}
            <div style={{ display: "flex", gap: 6 }}>
              {TOOLS.filter((t) => t.id !== active.id).map((t) => (
                <button key={t.id} onClick={() => setMode(t.id)}
                  style={{ padding: "7px 12px", borderRadius: 8, cursor: "pointer", background: T.panel,
                    border: `1px solid ${T.line2}`, color: T.dim, fontSize: 11.5, fontWeight: 600, ...ui, transition: "all 0.14s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.muted; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.dim; e.currentTarget.style.borderColor = T.line2; }}>
                  {t.name} →
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Engines — all mounted, hidden when inactive so entered state persists */}
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
