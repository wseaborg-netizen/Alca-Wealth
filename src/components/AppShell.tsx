"use client";
import React, { useState, useRef, useEffect } from "react";
import { T } from "./tokens";
import DashboardTab from "./DashboardTab";
import IdeasTab, { type IdeasMode } from "./IdeasTab";
import AnalysisTab  from "./AnalysisTab";
import CompareTab   from "./CompareTab";
import SettingsDrawer, { type Theme } from "./SettingsTab";
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
import TopNav, { type NavSection } from "./TopNav";

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
type TabId = "home" | "dashboard" | "research" | "workspace" | "ideas" | "analysis" | "comparison"
  | "portfolio" | "murderboard" | "watchlist" | "lists" | "model" | "backtest" | "correlation" | "peers" | "alerts" | "tax" | "assistant" | "expansion";

// Which top-nav item "owns" each tab (drives the active dot in TopNav).
const SECTION_OF: Partial<Record<TabId, string>> = {
  dashboard: "overview",
  research: "research", ideas: "research", comparison: "research", analysis: "research", watchlist: "research", lists: "tools",
  workspace: "portfolio-ws", portfolio: "portfolio-ws", murderboard: "portfolio-ws",
  model: "model",
  correlation: "tools", peers: "tools", backtest: "tools", tax: "tools", alerts: "tools", assistant: "tools", expansion: "tools",
};

// Research-family tabs share one internal navigation bar rendered by the shell.
const RESEARCH_TABS = new Set<TabId>(["research", "ideas", "comparison", "analysis", "watchlist"]);

// ── Main component ───────────────────────────────────────────────────────────────

interface AppShellProps {
  authMode?: "full" | "preview" | "none" | null;
  authUser?: string | null;
  authWorkspace?: string | null;
  onLogout?: () => void;
}

export default function AppShell({ authMode, authUser, authWorkspace, onLogout }: AppShellProps = {}) {
  const [tab, setTab]   = useState<TabId>("home");
  const [mounted, setMounted] = useState<Set<TabId>>(new Set<TabId>(["home", "dashboard"]));

  // Shared "focus fund" + tray - the glue that carries data across tabs
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [analysisTicker, setAnalysisTicker] = useState("");
  const [recommendSeed, setRecommendSeed]   = useState("");
  const [ideasMode, setIdeasMode]           = useState<IdeasMode>("find");
  const [modelMode, setModelMode]           = useState<ModelMode>("overview");

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

  // ── In-app navigation history (back / forward) ──
  type NavState = { tab: TabId; ideasMode: IdeasMode };
  const [history, setHistory] = useState<NavState[]>([{ tab: "home", ideasMode: "all" }]);
  const hiRef = useRef(0);
  const [hi, setHi] = useState(0);

  const applyState = (s: NavState) => {
    setMounted((prev) => { const set = new Set(prev); set.add(s.tab); return set; });
    setTab(s.tab);
    setIdeasMode(s.ideasMode);
  };

  // Everything except the public homepage requires a session (full or preview).
  const isProtected = (id: TabId) => id !== "home";
  const authed = authMode === "full" || authMode === "preview";

  // Navigate + record in history (truncating any forward entries)
  const navigate = (id: TabId, mode?: IdeasMode) => {
    // Logged-out visitors can browse the homepage; the app itself lives
    // behind /login. (Server-side, RLS/401s enforce this regardless of UI.)
    if (isProtected(id) && authMode === "none") {
      window.location.href = "/login";
      return;
    }
    const nextMode = mode ?? ideasMode;
    applyState({ tab: id, ideasMode: nextMode });
    setHistory((prev) => {
      const base = prev.slice(0, hiRef.current + 1);
      const last = base[base.length - 1];
      if (last && last.tab === id && last.ideasMode === nextMode) return prev; // dedupe
      const next = [...base, { tab: id, ideasMode: nextMode }];
      hiRef.current = next.length - 1;
      setHi(hiRef.current);
      return next;
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  };
  const switchTab = (id: TabId) => navigate(id);
  const goBack = () => {
    if (hiRef.current <= 0) return;
    hiRef.current -= 1; setHi(hiRef.current); applyState(history[hiRef.current]);
  };
  const goForward = () => {
    if (hiRef.current >= history.length - 1) return;
    hiRef.current += 1; setHi(hiRef.current); applyState(history[hiRef.current]);
  };
  const canBack = hi > 0;
  const canForward = hi < history.length - 1;

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
  const WORKSPACE_TABS: TabId[] = ["dashboard", "research", "workspace", "model", "ideas", "comparison", "analysis", "watchlist", "portfolio", "murderboard"];
  useEffect(() => {
    if (WORKSPACE_TABS.includes(tab)) { try { localStorage.setItem("alca-last-tab", tab); } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Cross-tab actions ──
  const goAnalyze = (t: string) => { setAnalysisTicker(t.toUpperCase()); navigate("analysis"); };
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

  // Adapter for the dashboard overview quick actions.
  const dashNavigate = (t: import("./DashboardTab").DashTab) => {
    if (t === "discover" || t === "find") goIdeas("find");
    else if (t === "recommendation") goIdeas("fromfund");
    else if (t === "model-fund") goModel("fund-benchmark");
    else if (t === "model-project") goModel("projection");
    else if (t === "model-scenarios") goModel("scenarios");
    else switchTab(t);
  };

  // Smoothly reveal the homepage's About section (switching to Home first if needed).
  const scrollToAbout = () => {
    const doScroll = () => document.getElementById("alca-about")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (tab !== "home") { switchTab("home"); setTimeout(doScroll, 90); }
    else doScroll();
  };

  // ── Top-nav model: direct links to each area overview + a Tools menu.
  //    No Workspaces dropdown — every main label opens its overview page. ──
  const sections: NavSection[] = [
    { id: "overview", label: "Advisor Overview", onClick: () => switchTab("dashboard") },
    { id: "research", label: "Research", onClick: () => switchTab("research") },
    { id: "portfolio-ws", label: "Portfolio", onClick: () => switchTab("workspace") },
    { id: "model", label: "Model", onClick: () => switchTab("model") },
    { id: "tools", label: "Tools", leaves: [
      { label: "Expansion", desc: "Add funds to Alca's universe", onClick: () => switchTab("expansion"), active: tab === "expansion" },
      { label: "Saved Lists", desc: "Commonly used funds & watchlists", onClick: () => switchTab("lists"), active: tab === "lists" },
      { label: "Correlation", desc: "Find true diversifiers", onClick: () => switchTab("correlation"), active: tab === "correlation" },
      { label: "Peer Rankings", desc: "Category leaderboards", onClick: () => switchTab("peers"), active: tab === "peers" },
      { label: "Backtest", desc: "Historical what-if", onClick: () => switchTab("backtest"), active: tab === "backtest" },
      { label: "Tax Center", desc: "Tax-aware fund analysis", onClick: () => switchTab("tax"), active: tab === "tax" },
      { label: "Alerts", desc: "Threshold notifications", onClick: () => switchTab("alerts"), active: tab === "alerts" },
      { label: "AI Assistant", desc: "Ask the fund universe", onClick: () => switchTab("assistant"), active: tab === "assistant" },
    ] },
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column" }}>

      <TopNav
        sections={sections}
        activeSection={SECTION_OF[tab] ?? null}
        onBrand={() => switchTab("home")}
        onAbout={scrollToAbout}
        onSearch={() => goIdeas("find")}
        onSettings={() => { if (authMode === "none") { window.location.href = "/login"; return; } setSettingsOpen(true); }}
        authMode={authMode}
        authUser={authUser}
        authWorkspace={authWorkspace}
        onLogout={onLogout}
        canBack={canBack}
        canForward={canForward}
        goBack={goBack}
        goForward={goForward}
      />

      {/* Content - lazy-mounted, hidden when inactive (state persists).
          Home and the command center run full-bleed dark; every other tab gets
          nav clearance + a faint teal wash falling from under the floating nav. */}
      <main style={{ flex: 1, minWidth: 0,
        padding: tab === "home" || tab === "dashboard" ? "0 32px 0" : "96px 32px 48px",
        background: tab === "home" || tab === "dashboard" ? "transparent"
          : "linear-gradient(180deg, rgba(14,116,144,0.045) 0%, rgba(14,116,144,0) 380px)" }}>

        {/* Shared Research navigation — one consistent system across the whole
            Research workspace: Overview | Find Funds | Compare | Analyze | Watchlist */}
        {RESEARCH_TABS.has(tab) && (
          <div style={{ maxWidth: 1280, margin: "0 auto 22px" }}>
            <style>{`.alca-subnav::-webkit-scrollbar{display:none}`}</style>
            <div className="alca-subnav" role="navigation" aria-label="Research sections"
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

        <div style={{ display: tab === "home" ? "block" : "none" }}>
          <HomeTab
            onEnterPlatform={() => switchTab("dashboard")}
            onOpenResearch={() => switchTab("research")}
            onOpenPortfolio={() => switchTab("workspace")}
            onOpenModel={() => switchTab("model")}
            onExplore={scrollToAbout}
          />
        </div>
        <div style={{ display: tab === "dashboard" ? "block" : "none" }}>
          <DashboardTab onNavigate={dashNavigate} />
        </div>
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
              onCompare={addToCompare} onFindSimilar={goFindSimilar} />
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
        {/* Roadmap tabs - placeholders */}
        {ROADMAP.filter((r) => r.id === tab).map((r) => (
          <ComingSoonTab key={r.id} spec={r} />
        ))}
      </main>

      {/* Settings drawer */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)}
        theme={theme} setTheme={setTheme} environment={authMode} />
    </div>
  );
}
