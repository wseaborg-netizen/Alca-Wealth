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
interface DeskFund { ticker: string; name: string | null; category: string | null; quote: Quote | null; hasAlert: boolean }
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
const sectionTitle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.01em" };
const sectionSub: React.CSSProperties = { fontSize: 12.5, color: T.dim, ...ui, margin: "3px 0 0" };
const smallCap: React.CSSProperties = { fontSize: 10, color: T.muted, ...ui, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" };

// ── Signature hero artwork — flowing mesh · topographic curves · network ──────
function HeroArt() {
  // A deterministic particle field + network nodes (no randomness → stable SSR).
  const nodes = [[430, 40], [500, 70], [560, 40], [470, 110], [540, 130], [590, 95], [415, 150], [505, 175]];
  const links: [number, number][] = [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [2, 5], [3, 6], [4, 7]];
  return (
    <svg viewBox="0 0 640 260" preserveAspectRatio="xMidYMid slice" aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id="hero-rib" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.55" /><stop offset="55%" stopColor="#3B82F6" stopOpacity="0.5" /><stop offset="100%" stopColor="#2563EB" stopOpacity="0.4" />
        </linearGradient>
        <radialGradient id="hero-glow" cx="72%" cy="30%" r="55%">
          <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.16" /><stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2563EB" stopOpacity="0" /><stop offset="50%" stopColor="#2563EB" stopOpacity="0.5" /><stop offset="100%" stopColor="#5EEAD4" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <rect width="640" height="260" fill="url(#hero-glow)" />
      {/* topographic contour curves */}
      <g fill="none" stroke="url(#hero-line)" strokeWidth="1">
        {[0, 16, 32, 50, 70, 92].map((o, i) => (
          <path key={i} opacity={0.5 - i * 0.05}
            d={`M-20 ${150 + o} C 140 ${90 + o} 300 ${190 + o} 470 ${110 + o} S 700 ${150 + o} 720 ${120 + o}`} />
        ))}
      </g>
      {/* soft translucent ribbons */}
      <path d="M-40 120 C 160 40 360 200 680 60 L680 -40 L-40 -40 Z" fill="url(#hero-rib)" opacity="0.14" />
      <path d="M-40 170 C 200 90 420 230 700 110" fill="none" stroke="url(#hero-rib)" strokeWidth="30" opacity="0.16" strokeLinecap="round" />
      <path d="M-20 210 C 220 150 430 250 700 170" fill="none" stroke="url(#hero-rib)" strokeWidth="16" opacity="0.20" strokeLinecap="round" />
      {/* financial network mesh */}
      <g stroke="#3B82F6" strokeWidth="0.8" opacity="0.35">
        {links.map(([a, b], i) => <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />)}
      </g>
      {nodes.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 3 : 2} fill="#2563EB" opacity="0.5" />)}
      {/* fine particles */}
      <g fill="#5EEAD4" opacity="0.5">
        {[[380, 60], [420, 200], [560, 200], [610, 50], [330, 120], [290, 60], [360, 170], [520, 100]].map(([x, y], i) =>
          <circle key={i} cx={x} cy={y} r={i % 2 ? 1.4 : 1} />)}
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
      <g fill="none" stroke="#2563EB" strokeWidth="1" opacity="0.035">
        {[0, 60, 120, 190, 270].map((o, i) => (
          <path key={i} d={`M-40 ${560 + o} C 300 ${420 + o} 700 ${680 + o} 1440 ${480 + o}`} />
        ))}
      </g>
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
              {f.hasAlert ? <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: T.red }} /> : <span style={{ color: T.muted }}>–</span>}
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

// ── Small link icon ───────────────────────────────────────────────────────────
function LinkDot({ c }: { c: string }) {
  return <span style={{ width: 5, height: 5, borderRadius: "50%", background: c, opacity: 0.75, flexShrink: 0 }} />;
}

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
              <LinkDot c={accent} />{it.label}{it.disabled ? <span style={{ fontSize: 9, color: T.muted }}> soon</span> : null}
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
  const isNarrow = useMediaQuery("(max-width: 1080px)");
  const isMobile = useMediaQuery("(max-width: 720px)");
  const go = (t: DashTab) => onNavigate?.(t);

  useEffect(() => {
    let alive = true;
    fetch("/api/market").then((r) => r.json()).then((d) => { if (alive) setMarket(d); }).catch(() => {});
    fetch("/api/profile", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setGreeting((d?.greeting as string) ?? greetingName(null, userEmail ?? null)); })
      .catch(() => { if (alive) setGreeting(greetingName(null, userEmail ?? null)); });
    fetch("/api/advisor-overview", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.ok) setOverview(d as Overview); }).catch(() => {});
    fetch("/api/health/system", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.checks) setHealth(d as HealthResp); }).catch(() => {});
    return () => { alive = false; };
  }, [userEmail]);

  const indices = useMemo(() => {
    const find = (t: string) => market?.items.find((i) => i.ticker === t);
    return [find("^DJI"), find("^IXIC"), find("^GSPC")];
  }, [market]);
  const time = market ? new Date(market.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
  const healthProblems = health ? health.checks.filter((c) => c.status !== "healthy").length : 0;

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
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ fontSize: 13, color: T.dim, ...ui, marginBottom: 2 }}>Welcome back,</div>
                <h1 style={{ fontSize: isMobile ? 30 : 38, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
                  {greeting ?? "Advisor"}
                </h1>
                <p style={{ fontSize: 13.5, color: T.dim, ...ui, margin: "10px 0 16px", lineHeight: 1.5 }}>
                  Here’s what needs attention across your workspace.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, ...ui, color: T.text }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: healthProblems === 0 ? T.green : T.amber }} />
                    {health ? (healthProblems === 0 ? "All systems operational" : `${healthProblems} item${healthProblems === 1 ? "" : "s"} need attention`) : "Checking systems…"}
                  </span>
                  {time && <span style={{ fontSize: 11.5, color: T.muted, ...mono }}>Data as of {time} · delayed</span>}
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

            {/* Daily Desk */}
            <Card style={{ ...cardPad }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h2 style={sectionTitle}>Daily Desk</h2>
                  <p style={sectionSub}>Your saved funds, watchlists, and recent activity at a glance.</p>
                </div>
                <button onClick={() => go("lists")} style={{ fontSize: 11.5, color: T.dim, ...ui, background: "none",
                  border: `1px solid ${T.line2}`, borderRadius: 8, padding: "6px 11px", cursor: "pointer", fontWeight: 600 }}>Customize</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 22, marginTop: 18 }}>
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
                    <button onClick={() => go("watchlist")} style={{ fontSize: 11, color: T.blue, ...ui, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>View full →</button>
                  </div>
                  {overview ? <WatchTable funds={overview.watchlistFunds} onAnalyze={onAnalyze} /> : <Empty text="Loading…" />}
                </div>
              </div>

              {/* Recent activity */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, ...ui }}>Recent activity</span>
                {overview && overview.recentActivity.length > 0 ? (
                  <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                    {overview.recentActivity.slice(0, 5).map((a, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: T.panel3,
                        border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 12px" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: SEV_DOT[a.severity] ?? T.muted }} />
                        {a.ticker && <span style={{ fontSize: 11.5, fontWeight: 700, color: T.blue, ...mono }}>{a.ticker}</span>}
                        <span style={{ fontSize: 11.5, color: T.dim, ...ui, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                        <span style={{ fontSize: 10, color: T.muted, ...mono }}>{new Date(a.at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ fontSize: 12, color: T.muted, ...ui, margin: "8px 0 0" }}>No recent activity yet. Save a fund or run an SEC refresh to get started.</p>}
              </div>
            </Card>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* My Updates / Alerts */}
              <Card style={{ ...cardPad }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <h2 style={sectionTitle}>My Updates & Alerts</h2>
                  <button onClick={() => go("alerts")} style={{ fontSize: 11.5, color: T.blue, ...ui, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>View all →</button>
                </div>
                <p style={sectionSub}>Personal to your saved funds, watchlist, and monitoring.</p>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                  {overview && (overview.attentionItems.length > 0 || overview.recentActivity.length > 0) ? (
                    <>
                      {overview.attentionItems.map((it, i) => (
                        <button key={`a${i}`} onClick={() => go(it.type === "sec_alerts" || it.type === "unresolved_cik" ? "alerts" : "expansion")}
                          style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: "none", border: "none", padding: "9px 0", borderTop: i ? `1px solid ${T.line}` : "none", cursor: "pointer" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_DOT[it.severity] ?? T.blue, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 12.5, color: T.text, ...ui }}>{it.title}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: T.text, ...mono }}>{it.count}</span>
                        </button>
                      ))}
                      {overview.recentActivity.slice(0, 5).map((a, i) => (
                        <div key={`r${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${T.line}` }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_DOT[a.severity] ?? T.muted, flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 12.5, color: T.text, ...ui, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.ticker ? <span style={{ color: T.blue, fontWeight: 700, ...mono }}>{a.ticker} </span> : null}{a.label}
                            </span>
                          </span>
                          <span style={{ fontSize: 10, color: T.muted, ...mono, flexShrink: 0 }}>{new Date(a.at).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </>
                  ) : <p style={{ fontSize: 12.5, color: T.muted, ...ui, padding: "10px 0" }}>No updates right now. Save funds and run an SEC refresh to start monitoring.</p>}
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
          <Card style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 14, flexWrap: "wrap", background: "linear-gradient(90deg, rgba(217,119,6,0.06), rgba(37,99,235,0.04))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(217,119,6,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 15 }}>💡</span>
              </span>
              <span style={{ fontSize: 12.5, color: T.text, ...ui }}>
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
