"use client";
import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ui, mono } from "./tokens";
import { useMediaQuery } from "./motion";
import { greetingName } from "@/lib/profile";
import { rankPerformers } from "@/lib/overviewRank";
import { STATUS_META, type Status } from "./FirmFundsTab";
import { C } from "./SignedInShell";

/**
 * Advisor Overview — the signed-in landing dashboard CONTENT.
 *
 * The authenticated chrome (sidebar / top nav / search / notifications / profile)
 * lives in the shared SignedInShell; this renders only the Overview page:
 *   1. a real-image mountain hero (greeting left, Market Pulse card top-right)
 *   2. Top / Worst Performers
 *   3. lower section: Firm Activity, Attention & Alerts, Held Fund Intelligence,
 *      then remaining widgets (Watchlist Momentum, Sector Movers).
 *
 * Real firm-scoped data only, via existing endpoints (no new APIs, no schema).
 * Top/Worst rank ONLY the firm's funds by the canonical visible Price Change
 * (ETFs raw close, mutual funds raw NAV; dividends/distributions excluded).
 * Missing performance shows "Unavailable", never 0%. No fabricated numbers.
 */

const PERIODS = ["1D", "5D", "1M", "6M", "YTD", "1Y", "3Y", "5Y", "Max"] as const;
type Period = (typeof PERIODS)[number];
const DEFAULT_PERIOD: Period = "YTD";

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
  userSummary?: { greeting?: string | null; workspace?: string | null };
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

// ── Reusable ──────────────────────────────────────────────────────────────────
const card: React.CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" };
const sectionH: React.CSSProperties = { fontSize: 15.5, fontWeight: 700, color: C.ink, ...ui, margin: 0, letterSpacing: "-0.01em" };
const cap: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: C.mute, ...ui, textTransform: "uppercase", letterSpacing: "0.05em" };
const linkBtn: React.CSSProperties = { fontSize: 12, color: C.blue, ...ui, background: "none", border: "none", cursor: "pointer", fontWeight: 600 };
function Muted({ text }: { text: string }) { return <div style={{ fontSize: 12.5, color: C.mute, ...ui, padding: "12px 0", lineHeight: 1.6 }}>{text}</div>; }

// ── Compact Market Pulse (lives in the hero, upper-right) ─────────────────────
function MarketPulse({ indices, dataTime }: { indices: { key: string; item?: MarketItem }[]; dataTime: string | null }) {
  return (
    <div style={{ ...card, boxShadow: "0 8px 24px rgba(16,24,40,0.12)", padding: "13px 14px 11px", width: 300, maxWidth: "100%", backdropFilter: "blur(2px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, ...ui }}>Market Pulse</span>
        {dataTime && <span style={{ ...cap }}>as of {dataTime}</span>}
      </div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column" }}>
        {indices.map(({ key, item }, i) => (
          <div key={key} style={{ display: "grid", gridTemplateColumns: "1fr auto 54px", gap: 8, alignItems: "center", padding: "7px 0", borderTop: i ? `1px solid ${C.line}` : "none" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...ui, fontSize: 12, fontWeight: 600, color: C.ink }}>{key}</div>
              <div style={{ ...mono, fontSize: 12, color: C.dim }}>{item?.price != null ? fmtNum(item.price) : "—"}</div>
            </div>
            <span style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: pctCol(item?.change1d) }}>{fmtPct(item?.change1d) ?? "—"}</span>
            <span style={{ display: "flex", justifyContent: "flex-end" }}><Spark data={item?.spark6m ?? null} up={(item?.change1d ?? 0) >= 0} w={50} /></span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9.5, color: C.mute, ...ui, marginTop: 6, lineHeight: 1.4 }}>Labeled ETF proxies · quotes may be delayed.</div>
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
export default function DashboardTab({ go, onAnalyze, userEmail }: {
  go?: (dest: string) => void;
  onAnalyze?: (t: string) => void;
  userEmail?: string | null;
} = {}) {
  const isMobile = useMediaQuery("(max-width: 720px)");
  const isTablet = useMediaQuery("(max-width: 1080px)");
  const nav = (d: string) => go?.(d);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [inv, setInv] = useState<InvRow[] | null>(null);
  const [perf, setPerf] = useState<Record<string, PerfResult | null>>({});
  const [perfLoaded, setPerfLoaded] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);

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
      .then((d) => { if (!alive) return; if (d?.ok) { setOverview(d as Overview); setWorkspace((d.userSummary?.workspace as string) ?? null); setState("ready"); } else setState("error"); })
      .catch(() => { if (alive) setState("error"); });
    fetch("/api/firm-funds", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { inventory: [] }))
      .then((d) => { if (alive) setInv((d.inventory ?? []) as InvRow[]); }).catch(() => { if (alive) setInv([]); });
    return () => { alive = false; };
  }, [userEmail]);

  // ── Firm-scoped performance enrichment (only the firm's own tickers) ──
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

  const ranked = useMemo<Ranked[]>(() => {
    if (!inv) return [];
    return inv.map((r) => {
      const pp = perf[r.ticker]?.periods?.[period];
      return { ticker: r.ticker, name: r.name, status: r.status, pc: pp?.priceChange ?? null, spark: pp?.spark ?? null };
    });
  }, [inv, perf, period]);
  const top = useMemo(() => rankPerformers(ranked, "top", 10), [ranked]);
  const worst = useMemo(() => rankPerformers(ranked, "worst", 10), [ranked]);
  const perfLoading = inv === null || (inv.length > 0 && !perfLoaded);

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
  const reviewQueue = wf ? wf.counts.openReviews + wf.counts.inReview : 0;

  // ── Firm Activity: compact metrics (real firm-scoped; Unavailable where unsupported) ──
  const activity: { label: string; node: React.ReactNode; dest?: string; tone?: string }[] = [
    { label: "Funds on Watch", node: wf?.statusCounts.watch ?? 0, dest: "firmfunds", tone: C.ink },
    { label: "Alerts", node: overview?.alertCounts?.unread ?? 0, dest: "alerts", tone: (overview?.alertCounts?.unread ?? 0) > 0 ? C.amber : C.ink },
    { label: "Review Queue", node: reviewQueue, dest: "reviews", tone: reviewQueue > 0 ? C.blue : C.ink },
    { label: "New Filings", node: "Unavailable" },
    { label: "News Updates", node: "Unavailable" },
    { label: "Market Status", node: status.label, tone: status.open ? C.green : C.mute },
    { label: "Watchlist Changes", node: "Unavailable" },
  ];
  const attnRow = (label: string, count: number, tone: string, dest: string) => (
    <button onClick={() => nav(dest)} style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "11px 0", border: "none", borderTop: `1px solid ${C.line}`, background: "none", cursor: "pointer", textAlign: "left" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: tone, flexShrink: 0 }} />
      <span style={{ flex: 1, ...ui, fontSize: 13, color: C.ink }}>{label}</span>
      <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: count > 0 ? tone : C.mute }}>{count}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.mute} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
    </button>
  );

  return (
    <div>
      {/* ── 1. Mountain hero: greeting left · Market Pulse right ── */}
      <div style={{ position: "relative", overflow: "hidden", minHeight: isMobile ? 320 : 340, background: C.sky }}>
        <Image src="/overview-mountain.jpg" alt="" fill priority sizes="(max-width: 720px) 100vw, (max-width: 1080px) 100vw, 82vw"
          style={{ objectFit: "cover", objectPosition: "center 42%" }} />
        {/* soft fade at the BOTTOM only — the peak stays sharp and un-washed */}
        <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "38%", background: "linear-gradient(180deg, rgba(245,248,253,0) 0%, rgba(245,248,253,0.6) 58%, #F5F8FD 100%)" }} />
        {/* light top-left wash only (far left) so the greeting stays readable */}
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(245,248,253,0.72) 0%, rgba(245,248,253,0.16) 26%, rgba(245,248,253,0) 44%)" }} />
        <div style={{ position: "relative", padding: isMobile ? "22px 16px 18px" : "26px 28px 22px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, color: C.dim, ...ui, fontWeight: 500 }}>{greetingPrefix()},</div>
            <h1 style={{ fontSize: isMobile ? 28 : 38, fontWeight: 700, color: C.ink, ...ui, margin: "4px 0 0", letterSpacing: "-0.02em" }}>{greeting ?? "Advisor"}</h1>
            <p style={{ fontSize: 14, color: C.dim, ...ui, margin: "8px 0 0", fontWeight: 500 }}>{workspace ?? "Here's your command center for what matters most."}</p>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 14, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 12px", ...ui, fontSize: 12, fontWeight: 600, color: C.ink }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: status.open ? C.green : C.mute }} />
              Markets {status.label}
            </span>
          </div>
          <MarketPulse indices={indices} dataTime={dataTime} />
        </div>
      </div>

      <div style={{ padding: isMobile ? "0 16px 40px" : "0 28px 44px", maxWidth: 1500, width: "100%", boxSizing: "border-box" }}>
        {state === "error" && (
          <div role="alert" style={{ ...card, border: `1px solid ${C.red}44`, background: "#FEF2F2", padding: "14px 16px", margin: "16px 0", color: C.red, ...ui, fontSize: 13 }}>Your Overview could not be loaded. Some sections may show Unavailable.</div>
        )}

        {/* ── 2. Performer tables (prominent, directly below the hero) ── */}
        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 1fr", gap: 16, marginTop: 18 }}>
          <PerformerPanel title="Top Performers" rows={top} loading={perfLoading} period={period} setPeriod={setPeriod} onAnalyze={(t) => onAnalyze?.(t)} />
          <PerformerPanel title="Worst Performers" rows={worst} loading={perfLoading} period={period} setPeriod={setPeriod} onAnalyze={(t) => onAnalyze?.(t)} />
        </div>

        {/* ── 3a. Firm Activity — one compact card (replaces the 7 large cards) ── */}
        <div style={{ ...card, padding: "14px 18px", marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <h2 style={{ ...sectionH, fontSize: 14 }}>Firm Activity</h2>
            <span style={{ ...cap }}>firm-scoped</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? "12px 20px" : "10px 30px", marginTop: 8 }}>
            {activity.map((m) => {
              const un = m.node === "Unavailable";
              const inner = (
                <>
                  <span style={{ ...cap, display: "block" }}>{m.label}</span>
                  <span style={{ fontSize: un ? 12 : 17, fontWeight: un ? 600 : 700, ...(un ? ui : mono), color: un ? C.mute : (m.tone ?? C.ink), marginTop: 3, display: "block" }}>{m.node}</span>
                </>
              );
              return m.dest ? (
                <button key={m.label} onClick={() => nav(m.dest!)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>{inner}</button>
              ) : (
                <div key={m.label}>{inner}</div>
              );
            })}
          </div>
        </div>

        {/* ── 3b. Attention & Alerts + Held Fund Intelligence · remaining widgets ── */}
        <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "1fr 340px", gap: 16, marginTop: 16, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
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

          {/* ── 4. Remaining supported widgets ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

            <div style={{ ...card, padding: "16px 16px 18px" }}>
              <h2 style={sectionH}>Sector Movers</h2>
              <Muted text="Sector analytics unavailable." />
            </div>
          </div>
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
  );
}
