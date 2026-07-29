"use client";
import React, { useState, useEffect } from "react";
import DashboardTab from "./DashboardTab";
import IdeasTab, { type IdeasMode } from "./IdeasTab";
import AnalysisTab  from "./AnalysisTab";
import CompareTab   from "./CompareTab";
import SettingsDrawer, { type Theme } from "./SettingsTab";
import CompleteProfile from "./CompleteProfile";
import { loadPrefs, applyMotionPref } from "../lib/prefs";
import ComingSoonTab, { type RoadmapSpec } from "./ComingSoonTab";
import WatchlistTab from "./WatchlistTab";
import PortfoliosTab from "./PortfoliosTab";
import MurderBoardTab from "./MurderBoardTab";
import { ResearchHubTab, AdvisorWorkspaceTab, type HubDest } from "./Hubs";
import HomeTab from "./HomeTab";
import ModelTab, { type ModelMode } from "./ModelTab";
import ListsTab from "./ListsTab";
import ExpansionTab from "./ExpansionTab";
import AlertsTab from "./AlertsTab";
import FirmFundsTab from "./FirmFundsTab";
import ReviewsTab from "./ReviewsTab";
import SignedInShell, { C } from "./SignedInShell";

// ── Roadmap / idea tabs (placeholders - not built yet) ──────────────────────────
const mk = (paths: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">{paths}</svg>
);

const ROADMAP: RoadmapSpec[] = [
  { id: "backtest", label: "Backtest", title: "Backtest & What-If",
    icon: mk(<><circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 4.6V8l2.4 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></>),
    blurb: "Run a historical what-if on a single fund or a blend - see how the mix would have grown, its drawdowns, and how it behaved through past market regimes.",
    bullets: ["Growth-of-$10k for a fund or blend", "Max drawdown & recovery time", "Stress-period performance", "Compare two blends side by side", "Rebalancing-frequency options"] },
  { id: "alerts", label: "Alerts", title: "Alerts",
    icon: mk(<><path d="M4 7a4 4 0 0 1 8 0c0 3 1 4 1 4H3s1-1 1-4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M6.5 13a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></>),
    blurb: "Get notified when a fund crosses a threshold you care about - a drawdown, a yield level, an expense change, or a rating shift.",
    bullets: ["Set metric thresholds per fund", "Drawdown, yield, expense & rating triggers", "Email or in-app notifications", "Tie alerts to a watchlist or theme"] },
  { id: "tax", label: "Tax Center", title: "Tax Center",
    icon: mk(<><line x1="4" y1="12" x2="12" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="5" cy="5" r="1.6" stroke="currentColor" strokeWidth="1.3"/><circle cx="11" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.3"/></>),
    blurb: "Compare the tax efficiency of funds and surface tax-aware swap ideas - all at the fund level, no client data involved.",
    bullets: ["Estimated tax drag by fund", "Asset-location (taxable vs IRA) guidance", "Tax-efficient swap candidates", "Wash-sale-aware suggestions"] },
  { id: "assistant", label: "AI Assistant", title: "Research Assistant",
    icon: mk(<><path d="M2.5 4.3a1.8 1.8 0 0 1 1.8-1.8h7.4a1.8 1.8 0 0 1 1.8 1.8v4a1.8 1.8 0 0 1-1.8 1.8H7l-3 2.4V10.1H4.3a1.8 1.8 0 0 1-1.8-1.8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></>),
    blurb: "Ask plain-English questions about the fund universe - e.g. 'cheapest large-cap value with low drawdown' - and get an answer plus the matching funds, ready to compare or analyze.",
    bullets: ["Natural-language fund search", "Explains the reasoning behind each pick", "One tap to Compare or Analyze the results", "Cites the metrics it used"] },
];

// ── Nav model ───────────────────────────────────────────────────────────────────
export type TabId = "home" | "dashboard" | "firmfunds" | "reviews" | "research" | "workspace" | "ideas" | "analysis" | "comparison"
  | "portfolio" | "murderboard" | "watchlist" | "lists" | "model" | "backtest" | "correlation" | "peers" | "alerts" | "tax" | "assistant" | "expansion";

// Which primary-nav item "owns" each tab (drives the active underline in TopNav).
// Research-family tabs share one internal navigation bar rendered by the shell.
const RESEARCH_TABS = new Set<TabId>(["research", "ideas", "comparison", "analysis", "watchlist"]);

// ── Main component ───────────────────────────────────────────────────────────────

interface AppShellProps {
  authMode?: "full" | "preview" | "none" | null;
  authUser?: string | null;
  authWorkspace?: string | null;
  initialTab?: TabId;   // server-resolved landing tab (dashboard when signed in)
  onLogout?: () => void;
}

export default function AppShell({ authMode, authUser, initialTab, onLogout }: AppShellProps = {}) {
  const [tab, setTab]   = useState<TabId>(initialTab ?? "home");
  const [mounted, setMounted] = useState<Set<TabId>>(new Set<TabId>(["home", "dashboard", ...(initialTab ? [initialTab] : [])]));

  // Profile display name for the top-right (name, not email-based workspace).
  const [accountName, setAccountName] = useState<string | null>(null);
  const [unreadAlerts, setUnreadAlerts] = useState<number | null>(null);
  useEffect(() => {
    if (authMode !== "full") return;
    let alive = true;
    fetch("/api/profile", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!alive || !d) return;
      const p = d.profile as { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null;
      const full = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
      setAccountName(full || p?.display_name || (d.greeting as string) || null);
    }).catch(() => {});
    // Unread alert count for the nav bell (real data; silent on failure).
    fetch("/api/alerts", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (alive && typeof d?.counts?.unread === "number") setUnreadAlerts(d.counts.unread);
    }).catch(() => {});
    return () => { alive = false; };
  }, [authMode]);

  // Shared "focus fund" + tray - the glue that carries data across tabs
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [analysisTicker, setAnalysisTicker] = useState("");
  const [recommendSeed, setRecommendSeed]   = useState("");
  const [ideasMode, setIdeasMode]           = useState<IdeasMode>("find");
  const [modelMode, setModelMode]           = useState<ModelMode>("overview");
  // Phase 2D contextual-workspace navigation glue.
  const [analysisFromFirm, setAnalysisFromFirm] = useState(false);
  const [reviewCtx, setReviewCtx]           = useState<{ firmFundId: string; ticker: string } | null>(null);
  const [openReviewId, setOpenReviewId]     = useState<string | null>(null);  // Home → open a specific review detail
  const [firmFundsAddTicker, setFirmFundsAddTicker] = useState<string | null>(null);

  // ── Theme (persisted per device; "system" follows the OS preference) ──
  const [theme, setThemeState] = useState<Theme>("light");
  const applyTheme = (t: Theme) => {
    const resolved = t === "system"
      ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : t;
    document.documentElement.setAttribute("data-theme", resolved);
  };
  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("gf_theme")) as Theme | null;
    if (saved === "dark" || saved === "light" || saved === "system") { setThemeState(saved); applyTheme(saved); }
  }, []);
  useEffect(() => {
    if (theme !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => applyTheme("system");
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [theme]);
  const setTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try { localStorage.setItem("gf_theme", t); } catch {}
  };
  const [settingsOpen, setSettingsOpen] = useState(false);

  type NavState = { tab: TabId; ideasMode: IdeasMode };
  const applyState = (s: NavState) => {
    setMounted((prev) => { const set = new Set(prev); set.add(s.tab); return set; });
    setTab(s.tab);
    setIdeasMode(s.ideasMode);
  };

  // Everything except the public homepage requires a session (full or preview).
  const isProtected = (id: TabId) => id !== "home";

  const navigate = (id: TabId, mode?: IdeasMode) => {
    // Logged-out visitors can browse the homepage; the app itself lives
    // behind /login. (Server-side, RLS/401s enforce this regardless of UI.)
    if (isProtected(id) && authMode === "none") {
      window.location.href = "/login";
      return;
    }
    applyState({ tab: id, ideasMode: mode ?? ideasMode });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  };
  const switchTab = (id: TabId) => navigate(id);

  // If the session resolves to logged-out while on a protected tab (e.g. after
  // sign-out elsewhere), bounce to the login page.
  useEffect(() => {
    if (authMode === "none" && isProtected(tab)) window.location.href = "/login";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode, tab]);

  // Motion preference is cosmetic and device-local — apply for everyone.
  useEffect(() => { try { applyMotionPref(loadPrefs().motion); } catch { /* ignore */ } }, []);

  // No automatic landing: everyone — signed in or not — starts on the
  // homepage and enters the workspace only by clicking Enter ALCA / the nav.
  const WORKSPACE_TABS: TabId[] = ["dashboard", "firmfunds", "reviews", "research", "workspace", "model", "ideas", "comparison", "analysis", "watchlist", "portfolio", "murderboard"];
  useEffect(() => {
    if (WORKSPACE_TABS.includes(tab)) { try { localStorage.setItem("alca-last-tab", tab); } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Cross-tab actions ──
  const goAnalyze = (t: string, fromFirm = false) => { setAnalysisFromFirm(fromFirm); setAnalysisTicker(t.toUpperCase()); navigate("analysis"); };
  // Contextual-workspace actions (Phase 2D).
  const goBackToFirmFunds = () => switchTab("firmfunds");
  const goStartReview = (firmFundId: string, t: string) => { setReviewCtx({ firmFundId, ticker: t.toUpperCase() }); switchTab("reviews"); };
  const goAddToFirmFunds = (t: string) => { setFirmFundsAddTicker(t.toUpperCase()); switchTab("firmfunds"); };
  // Review → Discover Comparison (reuses the existing compare tray + tab).
  const goCompareMany = (tickers: string[]) => { setCompareTickers(Array.from(new Set(tickers.map((t) => t.toUpperCase()))).slice(0, 6)); switchTab("comparison"); };
  // Add to the comparison tray WITHOUT navigating away - build a list from anywhere.
  const addToCompare = (t: string) => {
    const up = t.toUpperCase();
    setCompareTickers((prev) => (prev.includes(up) ? prev : [...prev, up].slice(0, 6)));
  };
  const goFindSimilar = (t: string) => { setRecommendSeed(t.toUpperCase()); navigate("ideas", "fromfund"); };
  const goIdeas = (m: IdeasMode) => navigate("ideas", m);
  const goModel = (m: ModelMode) => { setModelMode(m); switchTab("model"); };

  // Route the hub cards into the canonical destinations.
  const hubGo = (d: HubDest) => {
    switch (d) {
      case "discover":     goIdeas("find"); break;        // canonical: Screen (universe mode)
      case "replacements": goIdeas("fromfund"); break;    // canonical: Replacements / Screen similar mode
      case "clientmatch":  goIdeas("profile"); break;     // canonical: Screen client-profile mode
      case "compare":      switchTab("comparison"); break;
      case "analysis":     switchTab("analysis"); break;
      case "watchlist":    switchTab("watchlist"); break;
      case "build":
      case "portfolios":   switchTab("portfolio"); break;
      case "improve":
      case "opportunity":  switchTab("murderboard"); break;
      case "model":        goModel("overview"); break;
    }
  };


  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>

      {/* Public marketing homepage — its own chrome (signed-out visitors only). */}
      {tab === "home" && <HomeTab />}

      {/* ONE shared signed-in shell around EVERY authenticated route (sidebar +
          top nav + search / notifications / profile). No authenticated route uses
          the old floating TopNav, and the ALCA Wealth logo returns to the signed-in
          Overview — never the Public Homepage. */}
      {tab !== "home" && authMode !== "none" && (
      <SignedInShell
        activeTab={tab}
        go={(d) => switchTab(d as TabId)}
        onSearch={() => goIdeas("find")}
        onNotifications={() => switchTab("alerts")}
        onSettings={() => setSettingsOpen(true)}
        accountName={accountName}
        unread={unreadAlerts ?? 0}
        attention={unreadAlerts ?? 0}
        onLogout={onLogout}
      >

        {/* Shared Discover navigation — one consistent system across the whole
            Discover workspace: Overview | Find Funds | Compare | Analyze | Watchlist.
            These are Discover's internal sections, not primary navigation. */}
        {RESEARCH_TABS.has(tab) && (
          <div style={{ maxWidth: 1280, margin: "0 auto 22px" }}>
            <style>{`.alca-subnav::-webkit-scrollbar{display:none}`}</style>
            <div className="alca-subnav" role="navigation" aria-label="Discover sections"
              style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--c-line)",
                overflowX: "auto", scrollbarWidth: "none" }}>
              {([
                ["Overview", tab === "research", () => switchTab("research")],
                ["Find Funds", tab === "ideas", () => goIdeas("all")],
                ["Compare", tab === "comparison", () => switchTab("comparison")],
                ["Analyze", tab === "analysis", () => switchTab("analysis")],
                ["Watchlist", tab === "watchlist", () => switchTab("watchlist")],
              ] as [string, boolean, () => void][]).map(([label, active, onClick]) => (
                <button key={label} onClick={onClick} aria-current={active ? "page" : undefined}
                  style={{ padding: "11px 16px 12px", border: "none", cursor: active ? "default" : "pointer",
                    background: "transparent", whiteSpace: "nowrap",
                    fontSize: 13.5, fontWeight: active ? 600 : 500,
                    color: active ? "var(--c-accent)" : "var(--c-dim)", fontFamily: "var(--font-text)",
                    borderBottom: `2px solid ${active ? "var(--c-accent)" : "transparent"}`, marginBottom: -1,
                    transition: "color 0.14s" }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "var(--c-text)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--c-dim)"; }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Advisor Overview (authenticated-only; the shell gate above already
            excludes signed-out visitors, keeping the public homepage API-free). */}
        <div style={{ display: tab === "dashboard" ? "block" : "none" }}>
          <DashboardTab go={(d) => switchTab(d as TabId)} onAnalyze={goAnalyze} userEmail={authUser ?? null} />
        </div>
        {/* Firm Funds — primary destination shell (real data model added later) */}
        {mounted.has("firmfunds") && (
          <div style={{ display: tab === "firmfunds" ? "block" : "none" }}>
            <FirmFundsTab onAnalyze={(t) => goAnalyze(t, true)}
              initialAddTicker={firmFundsAddTicker} onAddTickerConsumed={() => setFirmFundsAddTicker(null)} />
          </div>
        )}
        {/* Reviews — primary destination shell (real workflow added later) */}
        {mounted.has("reviews") && (
          <div style={{ display: tab === "reviews" ? "block" : "none" }}>
            <ReviewsTab context={reviewCtx} initialReviewId={openReviewId} onInitialReviewConsumed={() => setOpenReviewId(null)}
              onAnalyze={goAnalyze} onCompareCandidates={goCompareMany} />
          </div>
        )}
        {mounted.has("research") && (
          <div style={{ display: tab === "research" ? "block" : "none" }}><ResearchHubTab go={hubGo} onAnalyze={goAnalyze} /></div>
        )}
        {mounted.has("workspace") && (
          <div style={{ display: tab === "workspace" ? "block" : "none" }}><AdvisorWorkspaceTab go={hubGo} /></div>
        )}
        {mounted.has("ideas") && (
          <div style={{ display: tab === "ideas" ? "block" : "none" }}>
            <IdeasTab mode={ideasMode} setMode={goIdeas} seedTicker={recommendSeed}
              onAddToCompare={addToCompare} onAnalyze={goAnalyze} onFindSimilar={goFindSimilar} />
          </div>
        )}
        {mounted.has("analysis") && (
          <div style={{ display: tab === "analysis" ? "block" : "none" }}>
            <AnalysisTab ticker={analysisTicker} setTicker={setAnalysisTicker}
              onCompare={addToCompare} onFindSimilar={goFindSimilar}
              firmOrigin={analysisFromFirm} onBackToFirmFunds={goBackToFirmFunds}
              onStartReview={goStartReview} onAddToFirmFunds={goAddToFirmFunds} />
          </div>
        )}
        {mounted.has("comparison") && (
          <div style={{ display: tab === "comparison" ? "block" : "none" }}>
            <CompareTab tickers={compareTickers} setTickers={setCompareTickers} onAnalyze={goAnalyze} />
          </div>
        )}
        {/* Watchlist - real feature */}
        {mounted.has("watchlist") && (
          <div style={{ display: tab === "watchlist" ? "block" : "none" }}>
            <WatchlistTab
              onAddToCompare={addToCompare}
              onAnalyze={goAnalyze}
              onDiscover={goIdeas}
              authMode={authMode}
            />
          </div>
        )}
        {/* Saved fund lists */}
        {mounted.has("lists") && (
          <div style={{ display: tab === "lists" ? "block" : "none" }}>
            <ListsTab onAnalyze={goAnalyze} onAddToCompare={addToCompare} />
          </div>
        )}
        {/* Expansion Hub — add funds to the universe */}
        {mounted.has("expansion") && (
          <div style={{ display: tab === "expansion" ? "block" : "none" }}>
            <ExpansionTab onAnalyze={goAnalyze} />
          </div>
        )}
        {/* Analytics group - coming soon placeholders */}
        {tab === "correlation" && (
          <ComingSoonTab spec={{ id: "correlation", label: "Correlation", title: "Correlation Matrix",
            icon: mk(<><path d="M2.5 2.5v11h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="5.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="11.5" cy="5" r="1.2" fill="currentColor"/></>),
            blurb: "Drop in a set of funds and see how correlated they really are - find true diversifiers and spot redundant, overlapping holdings.",
            bullets: ["Color-coded correlation heatmap", "Rolling correlation over time", "Flags near-duplicate holdings", "Surfaces low-correlation diversifiers"] }} />
        )}
        {tab === "peers" && (
          <ComingSoonTab spec={{ id: "peers", label: "Peer Rankings", title: "Peer Rankings",
            icon: mk(<><rect x="2" y="9" width="3" height="5" rx="0.6" stroke="currentColor" strokeWidth="1.3"/><rect x="6.5" y="6" width="3" height="8" rx="0.6" stroke="currentColor" strokeWidth="1.3"/><rect x="11" y="3" width="3" height="11" rx="0.6" stroke="currentColor" strokeWidth="1.3"/></>),
            blurb: "Category leaderboards - see where any fund ranks against its peers on every metric, with percentile tables and top-of-category lists.",
            bullets: ["Category leaderboards by metric", "Percentile rank vs peers", "Top funds per category", "Filter by vehicle & cost"] }} />
        )}
        {/* Client Tools - real */}
        {mounted.has("portfolio") && (
          <div style={{ display: tab === "portfolio" ? "block" : "none" }}>
            <PortfoliosTab onAnalyze={goAnalyze} onFindSimilar={goFindSimilar} onRunInModel={() => goModel("projection")} />
          </div>
        )}
        {mounted.has("murderboard") && (
          <div style={{ display: tab === "murderboard" ? "block" : "none" }}>
            <MurderBoardTab onAnalyze={goAnalyze} onFindSimilar={goFindSimilar} />
          </div>
        )}
        {/* Model - advisor scenario analysis */}
        {mounted.has("model") && (
          <div style={{ display: tab === "model" ? "block" : "none" }}>
            <ModelTab mode={modelMode} setMode={setModelMode} onReturnToPortfolio={() => switchTab("portfolio")} />
          </div>
        )}
        {/* Alerts — SEC filing monitoring (real) */}
        {mounted.has("alerts") && (
          <div style={{ display: tab === "alerts" ? "block" : "none" }}>
            <AlertsTab onAnalyze={goAnalyze} />
          </div>
        )}
        {/* Roadmap tabs - placeholders (alerts is real, above) */}
        {ROADMAP.filter((r) => r.id === tab && r.id !== "alerts").map((r) => (
          <ComingSoonTab key={r.id} spec={r} />
        ))}
      </SignedInShell>
      )}

      {/* Settings drawer */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)}
        theme={theme} setTheme={setTheme} environment={authMode} />

      {/* One-time "complete your profile" prompt for signed-in users without a name */}
      <CompleteProfile active={authMode === "full"} />
    </div>
  );
}
