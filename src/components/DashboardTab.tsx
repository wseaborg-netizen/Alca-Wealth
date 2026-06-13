"use client";
import React, { useEffect, useState } from "react";
import { T, ui, mono } from "./tokens";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, CartesianGrid, XAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from "recharts";
import type { RatesData } from "../app/api/rates/route";
import universeData from "@/../data/universe.json";

export type DashTab = "news" | "find" | "analysis" | "comparison" | "recommendation" | "discover";

// Live fund-universe size — updates everywhere automatically when the universe grows.
const UNIVERSE_COUNT = (universeData as unknown[]).length;

interface MarketItem {
  ticker: string; label: string; group: string;
  price: number | null;
  change1d: number | null; change1w: number | null; change1m: number | null; changeYtd: number | null;
  spark6m?: number[];
}
interface MarketData { items: MarketItem[]; fetchedAt: number; }

interface NewsItem {
  uuid: string; title: string; summary: string; publisher: string;
  link: string; publishedAt: number; tickers: string[]; image: string;
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtPrice = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null) =>
  v == null ? "—" : (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
const fmtRate = (v: number | null) => v == null ? "—" : v.toFixed(2) + "%";
const col = (v: number | null) => v == null ? T.dim : v >= 0 ? T.green : T.red;

function Pct({ v, size = 13 }: { v: number | null; size?: number }) {
  return <span style={{ fontSize: size, fontWeight: 600, color: col(v), ...mono }}>{fmtPct(v)}</span>;
}

/** Glow sparkline chart (height configurable) */
function IndexSpark({ data, lineColor, height = 150 }: {
  data: number[]; lineColor: string; height?: number;
}) {
  const pts = data.map((v, i) => ({ i, v }));
  const gid = `g-${lineColor.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div style={{ filter: `drop-shadow(0 0 8px ${lineColor}55) drop-shadow(0 0 3px ${lineColor}35)` }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={pts} margin={{ top: 6, right: 2, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
              <stop offset="70%" stopColor={lineColor} stopOpacity={0.04} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={T.line} strokeOpacity={0.5} vertical={false} />
          <XAxis dataKey="i" hide />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            return <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 6, padding: "5px 9px" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.text, ...mono }}>${fmtPrice(payload[0]?.value as number)}</span>
            </div>;
          }} cursor={{ stroke: lineColor + "55", strokeWidth: 1 }} />
          <Area type="monotone" dataKey="v" stroke={lineColor} strokeWidth={3.5} strokeOpacity={0.15} fill="none" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="v" stroke={lineColor} strokeWidth={1.5} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Compact index hero (S&P / Dow / Nasdaq) */
function IndexHero({ item }: { item: MarketItem | null }) {
  if (!item) return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "16px 18px",
      height: 196, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12, ...ui }}>
      Loading…
    </div>
  );
  const lineColor = item.change1d != null && item.change1d >= 0 ? T.green : T.red;
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "16px 18px",
      boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 10, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", ...ui }}>{item.label}</span>
        <span style={{ fontSize: 9, color: T.muted, ...mono }}>{item.ticker.replace("^", "")}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 23, fontWeight: 600, color: T.text, ...mono, letterSpacing: "-0.01em" }}>${fmtPrice(item.price)}</span>
        <Pct v={item.change1d} size={13} />
      </div>
      {item.spark6m && item.spark6m.length > 10
        ? <IndexSpark data={item.spark6m} lineColor={lineColor} height={84} />
        : <div style={{ height: 84 }} />}
      <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
        {([["1 Wk", item.change1w], ["1 Mo", item.change1m], ["YTD", item.changeYtd]] as [string, number | null][]).map(([l, v]) => (
          <div key={l}>
            <div style={{ fontSize: 8, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", ...ui }}>{l}</div>
            <Pct v={v} size={11} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Rates / macro bar */
function RatesBar({ data }: { data: RatesData | null }) {
  if (!data) return null;
  const stats = [
    { label: "Fed Funds",    value: fmtRate(data.fedFunds),    color: T.text },
    { label: "10Y Treasury", value: fmtRate(data.yield10y),    color: T.text },
    { label: "2Y Treasury",  value: fmtRate(data.yield2y),     color: T.text },
    { label: "Yield Curve",  value: data.yieldCurve != null ? `${data.yieldCurve >= 0 ? "+" : ""}${data.yieldCurve.toFixed(2)}%` : "—",
      color: data.yieldCurve != null ? (data.yieldCurve >= 0 ? T.green : T.amber) : T.dim },
    { label: "CPI Inflation", value: fmtRate(data.cpiYoY),
      color: data.cpiYoY != null ? (data.cpiYoY > 4 ? T.red : data.cpiYoY > 2.5 ? T.amber : T.green) : T.dim },
  ];
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 20px",
      display: "flex", gap: 0, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
      {stats.map((s, i) => (
        <React.Fragment key={s.label}>
          <div style={{ flex: 1, textAlign: i === 0 ? "left" : "center" }}>
            <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", ...ui, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: s.color, ...mono }}>{s.value}</div>
          </div>
          {i < stats.length - 1 && <div style={{ width: 1, background: T.line, margin: "0 8px", alignSelf: "stretch" }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function MiniMarketTable({ title, items }: { title: string; items: MarketItem[] }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden",
      boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${T.line}`, fontSize: 11,
        fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif", fontWeight: 300,
        color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
      {items.map((item, idx) => (
        <div key={item.ticker} style={{ display: "grid", gridTemplateColumns: "48px 1fr 70px 66px", padding: "8px 14px",
          borderBottom: idx < items.length - 1 ? `1px solid ${T.line}` : "none", alignItems: "center" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = T.panel2)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.data, ...mono }}>{item.ticker}</div>
          <div style={{ fontSize: 10, color: T.dim, ...ui, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }}>{item.label}</div>
          <div style={{ textAlign: "right", fontSize: 11, color: T.text, ...mono }}>${fmtPrice(item.price)}</div>
          <div style={{ textAlign: "right" }}><span style={{ fontSize: 11, fontWeight: 600, color: col(item.change1d), ...mono }}>{fmtPct(item.change1d)}</span></div>
        </div>
      ))}
    </div>
  );
}

function timeAgo(ts: number): string {
  if (!ts) return "";
  const mins = Math.floor((Date.now() / 1000 - ts) / 60);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

function FeaturedStory({ item, big }: { item: NewsItem; big: boolean }) {
  return (
    <div onClick={() => window.open(item.link, "_blank", "noopener,noreferrer")}
      style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden",
        cursor: "pointer", display: "flex", gap: 0, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.blue)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}>
      {item.image && (
        <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer"
          style={{ width: big ? 150 : 110, height: big ? "auto" : 88, minHeight: big ? 110 : 88,
            objectFit: "cover", flexShrink: 0, background: T.panel2 }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      )}
      <div style={{ padding: "14px 16px", flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: big ? 14 : 12.5, fontWeight: big ? 600 : 500, color: T.text, lineHeight: 1.45, ...ui, marginBottom: item.summary ? 6 : 0 }}>
          {item.title}
        </div>
        {item.summary && (
          <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.55, ...ui, marginBottom: 7,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"], overflow: "hidden" }}>
            {item.summary}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: T.muted, ...ui }}>{item.publisher}</span>
          <span style={{ fontSize: 10, color: T.muted }}>·</span>
          <span style={{ fontSize: 10, color: T.muted, ...mono }}>{timeAgo(item.publishedAt)} ago</span>
        </div>
      </div>
    </div>
  );
}

function SmallStory({ item }: { item: NewsItem }) {
  return (
    <div onClick={() => window.open(item.link, "_blank", "noopener,noreferrer")}
      style={{ padding: "11px 0", borderBottom: `1px solid ${T.line}`, cursor: "pointer", display: "flex", gap: 10, alignItems: "center" }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
      {item.image && (
        <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer"
          style={{ width: 52, height: 52, borderRadius: 6, objectFit: "cover", flexShrink: 0, background: T.panel2 }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: T.text, ...ui, lineHeight: 1.4, marginBottom: 3 }}>{item.title}</div>
        <div style={{ display: "flex", gap: 5 }}>
          <span style={{ fontSize: 10, color: T.muted, ...ui }}>{item.publisher}</span>
          <span style={{ fontSize: 10, color: T.muted }}>·</span>
          <span style={{ fontSize: 10, color: T.muted, ...mono }}>{timeAgo(item.publishedAt)} ago</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  SCROLL PROGRESS RAIL — a little train that rides the left rail, then crosses
//  the page after the news and rides down the right rail.
// ════════════════════════════════════════════════════════════════════════════
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * ScrollProgress — a clean, straight scroll-position indicator hugging the
 * sidebar edge: a thin vertical track, a filled (traveled) portion, and a small
 * handle. Moves linearly with scroll position.
 */
function ScrollRail({ offset }: { offset: number }) {
  const [m, setM] = useState({ p: 0, vh: 800 });
  useEffect(() => {
    const recalc = () => {
      const el = document.documentElement;
      const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
      setM({ p: clamp01(el.scrollTop / maxScroll), vh: window.innerHeight });
    };
    recalc();
    window.addEventListener("scroll", recalc, { passive: true });
    window.addEventListener("resize", recalc);
    return () => { window.removeEventListener("scroll", recalc); window.removeEventListener("resize", recalc); };
  }, []);

  const xRail = offset + 13;
  const yTop = 92;
  const yBottom = m.vh - 48;
  const ty = yTop + m.p * (yBottom - yTop); // linear with scroll

  return (
    <div style={{ position: "fixed", left: xRail - 8, top: 0, bottom: 0, width: 16, zIndex: 40,
      pointerEvents: "none" }}>
      {/* track */}
      <div style={{ position: "absolute", left: 8, top: yTop, width: 2, height: yBottom - yTop,
        background: T.line2, borderRadius: 2, transform: "translateX(-50%)" }} />
      {/* traveled portion */}
      <div style={{ position: "absolute", left: 8, top: yTop, width: 2, height: ty - yTop,
        background: T.text, borderRadius: 2, transform: "translateX(-50%)" }} />
      {/* handle */}
      <div style={{ position: "absolute", left: 8, top: ty, width: 10, height: 10, borderRadius: "50%",
        transform: "translate(-50%, -50%)", transition: "top 0.08s linear",
        background: T.panel, border: `2px solid ${T.text}`, boxShadow: "0 1px 3px rgba(0,0,0,0.28)" }} />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TOOL SHOWCASE — mini "homescreens" you scroll through, each links to its page
// ════════════════════════════════════════════════════════════════════════════

const TOOL_ICONS: Record<DashTab, React.ReactNode> = {
  news: null,
  find: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  discover: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5a4.5 4.5 0 0 0-2.7 8.1c.45.34.7.86.7 1.4v.5h4v-.5c0-.54.25-1.06.7-1.4A4.5 4.5 0 0 0 8 1.5Z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <line x1="6.2" y1="13.5" x2="9.8" y2="13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="6.8" y1="15" x2="9.2" y2="15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  analysis: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 9l2-2 1.5 1.5L11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="5" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  comparison: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h5v8H2zM9 2h5v10H9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  recommendation: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5l1.55 3.14 3.47.5-2.51 2.45.59 3.46L8 9.27l-3.1 1.68.59-3.46L3 5.04l3.47-.5L8 1.5z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
};

function ShowcaseSection({
  index, total, tab, name, tagline, accent, onNavigate, children,
}: {
  index: number; total: number; tab: DashTab; name: string; tagline: string;
  accent: string; onNavigate: (t: DashTab) => void; children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => onNavigate(tab)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: T.panel, border: `1px solid ${hover ? accent : T.line}`, borderRadius: 14,
        overflow: "hidden", cursor: "pointer",
        transform: hover ? "translateY(-3px)" : "none",
        boxShadow: hover ? `0 10px 30px ${accent}22, 0 2px 6px rgba(16,24,40,0.06)` : "0 1px 2px rgba(16,24,40,0.04)",
        transition: "transform 0.18s cubic-bezier(0.4,0,0.2,1), box-shadow 0.18s, border-color 0.18s",
      }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 22px",
        borderBottom: `1px solid ${T.line}` }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: accent + "14", border: `1px solid ${accent}33`,
          display: "flex", alignItems: "center", justifyContent: "center", color: accent }}>
          {TOOL_ICONS[tab]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: T.muted, ...mono, letterSpacing: "0.1em" }}>
              {String(index).padStart(2, "0")}/{String(total).padStart(2, "0")}
            </span>
            <span style={{ fontSize: 18, fontWeight: 300, color: T.text,
              fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif", letterSpacing: "0.06em" }}>{name}</span>
          </div>
          <div style={{ fontSize: 12, color: T.dim, ...ui, marginTop: 1 }}>{tagline}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
          background: hover ? accent : accent + "12",
          border: `1px solid ${hover ? accent : accent + "33"}`,
          color: hover ? "#fff" : accent,
          borderRadius: 8, padding: "8px 14px", transition: "all 0.18s" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", ...ui }}>Open {name}</span>
          <span style={{ fontSize: 14, transform: hover ? "translateX(2px)" : "none", transition: "transform 0.18s" }}>→</span>
        </div>
      </div>
      {/* Mockup body */}
      <div style={{ padding: "20px 22px", background: T.panel2 }}>
        {children}
      </div>
    </div>
  );
}

// ── Mock data for the previews ──────────────────────────────────────────────
const MOCK_FIND = [
  { ticker: "SCHD", name: "Schwab US Dividend Equity", score: 94, cap: "Large · Value" },
  { ticker: "VOO",  name: "Vanguard S&P 500",          score: 89, cap: "Large · Blend" },
  { ticker: "DGRO", name: "iShares Core Div Growth",    score: 86, cap: "Large · Blend" },
];
const MOCK_RADAR = [
  { metric: "Cost", VOO: 96, ARKK: 34 },
  { metric: "Risk Adj", VOO: 80, ARKK: 26 },
  { metric: "Downside", VOO: 74, ARKK: 18 },
  { metric: "Alpha", VOO: 52, ARKK: 44 },
  { metric: "Consistency", VOO: 85, ARKK: 22 },
  { metric: "Yield", VOO: 58, ARKK: 10 },
];
const MOCK_GROWTH = [12, 13, 12.4, 14, 15.2, 14.6, 16, 17.5, 17, 18.8, 20, 19.4, 21.5, 23, 22.4, 24, 26, 25.3, 27.5, 29, 28.4, 31, 33, 34.2];

// ── FIND preview: mini style-box + ranked results ───────────────────────────
function FindPreview() {
  const cells = [0, 1, 0, 0, 1, 0, 0, 0, 0]; // highlighted style-box cells
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 18, alignItems: "center" }}>
      {/* mini style box */}
      <div>
        <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", ...ui, marginBottom: 6 }}>Style box</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
          {cells.map((on, i) => (
            <div key={i} style={{ aspectRatio: "1.5/1", borderRadius: 4,
              background: on ? T.data : "#fff", border: `1px solid ${on ? T.data : T.line2}` }} />
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 22, fontWeight: 600, color: T.data, ...mono, lineHeight: 1 }}>{UNIVERSE_COUNT}</div>
        <div style={{ fontSize: 10, color: T.dim, ...ui }}>funds in database</div>
      </div>
      {/* ranked results */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {MOCK_FIND.map((f, i) => (
          <div key={f.ticker} style={{ display: "flex", alignItems: "center", gap: 12, background: T.panel,
            border: `1px solid ${T.line}`, borderRadius: 8, padding: "9px 13px" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, ...mono, width: 16 }}>{i + 1}</span>
            <div style={{ width: 56 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...mono }}>{f.ticker}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: T.dim, ...ui, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
              <div style={{ height: 4, background: T.panel3, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${f.score}%`, background: T.data, borderRadius: 2 }} />
              </div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.data, ...mono }}>{f.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ANALYSIS preview: verdict + growth + strengths ──────────────────────────
function AnalysisPreview() {
  const pts = MOCK_GROWTH.map((v, i) => ({ i, v }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* verdict */}
        <div style={{ background: "#F0FDF4", border: `1px solid ${T.green}44`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text, ...mono }}>SCHD</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: "#fff", background: T.green, borderRadius: 4, padding: "2px 7px", ...ui }}>STRONG</span>
          </div>
          <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, ...ui, marginTop: 6 }}>
            Low cost, top-quartile risk-adjusted return, and shallow drawdowns make this a high-conviction core holding.
          </div>
        </div>
        {/* strengths / watch-outs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[["▲", T.green, "0.06% expense — cheaper than 96% of peers"],
            ["▲", T.green, "Sharpe 1.18 · downside capture 84%"],
            ["▼", T.amber, "Yield trails high-income alternatives"]].map(([sym, c, txt], i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: c as string }}>{sym}</span>
              <span style={{ fontSize: 11, color: T.dim, ...ui }}>{txt}</span>
            </div>
          ))}
        </div>
      </div>
      {/* growth chart */}
      <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", ...ui, marginBottom: 4 }}>Growth vs benchmark</div>
        <div style={{ filter: `drop-shadow(0 0 6px ${T.data}33)` }}>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={pts} margin={{ top: 4, right: 2, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="g-analysis" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.data} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={T.data} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={T.data} strokeWidth={1.8} fill="url(#g-analysis)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: T.dim, ...ui }}>3-year</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.green, ...mono }}>+34.2%</span>
        </div>
      </div>
    </div>
  );
}

// ── COMPARISON preview: radar + mini KPI table ──────────────────────────────
function ComparisonPreview() {
  const rows: [string, string, string][] = [
    ["Sharpe 3Y", "1.18", "0.41"],
    ["Max DD", "−24%", "−61%"],
    ["Expense", "0.03%", "0.75%"],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "center" }}>
      <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "6px 10px" }}>
        <ResponsiveContainer width="100%" height={186}>
          <RadarChart data={MOCK_RADAR} margin={{ top: 8, right: 18, bottom: 8, left: 18 }}>
            <PolarGrid stroke={T.line} />
            <PolarAngleAxis dataKey="metric" tick={{ fill: T.dim, fontSize: 8.5, fontFamily: "'Geist', sans-serif" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="VOO" dataKey="VOO" stroke={T.data} fill={T.data} fillOpacity={0.15} strokeWidth={1.5} />
            <Radar name="ARKK" dataKey="ARKK" stroke={T.amber} fill={T.amber} fillOpacity={0.12} strokeWidth={1.5} />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'Geist', sans-serif" }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {/* mini KPI table */}
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 64px", gap: 0,
          fontSize: 10, color: T.muted, ...ui, paddingBottom: 6, borderBottom: `1px solid ${T.line}` }}>
          <span>Metric</span>
          <span style={{ textAlign: "right", color: T.data, fontWeight: 600, ...mono }}>VOO</span>
          <span style={{ textAlign: "right", color: T.amber, fontWeight: 600, ...mono }}>ARKK</span>
        </div>
        {rows.map(([m, a, b]) => (
          <div key={m} style={{ display: "grid", gridTemplateColumns: "1fr 64px 64px",
            padding: "9px 0", borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontSize: 11, color: T.dim, ...ui }}>{m}</span>
            <span style={{ textAlign: "right", fontSize: 12, fontWeight: 600, color: T.green, ...mono }}>{a}</span>
            <span style={{ textAlign: "right", fontSize: 12, fontWeight: 600, color: T.dim, ...mono }}>{b}</span>
          </div>
        ))}
        <div style={{ fontSize: 10, color: T.muted, ...ui, marginTop: 8 }}>Up to 4 funds, side by side.</div>
      </div>
    </div>
  );
}

// ── RECOMMENDATION preview: factor swap cards ───────────────────────────────
function RecommendPreview() {
  const cards = [
    { icon: "💰", label: "Lower Cost", from: "0.68%", to: "0.04%", tick: "VTI", note: "64 bps/yr cheaper" },
    { icon: "📈", label: "Risk-Adjusted", from: "0.62", to: "1.07", tick: "VOO", note: "more return per unit risk" },
    { icon: "🛡", label: "Downside", from: "−38%", to: "−19%", tick: "SCHD", note: "shallower drawdowns" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {cards.map((c) => (
        <div key={c.label} style={{ background: T.panel, border: `1px solid ${T.blue}44`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>{c.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.text, ...ui }}>{c.label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.panel2,
            border: `1px solid ${T.line}`, borderRadius: 6, padding: "7px 10px" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.dim, ...mono }}>{c.from}</span>
            <span style={{ color: T.green, fontSize: 13 }}>→</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.green, ...mono }}>{c.to}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.data, ...mono }}>{c.tick}</span>
            <span style={{ fontSize: 10, color: T.dim, ...ui }}>{c.note}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 3D implied-volatility surface — dark "high-tech" eye candy ───────────────
function VolSurface3D() {
  const COLS = 9, ROWS = 6;
  const originX = 118, originY = 128;
  const cellW = 30, depthX = 19, depthY = -12;
  const vol = (c: number, r: number) => {
    const x = (c - (COLS - 1) / 2) / ((COLS - 1) / 2); // -1..1 (moneyness)
    return 18 + x * x * 36 + r * 5; // smile + term structure
  };
  const project = (c: number, r: number): [number, number] => {
    const z = vol(c, r);
    return [originX + c * cellW + r * depthX, originY + r * depthY - z];
  };
  const rowPaths: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    let d = "";
    for (let c = 0; c < COLS; c++) { const [x, y] = project(c, r); d += (c === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " "; }
    rowPaths.push(d);
  }
  const colPaths: string[] = [];
  for (let c = 0; c < COLS; c++) {
    let d = "";
    for (let r = 0; r < ROWS; r++) { const [x, y] = project(c, r); d += (r === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " "; }
    colPaths.push(d);
  }
  return (
    <div style={{ position: "relative", width: "100%", overflow: "hidden", borderRadius: 10 }}>
      <svg viewBox="0 0 360 150" width="100%" height="150" preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", filter: "drop-shadow(0 0 6px rgba(0,0,0,0.18))" }}>
        <defs>
          <linearGradient id="vol-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--c-muted)" />
            <stop offset="50%" stopColor="var(--c-accent)" />
            <stop offset="100%" stopColor="var(--c-muted)" />
          </linearGradient>
        </defs>
        {/* depth lines (term structure) — faint */}
        {colPaths.map((d, i) => (
          <path key={"c" + i} d={d} fill="none" stroke="var(--c-line2)" strokeWidth={0.8} opacity={0.7} />
        ))}
        {/* strike lines (the vol smiles) — bright, brighter toward the front */}
        {rowPaths.map((d, i) => (
          <path key={"r" + i} d={d} fill="none" stroke="url(#vol-grad)"
            strokeWidth={1.6} opacity={0.35 + (i / (ROWS - 1)) * 0.6}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
    </div>
  );
}

// ── The showcase block ──────────────────────────────────────────────────────
function ToolShowcase({ onNavigate }: { onNavigate: (t: DashTab) => void }) {
  const sections: { tab: DashTab; name: string; tagline: string; accent: string; body: React.ReactNode }[] = [
    { tab: "discover", name: "Discover", accent: T.blue,
      tagline: `Source funds for clients — screen ${UNIVERSE_COUNT} funds, find funds like a ticker they hold, or match a client profile.`,
      body: <FindPreview /> },
    { tab: "comparison", name: "Comparison", accent: T.blue,
      tagline: "Put up to 6 funds head-to-head across every factor, percentile, and tax angle.",
      body: <ComparisonPreview /> },
    { tab: "analysis", name: "Analysis", accent: T.blue,
      tagline: "A plain-English verdict on any fund — strengths, watch-outs, growth vs benchmark & stress tests.",
      body: <AnalysisPreview /> },
  ];
  return (
    <div id="af-showcase" style={{ marginTop: 22 }}>
      {/* ── Advisor Hub banner ── */}
      <div style={{
        background: "var(--c-panel)",
        border: "1px solid var(--c-line)", borderRadius: 14, padding: "22px 26px", marginBottom: 18,
        position: "relative", overflow: "hidden",
        boxShadow: "0 4px 18px rgba(0,0,0,0.06)",
        display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "center",
      }}>
        {/* subtle dot-grid texture */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.025, pointerEvents: "none",
          backgroundImage: "radial-gradient(circle, var(--c-text) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div style={{ position: "relative" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9.5, fontWeight: 500,
            letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-dim)",
            background: "var(--c-panel2)", border: "1px solid var(--c-line2)",
            borderRadius: 20, padding: "4px 11px", ...ui }}>
            ★ Advisor Hub
          </span>
          <div style={{ fontSize: 22, fontWeight: 300, color: "var(--c-text)", marginTop: 11,
            fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            The Advisor Hub
          </div>
          <div style={{ fontSize: 13, color: "var(--c-dim)", ...ui, marginTop: 6, lineHeight: 1.55, maxWidth: 520 }}>
            Everything Lynx does for your workflow — find funds, pressure-test them, and
            stand up a recommendation. Scroll through the toolkit below; click any panel to jump straight in.
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 16 }}>
            {[[String(UNIVERSE_COUNT), "funds in universe"], ["16", "metrics per fund"], ["4", "research tools"]].map(([n, l]) => (
              <div key={l}>
                <div style={{ fontSize: 20, fontWeight: 600, color: "var(--c-text)", ...mono, lineHeight: 1 }}>{n}</div>
                <div style={{ fontSize: 9.5, color: "var(--c-muted)", ...ui, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        {/* 3D implied-vol surface */}
        <div style={{ position: "relative" }}>
          <VolSurface3D />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sections.map((s, i) => (
          <ShowcaseSection key={s.tab} index={i + 1} total={sections.length}
            tab={s.tab} name={s.name} tagline={s.tagline} accent={s.accent} onNavigate={onNavigate}>
            {s.body}
          </ShowcaseSection>
        ))}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardTab({ onNavigate, railOffset = 60 }: {
  onNavigate?: (t: DashTab) => void; railOffset?: number;
} = {}) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [rates, setRates] = useState<RatesData | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [mktLoading, setMktLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/market").then((r) => r.json()).then((d) => { setMarket(d); setMktLoading(false); })
      .catch(() => { setError("Failed to load market data"); setMktLoading(false); });
    fetch("/api/rates").then((r) => r.json()).then((d) => setRates(d)).catch(() => {});
    fetch("/api/news").then((r) => r.json()).then((d) => setNews(d.items ?? [])).catch(() => {}).finally(() => setNewsLoading(false));
  }, []);

  if (mktLoading) return (
    <div style={{ padding: "80px 0", textAlign: "center", color: T.dim }}>
      <div style={{ fontSize: 13, ...ui }}>Loading market data…</div>
    </div>
  );
  if (error || !market) return (
    <div style={{ padding: "64px 0", textAlign: "center", color: T.red }}>
      <div style={{ fontSize: 13, ...ui }}>{error ?? "No data"}</div>
    </div>
  );

  const find = (t: string) => market.items.find((i) => i.ticker === t) ?? null;
  const heroes = [find("^GSPC"), find("^DJI"), find("^IXIC")];
  const equities = market.items.filter((i) => i.group === "Equity" && !["^GSPC", "^DJI", "^IXIC"].includes(i.ticker));
  const bonds = market.items.filter((i) => i.group === "Fixed Income");
  const alts = market.items.filter((i) => i.group === "Alternatives");
  const time = new Date(market.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const topStories = news.slice(0, 3);
  const moreStories = news.slice(3, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Scroll progress railroad — only when navigation is wired (dashboard) */}
      {onNavigate && <ScrollRail offset={railOffset} />}

      {/* 3 index heroes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {heroes.map((h, i) => <IndexHero key={i} item={h} />)}
      </div>

      <RatesBar data={rates} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14, alignItems: "start" }}>
        {/* LEFT — news */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 13, color: T.dim, textTransform: "uppercase", letterSpacing: "0.07em",
              fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif", fontWeight: 300 }}>Market News</div>
            <span style={{ fontSize: 10, color: T.muted, ...mono }}>{time}</span>
          </div>
          {newsLoading && (
            <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "24px 18px", color: T.muted, fontSize: 12, ...ui }}>Loading headlines…</div>
          )}
          {!newsLoading && topStories.length === 0 && (
            <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "24px 18px", color: T.muted, fontSize: 12, ...ui }}>No news available.</div>
          )}
          {topStories.map((item, i) => <FeaturedStory key={item.uuid} item={item} big={i === 0} />)}
          {moreStories.length > 0 && (
            <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "0 18px", boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
              <div style={{ fontSize: 11, color: T.dim, textTransform: "uppercase", letterSpacing: "0.06em",
                fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif", fontWeight: 300, paddingTop: 12, paddingBottom: 2 }}>More Headlines</div>
              {moreStories.map((item) => <SmallStory key={item.uuid} item={item} />)}
              <div style={{ height: 8 }} />
            </div>
          )}
        </div>

        {/* RIGHT — markets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: T.dim, textTransform: "uppercase", letterSpacing: "0.07em",
            fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif", fontWeight: 300 }}>Markets</div>
          <MiniMarketTable title="Equities" items={equities} />
          <MiniMarketTable title="Fixed Income" items={bonds} />
          <MiniMarketTable title="Alternatives" items={alts} />
        </div>
      </div>

      {/* ── Tool showcase — scroll-through product tour ── */}
      {onNavigate && <ToolShowcase onNavigate={onNavigate} />}

      <p style={{ fontSize: 10, color: T.muted, ...ui, textAlign: "center", marginTop: 8 }}>
        Prices delayed · Yahoo Finance &amp; FRED · Research aid — verify before client use
      </p>
    </div>
  );
}
