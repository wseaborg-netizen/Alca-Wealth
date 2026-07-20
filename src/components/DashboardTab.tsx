"use client";
import React, { useEffect, useState } from "react";
import { T, ui, mono } from "./tokens";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { Reveal, CountUp, useMediaQuery, usePrefersReducedMotion } from "./motion";
import { greetingName } from "@/lib/profile";

export type DashTab = "find" | "analysis" | "comparison" | "recommendation" | "discover"
  | "research" | "workspace" | "portfolio" | "murderboard" | "watchlist" | "model"
  | "model-fund" | "model-project" | "model-scenarios";

interface MarketItem {
  ticker: string; label: string; group: string;
  price: number | null;
  change1d: number | null; change1w: number | null; change1m: number | null; changeYtd: number | null;
  spark6m?: number[];
}
interface MarketData { items: MarketItem[]; fetchedAt: number; }

// ── Advisor Overview — the "Enter Platform" landing surface ──────────────────
// A light, calm advisor overview: soft-gray page, white cards, dark charcoal
// reserved for the market data strip. Market data comes from /api/market
// (Financial Modeling Prep).

// Charcoal palette — used ONLY inside the dark market strip.
const STRIP_BG   = "linear-gradient(150deg, #101216 0%, #15171C 100%)";
const STRIP_LINE = "rgba(255,255,255,0.09)";
const STRIP_TXT  = "#F4F5F7";
const STRIP_DIM  = "rgba(244,245,247,0.66)";
const STRIP_MUT  = "rgba(244,245,247,0.4)";
const UP   = "#34D399";
const DOWN = "#F87171";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtPrice = (v: number | null) =>
  v == null ? "-" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null) =>
  v == null ? "-" : (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
const pctColDark = (v: number | null) => (v == null ? STRIP_MUT : v >= 0 ? UP : DOWN);
const pctColLight = (v: number | null) => (v == null ? T.muted : v >= 0 ? T.green : T.red);

/** Tiny glow sparkline for the market strip (dark surface). */
function StripSpark({ data, lineColor, height = 44 }: { data: number[]; lineColor: string; height?: number }) {
  const pts = data.map((v, i) => ({ i, v }));
  const gid = `gs-${lineColor.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div style={{ filter: `drop-shadow(0 0 5px ${lineColor}45)` }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={pts} margin={{ top: 3, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.22} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            return <div style={{ background: "#16181E", border: `1px solid rgba(255,255,255,0.16)`, borderRadius: 6, padding: "4px 8px" }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "#fff", ...mono }}>${fmtPrice(payload[0]?.value as number)}</span>
            </div>;
          }} cursor={{ stroke: lineColor + "55", strokeWidth: 1 }} />
          <Area type="monotone" dataKey="v" stroke={lineColor} strokeWidth={1.6} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One index cell in the compact market strip. */
function IndexCell({ item }: { item: MarketItem | null }) {
  if (!item) return (
    <div style={{ flex: 1, minWidth: 210, padding: "14px 18px", display: "flex", alignItems: "center",
      justifyContent: "center", color: STRIP_MUT, fontSize: 11.5, ...ui }}>Loading…</div>
  );
  const c = item.change1d != null && item.change1d >= 0 ? UP : DOWN;
  return (
    <div style={{ flex: 1, minWidth: 210, padding: "13px 18px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: STRIP_DIM, textTransform: "uppercase", letterSpacing: "0.12em", ...ui, whiteSpace: "nowrap" }}>
          {item.label}
        </span>
        <span style={{ fontSize: 9, color: STRIP_MUT, ...mono }}>{item.ticker.replace("^", "")}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 21, fontWeight: 600, color: STRIP_TXT, ...mono, letterSpacing: "-0.02em" }}>
          $<CountUp value={item.price ?? 0} decimals={2} duration={1100} />
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: c, background: `${c}1A`, borderRadius: 999, padding: "2px 9px", ...mono }}>
          {fmtPct(item.change1d)}
        </span>
      </div>
      {item.spark6m && item.spark6m.length > 10
        ? <StripSpark data={item.spark6m} lineColor={c} />
        : <div style={{ height: 44 }} />}
      <div style={{ display: "flex", gap: 14 }}>
        {([["1W", item.change1w], ["1M", item.change1m], ["YTD", item.changeYtd]] as [string, number | null][]).map(([l, v]) => (
          <span key={l} style={{ fontSize: 9.5, color: STRIP_MUT, ...ui }}>
            {l} <span style={{ fontWeight: 600, color: pctColDark(v), ...mono }}>{fmtPct(v)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Slim pill for the secondary ticker row — light surface. */
function TickerPill({ item }: { item: MarketItem }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px",
      background: T.panel, border: `1px solid ${T.line}`, borderRadius: 99, whiteSpace: "nowrap",
      boxShadow: "var(--c-card-shadow)" }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: T.data, ...mono }}>{item.ticker}</span>
      <span style={{ fontSize: 11, color: T.dim, ...mono }}>${fmtPrice(item.price)}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: pctColLight(item.change1d), ...mono }}>{fmtPct(item.change1d)}</span>
    </span>
  );
}

/** Slow looping ticker row — no native scrollbar, pause on hover, edge fades.
    Reduced motion: a stationary wrapped row instead. Real data only. */
function TickerMarquee({ items }: { items: MarketItem[] }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {items.map((it) => <TickerPill key={it.ticker} item={it} />)}
      </div>
    );
  }
  const dur = Math.max(36, items.length * 7); // slow & restrained, scales with count
  const half = (hidden: boolean) => (
    <div aria-hidden={hidden || undefined} style={{ display: "flex", gap: 8, paddingRight: 8 }}>
      {items.map((it) => <TickerPill key={it.ticker + (hidden ? "-b" : "")} item={it} />)}
    </div>
  );
  return (
    <div className="alca-ticker" style={{ position: "relative", overflow: "hidden", padding: "2px 0" }}>
      <style>{`
        @keyframes alca-ticker { to { transform: translateX(-50%); } }
        .alca-ticker:hover .alca-ticker-track { animation-play-state: paused; }
      `}</style>
      <div className="alca-ticker-track"
        style={{ display: "flex", width: "max-content", willChange: "transform",
          animation: `alca-ticker ${dur}s linear infinite` }}>
        {half(false)}
        {half(true)}
      </div>
      {/* edge fades into the page background */}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 56, pointerEvents: "none",
        background: "linear-gradient(90deg, var(--c-bg), transparent)" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 56, pointerEvents: "none",
        background: "linear-gradient(270deg, var(--c-bg), transparent)" }} />
    </div>
  );
}

// ── Workspace card glyphs — quiet visual identity per workspace (light) ───────
const GlyphResearch = (
  <svg width="132" height="44" viewBox="0 0 132 44" aria-hidden>
    {[["0", 96, "#0E7490"], ["16", 72, "#0891B2"], ["32", 52, "#155E75"]].map(([y, w, c]) => (
      <g key={y as string}>
        <rect x="0" y={y as string} width="132" height="9" rx="4.5" fill="var(--c-panel3)" />
        <rect x="0" y={y as string} width={w as number} height="9" rx="4.5" fill={c as string} opacity="0.85" />
      </g>
    ))}
  </svg>
);
const GlyphPortfolio = (() => {
  const R = 16, C = 2 * Math.PI * R;
  const segs = [[0.4, "#0E7490"], [0.26, "#0891B2"], [0.2, "#155E75"], [0.14, "var(--c-line2)"]] as [number, string][];
  let acc = 0;
  return (
    <svg width="132" height="44" viewBox="0 0 132 44" aria-hidden>
      <g transform="translate(22,22)">
        {segs.map(([f, c], i) => {
          const el = <circle key={i} r={R} fill="none" stroke={c} strokeWidth="7"
            strokeDasharray={`${f * C} ${C - f * C}`} strokeDashoffset={-acc * C} transform="rotate(-90)" opacity="0.9" />;
          acc += f; return el;
        })}
      </g>
      {[["52", 66], ["52", 46, 14], ["52", 30, 28]].map(([x, w, y = 0], i) => (
        <rect key={i} x={x as string} y={8 + (y as number)} width={w as number} height="8" rx="4"
          fill={["#0E7490", "#0891B2", "#155E75"][i]} opacity="0.7" />
      ))}
    </svg>
  );
})();
const GlyphModel = (
  <svg width="132" height="44" viewBox="0 0 132 44" aria-hidden>
    <path d="M4 38 C 30 34, 48 28, 62 22" fill="none" stroke="#0E7490" strokeWidth="2" strokeLinecap="round" />
    <path d="M62 22 C 84 14, 106 8, 128 4" fill="none" stroke="#0891B2" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M62 22 C 84 18, 106 15, 128 13" fill="none" stroke="#0E7490" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M62 22 C 84 24, 106 27, 128 30" fill="none" stroke="#155E75" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 3" />
    <circle cx="62" cy="22" r="3" fill="#0E7490" />
  </svg>
);

// ── Workspace cards ───────────────────────────────────────────────────────────
interface QuickAction { label: string; go: DashTab }
function WorkspaceCard({ step, title, desc, actions, cta, go, onNavigate, badge, delay, glyph }: {
  step: string; title: string; desc: string; actions: QuickAction[];
  cta: string; go: DashTab; onNavigate: (t: DashTab) => void; badge?: string; delay: number;
  glyph: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Reveal delay={delay} y={18} style={{ display: "flex", minWidth: 0 }}>
      <div onClick={() => onNavigate(go)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ position: "relative", overflow: "hidden", cursor: "pointer", width: "100%", minHeight: 360,
          background: T.panel, border: `1px solid ${hover ? T.line2 : T.line}`, borderRadius: 18,
          boxShadow: hover ? "var(--elev-2)" : "var(--c-card-shadow)",
          transform: hover ? "translateY(-2px)" : "none", transition: "all 0.22s var(--ease-out)",
          padding: "32px 30px 26px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.blue, ...ui, letterSpacing: "0.18em", textTransform: "uppercase" }}>{step}</span>
            {badge && (
              <span style={{ fontSize: 8.5, fontWeight: 700, color: T.amber, background: "rgba(180,83,9,0.08)",
                border: "1px solid rgba(180,83,9,0.3)", borderRadius: 99, padding: "3px 8px",
                letterSpacing: "0.1em", textTransform: "uppercase", ...ui, whiteSpace: "nowrap" }}>{badge}</span>
            )}
          </div>
          <h3 style={{ fontSize: 28, fontWeight: 700, color: T.text, ...ui, margin: "12px 0 0", letterSpacing: "-0.02em" }}>{title}</h3>
          <p style={{ fontSize: 14, color: T.dim, ...ui, margin: "9px 0 0", lineHeight: 1.6 }}>{desc}</p>
        </div>
        {/* workspace glyph — quiet identity, not a chart with fake data */}
        <div style={{ opacity: hover ? 1 : 0.85, transition: "opacity 0.22s" }}>{glyph}</div>
        {/* quick actions - stopPropagation so they don't double-fire the card */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {actions.map((a) => (
            <button key={a.label} onClick={(e) => { e.stopPropagation(); onNavigate(a.go); }}
              style={{ fontSize: 12, fontWeight: 600, color: T.dim, ...ui, background: T.panel,
                border: `1px solid ${T.line2}`, borderRadius: 9, padding: "8px 14px", cursor: "pointer",
                transition: "all 0.15s var(--ease-out)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.muted; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.dim; e.currentTarget.style.borderColor = T.line2; }}>
              {a.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={(e) => { e.stopPropagation(); onNavigate(go); }}
          style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 9,
            padding: "11px 20px", borderRadius: 10, border: "none", cursor: "pointer",
            background: hover ? T.blueD : T.blue, color: "#fff", fontSize: 13.5, fontWeight: 600, ...ui,
            transition: "background 0.18s var(--ease-out)" }}>
          {cta}
          <span style={{ transform: hover ? "translateX(3px)" : "none", transition: "transform 0.18s var(--ease-out)" }}>→</span>
        </button>
      </div>
    </Reveal>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.14em" }}>
        {children}
      </span>
      {right}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardTab({ onNavigate, userEmail }: { onNavigate?: (t: DashTab) => void; userEmail?: string | null } = {}) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [mktLoading, setMktLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const isNarrow = useMediaQuery("(max-width: 1080px)");
  const isMobile = useMediaQuery("(max-width: 720px)");

  useEffect(() => {
    fetch("/api/market").then((r) => r.json()).then((d) => { setMarket(d); setMktLoading(false); })
      .catch(() => { setError("Failed to load market data"); setMktLoading(false); });
  }, []);

  // Personalized greeting: profile first_name → auth metadata → email prefix →
  // "Advisor" (the API resolves the chain; email is the client-side fallback).
  useEffect(() => {
    let alive = true;
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setGreeting((d?.greeting as string) ?? greetingName(null, userEmail ?? null)); })
      .catch(() => { if (alive) setGreeting(greetingName(null, userEmail ?? null)); });
    return () => { alive = false; };
  }, [userEmail]);

  const go = (t: DashTab) => onNavigate?.(t);

  const find = (t: string) => market?.items.find((i) => i.ticker === t) ?? null;
  const heroes = [find("^DJI"), find("^IXIC"), find("^GSPC")];
  const others = market?.items.filter((i) => !["^GSPC", "^DJI", "^IXIC"].includes(i.ticker)) ?? [];
  const time = market ? new Date(market.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  const shimmer: React.CSSProperties = {
    background: "linear-gradient(90deg, var(--c-panel3) 25%, var(--c-panel2) 37%, var(--c-panel3) 63%)",
    backgroundSize: "400px 100%", animation: "alca-shimmer 1.4s linear infinite",
  };

  const opportunityKinds = ["High expenses", "Concentration risk", "Fund overlap", "Style drift", "Replacement candidates", "Portfolio imbalances"];

  return (
    // Full-bleed light canvas with a faint teal wash falling from under the nav.
    <div style={{ margin: "0 -32px", background: T.bg, minHeight: "100vh" }}>
      <div style={{ position: "absolute", left: 0, right: 0, height: 360, pointerEvents: "none",
        background: "linear-gradient(180deg, rgba(14,116,144,0.05) 0%, rgba(14,116,144,0) 100%)" }} />

      <div style={{ position: "relative", maxWidth: 1360, margin: "0 auto",
        padding: isMobile ? "96px 18px 56px" : "108px 40px 72px",
        display: "flex", flexDirection: "column", gap: 32 }}>

        {/* ── Header ── */}
        <Reveal>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
            <div>
              {greeting && (
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.blue, ...ui, marginBottom: 6,
                  letterSpacing: "0.02em" }}>Welcome back, {greeting}</div>
              )}
              <h1 style={{ fontSize: isMobile ? 26 : 32, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.025em" }}>
                Advisor Overview
              </h1>
              <p style={{ fontSize: 14, color: T.dim, ...ui, margin: "8px 0 0" }}>
                Live markets, your workspaces, and what needs attention.
              </p>
            </div>
            {time && <span style={{ fontSize: 11, color: T.muted, ...mono }}>Data as of {time} · delayed</span>}
          </div>
        </Reveal>

        {/* ── 1 · Compact market strip (charcoal data surface) ── */}
        <Reveal delay={60}>
          {mktLoading ? (
            <div style={{ border: `1px solid ${T.line}`, borderRadius: 16, height: 128, ...shimmer }} />
          ) : error || !market ? (
            <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 16, padding: "22px 24px",
              color: T.red, fontSize: 13, ...ui }}>{error ?? "No market data"}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row",
                background: STRIP_BG, border: "1px solid #26262B", borderRadius: 16,
                boxShadow: "var(--elev-2), inset 0 1px 0 rgba(255,255,255,0.05)", overflow: "hidden" }}>
                {heroes.map((h, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <div style={{ alignSelf: "stretch", width: isNarrow ? "auto" : 1, height: isNarrow ? 1 : "auto", background: STRIP_LINE }} />}
                    <IndexCell item={h} />
                  </React.Fragment>
                ))}
              </div>
              {others.length > 0 && <TickerMarquee items={others} />}
            </div>
          )}
        </Reveal>

        {/* ── 2 · Three workspaces ── */}
        <div>
          <SectionLabel>Workspaces</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)", gap: 18, marginTop: 14 }}>
            <WorkspaceCard step="Step 1 · Research" title="Research"
              desc="Find, analyze, and compare individual investments."
              actions={[{ label: "Screen Funds", go: "discover" }, { label: "Compare Funds", go: "comparison" }, { label: "Analyze Fund", go: "analysis" }]}
              cta="Enter Research" go="research" onNavigate={go} delay={0} glyph={GlyphResearch} />
            <WorkspaceCard step="Step 2 · Portfolio" title="Portfolio"
              desc="Build, revise, and analyze complete client portfolios."
              actions={[{ label: "Create portfolio", go: "portfolio" }, { label: "Review portfolio", go: "murderboard" }, { label: "Open workspace", go: "workspace" }]}
              cta="Enter Portfolio" go="workspace" onNavigate={go} delay={90} glyph={GlyphPortfolio} />
            <WorkspaceCard step="Step 3 · Model" title="Model"
              desc="Test funds and portfolios across benchmarks, assumptions, and market scenarios."
              actions={[{ label: "Compare Fund", go: "model-fund" }, { label: "Project Portfolio", go: "model-project" }, { label: "Build Scenario", go: "model-scenarios" }]}
              cta="Enter Model" go="model" onNavigate={go} delay={180} glyph={GlyphModel} />
          </div>
        </div>

        {/* ── 3 · Recent Work ── */}
        <div>
          <SectionLabel>Recent Work</SectionLabel>
          <Reveal delay={60}>
            <div style={{ marginTop: 14, background: T.panel, border: `1px dashed ${T.line2}`, borderRadius: 16,
              padding: isMobile ? "26px 20px" : "28px 30px", display: "flex", alignItems: "center", gap: 20,
              flexWrap: "wrap" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", background: "var(--c-blueL)",
                border: `1px solid ${T.blue}33` }}>
                <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.3" stroke={T.blue} strokeWidth="1.3" />
                  <path d="M8 4.6V8l2.3 1.5" stroke={T.blue} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, ...ui }}>No recent activity yet</div>
                <div style={{ fontSize: 12.5, color: T.dim, ...ui, marginTop: 4, lineHeight: 1.55, maxWidth: 560 }}>
                  Funds you analyze, comparisons you run, and portfolios you build will appear here
                  so you can pick up where you left off.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => go("discover")}
                  style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", ...ui, cursor: "pointer",
                    background: T.blue, border: "none", borderRadius: 9, padding: "9px 16px",
                    transition: "background 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.blueD)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = T.blue)}>
                  Start researching
                </button>
                <button onClick={() => go("portfolio")}
                  style={{ fontSize: 12.5, fontWeight: 600, color: T.dim, ...ui, cursor: "pointer",
                    background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 9, padding: "9px 16px",
                    transition: "all 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.muted; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.dim; e.currentTarget.style.borderColor = T.line2; }}>
                  Build a portfolio
                </button>
              </div>
            </div>
          </Reveal>
        </div>

        {/* ── 4 · Portfolio Opportunities ── */}
        <div>
          <SectionLabel>Portfolio Opportunities</SectionLabel>
          <Reveal delay={60}>
            <div style={{ marginTop: 14, background: T.panel, border: `1px solid ${T.line}`,
              borderRadius: 16, padding: "22px 24px 20px", boxShadow: "var(--c-card-shadow)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.blue, opacity: 0.85 }} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text, ...ui }}>Watching your book</span>
              </div>
              <p style={{ fontSize: 12.5, color: T.dim, ...ui, lineHeight: 1.6, margin: "10px 0 0", maxWidth: 720 }}>
                As client portfolios are added, the feed will flag items that may need attention:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 14 }}>
                {opportunityKinds.map((k) => (
                  <span key={k} style={{ fontSize: 11, fontWeight: 600, color: T.dim, ...ui,
                    background: T.panel3, border: `1px solid ${T.line}`, borderRadius: 99, padding: "6px 12px" }}>
                    {k}
                  </span>
                ))}
              </div>
              <div style={{ height: 1, background: T.line, margin: "18px 0 14px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, color: T.muted, ...ui, lineHeight: 1.55, flex: 1, minWidth: 240 }}>
                  No findings yet — nothing needs attention, or no portfolios have been analyzed.
                </span>
                <button onClick={() => go("murderboard")}
                  style={{ fontSize: 12, fontWeight: 600, color: T.blue, ...ui, cursor: "pointer",
                    background: "var(--c-blueL)", border: `1px solid ${T.blue}44`,
                    borderRadius: 9, padding: "9px 16px", transition: "filter 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.97)")}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}>
                  Review a portfolio →
                </button>
              </div>
            </div>
          </Reveal>
        </div>

        <p style={{ fontSize: 10, color: T.muted, ...ui, textAlign: "center", margin: 0 }}>
          Prices delayed · market data via Financial Modeling Prep · Research aid - verify before client use
        </p>
      </div>
    </div>
  );
}
