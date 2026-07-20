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

// ── Index card (market indices — real /api/market) ───────────────────────────
function IndexCard({ item }: { item: MarketItem | undefined }) {
  if (!item) return <Card style={{ ...cardPad, minHeight: 150, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12, ...ui }}>Loading…</Card>;
  const up = (item.change1d ?? 0) >= 0;
  const c = up ? T.green : T.red;
  const spark = item.spark6m && item.spark6m.length > 8 ? item.spark6m.map((v, i) => ({ i, v })) : null;
  const gid = `sp-${item.ticker.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <Card hover style={{ ...cardPad, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text, ...ui }}>{item.label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: c, ...mono }}>{fmtPct(item.change1d)}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: T.text, ...mono, letterSpacing: "-0.02em" }}>{fmtPrice(item.price)}</div>
      {spark ? (
        <div style={{ height: 52, margin: "2px -4px 0" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.2} /><stop offset="100%" stopColor={c} stopOpacity={0} />
              </linearGradient></defs>
              <Area type="monotone" dataKey="v" stroke={c} strokeWidth={1.8} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <div style={{ height: 52 }} />}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, ...ui, color: T.muted }}>
        <span>Today <span style={{ fontWeight: 700, color: c, ...mono }}>{fmtPct(item.change1d)}</span></span>
        <span>YTD <span style={{ fontWeight: 700, color: pctCol(item.changeYtd), ...mono }}>{fmtPct(item.changeYtd)}</span></span>
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
        {["Ticker", "Category", "1D", "YTD"].map((h, i) => (
          <th key={h} style={{ ...smallCap, textAlign: i < 2 ? "left" : "right", padding: "0 0 8px" }}>{h}</th>
        ))}
        <th style={{ ...smallCap, textAlign: "center", padding: "0 0 8px" }}>Alert</th>
      </tr></thead>
      <tbody>
        {funds.map((f) => (
          <tr key={f.ticker} style={{ borderTop: `1px solid ${T.line}` }}>
            <td style={{ padding: "9px 0" }}>
              <button onClick={() => onAnalyze?.(f.ticker)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", ...mono, fontSize: 12.5, fontWeight: 700, color: T.blue }}>{f.ticker}</button>
            </td>
            <td style={{ padding: "9px 8px 9px 0", fontSize: 11.5, color: T.dim, ...ui, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.category ?? "—"}</td>
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

// ── Workspace hub card ────────────────────────────────────────────────────────
function Hub({ title, purpose, accent, items, cta, onCta, go }: {
  title: string; purpose: string; accent: string; cta: string; onCta: () => void;
  items: { label: string; tab?: DashTab; disabled?: boolean }[]; go: (t: DashTab) => void;
}) {
  return (
    <Card hover style={{ ...cardPad, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 12, height: 12, borderRadius: 4, background: accent }} />
        </span>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text, ...ui }}>{title}</div>
          <div style={{ fontSize: 11.5, color: T.dim, ...ui }}>{purpose}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {items.map((it) => (
          <button key={it.label} disabled={it.disabled || !it.tab}
            onClick={() => it.tab && go(it.tab)}
            style={{ textAlign: "left", background: "none", border: "none", padding: "5px 0", ...ui, fontSize: 12.5,
              color: it.disabled || !it.tab ? T.muted : T.dim, cursor: it.disabled || !it.tab ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ color: accent, fontSize: 11 }}>›</span>{it.label}{it.disabled ? <span style={{ fontSize: 9.5, color: T.muted }}> (soon)</span> : null}
          </button>
        ))}
      </div>
      <button onClick={onCta} style={{ marginTop: 4, padding: "10px 0", borderRadius: 10, border: "none",
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
    <div style={{ margin: "0 -32px", background: T.bg, minHeight: "100vh" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "88px 16px 48px" : "100px 32px 64px",
        display: "flex", flexDirection: "column", gap: 22 }}>

        {/* ── TOP: Welcome + 3 index cards ── */}
        <Reveal>
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "0.9fr 1.5fr", gap: 20 }}>
            {/* Welcome */}
            <Card style={{ padding: isMobile ? "26px 24px" : "32px 30px", position: "relative", overflow: "hidden",
              display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 172 }}>
              <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none",
                background: "radial-gradient(120% 90% at 100% 0%, rgba(37,99,235,0.10) 0%, rgba(37,99,235,0) 55%), radial-gradient(90% 90% at 0% 100%, rgba(94,234,212,0.10) 0%, rgba(94,234,212,0) 50%)" }} />
              <svg aria-hidden viewBox="0 0 400 200" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.5 }}>
                <path d="M0 150 Q 100 110 200 140 T 400 120" fill="none" stroke="rgba(37,99,235,0.14)" strokeWidth="1.5" />
                <path d="M0 170 Q 120 130 240 160 T 400 140" fill="none" stroke="rgba(94,234,212,0.14)" strokeWidth="1.5" />
              </svg>
              <div style={{ position: "relative" }}>
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
            <Hub title="Research" purpose="Find, analyze & compare." accent="#2563EB" cta="Enter Research" onCta={() => go("research")} go={go}
              items={[{ label: "Advanced Search", tab: "find" }, { label: "Screener & Filters", tab: "find" }, { label: "Fund Comparison", tab: "comparison" }, { label: "Analyze a Fund", tab: "analysis" }, { label: "Recently Viewed", tab: "research" }]} />
            <Hub title="Portfolio" purpose="Build & review portfolios." accent="#16A34A" cta="Enter Portfolio" onCta={() => go("portfolio")} go={go}
              items={[{ label: "My Portfolios", tab: "portfolio" }, { label: "Allocation Review", tab: "portfolio" }, { label: "Performance", tab: "portfolio" }, { label: "Rebalancing", tab: "portfolio" }, { label: "Risk Analysis", tab: "murderboard" }]} />
            <Hub title="Model" purpose="Test future outcomes." accent="#7C3AED" cta="Enter Model" onCta={() => go("model")} go={go}
              items={[{ label: "Goal Planning", tab: "model-project" }, { label: "Projections", tab: "model-project" }, { label: "Scenario Analysis", tab: "model-scenarios" }, { label: "Fund vs Benchmark", tab: "model-fund" }, { label: "Monte Carlo", disabled: true }]} />
            <Hub title="Advisor Toolkit" purpose="Planning tools & analytics." accent="#D97706" cta="Enter Toolkit" onCta={() => go("tax")} go={go}
              items={[{ label: "Tax Efficiency", tab: "tax" }, { label: "Correlation", tab: "correlation" }, { label: "Peer Rankings", tab: "peers" }, { label: "Backtest", tab: "backtest" }, { label: "Saved Lists", tab: "lists" }, { label: "Add Missing Fund", tab: "expansion" }, { label: "Alerts", tab: "alerts" }, { label: "AI Assistant", tab: "assistant" }]} />
          </div>
        </Reveal>
      </div>
    </div>
  );
}
