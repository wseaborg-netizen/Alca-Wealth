"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ui, mono } from "./tokens";
import { useMediaQuery } from "./motion";
import { greetingName } from "@/lib/profile";
import { rankPerformers } from "@/lib/overviewRank";
import { STATUS_META, type Status } from "./FirmFundsTab";

/**
 * Advisor Overview — the signed-in command center.
 *
 * Real firm-scoped data only, via existing endpoints (no new APIs, no schema):
 *   /api/advisor-overview  → review workflow counts, status counts, alert counts
 *   /api/firm-funds        → the firm's fund inventory (identity + status)
 *   /api/firm-funds/performance → canonical Price Change + sparkline per period
 *   /api/market            → labeled ETF-proxy market pulse
 * Top/Worst performers rank ONLY the authenticated firm's funds by the canonical
 * visible Price Change (raw close for ETFs, raw NAV for mutual funds; dividends/
 * distributions excluded) — the same engine every other surface uses. Missing
 * performance shows "Unavailable", never 0%. Unsupported sections show honest
 * empty states; nothing is fabricated. The right column is market/monitoring
 * context only — no reviews.
 */

// Locked visible period vocabulary + single metric (Price Change).
const PERIODS = ["1D", "5D", "1M", "6M", "YTD", "1Y", "3Y", "5Y", "Max"] as const;
type Period = (typeof PERIODS)[number];
const DEFAULT_PERIOD: Period = "YTD";

// ── Brand palette (Overview) ──────────────────────────────────────────────────
const C = {
  bg: "#F5F8FD", panel: "#FFFFFF", ink: "#0F1B33", dim: "#475467", mute: "#7A879C",
  line: "#E6ECF5", line2: "#DCE4F0", blue: "#2563EB", blueSoft: "#EAF1FE",
  green: "#059669", red: "#DC2626", amber: "#B45309", sky: "#EAF3FC",
};

// ── Nav destinations (map to existing app tabs) ───────────────────────────────
export type DashTab = string;
const SIDEBAR: { label: string; dest: string; icon: string; badgeKey?: "attention" }[] = [
  { label: "Overview", dest: "dashboard", icon: "grid" },
  { label: "Attention", dest: "alerts", icon: "inbox", badgeKey: "attention" },
  { label: "Firm Funds", dest: "firmfunds", icon: "funds" },
  { label: "Watchlist", dest: "watchlist", icon: "eye" },
  { label: "Analytics", dest: "analysis", icon: "bars" },
  { label: "Reviews", dest: "reviews", icon: "check" },
  { label: "Discover", dest: "research", icon: "search" },
  { label: "News & Filings", dest: "alerts", icon: "doc" },
  { label: "Settings", dest: "__settings", icon: "gear" },
];
const TOP_TABS: { label: string; dest: string }[] = [
  { label: "Overview", dest: "dashboard" },
  { label: "Monitor", dest: "firmfunds" },
  { label: "Research", dest: "research" },
  { label: "Markets", dest: "#market-pulse" },
];

// ── Types (from existing endpoints) ───────────────────────────────────────────
interface PerfPoint { priceChange: number | null; spark: number[] | null }
interface PerfResult { periods: Record<Period, PerfPoint>; asOf: string | null; basis: "market_price" | "nav" }
interface InvRow { id: string; ticker: string; name: string | null; vehicle: string | null; status: Status }
interface Counts { openReviews: number; inReview: number; approachingTarget: number; overdueActive: number; firmFundsUpcoming: number; firmFundsOverdue: number }
interface ReviewWorkflow { counts: Counts; statusCounts: Record<Status, number>; firmFundsTotal: number }
interface Overview {
  ok: boolean;
  reviewWorkflow: ReviewWorkflow | null;
  alertCounts: { unread: number; total: number };
  userSummary?: { greeting?: string | null };
}
interface MarketItem { ticker: string; label: string; price: number | null; change1d: number | null; spark6m?: number[]; proxy?: { of: string } }
interface MarketData { items: MarketItem[]; fetchedAt: number }

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtPct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`);
const pctCol = (v: number | null | undefined) => (v == null ? C.mute : v >= 0 ? C.green : C.red);
const fmtNum = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function greetingPrefix(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
/** US equity session status, derived from Eastern Time (honest, no fabrication). */
function marketStatus(): { open: boolean; label: string } {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); const mins = et.getHours() * 60 + et.getMinutes();
  const open = day >= 1 && day <= 5 && mins >= 570 && mins < 960; // 9:30–16:00 ET, Mon–Fri
  return { open, label: open ? "Open" : "Closed" };
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function Ico({ n, c = "currentColor", s = 18 }: { n: string; c?: string; s?: number }) {
  const p: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.4" /><rect x="14" y="3" width="7" height="7" rx="1.4" /><rect x="3" y="14" width="7" height="7" rx="1.4" /><rect x="14" y="14" width="7" height="7" rx="1.4" /></>,
    inbox: <><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1 2h6l1-2h5" /></>,
    funds: <><path d="M4 20V10M9 20V4M14 20v-7M19 20V8" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.6" /></>,
    bars: <><path d="M4 20V12M9 20V6M14 20v-9M19 20V9" /></>,
    check: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12l2 2 4-4" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></>,
    doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 9h6M9 12.5h6M9 16h4" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
    bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M10.3 21a2 2 0 0 0 3.4 0" /></>,
    chevron: <path d="M6 9l6 6 6-6" />,
  };
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p[n]}</svg>;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Spark({ data, up, w = 72, h = 22 }: { data: number[] | null; up: boolean; w?: number; h?: number }) {
  if (!data || data.length < 4) return <span style={{ color: C.mute, fontSize: 10.5, ...ui }}>—</span>;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={up ? C.green : C.red} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusPill({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return <span style={{ fontSize: 10.5, fontWeight: 600, ...ui, color: m.fg, background: m.bg, border: `1px solid ${m.bd}`, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>{m.label}</span>;
}

// ── Mountain header (local optimized SVG — snowy ridge fading into the page) ───
function MountainHeader() {
  return (
    <svg viewBox="0 0 1440 300" preserveAspectRatio="xMidYMid slice" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id="ov-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#EAF3FC" /><stop offset="1" stopColor="#F5F8FD" /></linearGradient>
        <linearGradient id="ov-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#CFE0F2" /><stop offset="1" stopColor="#E3EDF8" /></linearGradient>
        <linearGradient id="ov-near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#B9CFE8" /><stop offset="1" stopColor="#DCE8F5" /></linearGradient>
        <linearGradient id="ov-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F5F8FD" stopOpacity="0" /><stop offset="1" stopColor="#F5F8FD" stopOpacity="1" /></linearGradient>
      </defs>
      <rect width="1440" height="300" fill="url(#ov-sky)" />
      <path d="M0 210 L150 150 L280 195 L430 120 L590 190 L760 130 L930 200 L1090 140 L1250 195 L1370 155 L1440 185 L1440 300 L0 300 Z" fill="url(#ov-far)" opacity="0.85" />
      <path d="M0 250 L190 175 L340 225 L520 160 L700 230 L880 170 L1060 235 L1240 175 L1380 220 L1440 200 L1440 300 L0 300 Z" fill="url(#ov-near)" />
      <g fill="#FFFFFF" opacity="0.7"><path d="M520 160 L548 182 L520 194 L494 180 Z" /><path d="M880 170 L906 190 L880 202 L856 188 Z" /><path d="M190 175 L214 194 L190 205 L168 192 Z" /></g>
      <rect y="150" width="1440" height="150" fill="url(#ov-fade)" />
    </svg>
  );
}

// ── Reusable card ─────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" };
const sectionH: React.CSSProperties = { fontSize: 15.5, fontWeight: 700, color: C.ink, ...ui, margin: 0, letterSpacing: "-0.01em" };
const cap: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: C.mute, ...ui, textTransform: "uppercase", letterSpacing: "0.05em" };
const linkBtn: React.CSSProperties = { fontSize: 12, color: C.blue, ...ui, background: "none", border: "none", cursor: "pointer", fontWeight: 600 };
function Muted({ text }: { text: string }) { return <div style={{ fontSize: 12.5, color: C.mute, ...ui, padding: "12px 0", lineHeight: 1.6 }}>{text}</div>; }

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ go, onSettings, attention, collapsed }: { go: (d: string) => void; onSettings: () => void; attention: number; collapsed: boolean }) {
  const item = (s: (typeof SIDEBAR)[number], active: boolean) => (
    <button key={s.label} onClick={() => (s.dest === "__settings" ? onSettings() : go(s.dest))}
      aria-current={active ? "page" : undefined}
      style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: collapsed ? "10px" : "10px 12px",
        justifyContent: collapsed ? "center" : "flex-start", borderRadius: 9, border: "none", cursor: "pointer",
        background: active ? C.blueSoft : "transparent", color: active ? C.blue : C.dim, ...ui, fontSize: 13.5, fontWeight: active ? 600 : 500 }}>
      <Ico n={s.icon} s={18} c={active ? C.blue : C.mute} />
      {!collapsed && <span style={{ flex: 1, textAlign: "left" }}>{s.label}</span>}
      {!collapsed && s.badgeKey === "attention" && attention > 0 && (
        <span style={{ fontSize: 10.5, fontWeight: 700, ...mono, color: "#fff", background: C.red, borderRadius: 999, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{attention}</span>
      )}
    </button>
  );
  return (
    <aside style={{ width: collapsed ? 64 : 210, flexShrink: 0, borderRight: `1px solid ${C.line}`, background: C.panel,
      position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column", padding: collapsed ? "18px 10px" : "18px 14px", boxSizing: "border-box" }}>
      <button onClick={() => go("dashboard")} aria-label="ALCA Wealth Overview"
        style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: "2px 4px 18px" }}>
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden><path d="M8 24L16 6l8 18" stroke={C.blue} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M11.5 18h9" stroke={C.blue} strokeWidth="2.2" strokeLinecap="round" /></svg>
        {!collapsed && <span style={{ fontSize: 16, fontWeight: 700, color: C.ink, ...ui, letterSpacing: "-0.01em" }}>ALCA Wealth</span>}
      </button>
      <nav aria-label="Sidebar" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {SIDEBAR.map((s) => item(s, s.dest === "dashboard"))}
      </nav>
      <div style={{ marginTop: "auto", paddingTop: 14 }}>
        {!collapsed && <div style={{ fontSize: 11, color: C.mute, ...ui, lineHeight: 1.5 }}>Built for advisory teams.</div>}
      </div>
    </aside>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────
function TopBar({ go, onSearch, onNotifications, onProfile, accountName, unread, isMobile, onMenu }: {
  go: (d: string) => void; onSearch: () => void; onNotifications: () => void; onProfile: () => void;
  accountName: string | null; unread: number; isMobile: boolean; onMenu: () => void;
}) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(245,248,253,0.9)", backdropFilter: "blur(8px)",
      borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: isMobile ? "10px 16px" : "10px 26px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 22, minWidth: 0 }}>
        {isMobile && (
          <button aria-label="Menu" onClick={onMenu} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "inline-flex", flexDirection: "column", gap: 4 }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 20, height: 2, background: C.ink, borderRadius: 2 }} />)}
          </button>
        )}
        <nav aria-label="Sections" style={{ display: "flex", gap: isMobile ? 12 : 22, overflowX: "auto" }}>
          {TOP_TABS.map((t, i) => (
            <button key={t.label} onClick={() => (t.dest.startsWith("#") ? document.querySelector(t.dest)?.scrollIntoView({ behavior: "smooth" }) : go(t.dest))}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 2px", ...ui, fontSize: 14, whiteSpace: "nowrap",
                fontWeight: i === 0 ? 600 : 500, color: i === 0 ? C.ink : C.dim, borderBottom: `2px solid ${i === 0 ? C.blue : "transparent"}` }}>{t.label}</button>
          ))}
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!isMobile && (
          <button onClick={onSearch} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.panel, border: `1px solid ${C.line2}`,
            borderRadius: 9, padding: "8px 12px", cursor: "pointer", color: C.mute, ...ui, fontSize: 12.5, width: 240 }}>
            <Ico n="search" s={15} c={C.mute} /> Search funds, reports…
          </button>
        )}
        <button aria-label="Notifications" onClick={onNotifications} style={{ position: "relative", background: C.panel, border: `1px solid ${C.line2}`, borderRadius: 9, width: 36, height: 36, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Ico n="bell" s={17} c={C.dim} />
          {unread > 0 && <span style={{ position: "absolute", top: -6, right: -6, fontSize: 10, fontWeight: 700, ...mono, color: "#fff", background: C.red, borderRadius: 999, minWidth: 17, height: 17, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{unread}</span>}
        </button>
        <button aria-label="Account" onClick={onProfile} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.panel, border: `1px solid ${C.line2}`, borderRadius: 999, padding: "4px 8px 4px 4px", cursor: "pointer" }}>
          <span style={{ width: 28, height: 28, borderRadius: "50%", background: C.blue, color: "#fff", ...ui, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {(accountName ?? "You").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
          </span>
          {!isMobile && <span style={{ ...ui, fontSize: 12.5, fontWeight: 600, color: C.ink, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{accountName ?? "Account"}</span>}
          <Ico n="chevron" s={13} c={C.mute} />
        </button>
      </div>
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, tone, unavailable }: { label: string; value: React.ReactNode; sub?: string; tone?: string; unavailable?: boolean }) {
  return (
    <div style={{ ...card, padding: "14px 16px", minWidth: 0 }}>
      <div style={{ ...cap }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, ...mono, color: unavailable ? C.mute : (tone ?? C.ink), marginTop: 6, lineHeight: 1 }}>
        {unavailable ? <span style={{ fontSize: 13, ...ui, fontWeight: 600 }}>Unavailable</span> : value}
      </div>
      {sub && !unavailable && <div style={{ fontSize: 11, color: C.mute, ...ui, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// ── Performer panel ───────────────────────────────────────────────────────────
type Ranked = { ticker: string; name: string | null; status: Status; pc: number | null; spark: number[] | null };
function PerformerPanel({ title, rows, loading, period, setPeriod, onAnalyze }: {
  title: string; rows: Ranked[]; loading: boolean; period: Period; setPeriod: (p: Period) => void; onAnalyze: (t: string) => void;
}) {
  return (
    <div style={{ ...card, padding: "18px 18px 8px", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={sectionH}>{title} <span style={{ fontSize: 11.5, color: C.mute, fontWeight: 500 }}>· Firm Funds</span></h2>
        <div role="group" aria-label={`${title} period`} style={{ display: "inline-flex", flexWrap: "wrap", border: `1px solid ${C.line2}`, borderRadius: 8, overflow: "hidden" }}>
          {PERIODS.map((p) => (
            <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p}
              style={{ padding: "5px 8px", border: "none", cursor: "pointer", ...ui, fontSize: 11, fontWeight: 600,
                background: period === p ? C.blue : "transparent", color: period === p ? "#fff" : C.dim, borderLeft: p === "1D" ? "none" : `1px solid ${C.line2}` }}>{p}</button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 8, overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "20px 56px 1fr 70px 76px 84px", gap: 8, padding: "8px 4px", ...cap, minWidth: 470 }}>
          <span>#</span><span>Ticker</span><span>Fund</span><span style={{ textAlign: "center" }}>Trend</span><span style={{ textAlign: "right" }}>{period} Chg</span><span>Status</span>
        </div>
        {loading ? <Muted text="Loading rankings…" />
          : rows.length === 0 ? <Muted text="No Firm Funds with performance yet." />
          : rows.map((r, i) => {
            const v = fmtPct(r.pc);
            return (
              <button key={r.ticker} onClick={() => onAnalyze(r.ticker)}
                style={{ display: "grid", gridTemplateColumns: "20px 56px 1fr 70px 76px 84px", gap: 8, alignItems: "center", width: "100%",
                  padding: "9px 4px", border: "none", borderTop: `1px solid ${C.line}`, background: "none", cursor: "pointer", textAlign: "left", minWidth: 470 }}>
                <span style={{ ...mono, fontSize: 12, color: C.mute }}>{i + 1}</span>
                <span style={{ ...mono, fontSize: 12.5, fontWeight: 700, color: C.blue }}>{r.ticker}</span>
                <span style={{ ...ui, fontSize: 12.5, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name ?? r.ticker}</span>
                <span style={{ display: "flex", justifyContent: "center" }}><Spark data={r.spark} up={(r.pc ?? 0) >= 0} /></span>
                <span style={{ textAlign: "right", ...mono, fontSize: 12.5, fontWeight: 700, color: v == null ? C.mute : pctCol(r.pc) }}>{v ?? "Unavailable"}</span>
                <span style={{ display: "flex", justifyContent: "flex-start" }}><StatusPill status={r.status} /></span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function DashboardTab({ go, onAnalyze, onSearch, onNotifications, onSettings, userEmail, accountName }: {
  go?: (dest: string) => void;
  onAnalyze?: (t: string) => void;
  onSearch?: () => void;
  onNotifications?: () => void;
  onSettings?: () => void;
  userEmail?: string | null;
  accountName?: string | null;
} = {}) {
  const isMobile = useMediaQuery("(max-width: 720px)");
  const isTablet = useMediaQuery("(max-width: 1080px)");
  const nav = useCallback((d: string) => go?.(d), [go]);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [inv, setInv] = useState<InvRow[] | null>(null);
  const [perf, setPerf] = useState<Record<string, PerfResult | null>>({});
  const [perfLoaded, setPerfLoaded] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [mobileNav, setMobileNav] = useState(false);

  // ── Load real data (existing endpoints only) ──
  useEffect(() => {
    let alive = true;
    fetch("/api/market").then((r) => r.json()).then((d) => { if (alive) setMarket(d); }).catch(() => {});
    fetch("/api/profile", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        const p = d?.profile as { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null;
        const full = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
        setGreeting(full || p?.display_name || (d?.greeting as string) || greetingName(null, userEmail ?? null));
      }).catch(() => { if (alive) setGreeting(greetingName(null, userEmail ?? null)); });
    fetch("/api/advisor-overview", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!alive) return; if (d?.ok) { setOverview(d as Overview); setState("ready"); } else setState("error"); })
      .catch(() => { if (alive) setState("error"); });
    fetch("/api/firm-funds", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { inventory: [] }))
      .then((d) => { if (alive) setInv((d.inventory ?? []) as InvRow[]); }).catch(() => { if (alive) setInv([]); });
    return () => { alive = false; };
  }, [userEmail]);

  // ── Firm-scoped performance enrichment (only the firm's own tickers) ──
  // State is only updated inside the async callbacks (never synchronously in the
  // effect body), so this never triggers a synchronous cascading re-render.
  useEffect(() => {
    if (!inv || inv.length === 0) return;
    let alive = true;
    fetch("/api/firm-funds/performance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tickers: inv.map((r) => r.ticker) }) })
      .then((r) => (r.ok ? r.json() : { performance: {} }))
      .then((d) => { if (alive) { setPerf((d.performance ?? {}) as Record<string, PerfResult | null>); setPerfLoaded(true); } })
      .catch(() => { if (alive) setPerfLoaded(true); });
    return () => { alive = false; };
  }, [inv]);

  const wf = overview?.reviewWorkflow ?? null;
  const status = marketStatus();

  // ── Rank the firm's funds by canonical Price Change for the selected period ──
  const ranked = useMemo<Ranked[]>(() => {
    if (!inv) return [];
    return inv.map((r) => {
      const pp = perf[r.ticker]?.periods?.[period];
      return { ticker: r.ticker, name: r.name, status: r.status, pc: pp?.priceChange ?? null, spark: pp?.spark ?? null };
    });
  }, [inv, perf, period]);
  const top = useMemo(() => rankPerformers(ranked, "top", 10), [ranked]);
  const worst = useMemo(() => rankPerformers(ranked, "worst", 10), [ranked]);
  // Loading while inventory is unknown, or the firm has funds whose performance
  // has not returned yet. An empty inventory is "loaded" (nothing to fetch).
  const perfLoading = inv === null || (inv.length > 0 && !perfLoaded);

  // Watch-status firm funds for Watchlist Momentum (recent = 1D price change).
  const watchMomentum = useMemo(() => {
    if (!inv) return [];
    return inv.filter((r) => r.status === "watch").map((r) => {
      const pp = perf[r.ticker]?.periods?.["1D"];
      return { ticker: r.ticker, name: r.name, pc: pp?.priceChange ?? null, spark: pp?.spark ?? null };
    }).slice(0, 6);
  }, [inv, perf]);

  const indices = useMemo(() => {
    const find = (t: string) => market?.items.find((i) => i.ticker === t);
    return [
      { key: "S&P 500", item: find("SPY") }, { key: "Nasdaq", item: find("QQQ") },
      { key: "Dow Jones", item: find("DIA") }, { key: "US Treasury", item: find("TLT") },
    ];
  }, [market]);
  const dataTime = market ? new Date(market.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : null;

  const attentionTotal = wf ? wf.counts.overdueActive + wf.counts.approachingTarget + wf.counts.firmFundsOverdue : 0;
  const reviewQueue = wf ? wf.counts.openReviews + wf.counts.inReview : 0;

  // ── Right column ──
  const rightColumn = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Market Pulse */}
      <div id="market-pulse" style={{ ...card, padding: "16px 16px 12px", scrollMarginTop: 70 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={sectionH}>Market Pulse</h2>
          {dataTime && <span style={{ ...cap }}>as of {dataTime}</span>}
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
          {indices.map(({ key, item }, i) => (
            <div key={key} style={{ display: "grid", gridTemplateColumns: "1fr auto 64px", gap: 8, alignItems: "center", padding: "10px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...ui, fontSize: 12.5, fontWeight: 600, color: C.ink }}>{key}</div>
                <div style={{ ...mono, fontSize: 13, color: C.ink }}>{item?.price != null ? fmtNum(item.price) : "—"}</div>
                {item?.proxy && <div style={{ fontSize: 9.5, color: C.mute, ...ui }}>ETF proxy · {item.ticker}</div>}
              </div>
              <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: pctCol(item?.change1d) }}>{fmtPct(item?.change1d) ?? "—"}</span>
              <span style={{ display: "flex", justifyContent: "flex-end" }}><Spark data={item?.spark6m ?? null} up={(item?.change1d ?? 0) >= 0} w={60} /></span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: C.mute, ...ui, marginTop: 8, lineHeight: 1.5 }}>Index rows use clearly-labeled ETF proxies. Quotes may be delayed.</div>
      </div>

      {/* Watchlist Momentum */}
      <div style={{ ...card, padding: "16px 16px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={sectionH}>Watchlist Momentum</h2>
          <button onClick={() => nav("watchlist")} style={linkBtn}>View all →</button>
        </div>
        <div style={{ marginTop: 8 }}>
          {perfLoading ? <Muted text="Loading…" />
            : watchMomentum.length === 0 ? <Muted text="No funds on watch yet." />
            : watchMomentum.map((r, i) => (
              <button key={r.ticker} onClick={() => onAnalyze?.(r.ticker)} style={{ display: "grid", gridTemplateColumns: "1fr auto 60px", gap: 8, alignItems: "center", width: "100%", padding: "9px 0", border: "none", borderTop: i ? `1px solid ${C.line}` : "none", background: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ ...mono, fontSize: 12.5, fontWeight: 700, color: C.blue }}>{r.ticker}</span>
                  <span style={{ display: "block", ...ui, fontSize: 10.5, color: C.mute, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name ?? ""}</span>
                </span>
                <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: pctCol(r.pc) }}>{fmtPct(r.pc) ?? "Unavailable"}</span>
                <span style={{ display: "flex", justifyContent: "flex-end" }}><Spark data={r.spark} up={(r.pc ?? 0) >= 0} w={56} /></span>
              </button>
            ))}
        </div>
      </div>

      {/* Sector Movers — unsupported (honest) */}
      <div style={{ ...card, padding: "16px 16px 18px" }}>
        <h2 style={sectionH}>Sector Movers</h2>
        <Muted text="Sector analytics unavailable." />
      </div>
    </div>
  );

  // ── Attention & Held Fund Intelligence (lower center) ──
  const attnRow = (label: string, count: number, tone: string, dest: string) => (
    <button onClick={() => nav(dest)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "11px 0", border: "none", borderTop: `1px solid ${C.line}`, background: "none", cursor: "pointer", textAlign: "left" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: tone, flexShrink: 0 }} />
      <span style={{ flex: 1, ...ui, fontSize: 13, color: C.ink }}>{label}</span>
      <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: count > 0 ? tone : C.mute }}>{count}</span>
      <Ico n="chevron" s={14} c={C.mute} />
    </button>
  );

  return (
    <div style={{ margin: "0 -32px", background: C.bg, minHeight: "100vh", display: "flex" }}>
      {/* Sidebar (desktop) */}
      {!isMobile && <Sidebar go={nav} onSettings={() => onSettings?.()} attention={attentionTotal} collapsed={isTablet} />}

      {/* Mobile slide-in nav */}
      {isMobile && mobileNav && (
        <div onClick={() => setMobileNav(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,27,51,0.4)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 240, height: "100%", background: C.panel }}>
            <Sidebar go={(d) => { setMobileNav(false); nav(d); }} onSettings={() => { setMobileNav(false); onSettings?.(); }} attention={attentionTotal} collapsed={false} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar go={nav} onSearch={() => onSearch?.()} onNotifications={() => onNotifications?.()} onProfile={() => onSettings?.()}
          accountName={accountName ?? greeting ?? null} unread={overview?.alertCounts?.unread ?? 0} isMobile={isMobile} onMenu={() => setMobileNav(true)} />

        {/* Mountain header */}
        <div style={{ position: "relative", overflow: "hidden", minHeight: isMobile ? 150 : 190 }}>
          <MountainHeader />
          <div style={{ position: "relative", padding: isMobile ? "26px 18px 20px" : "34px 26px 26px", maxWidth: 1500 }}>
            <div style={{ fontSize: 13, color: C.dim, ...ui }}>{greetingPrefix()},</div>
            <h1 style={{ fontSize: isMobile ? 28 : 38, fontWeight: 700, color: C.ink, ...ui, margin: "4px 0 0", letterSpacing: "-0.02em" }}>{greeting ?? "Advisor"}</h1>
            <p style={{ fontSize: 14, color: C.dim, ...ui, margin: "8px 0 0" }}>Here&apos;s your command center for what matters most.</p>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 12px", ...ui, fontSize: 12, fontWeight: 600, color: C.ink }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: status.open ? C.green : C.mute }} />
              Markets {status.label}
            </span>
          </div>
        </div>

        <div style={{ padding: isMobile ? "0 16px 40px" : "0 26px 44px", maxWidth: 1500, width: "100%", boxSizing: "border-box" }}>
          {state === "error" && (
            <div role="alert" style={{ ...card, border: `1px solid ${C.red}44`, background: "#FEF2F2", padding: "14px 16px", margin: "16px 0", color: C.red, ...ui, fontSize: 13 }}>Your Overview could not be loaded. Some sections may show Unavailable.</div>
          )}

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(7, 1fr)", gap: 12, marginTop: 18 }}>
            <SummaryCard label="Funds on Watch" value={wf?.statusCounts.watch ?? 0} sub="watch status" tone={C.ink} />
            <SummaryCard label="Alerts" value={overview?.alertCounts?.unread ?? 0} sub="unread" tone={(overview?.alertCounts?.unread ?? 0) > 0 ? C.amber : C.ink} />
            <SummaryCard label="Review Queue" value={reviewQueue} sub="open + in review" tone={reviewQueue > 0 ? C.blue : C.ink} />
            <SummaryCard label="New Filings" value={null} unavailable />
            <SummaryCard label="News Updates" value={null} unavailable />
            <SummaryCard label="Market Status" value={<span style={{ fontSize: 16, ...ui, color: status.open ? C.green : C.mute }}>{status.label}</span>} sub={status.open ? "Closes 4:00 PM ET" : "US equities"} />
            <SummaryCard label="Watchlist Changes" value={null} unavailable />
          </div>

          {/* Performers */}
          <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr", gap: 16, marginTop: 16 }}>
            <PerformerPanel title="Top Performers" rows={top} loading={perfLoading} period={period} setPeriod={setPeriod} onAnalyze={(t) => onAnalyze?.(t)} />
            <PerformerPanel title="Worst Performers" rows={worst} loading={perfLoading} period={period} setPeriod={setPeriod} onAnalyze={(t) => onAnalyze?.(t)} />
          </div>

          {/* Lower center (attention + held fund intelligence) + right column */}
          <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 340px", gap: 16, marginTop: 16, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              {/* Attention & Alerts */}
              <div style={{ ...card, padding: "18px 18px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <h2 style={sectionH}>Attention &amp; Alerts</h2>
                  <button onClick={() => nav("reviews")} style={linkBtn}>View all →</button>
                </div>
                <div style={{ marginTop: 6 }}>
                  {!wf ? <Muted text="Unavailable" /> : (
                    <>
                      {attnRow("Overdue reviews", wf.counts.overdueActive, C.red, "reviews")}
                      {attnRow("Reviews due soon", wf.counts.approachingTarget, C.amber, "reviews")}
                      {attnRow("Funds on watch", wf.statusCounts.watch, C.blue, "firmfunds")}
                      {attnRow("Firm funds overdue for review", wf.counts.firmFundsOverdue, C.red, "firmfunds")}
                    </>
                  )}
                </div>
              </div>

              {/* Held Fund Intelligence */}
              <div style={{ ...card, padding: "18px 18px 20px" }}>
                <h2 style={sectionH}>Held Fund Intelligence</h2>
                <p style={{ fontSize: 12.5, color: C.dim, ...ui, margin: "4px 0 14px" }}>News, filings, and updates for the funds you hold and monitor.</p>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                  <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 14px" }}>
                    <div style={{ ...cap, marginBottom: 8 }}>Fund News</div>
                    <div style={{ ...ui, fontSize: 12.5, color: C.dim }}>No recent fund news.</div>
                    <div style={{ ...ui, fontSize: 11.5, color: C.mute, marginTop: 4, lineHeight: 1.5 }}>Matched news for your Firm Funds will appear here.</div>
                  </div>
                  <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 14px" }}>
                    <div style={{ ...cap, marginBottom: 8 }}>SEC Filings</div>
                    <div style={{ ...ui, fontSize: 12.5, color: C.dim }}>No recent filings.</div>
                    <div style={{ ...ui, fontSize: 11.5, color: C.mute, marginTop: 4, lineHeight: 1.5 }}>Matched SEC filings for your Firm Funds will appear here.</div>
                  </div>
                </div>
              </div>
            </div>

            {rightColumn}
          </div>

          {/* Footer */}
          <footer style={{ marginTop: 28, borderTop: `1px solid ${C.line}`, paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: C.mute, ...ui }}>© {new Date().getFullYear()} ALCA Wealth. All rights reserved.</span>
            <nav aria-label="Legal" style={{ display: "flex", gap: 18 }}>
              {[["Privacy", "/privacy"], ["Terms", "/terms"], ["Disclosures", "/disclosures"]].map(([l, h]) => (
                <a key={l} href={h} style={{ fontSize: 12, color: C.dim, ...ui, textDecoration: "none", fontWeight: 500 }}>{l}</a>
              ))}
            </nav>
          </footer>
        </div>
      </div>
    </div>
  );
}
