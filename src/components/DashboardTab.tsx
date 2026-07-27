"use client";
import React, { useEffect, useMemo, useState } from "react";
import { T, ui, mono } from "./tokens";
import { Reveal, useMediaQuery } from "./motion";
import { greetingName } from "@/lib/profile";
import { STATUS_META, STATUSES, type Status } from "./FirmFundsTab";

// DashTab kept for the shell's generic navigation contract.
export type DashTab = "find" | "analysis" | "comparison" | "recommendation" | "discover"
  | "research" | "workspace" | "portfolio" | "murderboard" | "watchlist" | "model"
  | "model-fund" | "model-project" | "model-scenarios" | "expansion" | "lists" | "alerts"
  | "tax" | "correlation" | "peers" | "backtest" | "assistant";

// ── Types (all from real endpoints) ───────────────────────────────────────────
interface MarketItem { ticker: string; label: string; price: number | null; change1d: number | null }
interface MarketData { items: MarketItem[]; fetchedAt: number }

interface Counts {
  openReviews: number; inReview: number; approachingTarget: number; overdueActive: number;
  firmFundsUpcoming: number; firmFundsOverdue: number;
}
interface QueueItem {
  reviewId: string; firmFundId: string; ticker: string; name: string | null; reason: string | null;
  assignedReviewer: string | null; openedDate: string; targetDate: string | null;
  status: "open" | "in_review"; overdue: boolean;
}
interface UpcomingReview {
  firmFundId: string; ticker: string; name: string | null; status: Status; fundRole: string | null;
  lastCompletedReview: string | null; nextReviewDate: string; overdue: boolean;
}
type StatusCounts = Record<Status, number>;
interface ReviewWorkflow {
  counts: Counts; reviewQueue: QueueItem[]; upcomingFirmReviews: UpcomingReview[];
  statusCounts: StatusCounts; firmFundsTotal: number;
}
interface Overview { ok: boolean; reviewWorkflow: ReviewWorkflow | null }

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtPct = (v: number | null | undefined) => v == null ? "—" : (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
const pctCol = (v: number | null | undefined) => (v == null ? T.muted : v >= 0 ? T.green : T.red);
const REVIEW_STATUS_META: Record<"open" | "in_review", { label: string; c: string }> = {
  open: { label: "Open", c: "#0E7490" }, in_review: { label: "In review", c: "#B45309" },
};

/** Honest relative-date label from an ISO date to today (UTC day granularity). */
function relDate(iso: string | null): { text: string; overdue: boolean } {
  if (!iso) return { text: "—", overdue: false };
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const target = new Date(iso + "T00:00:00Z").getTime();
  const days = Math.round((target - today) / 86400000);
  if (days === 0) return { text: "Today", overdue: false };
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, overdue: true };
  if (days === 1) return { text: "Tomorrow", overdue: false };
  if (days <= 45) return { text: `in ${days}d`, overdue: false };
  return { text: iso, overdue: false };
}

// ── Reusable card ─────────────────────────────────────────────────────────────
function Card({ children, style, hover }: { children: React.ReactNode; style?: React.CSSProperties; hover?: boolean }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={hover ? () => setH(true) : undefined} onMouseLeave={hover ? () => setH(false) : undefined}
      style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 16,
        boxShadow: h ? "var(--elev-3)" : "var(--elev-1)", transform: h ? "translateY(-2px)" : "none",
        transition: "box-shadow .2s ease, transform .2s ease", ...style }}>{children}</div>
  );
}
const cardPad: React.CSSProperties = { padding: "20px 22px" };
const sectionTitle: React.CSSProperties = { fontSize: 15.5, fontWeight: 700, color: T.text, ...ui, margin: 0, letterSpacing: "-0.015em" };
const sectionSub: React.CSSProperties = { fontSize: 12, color: T.dim, ...ui, margin: "3px 0 0" };
const smallCap: React.CSSProperties = { fontSize: 10, color: T.muted, ...ui, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" };
const linkBtn: React.CSSProperties = { fontSize: 11.5, color: T.blue, ...ui, background: "none", border: "none", cursor: "pointer", fontWeight: 600 };

function ReviewBadge({ status }: { status: "open" | "in_review" }) {
  const m = REVIEW_STATUS_META[status];
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 600, ...ui,
    color: m.c, background: `${m.c}18`, border: `1px solid ${m.c}44`, whiteSpace: "nowrap" }}>{m.label}</span>;
}

// ── Attention tile ────────────────────────────────────────────────────────────
function AttnTile({ label, value, tone, loading }: { label: string; value: number; tone: string; loading: boolean }) {
  const active = value > 0;
  return (
    <div style={{ background: T.panel, border: `1px solid ${active ? `${tone}55` : T.line}`, borderRadius: 12,
      padding: "13px 15px", display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color: loading ? T.muted : active ? tone : T.text, ...mono, lineHeight: 1 }}>
        {loading ? "—" : value}
      </span>
      <span style={{ fontSize: 11, color: T.dim, ...ui, lineHeight: 1.35 }}>{label}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardTab({ onNavigate, userEmail, onAnalyze, onOpenReview, onOpenFirmFunds, onOpenDiscover }: {
  onNavigate?: (t: DashTab) => void;
  userEmail?: string | null;
  onAnalyze?: (t: string) => void;
  onOpenReview?: (reviewId: string) => void;
  onOpenFirmFunds?: () => void;
  onOpenDiscover?: () => void;
} = {}) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshTick, setRefreshTick] = useState(0);
  const isMobile = useMediaQuery("(max-width: 720px)");
  const isNarrow = useMediaQuery("(max-width: 1024px)");

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
    fetch("/api/advisor-overview", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!alive) return; if (d?.ok) { setOverview(d as Overview); setState("ready"); } else { setState("error"); } })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [userEmail, refreshTick]);

  const wf = overview?.reviewWorkflow ?? null;
  const loading = state === "loading";
  const indices = useMemo(() => {
    const find = (t: string) => market?.items.find((i) => i.ticker === t);
    return [find("SPY"), find("DIA"), find("QQQ"), find("AGG"), find("VXUS")].filter(Boolean) as MarketItem[];
  }, [market]);
  const dataTime = market ? new Date(market.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : null;

  const attnTotal = wf ? wf.counts.overdueActive + wf.counts.approachingTarget + wf.counts.firmFundsOverdue + wf.counts.firmFundsUpcoming : 0;

  return (
    <div style={{ margin: "0 -32px", background: T.bg, minHeight: "100vh", position: "relative" }}>
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1240, margin: "0 auto",
        padding: isMobile ? "88px 16px 48px" : "100px 32px 64px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Header ── */}
        <Reveal>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12.5, color: T.dim, ...ui, marginBottom: 2 }}>Welcome back,</div>
              <h1 style={{ fontSize: isMobile ? 28 : 34, fontWeight: 600, color: T.text, ...ui, margin: 0, letterSpacing: "-0.03em" }}>
                {greeting ?? "Advisor"}
              </h1>
              <p style={{ fontSize: 13.5, color: T.dim, ...ui, margin: "8px 0 0", lineHeight: 1.5 }}>
                {loading ? "Loading your review workspace…"
                  : attnTotal > 0 ? `${attnTotal} item${attnTotal === 1 ? "" : "s"} need attention across reviews and firm funds.`
                  : "No reviews or firm funds need attention right now."}
              </p>
            </div>
            <button onClick={() => setRefreshTick((t) => t + 1)} aria-label="Refresh"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, color: T.dim, ...ui,
                background: "none", border: `1px solid ${T.line2}`, borderRadius: 9, padding: "8px 13px", cursor: "pointer", fontWeight: 600 }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.8h-2.8" />
              </svg>
              Refresh
            </button>
          </div>
        </Reveal>

        {state === "error" && (
          <Card style={{ ...cardPad, border: `1px solid ${T.red}44`, background: `${T.red}0a` }}>
            <div role="alert" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: T.red, ...ui }}>Your Home workspace could not be loaded.</span>
              <button onClick={() => { setState("loading"); setRefreshTick((t) => t + 1); }}
                style={{ border: `1px solid ${T.red}66`, background: "transparent", color: T.red, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, ...ui, cursor: "pointer" }}>Retry</button>
            </div>
          </Card>
        )}

        {/* ── 1. Attention summary ── */}
        <Reveal delay={40}>
          <Card style={{ ...cardPad }}>
            <h2 style={sectionTitle}>Attention</h2>
            <p style={sectionSub}>Live counts from your firm&apos;s reviews and firm-fund review calendar.</p>
            <div style={{ marginTop: 14, display: "grid",
              gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(6, 1fr)", gap: 11 }}>
              <AttnTile label="Open reviews" value={wf?.counts.openReviews ?? 0} tone={T.blue} loading={loading} />
              <AttnTile label="In review" value={wf?.counts.inReview ?? 0} tone="#B45309" loading={loading} />
              <AttnTile label="Approaching target" value={wf?.counts.approachingTarget ?? 0} tone="#0E7490" loading={loading} />
              <AttnTile label="Overdue reviews" value={wf?.counts.overdueActive ?? 0} tone={T.red} loading={loading} />
              <AttnTile label="Funds due soon" value={wf?.counts.firmFundsUpcoming ?? 0} tone="#0E7490" loading={loading} />
              <AttnTile label="Funds overdue" value={wf?.counts.firmFundsOverdue ?? 0} tone={T.red} loading={loading} />
            </div>
          </Card>
        </Reveal>

        {/* ── 2 + 3: Review queue (main) + Upcoming firm reviews ── */}
        <Reveal delay={70}>
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1.6fr 1fr", gap: 18, alignItems: "start" }}>

            {/* 2. Review work queue */}
            <Card style={{ ...cardPad }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div><h2 style={sectionTitle}>Review work queue</h2>
                  <p style={sectionSub}>Open and in-review cases — overdue first.</p></div>
              </div>
              <div style={{ marginTop: 12 }}>
                {loading ? <Muted text="Loading reviews…" />
                  : !wf ? <Muted text="Unavailable" />
                  : wf.reviewQueue.length === 0 ? <Muted text="No open or in-review cases. Start a review from a fund’s workspace." />
                  : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {wf.reviewQueue.map((q, i) => {
                        const rel = relDate(q.targetDate);
                        return (
                          <button key={q.reviewId} onClick={() => onOpenReview?.(q.reviewId)}
                            style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "none",
                              border: "none", borderTop: i ? `1px solid ${T.line}` : "none", padding: "11px 0", cursor: "pointer" }}>
                            <span style={{ flexShrink: 0, width: 62 }}>
                              <span style={{ ...mono, fontSize: 12.5, fontWeight: 700, color: T.blue }}>{q.ticker || "—"}</span>
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 12.5, color: T.text, ...ui, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {q.name ?? q.ticker}
                              </span>
                              <span style={{ display: "block", fontSize: 11, color: T.muted, ...ui, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {q.reason ?? "No reason recorded"}{q.assignedReviewer ? " · assigned" : " · unassigned"}
                              </span>
                            </span>
                            <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, ...ui, color: rel.overdue ? T.red : T.dim, whiteSpace: "nowrap" }}>{rel.text}</span>
                              <ReviewBadge status={q.status} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
              </div>
            </Card>

            {/* 3. Upcoming Firm Fund reviews */}
            <Card style={{ ...cardPad }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div><h2 style={sectionTitle}>Upcoming firm-fund reviews</h2>
                  <p style={sectionSub}>By next review date.</p></div>
                <button onClick={() => onOpenFirmFunds?.()} style={linkBtn}>Firm Funds →</button>
              </div>
              <div style={{ marginTop: 12 }}>
                {loading ? <Muted text="Loading…" />
                  : !wf ? <Muted text="Unavailable" />
                  : wf.upcomingFirmReviews.length === 0 ? <Muted text="No firm funds have a next review date set." />
                  : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {wf.upcomingFirmReviews.map((u, i) => {
                        const rel = relDate(u.nextReviewDate);
                        return (
                          <button key={u.firmFundId} onClick={() => onAnalyze?.(u.ticker)}
                            style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: "none",
                              border: "none", borderTop: i ? `1px solid ${T.line}` : "none", padding: "10px 0", cursor: "pointer" }}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ ...mono, fontSize: 12.5, fontWeight: 700, color: T.blue }}>{u.ticker}</span>
                              <span style={{ display: "block", fontSize: 10.5, color: T.muted, ...ui, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {u.fundRole ?? u.name ?? ""}
                              </span>
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 600, ...ui, color: rel.overdue ? T.red : T.dim, whiteSpace: "nowrap" }}>{rel.text}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
              </div>
            </Card>
          </div>
        </Reveal>

        {/* ── 4 + 5: Firm Funds snapshot + Discover entry ── */}
        <Reveal delay={100}>
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1.6fr 1fr", gap: 18, alignItems: "start" }}>

            {/* 4. Firm Funds snapshot */}
            <Card style={{ ...cardPad }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div><h2 style={sectionTitle}>Firm Funds</h2>
                  <p style={sectionSub}>{wf ? `${wf.firmFundsTotal} fund${wf.firmFundsTotal === 1 ? "" : "s"} in your inventory` : "Your firm's inventory"}</p></div>
                <button onClick={() => onOpenFirmFunds?.()} style={linkBtn}>Open Firm Funds →</button>
              </div>
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(5, 1fr)", gap: 10 }}>
                {STATUSES.map((s) => (
                  <button key={s} onClick={() => onOpenFirmFunds?.()}
                    style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 11, padding: "12px 10px",
                      display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", textAlign: "left" }}>
                    <span style={{ fontSize: 19, fontWeight: 700, ...mono, color: loading ? T.muted : T.text, lineHeight: 1 }}>
                      {loading || !wf ? "—" : wf.statusCounts[s]}
                    </span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, ...ui, color: STATUS_META[s].fg }}>{STATUS_META[s].label}</span>
                  </button>
                ))}
              </div>
            </Card>

            {/* 5. Discover entry (restrained) */}
            <Card style={{ ...cardPad, display: "flex", flexDirection: "column" }}>
              <h2 style={sectionTitle}>Discover</h2>
              <p style={sectionSub}>Find alternatives, compare funds, continue research.</p>
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => onOpenDiscover?.()}
                  style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: T.blue, color: "#fff",
                    fontSize: 12.5, fontWeight: 700, ...ui, cursor: "pointer", alignSelf: "flex-start" }}>Open Discover →</button>
                <div style={{ display: "flex", gap: 14, marginTop: 2, flexWrap: "wrap" }}>
                  <button onClick={() => onNavigate?.("comparison")} style={linkBtn}>Compare funds</button>
                  <button onClick={() => onNavigate?.("find")} style={linkBtn}>Search &amp; screen</button>
                </div>
              </div>
            </Card>
          </div>
        </Reveal>

        {/* ── 6. Market context (secondary) ── */}
        <Reveal delay={130}>
          <Card style={{ ...cardPad }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
              <div><h2 style={sectionTitle}>Market context</h2>
                <p style={sectionSub}>Reference ETF price movement (1-day price change, not total return).</p></div>
              {dataTime && <span style={{ ...smallCap }}>As of {dataTime}</span>}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 18, flexWrap: "wrap" }}>
              {indices.length === 0 ? <Muted text="Market data unavailable." />
                : indices.map((it) => (
                  <div key={it.ticker} style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 92 }}>
                    <span style={{ ...smallCap }}>{it.label.replace(/ ETF Proxy.*/, "")}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: T.text, ...mono }}>{it.price == null ? "—" : it.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: pctCol(it.change1d), ...mono }}>{fmtPct(it.change1d)}</span>
                  </div>
                ))}
            </div>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

function Muted({ text }: { text: string }) {
  return <div style={{ fontSize: 12.5, color: T.muted, ...ui, padding: "12px 0", lineHeight: 1.6 }}>{text}</div>;
}
