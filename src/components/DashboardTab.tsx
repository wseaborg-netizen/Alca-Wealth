"use client";
import React, { useEffect, useState } from "react";
import { T, ui, mono } from "./tokens";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, CartesianGrid, XAxis,
} from "recharts";

export type DashTab = "news" | "find" | "analysis" | "comparison" | "recommendation" | "discover"
  | "research" | "workspace" | "portfolio" | "watchlist" | "present";

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
  v == null ? "-" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null) =>
  v == null ? "-" : (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
const col = (v: number | null) => v == null ? T.dim : v >= 0 ? T.green : T.red;

// Bright signal colors for figures sitting on the dark terminal cards - the
// themed T.green/T.red are tuned for white surfaces and go muddy on graphite.
const UP = "#34D399";
const DOWN = "#F87171";
const darkCol = (v: number | null) => v == null ? "rgba(255,255,255,0.45)" : v >= 0 ? UP : DOWN;

function Pct({ v, size = 13, dark = false }: { v: number | null; size?: number; dark?: boolean }) {
  return <span style={{ fontSize: size, fontWeight: 600, color: dark ? darkCol(v) : col(v), ...mono }}>{fmtPct(v)}</span>;
}

/** Glow sparkline chart (height configurable) */
function IndexSpark({ data, lineColor, height = 150, dark = false }: {
  data: number[]; lineColor: string; height?: number; dark?: boolean;
}) {
  const pts = data.map((v, i) => ({ i, v }));
  const gid = `g-${lineColor.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <div style={{ filter: `drop-shadow(0 0 8px ${lineColor}55) drop-shadow(0 0 3px ${lineColor}35)` }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={pts} margin={{ top: 6, right: 2, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={dark ? 0.26 : 0.18} />
              <stop offset="70%" stopColor={lineColor} stopOpacity={0.04} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={dark ? "rgba(255,255,255,0.07)" : T.line} strokeOpacity={dark ? 1 : 0.5} vertical={false} />
          <XAxis dataKey="i" hide />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            return <div style={{ background: dark ? "#1B1D22" : T.panel,
              border: `1px solid ${dark ? "rgba(255,255,255,0.14)" : T.line}`, borderRadius: 6, padding: "5px 9px" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: dark ? "#fff" : T.text, ...mono }}>${fmtPrice(payload[0]?.value as number)}</span>
            </div>;
          }} cursor={{ stroke: lineColor + "55", strokeWidth: 1 }} />
          <Area type="monotone" dataKey="v" stroke={lineColor} strokeWidth={3.5} strokeOpacity={0.15} fill="none" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="v" stroke={lineColor} strokeWidth={1.5} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Index hero (S&P / Dow / Nasdaq) - dark terminal card, same material as the chrome */
function IndexHero({ item }: { item: MarketItem | null }) {
  const [hover, setHover] = useState(false);
  if (!item) return (
    <div style={{ background: "linear-gradient(150deg, #101216 0%, #15171C 100%)", border: `1px solid #262628`,
      borderRadius: 14, padding: "20px 22px", height: 224, display: "flex", alignItems: "center",
      justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 12, ...ui }}>
      Loading…
    </div>
  );
  const lineColor = item.change1d != null && item.change1d >= 0 ? UP : DOWN;
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ background: "linear-gradient(150deg, #101216 0%, #15171C 100%)",
        border: `1px solid ${hover ? "#34363B" : "#262628"}`, borderRadius: 14, padding: "20px 22px 16px",
        boxShadow: hover ? "var(--elev-3), inset 0 1px 0 rgba(255,255,255,0.06)" : "var(--elev-2), inset 0 1px 0 rgba(255,255,255,0.06)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "all var(--dur-base) var(--ease-out)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase",
          letterSpacing: "0.14em", ...ui }}>{item.label}</span>
        <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.35)", ...mono }}>{item.ticker.replace("^", "")}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <span style={{ fontSize: 29, fontWeight: 600, color: "#fff", ...mono, letterSpacing: "-0.02em" }}>${fmtPrice(item.price)}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: lineColor, background: `${lineColor}1C`,
          borderRadius: 999, padding: "3px 10px", ...mono }}>{fmtPct(item.change1d)}</span>
      </div>
      {item.spark6m && item.spark6m.length > 10
        ? <div style={{ marginTop: 4 }}><IndexSpark data={item.spark6m} lineColor={lineColor} height={92} dark /></div>
        : <div style={{ height: 96 }} />}
      <div style={{ display: "flex", gap: 22, marginTop: 10 }}>
        {([["1 Wk", item.change1w], ["1 Mo", item.change1m], ["YTD", item.changeYtd]] as [string, number | null][]).map(([l, v]) => (
          <div key={l}>
            <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
              letterSpacing: "0.1em", ...ui, marginBottom: 1 }}>{l}</div>
            <Pct v={v} size={11.5} dark />
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMarketTable({ title, items }: { title: string; items: MarketItem[] }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden",
      boxShadow: "var(--elev-1)" }}>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${T.line}`, fontSize: 10.5,
        fontWeight: 600, ...ui, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</div>
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
      style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden",
        cursor: "pointer", display: "flex", gap: 0, boxShadow: "var(--elev-1)",
        transition: "border-color var(--dur-fast) var(--ease-out)" }}
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
//  SCROLL PROGRESS RAIL - a little train that rides the left rail, then crosses
//  the page after the news and rides down the right rail.
// ════════════════════════════════════════════════════════════════════════════
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * ScrollProgress - a clean, straight scroll-position indicator hugging the
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
// Dark surface language established on the Discover hub cards - now deepened
// with a navy undertone, layered lighting, and a hover light-sweep. Same
// material as the app chrome, so the platform reads as one instrument.
const DARK_BG = "linear-gradient(140deg, #0D0F15 0%, #12161F 60%, #0F131B 100%)";
const DARK_BORDER = "#262628";
const DARK_ACCENT = "#5EEAD4";

// ── Command-center workspace "department" card (whole card is clickable) ──────
function HubHero({ title, subtitle, desc, onOpen }: {
  title: string; subtitle: string; desc: string; onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: "relative", overflow: "hidden", background: DARK_BG,
        border: `1px solid ${hover ? "#3A3D45" : DARK_BORDER}`, borderRadius: 18, cursor: "pointer",
        boxShadow: hover ? "var(--elev-3), inset 0 1px 0 rgba(255,255,255,0.07)" : "var(--elev-2), inset 0 1px 0 rgba(255,255,255,0.07)",
        transform: hover ? "translateY(-3px)" : "none", transition: "all var(--dur-base) var(--ease-out)",
        padding: "54px 52px", display: "flex", flexDirection: "column", gap: 32, minWidth: 0, minHeight: 360 }}>
      {/* dot-grid texture - same language as the Discover hub cards */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.06, pointerEvents: "none",
        backgroundImage: "radial-gradient(circle, #FFFFFF 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
      {/* slow-breathing accent glow - restrained motion, not distracting */}
      <div style={{ position: "absolute", top: -70, right: -70, width: 300, height: 300, borderRadius: "50%",
        background: `radial-gradient(circle, ${DARK_ACCENT}2e, transparent 70%)`, filter: "blur(6px)",
        opacity: hover ? 0.9 : 0.55, transition: "opacity 0.3s ease",
        animation: "alcaCardGlow 7s ease-in-out infinite", pointerEvents: "none" }} />
      {/* cool counter-light bottom-left - the second source that makes the surface read as lit */}
      <div style={{ position: "absolute", bottom: -110, left: -80, width: 340, height: 340, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(14,116,144,0.22), transparent 70%)", filter: "blur(10px)",
        pointerEvents: "none" }} />
      {/* hover light-sweep - a sheen that crosses the card once on entry */}
      <div style={{ position: "absolute", top: 0, bottom: 0, width: "45%", left: hover ? "135%" : "-65%",
        transform: "skewX(-18deg)", pointerEvents: "none",
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)",
        transition: "left 0.8s var(--ease-out)" }} />
      <div style={{ minWidth: 0, position: "relative" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.48)", ...ui, letterSpacing: "0.2em", textTransform: "uppercase" }}>{title}</div>
        <div style={{ fontSize: 40, fontWeight: 600, color: "#fff", ...ui, marginTop: 16, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{subtitle}</div>
        <div style={{ fontSize: 15, fontWeight: 400, color: "rgba(255,255,255,0.6)", ...ui, marginTop: 12, lineHeight: 1.55, maxWidth: 420 }}>{desc}</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: DARK_ACCENT, ...ui, position: "relative" }}>
        Open Workspace <span style={{ transform: hover ? "translateX(5px)" : "none", transition: "transform var(--dur-fast) var(--ease-out)" }}>→</span>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardTab({ onNavigate, railOffset = 60 }: {
  onNavigate?: (t: DashTab) => void; railOffset?: number;
} = {}) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [mktLoading, setMktLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/market").then((r) => r.json()).then((d) => { setMarket(d); setMktLoading(false); })
      .catch(() => { setError("Failed to load market data"); setMktLoading(false); });
    fetch("/api/news").then((r) => r.json()).then((d) => setNews(d.items ?? [])).catch(() => {}).finally(() => setNewsLoading(false));
  }, []);

  // Skeletons reserve the real layout while data loads - the dashboard never
  // reflows, it just fills in (CLS-safe, and reads as fast).
  if (mktLoading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ background: "linear-gradient(150deg, #101216 0%, #15171C 100%)",
            border: "1px solid #262628", borderRadius: 14, padding: "20px 22px", height: 224 }}>
            {[[90, 11], [150, 26], [0, 0]].map(([w, h], j) => w > 0 ? (
              <div key={j} style={{ width: w, height: h, borderRadius: 6, marginBottom: 14,
                background: "linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.06) 63%)",
                backgroundSize: "400px 100%", animation: "alca-shimmer 1.4s linear infinite" }} />
            ) : (
              <div key={j} style={{ height: 100, borderRadius: 8,
                background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%)",
                backgroundSize: "400px 100%", animation: "alca-shimmer 1.4s linear infinite" }} />
            ))}
          </div>
        ))}
      </div>
      {onNavigate && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 24, marginTop: 34 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ background: DARK_BG, border: `1px solid ${DARK_BORDER}`, borderRadius: 18, minHeight: 360 }} />
          ))}
        </div>
      )}
    </div>
  );
  if (error || !market) return (
    <div style={{ padding: "64px 0", textAlign: "center", color: T.red }}>
      <div style={{ fontSize: 13, ...ui }}>{error ?? "No data"}</div>
    </div>
  );

  const find = (t: string) => market.items.find((i) => i.ticker === t) ?? null;
  const heroes = [find("^DJI"), find("^IXIC"), find("^GSPC")];
  const equities = market.items.filter((i) => i.group === "Equity" && !["^GSPC", "^DJI", "^IXIC"].includes(i.ticker));
  const bonds = market.items.filter((i) => i.group === "Fixed Income");
  const alts = market.items.filter((i) => i.group === "Alternatives");
  const time = new Date(market.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const topStories = news.slice(0, 3);
  const moreStories = news.slice(3, 8);

  const go = (t: DashTab) => onNavigate?.(t);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {onNavigate && <ScrollRail offset={railOffset} />}

      {/* 1 · Market command deck - dark terminal cards, same material as the chrome */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {heroes.map((h, i) => <IndexHero key={i} item={h} />)}
      </div>

      {/* 2 · The two workspaces - the primary visual focus of the dashboard */}
      {onNavigate && (
        <>
          <style>{`@keyframes alcaCardGlow { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.75; transform: scale(1.06); } }`}</style>
          <div style={{ marginTop: 22, fontSize: 12, fontWeight: 600, color: T.muted, ...ui,
            textTransform: "uppercase", letterSpacing: "0.09em" }}>Workspaces</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 24 }}>
            <HubHero title="Research" subtitle="Investment Research"
              desc="Screen, compare, and evaluate investment opportunities." onOpen={() => go("research")} />
            <HubHero title="Advisor" subtitle="Portfolio Construction"
              desc="Build, review, and present client portfolios." onOpen={() => go("workspace")} />
          </div>

          {/* 3 · Opportunity feed - a quiet pointer to what needs attention, no duplicate nav */}
          <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, boxShadow: "var(--elev-1)",
            padding: "18px 22px", marginTop: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, ...ui }}>Opportunity Feed</div>
            <div style={{ fontSize: 12.5, color: T.dim, ...ui, marginTop: 3, maxWidth: 640, lineHeight: 1.5 }}>
              Portfolios that may need attention - high expenses, risk drift, or replacement candidates - will surface here.
            </div>
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start", marginTop: 8 }}>
        {/* LEFT - news */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, ...ui, textTransform: "uppercase",
              letterSpacing: "0.09em" }}>Market News</div>
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
            <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "0 18px", boxShadow: "var(--elev-1)" }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: T.muted, ...ui, textTransform: "uppercase",
                letterSpacing: "0.08em", paddingTop: 12, paddingBottom: 2 }}>More Headlines</div>
              {moreStories.map((item) => <SmallStory key={item.uuid} item={item} />)}
              <div style={{ height: 8 }} />
            </div>
          )}
        </div>

        {/* RIGHT - markets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, ...ui, textTransform: "uppercase",
            letterSpacing: "0.09em" }}>Markets</div>
          <MiniMarketTable title="Equities" items={equities} />
          <MiniMarketTable title="Fixed Income" items={bonds} />
          <MiniMarketTable title="Alternatives" items={alts} />
        </div>
      </div>

      <p style={{ fontSize: 10, color: T.muted, ...ui, textAlign: "center", marginTop: 8 }}>
        Prices delayed · Yahoo Finance &amp; FRED · Research aid - verify before client use
      </p>
    </div>
  );
}
