"use client";
import React, { useEffect, useState } from "react";
import { T, ui, mono } from "./tokens";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, CartesianGrid, XAxis,
} from "recharts";
import type { RatesData } from "../app/api/rates/route";

export type DashTab = "news" | "find" | "analysis" | "comparison" | "recommendation" | "discover";

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
const fmtRate = (v: number | null) => v == null ? "-" : v.toFixed(2) + "%";
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
    { label: "Yield Curve",  value: data.yieldCurve != null ? `${data.yieldCurve >= 0 ? "+" : ""}${data.yieldCurve.toFixed(2)}%` : "-",
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
  const heroes = [find("^DJI"), find("^IXIC"), find("^GSPC")];
  const equities = market.items.filter((i) => i.group === "Equity" && !["^GSPC", "^DJI", "^IXIC"].includes(i.ticker));
  const bonds = market.items.filter((i) => i.group === "Fixed Income");
  const alts = market.items.filter((i) => i.group === "Alternatives");
  const time = new Date(market.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const topStories = news.slice(0, 3);
  const moreStories = news.slice(3, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Scroll progress railroad - only when navigation is wired (dashboard) */}
      {onNavigate && <ScrollRail offset={railOffset} />}

      {/* 3 index heroes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {heroes.map((h, i) => <IndexHero key={i} item={h} />)}
      </div>

      <RatesBar data={rates} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14, alignItems: "start" }}>
        {/* LEFT - news */}
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

        {/* RIGHT - markets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: T.dim, textTransform: "uppercase", letterSpacing: "0.07em",
            fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif", fontWeight: 300 }}>Markets</div>
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
