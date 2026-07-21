"use client";
import React, { useEffect, useMemo, useState } from "react";
import { T, ui, mono } from "./tokens";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Reveal, useMediaQuery } from "./motion";
import { greetingName } from "@/lib/profile";

export type DashTab = "find" | "analysis" | "comparison" | "recommendation" | "discover"
  | "research" | "workspace" | "portfolio" | "murderboard" | "watchlist" | "model"
  | "model-fund" | "model-project" | "model-scenarios" | "expansion" | "lists" | "alerts"
  | "tax" | "correlation" | "peers" | "backtest" | "assistant";

// ── Types (all from existing endpoints) ──────────────────────────────────────
interface MarketItem {
  ticker: string; label: string; group: string; price: number | null;
  change1d: number | null; change1w: number | null; change1m: number | null; changeYtd: number | null; spark6m?: number[];
}
interface MarketData { items: MarketItem[]; fetchedAt: number }
interface Quote { change1d: number; change1w: number; change1m: number; changeYtd: number }
interface DeskFund { ticker: string; name: string | null; category: string | null; quote: Quote | null; alertCount: number }
interface Overview {
  ok: boolean;
  attentionItems: { type: string; severity: string; title: string; count: number; href: string }[];
  recentActivity: { kind: string; label: string; ticker: string | null; severity: string; at: string; href: string | null }[];
  coreFunds: DeskFund[]; watchlistFunds: DeskFund[];
  alertCounts: { unread: number; total: number };
}
interface HealthResp { overall: "healthy" | "warning" | "error"; checks: { key: string; status: "healthy" | "warning" | "error" }[] }

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtPrice = (v: number | null) => v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number | null | undefined) => v == null ? "—" : (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
const pctCol = (v: number | null | undefined) => (v == null ? T.muted : v >= 0 ? T.green : T.red);
const SEV_DOT: Record<string, string> = { info: "#3b82f6", watch: "#f59e0b", warning: "#f59e0b", critical: "#ef4444" };

/** Relative timestamp: "2m ago" · "1h ago" · "3d ago". */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

/** Tiny keyword-mapped line icon for hub quick links (one cohesive stroke set). */
function MiniIcon({ label, c }: { label: string; c: string }) {
  const wrap = (children: React.ReactNode) => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.85 }}
      stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
  const l = label.toLowerCase();
  if (l.includes("search")) return wrap(<><circle cx="6.5" cy="6.5" r="3.8" /><path d="M9.4 9.4L13 13" /></>);
  if (l.includes("screen")) return wrap(<path d="M2 4h12M4.5 8h7M6.5 12h3" />);
  if (l.includes("categor")) return wrap(<path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />);
  if (l.includes("comparison")) return wrap(<path d="M3.5 13V6M8 13V3M12.5 13V8.5" />);
  if (l.includes("recent")) return wrap(<><circle cx="8" cy="8" r="5.6" /><path d="M8 5v3.2l2.1 1.6" /></>);
  if (l.includes("portfolio")) return wrap(<><circle cx="8" cy="8" r="5.6" /><path d="M8 8V2.4M8 8l4 3.6" /></>);
  if (l.includes("allocation")) return wrap(<><circle cx="8" cy="8" r="5.6" /><circle cx="8" cy="8" r="2.2" /></>);
  if (l.includes("rebalanc") || l.includes("distribution")) return wrap(<path d="M3 5.5h8.5L9.5 3.5M13 10.5H4.5l2 2" />);
  if (l.includes("performance") || l.includes("projection")) return wrap(<path d="M2 13l4-5 3 2 5-6" />);
  if (l.includes("risk")) return wrap(<path d="M8 2l5 1.8v3.8c0 3-2 5.1-5 6.4-3-1.3-5-3.4-5-6.4V3.8z" />);
  if (l.includes("model")) return wrap(<path d="M8 2l5 2.8v6.4L8 14l-5-2.8V4.8zM8 8l5-2.8M8 8L3 5.2M8 8v6" />);
  if (l.includes("goal") || l.includes("retirement")) return wrap(<><circle cx="8" cy="8" r="5.6" /><circle cx="8" cy="8" r="1.6" /></>);
  if (l.includes("scenario")) return wrap(<path d="M2.5 12.5h3c4.5 0 3.5-8 8-8M10.5 2.5l3 2-2.4 2.6" />);
  if (l.includes("monte")) return wrap(<><rect x="3" y="3" width="10" height="10" rx="2" /><path d="M6 6h.01M10 10h.01" /></>);
  if (l.includes("tax")) return wrap(<><path d="M3.5 12.5l9-9" /><circle cx="5" cy="5" r="1.5" /><circle cx="11" cy="11" r="1.5" /></>);
  if (l.includes("income")) return wrap(<><ellipse cx="8" cy="5" rx="5" ry="2.2" /><path d="M3 5v5.5c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V5" /></>);
  if (l.includes("estate")) return wrap(<path d="M3 8l5-5 5 5v5.5H3z" />);
  if (l.includes("report")) return wrap(<path d="M4.5 2h5l2.5 2.5V14h-7.5zM6.5 8h3M6.5 11h3" />);
  if (l.includes("calculator")) return wrap(<><rect x="3.5" y="2" width="9" height="12" rx="1.6" /><path d="M5.8 5h4.4M5.8 8.5h.01M8 8.5h.01M10.2 8.5h.01M5.8 11h.01M8 11h.01M10.2 11h.01" /></>);
  if (l.includes("social")) return wrap(<><circle cx="8" cy="5.4" r="2.6" /><path d="M3 13.5c.7-2.6 2.6-4 5-4s4.3 1.4 5 4" /></>);
  return wrap(<path d="M6 4l4 4-4 4" />);
}

/** Circular tinted icon for feeds (doc / bell / warning / person glyphs). */
function FeedIcon({ tone, kind }: { tone: string; kind: "doc" | "bell" | "warn" | "info" | "eye" | "bookmark" }) {
  const glyph = {
    doc: <path d="M5 2.5h4.5L12 5v8.5H5zM6.8 7.5h3.4M6.8 10h3.4" />,
    bell: <path d="M8 3a3.4 3.4 0 0 1 3.4 3.4c0 2.6 1 3.4 1 3.4H3.6s1-.8 1-3.4A3.4 3.4 0 0 1 8 3zM6.9 12.4a1.2 1.2 0 0 0 2.2 0" />,
    warn: <path d="M8 3l5.5 9.5h-11zM8 7v2.6M8 11.6h.01" />,
    info: <path d="M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 7.5V11M8 5.2h.01" />,
    eye: <path d="M2 8s2.4-4 6-4 6 4 6 4-2.4 4-6 4-6-4-6-4zM8 9.8A1.8 1.8 0 1 0 8 6.2a1.8 1.8 0 0 0 0 3.6z" />,
    bookmark: <path d="M4.5 2.5h7V14L8 11.4 4.5 14z" />,
  }[kind];
  return (
    <span style={{ width: 30, height: 30, borderRadius: "50%", background: `${tone}16`, display: "flex",
      alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={tone} strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round">{glyph}</svg>
    </span>
  );
}

// ── Reusable premium card ─────────────────────────────────────────────────────
function Card({ children, style, hover }: { children: React.ReactNode; style?: React.CSSProperties; hover?: boolean }) {
  const [h, setH] = useState(false);
  return (
    <div
      onMouseEnter={hover ? () => setH(true) : undefined}
      onMouseLeave={hover ? () => setH(false) : undefined}
      style={{
        background: T.panel, border: `1px solid ${T.line}`, borderRadius: 18,
        boxShadow: h ? "var(--elev-3)" : "var(--elev-1)",
        transform: h ? "translateY(-2px)" : "none", transition: "box-shadow .22s ease, transform .22s ease",
        ...style,
      }}>{children}</div>
  );
}
const cardPad: React.CSSProperties = { padding: "22px 24px" };
const sectionTitle: React.CSSProperties = { fontSize: 15.5, fontWeight: 600, color: T.text, ...ui, margin: 0, letterSpacing: "-0.015em" };
const sectionSub: React.CSSProperties = { fontSize: 12.5, color: T.dim, ...ui, margin: "3px 0 0" };
const smallCap: React.CSSProperties = { fontSize: 10, color: T.muted, ...ui, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" };

// ── Signature hero artwork — arctic sunrise (custom, minimal, low-contrast) ────
// Snowy mountain horizon under a pale sky with a soft dawn glow near the ridge.
// Deliberately understated so the hero text stays perfectly readable; the left
// + bottom fades (rendered in the hero card) blend it into the panel.
function HeroArt() {
  return (
    <svg viewBox="0 0 640 260" preserveAspectRatio="xMidYMid slice" aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E9F1FA" /><stop offset="52%" stopColor="#F1ECF0" />
          <stop offset="76%" stopColor="#FBE9DF" /><stop offset="100%" stopColor="#FDF5F0" />
        </linearGradient>
        <radialGradient id="dawn" cx="68%" cy="70%" r="46%">
          <stop offset="0%" stopColor="#FBD3B4" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#F6C9AE" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#F6C9AE" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mtnBack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D8E4F1" /><stop offset="100%" stopColor="#E7EEF7" />
        </linearGradient>
        <linearGradient id="mtnFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C4D4E7" /><stop offset="100%" stopColor="#DEE9F3" />
        </linearGradient>
      </defs>
      <rect width="640" height="260" fill="url(#sky)" />
      <rect width="640" height="260" fill="url(#dawn)" />
      {/* icy haze along the horizon */}
      <rect y="138" width="640" height="44" fill="#FBEDE3" opacity="0.45" />
      {/* distant ridge */}
      <path d="M0 172 L70 132 L120 160 L190 120 L260 158 L330 124 L420 164 L500 130 L560 158 L640 134 L640 260 L0 260 Z"
        fill="url(#mtnBack)" opacity="0.85" />
      {/* near snow peaks */}
      <path d="M0 204 L92 150 L150 186 L232 140 L300 186 L382 148 L470 196 L560 150 L640 186 L640 260 L0 260 Z"
        fill="url(#mtnFront)" />
      {/* snow-lit faces (dawn side) */}
      <g fill="#FFFFFF" opacity="0.62">
        <path d="M92 150 L112 163 L92 172 L74 162 Z" /><path d="M232 140 L254 154 L232 163 L212 153 Z" />
        <path d="M382 148 L404 162 L382 171 L362 160 Z" /><path d="M560 150 L580 163 L560 172 L542 162 Z" />
      </g>
      {/* cool shadow faces */}
      <g fill="#A9BFD9" opacity="0.30">
        <path d="M92 150 L150 186 L118 186 L92 172 Z" /><path d="M232 140 L300 186 L266 186 L232 163 Z" />
        <path d="M382 148 L470 196 L432 196 L382 171 Z" />
      </g>
    </svg>
  );
}

// ── Whole-page premium backdrop (very low opacity, behind everything) ─────────
function PageBackdrop() {
  return (
    <svg aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}
      preserveAspectRatio="xMidYMid slice" viewBox="0 0 1400 1000">
      <defs>
        <radialGradient id="bd-1" cx="15%" cy="8%" r="40%"><stop offset="0%" stopColor="#3B82F6" stopOpacity="0.05" /><stop offset="100%" stopColor="#3B82F6" stopOpacity="0" /></radialGradient>
        <radialGradient id="bd-2" cx="90%" cy="60%" r="45%"><stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.045" /><stop offset="100%" stopColor="#5EEAD4" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1400" height="1000" fill="url(#bd-1)" /><rect width="1400" height="1000" fill="url(#bd-2)" />
    </svg>
  );
}

// ── Index card (market indices — real /api/market) ───────────────────────────
function IndexCard({ item }: { item: MarketItem | undefined }) {
  if (!item) return <Card style={{ ...cardPad, minHeight: 158, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12, ...ui }}>Loading…</Card>;
  const up = (item.change1d ?? 0) >= 0;
  const c = up ? T.green : T.red;
  const spark = item.spark6m && item.spark6m.length > 8 ? item.spark6m.map((v, i) => ({ i, v })) : null;
  const gid = `sp-${item.ticker.replace(/[^a-z0-9]/gi, "")}`;
  // Absolute point change today, derived from the real price + % change.
  const absChange = item.price != null && item.change1d != null && item.change1d !== -1
    ? item.price - item.price / (1 + item.change1d) : null;
  return (
    <Card hover style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text, ...ui, textTransform: "uppercase", letterSpacing: "0.04em" }}>{item.label.toUpperCase()}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: c, ...mono }}>{fmtPct(item.change1d)}</span>
      </div>
      <div style={{ fontSize: 27, fontWeight: 700, color: T.text, ...mono, letterSpacing: "-0.02em" }}>{fmtPrice(item.price)}</div>
      {spark ? (
        <div style={{ height: 54, margin: "2px -4px 0" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.18} /><stop offset="100%" stopColor={c} stopOpacity={0} />
              </linearGradient></defs>
              <Area type="monotone" dataKey="v" stroke={c} strokeWidth={1.8} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <div style={{ height: 54 }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 11.5, ...ui, color: T.muted }}>
        <span>Today</span>
        <span style={{ fontWeight: 700, color: c, ...mono }}>{absChange == null ? "—" : (absChange >= 0 ? "+" : "") + absChange.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
      </div>
    </Card>
  );
}

// ── Desk fund tables ─────────────────────────────────────────────────────────
function CoreTable({ funds, onAnalyze }: { funds: DeskFund[]; onAnalyze?: (t: string) => void }) {
  if (funds.length === 0) return <Empty text="No funds in Commonly Used Funds yet. Save funds to see them here." />;
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead><tr>{["Fund", "1D", "1W", "1M", "YTD"].map((h, i) => (
        <th key={h} style={{ ...smallCap, textAlign: i === 0 ? "left" : "right", padding: "0 0 8px", }}>{h}</th>
      ))}</tr></thead>
      <tbody>
        {funds.map((f) => (
          <tr key={f.ticker} style={{ borderTop: `1px solid ${T.line}` }}>
            <td style={{ padding: "9px 0" }}>
              <button onClick={() => onAnalyze?.(f.ticker)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...mono, fontSize: 12.5, fontWeight: 700, color: T.blue }}>{f.ticker}</button>
            </td>
            {[f.quote?.change1d, f.quote?.change1w, f.quote?.change1m, f.quote?.changeYtd].map((v, i) => (
              <td key={i} style={{ padding: "9px 0", textAlign: "right", fontSize: 12, fontWeight: 600, color: pctCol(v), ...mono }}>{fmtPct(v)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function WatchTable({ funds, onAnalyze }: { funds: DeskFund[]; onAnalyze?: (t: string) => void }) {
  if (funds.length === 0) return <Empty text="Your Watchlist is empty. Add funds to monitor them here." />;
  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead><tr>
        <th style={{ ...smallCap, textAlign: "left", padding: "0 0 8px" }}>Ticker</th>
        <th style={{ ...smallCap, textAlign: "left", padding: "0 0 8px" }}>Category</th>
        <th style={{ ...smallCap, textAlign: "right", padding: "0 0 8px" }}>Score</th>
        <th style={{ ...smallCap, textAlign: "right", padding: "0 0 8px" }}>1D</th>
        <th style={{ ...smallCap, textAlign: "right", padding: "0 0 8px" }}>YTD</th>
        <th style={{ ...smallCap, textAlign: "center", padding: "0 0 8px" }}>Alert</th>
      </tr></thead>
      <tbody>
        {funds.map((f) => (
          <tr key={f.ticker} style={{ borderTop: `1px solid ${T.line}` }}>
            <td style={{ padding: "9px 0" }}>
              <button onClick={() => onAnalyze?.(f.ticker)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...mono, fontSize: 12.5, fontWeight: 700, color: T.blue }}>{f.ticker}</button>
            </td>
            <td style={{ padding: "9px 8px 9px 0", fontSize: 11.5, color: T.dim, ...ui, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.category ?? "—"}</td>
            <td style={{ padding: "9px 0", textAlign: "right", fontSize: 12, fontWeight: 700, color: T.muted, ...mono }} title="Open the fund to see its Advisor Review Score">—</td>
            <td style={{ padding: "9px 0", textAlign: "right", fontSize: 12, fontWeight: 600, color: pctCol(f.quote?.change1d), ...mono }}>{fmtPct(f.quote?.change1d)}</td>
            <td style={{ padding: "9px 0", textAlign: "right", fontSize: 12, fontWeight: 600, color: pctCol(f.quote?.changeYtd), ...mono }}>{fmtPct(f.quote?.changeYtd)}</td>
            <td style={{ padding: "9px 0", textAlign: "center" }}>
              {f.alertCount > 0
                ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 17, height: 17,
                    borderRadius: 999, background: T.red, color: "#fff", fontSize: 10, fontWeight: 700, ...mono, padding: "0 4px" }}>{f.alertCount}</span>
                : <span style={{ color: T.muted }}>–</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12.5, color: T.muted, ...ui, padding: "14px 0", lineHeight: 1.6 }}>{text}</div>;
}

// ── Premium isometric hub illustrations (custom SVG, one design system) ───────
// Shared iso helpers: a soft platform + a lifted panel with gradient + glass.
function isoDefs(id: string, c: string, light: string) {
  return (
    <defs>
      <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={light} /><stop offset="100%" stopColor={c} />
      </linearGradient>
      <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff" stopOpacity="0.5" /><stop offset="100%" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <radialGradient id={`${id}-glow`} cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor={c} stopOpacity="0.22" /><stop offset="100%" stopColor={c} stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}
const platform = (c: string) => (
  <g><ellipse cx="66" cy="98" rx="52" ry="13" fill={c} opacity="0.10" />
    <path d="M66 74 L114 96 L66 118 L18 96 Z" fill={c} opacity="0.08" />
    <path d="M66 70 L114 92 L66 114 L18 92 Z" fill={c} opacity="0.14" /></g>
);
// A lifted isometric card (top face + side depth).
function isoCard(id: string, x: number, y: number, w: number, h: number, dep: number, c: string) {
  return (
    <g>
      <path d={`M${x} ${y} L${x + w} ${y - w * 0.5} L${x + w} ${y - w * 0.5 + dep} L${x} ${y + dep} Z`} fill={c} opacity="0.5" />
      <path d={`M${x} ${y} L${x - h} ${y - h * 0.5} L${x - h} ${y - h * 0.5 + dep} L${x} ${y + dep} Z`} fill={c} opacity="0.32" />
      <path d={`M${x} ${y} L${x + w} ${y - w * 0.5} L${x + w - h} ${y - w * 0.5 - h * 0.5} L${x - h} ${y - h * 0.5} Z`} fill={`url(#${id}-g)`} />
    </g>
  );
}
const IlloResearch = ({ c }: { c: string }) => {
  const id = "il-r", light = "#7FA8FF";
  return (
    <svg width="128" height="120" viewBox="0 0 132 122" aria-hidden>
      {isoDefs(id, c, light)}<rect width="132" height="122" fill={`url(#${id}-glow)`} />{platform(c)}
      {/* floating dashboard panel */}
      <g transform="translate(2 -6)">
        <path d="M40 54 L86 30 L112 44 L66 68 Z" fill={`url(#${id}-g)`} />
        <path d="M40 54 L40 62 L66 76 L66 68 Z" fill={c} opacity="0.5" />
        <path d="M66 68 L66 76 L112 52 L112 44 Z" fill={c} opacity="0.34" />
        {/* mini bars on the panel top */}
        {[[58, 50, 8], [66, 52, 12], [74, 50, 16], [82, 48, 10]].map(([bx, by, bh], i) =>
          <path key={i} d={`M${bx} ${by} l6 3 l0 ${-bh} l-6 ${-3} Z`} fill="#fff" opacity={0.55 - i * 0.06} />)}
      </g>
      {/* search bubble */}
      <g transform="translate(84 20)"><circle r="11" fill={`url(#${id}-g)`} /><circle r="11" fill={`url(#${id}-glass)`} />
        <circle r="5" fill="none" stroke="#fff" strokeWidth="2" /><line x1="4" y1="4" x2="8" y2="8" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></g>
    </svg>
  );
};
const IlloPortfolio = ({ c }: { c: string }) => {
  const id = "il-p", light = "#5FE0A6";
  return (
    <svg width="128" height="120" viewBox="0 0 132 122" aria-hidden>
      {isoDefs(id, c, light)}<rect width="132" height="122" fill={`url(#${id}-glow)`} />{platform(c)}
      {/* allocation rings (isometric donut stack) */}
      <g transform="translate(66 58)">
        <ellipse cy="10" rx="34" ry="19" fill={c} opacity="0.5" />
        <ellipse rx="34" ry="19" fill={`url(#${id}-g)`} />
        <path d="M0 0 L0 -19 A34 19 0 0 1 30 8 Z" fill="#fff" opacity="0.4" />
        <ellipse rx="14" ry="8" fill={T.panel} />
      </g>
      {/* floating blocks */}
      {isoCard(id, 24, 44, 16, 10, 7, c)}
      <rect x="92" y="30" width="20" height="14" rx="3" transform="skewY(-8)" fill={`url(#${id}-g)`} opacity="0.9" />
    </svg>
  );
};
const IlloModel = ({ c }: { c: string }) => {
  const id = "il-m", light = "#B794F6";
  return (
    <svg width="128" height="120" viewBox="0 0 132 122" aria-hidden>
      {isoDefs(id, c, light)}<rect width="132" height="122" fill={`url(#${id}-glow)`} />{platform(c)}
      {/* probability surface */}
      <path d="M20 84 L44 62 L64 70 L104 34 L104 88 L20 88 Z" fill={`url(#${id}-g)`} opacity="0.22" />
      <path d="M20 84 Q40 58 64 70 T104 34" fill="none" stroke={c} strokeWidth="1.4" opacity="0.4" transform="translate(0 10)" />
      <path d="M20 78 L44 56 L64 64 L104 28" fill="none" stroke={`url(#${id}-g)`} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      {[[20, 78], [44, 56], [64, 64], [104, 28]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="4.5" fill="#fff" /><circle cx={x} cy={y} r="3" fill={c} /></g>)}
    </svg>
  );
};
const IlloTools = ({ c }: { c: string }) => {
  const id = "il-t", light = "#F5C77E";
  return (
    <svg width="128" height="120" viewBox="0 0 132 122" aria-hidden>
      {isoDefs(id, c, light)}<rect width="132" height="122" fill={`url(#${id}-glow)`} />{platform(c)}
      {/* planning blocks + gauge */}
      {isoCard(id, 34, 66, 18, 12, 10, c)}
      {isoCard(id, 58, 54, 18, 12, 16, c)}
      <g transform="translate(90 50)">
        <ellipse cy="6" rx="20" ry="11" fill={c} opacity="0.5" /><ellipse rx="20" ry="11" fill={`url(#${id}-g)`} />
        <path d="M0 0 L0 -11 A20 11 0 0 1 17 5 Z" fill="#fff" opacity="0.42" /><ellipse rx="8" ry="4.5" fill={T.panel} />
      </g>
    </svg>
  );
};

// ── Workspace hub card ────────────────────────────────────────────────────────
function Hub({ title, purpose, accent, items, cta, onCta, go, illo }: {
  title: string; purpose: string; accent: string; cta: string; onCta: () => void;
  items: { label: string; tab?: DashTab; disabled?: boolean }[]; go: (t: DashTab) => void;
  illo: React.ReactNode;
}) {
  return (
    <Card hover style={{ ...cardPad, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: accent }} />
        </span>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, ...ui }}>{title}</div>
      </div>
      <div style={{ fontSize: 11.5, color: T.dim, ...ui, marginBottom: 8 }}>{purpose}</div>
      <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
          {items.map((it) => (
            <button key={it.label} disabled={it.disabled || !it.tab} onClick={() => it.tab && go(it.tab)}
              style={{ textAlign: "left", background: "none", border: "none", padding: "3.5px 0", ...ui, fontSize: 12,
                color: it.disabled || !it.tab ? T.muted : T.dim, cursor: it.disabled || !it.tab ? "default" : "pointer",
                display: "flex", alignItems: "center", gap: 7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <MiniIcon label={it.label} c={accent} />{it.label}{it.disabled ? <span style={{ fontSize: 9, color: T.muted }}> soon</span> : null}
            </button>
          ))}
        </div>
        <div style={{ flexShrink: 0, marginTop: -4, opacity: 0.95 }}>{illo}</div>
      </div>
      <button onClick={onCta} style={{ marginTop: 12, alignSelf: "flex-start", padding: "9px 18px", borderRadius: 10, border: "none",
        background: accent, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", ...ui }}>{cta}</button>
    </Card>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardTab({ onNavigate, userEmail, onAnalyze }: {
  onNavigate?: (t: DashTab) => void; userEmail?: string | null; onAnalyze?: (t: string) => void;
} = {}) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [health, setHealth] = useState<HealthResp | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const isNarrow = useMediaQuery("(max-width: 1080px)");
  const isMobile = useMediaQuery("(max-width: 720px)");
  const go = (t: DashTab) => onNavigate?.(t);

  useEffect(() => {
    let alive = true;
    fetch("/api/market").then((r) => r.json()).then((d) => { if (alive) setMarket(d); }).catch(() => {});
    fetch("/api/profile", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const p = d?.profile as { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null;
        const full = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
        setGreeting(full || p?.display_name || (d?.greeting as string) || greetingName(null, userEmail ?? null));
      })
      .catch(() => { if (alive) setGreeting(greetingName(null, userEmail ?? null)); });
    fetch("/api/advisor-overview", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.ok) setOverview(d as Overview); }).catch(() => {});
    fetch("/api/health/system", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.checks) setHealth(d as HealthResp); }).catch(() => {});
    return () => { alive = false; };
  }, [userEmail, refreshTick]);

  const indices = useMemo(() => {
    const find = (t: string) => market?.items.find((i) => i.ticker === t);
    return [find("^DJI"), find("^IXIC"), find("^GSPC")];
  }, [market]);
  const healthProblems = health ? health.checks.filter((c) => c.status !== "healthy").length : 0;
  const dataTime = market
    ? new Date(market.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET"
    : null;

  return (
    <div style={{ margin: "0 -32px", background: T.bg, minHeight: "100vh", position: "relative" }}>
      <PageBackdrop />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1400, margin: "0 auto", padding: isMobile ? "88px 16px 48px" : "100px 32px 64px",
        display: "flex", flexDirection: "column", gap: 22 }}>

        {/* ── TOP: Welcome + 3 index cards ── */}
        <Reveal>
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "0.9fr 1.5fr", gap: 20 }}>
            {/* Welcome */}
            <Card style={{ padding: isMobile ? "26px 24px" : "34px 32px", position: "relative", overflow: "hidden",
              display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 200 }}>
              <HeroArt />
              {/* fades keep the arctic scene subtle + the text readable */}
              <div aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${T.panel} 0%, ${T.panel} 26%, transparent 64%)` }} />
              <div aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, ${T.panel} 0%, transparent 42%)` }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ fontSize: 12.5, color: T.dim, ...ui, marginBottom: 4, fontWeight: 400, letterSpacing: "0.01em" }}>Welcome back,</div>
                <h1 style={{ fontSize: isMobile ? 32 : 46, fontWeight: 600, color: T.text, ...ui, margin: 0, letterSpacing: "-0.035em", lineHeight: 1.0 }}>
                  {greeting ?? "Advisor"}
                </h1>
                <p style={{ fontSize: 14, color: T.dim, ...ui, margin: "14px 0 18px", lineHeight: 1.5, fontWeight: 400 }}>
                  Here’s what needs attention across your workspace.
                </p>
                <div style={{ display: "inline-flex", alignItems: "center", background: "rgba(255,255,255,0.82)",
                  backdropFilter: "blur(5px)", border: `1px solid ${T.line}`, borderRadius: 10, padding: "7px 6px 7px 14px",
                  boxShadow: "var(--elev-1)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, ...ui, color: T.text, paddingRight: 13 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: healthProblems === 0 ? T.green : T.amber }} />
                    {health ? (healthProblems === 0 ? "All systems operational" : `${healthProblems} item${healthProblems === 1 ? "" : "s"} need attention`) : "Checking systems…"}
                  </span>
                  {dataTime && (
                    <>
                      <span style={{ width: 1, alignSelf: "stretch", background: T.line }} />
                      <span style={{ fontSize: 11.5, color: T.muted, ...mono, padding: "0 8px 0 13px" }}>Data as of {dataTime}</span>
                      <button onClick={() => setRefreshTick((t) => t + 1)} aria-label="Refresh data" title="Refresh"
                        style={{ width: 24, height: 24, borderRadius: 7, border: "none", background: "transparent",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted }}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                          <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.8h-2.8" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>
            {/* 3 index cards */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16 }}>
              {indices.map((it, i) => <IndexCard key={i} item={it} />)}
            </div>
          </div>
        </Reveal>

        {/* ── MAIN: Daily Desk (2/3) + right column (1/3) ── */}
        <Reveal delay={60}>
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1.9fr 1fr", gap: 20, alignItems: "start" }}>

            {/* Left column: Daily Desk + Recent Activity strip */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
              <Card style={{ ...cardPad }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, background: `${T.blue}14`, display: "flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={T.blue} strokeWidth="1.5" strokeLinejoin="round">
                        <path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />
                      </svg>
                    </span>
                    <div>
                      <h2 style={sectionTitle}>Daily Desk</h2>
                      <p style={sectionSub}>Your saved funds, watchlists, and recent activity at a glance.</p>
                    </div>
                  </div>
                  <button onClick={() => go("lists")} style={{ display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 11.5, color: T.dim, ...ui, background: "none",
                    border: `1px solid ${T.line2}`, borderRadius: 9, padding: "7px 12px", cursor: "pointer", fontWeight: 600 }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <circle cx="8" cy="8" r="2" /><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4" />
                    </svg>
                    Customize
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.15fr", gap: 22, marginTop: 18 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, ...ui }}>My Core Funds</span>
                      <button onClick={() => go("lists")} style={{ fontSize: 11, color: T.blue, ...ui, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>View all →</button>
                    </div>
                    {overview ? <CoreTable funds={overview.coreFunds} onAnalyze={onAnalyze} /> : <Empty text="Loading…" />}
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, ...ui }}>Watchlist</span>
                      <button onClick={() => go("watchlist")} style={{ fontSize: 11, color: T.blue, ...ui, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>View full watchlist →</button>
                    </div>
                    {overview ? <WatchTable funds={overview.watchlistFunds} onAnalyze={onAnalyze} /> : <Empty text="Loading…" />}
                  </div>
                </div>
              </Card>

              {/* Recent Activity strip */}
              <Card style={{ padding: "16px 22px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
                  <FeedIcon tone={T.blue} kind="eye" />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, ...ui }}>Recent Activity</div>
                    <div style={{ fontSize: 11, color: T.muted, ...ui }}>Your latest actions and updates.</div>
                  </div>
                </div>
                {overview && overview.recentActivity.length > 0 ? (
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", flex: 1 }}>
                    {overview.recentActivity.slice(0, 4).map((a, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <FeedIcon tone={SEV_DOT[a.severity] ?? T.blue} kind={a.kind === "alert" ? "doc" : "bookmark"} />
                        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.text, ...ui, maxWidth: 150,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {a.ticker ? `${a.ticker} — ` : ""}{a.label.replace(new RegExp(`^${a.ticker ?? ""} — `), "")}
                          </span>
                          <span style={{ fontSize: 10.5, color: T.muted, ...ui }}>{timeAgo(a.at)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : <span style={{ fontSize: 12, color: T.muted, ...ui }}>No recent activity yet. Save a fund or run an SEC refresh to get started.</span>}
              </Card>
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* My Updates / Alerts */}
              <Card style={{ ...cardPad }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <h2 style={sectionTitle}>My Updates / Alerts</h2>
                  <button onClick={() => go("alerts")} style={{ fontSize: 11.5, color: T.blue, ...ui, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>View all →</button>
                </div>
                <p style={sectionSub}>Personal updates for your funds &amp; watchlist.</p>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
                  {overview && (overview.attentionItems.length > 0 || overview.recentActivity.length > 0) ? (
                    <>
                      {overview.attentionItems.map((it, i) => (
                        <button key={`a${i}`} onClick={() => go(it.type === "sec_alerts" || it.type === "unresolved_cik" ? "alerts" : "expansion")}
                          style={{ display: "flex", alignItems: "center", gap: 11, textAlign: "left", background: "none", border: "none",
                            padding: "10px 0", borderTop: i ? `1px solid ${T.line}` : "none", cursor: "pointer" }}>
                          <FeedIcon tone={SEV_DOT[it.severity] ?? T.blue} kind={it.severity === "warning" ? "warn" : "bell"} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: T.text, ...ui, lineHeight: 1.35 }}>{it.title}</span>
                            <span style={{ display: "block", fontSize: 11, color: T.muted, ...ui }}>Needs your review</span>
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: T.text, ...mono }}>{it.count}</span>
                        </button>
                      ))}
                      {overview.recentActivity.slice(0, 5).map((a, i) => (
                        <div key={`r${i}`} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0",
                          borderTop: overview.attentionItems.length + i > 0 ? `1px solid ${T.line}` : "none" }}>
                          <FeedIcon tone={SEV_DOT[a.severity] ?? T.blue} kind="doc" />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: T.text, ...ui, lineHeight: 1.35,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                            {a.ticker && <span style={{ display: "block", fontSize: 11, color: T.muted, ...mono }}>{a.ticker}</span>}
                          </span>
                          <span style={{ fontSize: 10.5, color: T.muted, ...ui, flexShrink: 0 }}>{timeAgo(a.at)}</span>
                        </div>
                      ))}
                      <button onClick={() => go("alerts")} style={{ marginTop: 8, alignSelf: "flex-start", background: "none",
                        border: "none", color: T.blue, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, ...ui }}>
                        View all alerts →
                      </button>
                    </>
                  ) : <p style={{ fontSize: 12.5, color: T.muted, ...ui, padding: "10px 0", lineHeight: 1.6 }}>No updates right now. Save funds and run an SEC refresh to start monitoring.</p>}
                </div>
              </Card>

              {/* Market / Global News — honest empty state (no provider) */}
              <Card style={{ ...cardPad }}>
                <h2 style={sectionTitle}>Market & Global News</h2>
                <p style={sectionSub}>General market headlines.</p>
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
                  padding: "18px 0", color: T.muted }}>
                  <span style={{ fontSize: 12.5, color: T.dim, ...ui, fontWeight: 600 }}>No news source connected</span>
                  <span style={{ fontSize: 11.5, color: T.muted, ...ui, lineHeight: 1.6 }}>
                    A licensed market-news feed isn’t connected yet, so no headlines are shown here. SEC filing activity for your saved funds appears under Updates & Alerts.
                  </span>
                </div>
              </Card>
            </div>
          </div>
        </Reveal>

        {/* ── Workspace hubs ── */}
        <Reveal delay={90}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isNarrow ? "1fr 1fr" : "repeat(4, 1fr)", gap: 18 }}>
            <Hub title="Research Hub" purpose="Find, analyze, and compare funds." accent="#2563EB" cta="Go to Research" onCta={() => go("research")} go={go} illo={<IlloResearch c="#2563EB" />}
              items={[{ label: "Advanced Search", tab: "find" }, { label: "Screeners", tab: "find" }, { label: "Categories", tab: "research" }, { label: "Fund Comparison", tab: "comparison" }, { label: "Recently Viewed", tab: "research" }]} />
            <Hub title="Portfolio Hub" purpose="Build, analyze, and manage portfolios." accent="#16A34A" cta="Go to Portfolio" onCta={() => go("portfolio")} go={go} illo={<IlloPortfolio c="#16A34A" />}
              items={[{ label: "My Portfolios", tab: "portfolio" }, { label: "Allocation Review", tab: "portfolio" }, { label: "Rebalancing", tab: "portfolio" }, { label: "Performance & Attribution", tab: "portfolio" }, { label: "Risk Analysis", tab: "murderboard" }]} />
            <Hub title="Model Hub" purpose="Run models and explore projections." accent="#7C3AED" cta="Go to Model" onCta={() => go("model")} go={go} illo={<IlloModel c="#7C3AED" />}
              items={[{ label: "Model Portfolios", tab: "model" }, { label: "Goal Planning", tab: "model-project" }, { label: "Scenario Analysis", tab: "model-scenarios" }, { label: "Projections", tab: "model-project" }, { label: "Monte Carlo", disabled: true }]} />
            <Hub title="Planning & Tools Hub" purpose="Client planning, tools, and analytics." accent="#D97706" cta="Go to Tools" onCta={() => go("tax")} go={go} illo={<IlloTools c="#D97706" />}
              items={[{ label: "Retirement Planner", disabled: true }, { label: "Tax Efficiency Analyzer", tab: "tax" }, { label: "Income Planning", disabled: true }, { label: "Estate Planning Tools", disabled: true }, { label: "Client Reports", disabled: true }, { label: "Custom Calculators", disabled: true }, { label: "RMD & Distribution Planner", disabled: true }, { label: "Social Security Optimizer", disabled: true }]} />
          </div>
        </Reveal>

        {/* ── Pro Tip bar ── */}
        <Reveal delay={110}>
          <Card style={{ padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(217,119,6,0.12)", display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 1.6a4.8 4.8 0 0 0-2.7 8.8c.5.4.7.8.7 1.3v.6h4v-.6c0-.5.2-.9.7-1.3A4.8 4.8 0 0 0 8 1.6zM6.4 14.4h3.2" />
                </svg>
              </span>
              <span style={{ fontSize: 12.5, color: T.dim, ...ui }}>
                <span style={{ fontWeight: 700, color: "#B45309" }}>Pro Tip</span>&nbsp;&nbsp;Run a Tax Efficiency Analyzer on high-basis holdings to uncover potential tax savings.
              </span>
            </div>
            <button onClick={() => go("tax")} style={{ padding: "8px 16px", borderRadius: 9, border: `1px solid ${T.line2}`,
              background: T.panel, color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer", ...ui, whiteSpace: "nowrap" }}>Try it now →</button>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}
