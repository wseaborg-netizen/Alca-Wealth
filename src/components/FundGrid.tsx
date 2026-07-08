"use client";
import React, { useState, useRef, useEffect } from "react";
import { T, ui, mono } from "./tokens";
import DashboardTab from "./DashboardTab";
import NewsTab      from "./NewsTab";
import IdeasTab, { type IdeasMode, DISCOVER_SECTIONS } from "./IdeasTab";
import AnalysisTab  from "./AnalysisTab";
import CompareTab   from "./CompareTab";
import SettingsTab, { type Theme } from "./SettingsTab";
import ComingSoonTab, { type RoadmapSpec } from "./ComingSoonTab";
import WatchlistTab from "./WatchlistTab";
import PortfoliosTab from "./PortfoliosTab";
import MurderBoardTab from "./MurderBoardTab";
import { ResearchHubTab, AdvisorWorkspaceTab, type HubDest } from "./Hubs";

// ── Dark chrome - the sidebar and header are one continuous graphite frame
// (--c-chrome), the same material as the dashboard's workspace cards. The
// frame stays dark in both themes; only the work canvas changes. Hairlines
// inside the chrome are white-alpha so they read as machined edges.
const CHROME = "var(--c-chrome)";
const CHROME_LINE = "var(--c-chrome-line)";

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

// ── Icons ───────────────────────────────────────────────────────────────────────

const IconDashboard = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
  </svg>
);
const IconNews = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <line x1="4" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <line x1="4" y1="8.5" x2="9" y2="8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <line x1="4" y1="11" x2="7" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <rect x="10.5" y="6" width="2.7" height="2.7" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
  </svg>
);
const IconIdeas = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="7.2" cy="7.2" r="5" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="7.2" cy="7.2" r="1.7" stroke="currentColor" strokeWidth="1.3"/>
    <line x1="10.9" y1="10.9" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const IconAnalysis = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M5 9l2-2 1.5 1.5L11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="5" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IconComparison = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 4h5v8H2zM9 2h5v10H9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
  </svg>
);
const IconSettings = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

// ── Nav model ───────────────────────────────────────────────────────────────────

type TabId = "dashboard" | "research" | "workspace" | "news" | "ideas" | "analysis" | "comparison" | "settings"
  | "portfolio" | "murderboard" | "watchlist" | "backtest" | "correlation" | "peers" | "alerts" | "tax" | "assistant";

interface NavItem { id: TabId; label: string; icon: React.ReactNode; }
interface NavGroup { id: string; title: string; items: NavItem[]; }

// Named icons for the workflow items (kept out of the GROUPS array for clarity).
const IconPortfolios  = mk(<><path d="M8 1.8V8l5.4 3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4"/></>);
const IconMurderBoard = mk(<><rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><line x1="4.5" y1="6" x2="11.5" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="4.5" y1="8.5" x2="11.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="4.5" y1="11" x2="8.5" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></>);
const IconWatchlist   = mk(<><path d="M8 2.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11.3l-3.4 1.7.7-3.8L2.5 6.5l3.8-.5L8 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></>);
const IconCorrelation = mk(<><path d="M2.5 2.5v11h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="5.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="11.5" cy="5" r="1.2" fill="currentColor"/></>);
const IconPeers       = mk(<><rect x="2" y="9" width="3" height="5" rx="0.6" stroke="currentColor" strokeWidth="1.3"/><rect x="6.5" y="6" width="3" height="8" rx="0.6" stroke="currentColor" strokeWidth="1.3"/><rect x="11" y="3" width="3" height="11" rx="0.6" stroke="currentColor" strokeWidth="1.3"/></>);
const IconResearchHub = mk(<><circle cx="6.6" cy="6.6" r="4.4" stroke="currentColor" strokeWidth="1.4"/><line x1="9.9" y1="9.9" x2="13.5" y2="13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="4.6" y1="6.6" x2="8.6" y2="6.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="6.6" y1="4.6" x2="6.6" y2="8.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></>);
const IconWorkspace   = mk(<><rect x="2" y="4.5" width="12" height="9" rx="1.4" stroke="currentColor" strokeWidth="1.4"/><path d="M6 4.5V3.4A1 1 0 0 1 7 2.4h2a1 1 0 0 1 1 1V4.5" stroke="currentColor" strokeWidth="1.4"/><line x1="2" y1="8.5" x2="14" y2="8.5" stroke="currentColor" strokeWidth="1.2"/></>);
const IconTools       = mk(<><path d="M6.5 3.2a2.6 2.6 0 0 0-3.3 3.3l4.3 4.3 1.9-1.9-4.3-4.3a2.6 2.6 0 0 1-.9 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M9.5 9l3.3 3.3a1.2 1.2 0 0 1-1.7 1.7L7.8 10.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></>);
const IconAssistant   = mk(<><path d="M2.5 4.3a1.8 1.8 0 0 1 1.8-1.8h7.4a1.8 1.8 0 0 1 1.8 1.8v4a1.8 1.8 0 0 1-1.8 1.8H7l-3 2.4V10.1H4.3a1.8 1.8 0 0 1-1.8-1.8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></>);

// Pull a roadmap item (backtest / alerts / tax / assistant) as a nav item.
const rm = (id: string): NavItem => { const r = ROADMAP.find((x) => x.id === id)!; return { id: r.id as TabId, label: r.label, icon: r.icon }; };

// Two-hub advisor platform: Overview → Workspaces → the research + advisor tools that live inside them.
const GROUPS: NavGroup[] = [
  {
    id: "overview", title: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: IconDashboard },
    ],
  },
  {
    id: "workspaces", title: "Workspaces",
    items: [
      { id: "research",  label: "Research Hub",      icon: IconResearchHub },
      { id: "workspace", label: "Advisor Workspace", icon: IconWorkspace },
    ],
  },
  {
    id: "research", title: "Research",
    items: [
      { id: "ideas",      label: "Discover",   icon: IconIdeas },
      { id: "comparison", label: "Comparison", icon: IconComparison },
      { id: "analysis",   label: "Analysis",   icon: IconAnalysis },
    ],
  },
  {
    id: "advisor", title: "Advisor",
    items: [
      { id: "portfolio",   label: "Portfolios",       icon: IconPortfolios },
      { id: "murderboard", label: "Portfolio Review", icon: IconMurderBoard },
      { id: "watchlist",   label: "Watchlist",        icon: IconWatchlist },
      rm("alerts"),
    ],
  },
  {
    id: "tools", title: "Tools",
    items: [
      { id: "correlation", label: "Correlation",   icon: IconCorrelation },
      { id: "peers",       label: "Peer Rankings", icon: IconPeers },
      rm("backtest"),
      rm("tax"),
    ],
  },
  {
    id: "assistant-group", title: "Assistant",
    items: [ rm("assistant") ],
  },
];

// The core research workflow tabs - shown as quick-access boxes in the top bar.
const ALL_ITEMS: NavItem[] = GROUPS.flatMap((g) => g.items);
const titleFor = (t: TabId) => t === "settings" ? "Settings" : (ALL_ITEMS.find((it) => it.id === t)?.label ?? "Dashboard");

const SIDEBAR_OPEN = 242;
const SIDEBAR_CLOSE = 60;

// ── Main component ───────────────────────────────────────────────────────────────

interface FundGridProps {
  authMode?: "full" | "preview" | null;
  authUser?: string | null;
  onLogout?: () => void;
}

export default function FundGrid({ authMode, authUser, onLogout }: FundGridProps = {}) {
  const [tab, setTab]   = useState<TabId>("dashboard");
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState<Set<TabId>>(new Set<TabId>(["dashboard"]));

  // Shared "focus fund" + tray - the glue that carries data across tabs
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [analysisTicker, setAnalysisTicker] = useState("");
  const [recommendSeed, setRecommendSeed]   = useState("");
  const [ideasMode, setIdeasMode]           = useState<IdeasMode>("all");
  const [discoverOpen, setDiscoverOpen]     = useState(false);
  const [expanded, setExpanded]             = useState<Set<string>>(new Set()); // expandable sidebar sections

  // ── Theme (persisted per device) ──
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("gf_theme")) as Theme | null;
    if (saved === "dark" || saved === "light") { setThemeState(saved); document.documentElement.setAttribute("data-theme", saved); }
  }, []);
  const setTheme = (t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("gf_theme", t); } catch {}
  };

  const sidebarW = open ? SIDEBAR_OPEN : SIDEBAR_CLOSE;

  // ── In-app navigation history (back / forward) ──
  type NavState = { tab: TabId; ideasMode: IdeasMode };
  const [history, setHistory] = useState<NavState[]>([{ tab: "dashboard", ideasMode: "all" }]);
  const hiRef = useRef(0);
  const [hi, setHi] = useState(0);

  const applyState = (s: NavState) => {
    setMounted((prev) => { const set = new Set(prev); set.add(s.tab); return set; });
    setTab(s.tab);
    setIdeasMode(s.ideasMode);
  };

  // Navigate + record in history (truncating any forward entries)
  const navigate = (id: TabId, mode?: IdeasMode) => {
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

  // ── Cross-tab actions ──
  const goAnalyze = (t: string) => { setAnalysisTicker(t.toUpperCase()); navigate("analysis"); };
  // Add to the comparison tray WITHOUT navigating away - build a list from anywhere.
  const addToCompare = (t: string) => {
    const up = t.toUpperCase();
    setCompareTickers((prev) => (prev.includes(up) ? prev : [...prev, up].slice(0, 6)));
  };
  const goFindSimilar = (t: string) => { setRecommendSeed(t.toUpperCase()); navigate("ideas", "fromfund"); };
  const goIdeas = (m: IdeasMode) => navigate("ideas", m);

  // Route the hub-landing cards into the real tools they represent.
  const hubGo = (d: HubDest) => {
    switch (d) {
      case "discover":     setDiscoverOpen(true); goIdeas("all"); break;
      case "replacements": setDiscoverOpen(true); goIdeas("fromfund"); break;
      case "compare":      switchTab("comparison"); break;
      case "analysis":     switchTab("analysis"); break;
      case "watchlist":    switchTab("watchlist"); break;
      case "build":
      case "portfolios":
      case "present":      switchTab("portfolio"); break;
      case "improve":
      case "opportunity":  switchTab("murderboard"); break;
    }
  };

  // Adapter for the dashboard command-center + showcase tour.
  const dashNavigate = (t: import("./DashboardTab").DashTab) => {
    if (t === "discover") { setDiscoverOpen(true); goIdeas("all"); }
    else if (t === "find") goIdeas("find");
    else if (t === "recommendation") goIdeas("fromfund");
    else if (t === "present") switchTab("portfolio");
    else switchTab(t);
  };

  const NavButton = ({ item, sub }: { item: NavItem; sub?: boolean }) => {
    const isDiscover = item.id === "ideas";
    const active = tab === item.id;
    const count = item.id === "comparison" && compareTickers.length > 0 ? compareTickers.length : null;
    const onClick = () => {
      if (isDiscover && open) {
        const willOpen = !discoverOpen;
        setDiscoverOpen(willOpen);
        if (willOpen) goIdeas("all");
      } else if (isDiscover) {
        goIdeas("all");
      } else {
        setDiscoverOpen(false);
        switchTab(item.id);
      }
    };
    return (
      <button
        onClick={onClick}
        title={!open ? item.label : undefined}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 11, position: "relative",
          padding: open ? "11px 12px" : "11px 0",
          paddingLeft: open ? (sub ? 22 : 11) : 0,
          justifyContent: open ? "flex-start" : "center",
          borderRadius: 8, cursor: "pointer", border: "none",
          borderLeft: active ? `3px solid var(--c-chrome-accent)` : "3px solid transparent",
          background: active ? "var(--c-chrome-active-bg)" : "transparent",
          color: active ? "var(--c-chrome-accent)" : "var(--c-chrome-dim)", transition: "all 0.15s",
        }}
        onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "var(--c-chrome-hover)"; e.currentTarget.style.color = "var(--c-chrome-text)"; } }}
        onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--c-chrome-dim)"; } }}
      >
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{item.icon}</span>
        {open && (
          <span style={{ fontSize: 15, fontWeight: active ? 600 : 500, whiteSpace: "nowrap",
            flex: 1, textAlign: "left", ...ui }}>{item.label}</span>
        )}
        {open && count != null && (
          <span style={{ fontSize: 9, fontWeight: 600, color: "var(--c-chrome-accent)", background: "rgba(94,234,212,0.16)",
            borderRadius: 99, padding: "1px 6px", ...mono }}>{count}</span>
        )}
        {open && isDiscover && (
          <span style={{ flexShrink: 0, display: "flex", alignItems: "center", color: "var(--c-chrome-muted)",
            transform: discoverOpen ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        )}
        {!open && count != null && (
          <span style={{ position: "absolute", top: 6, right: 8, width: 7, height: 7,
            borderRadius: "50%", background: "var(--c-chrome-accent)" }} />
        )}
      </button>
    );
  };

  // Indented sub-item rendered in the Discover dropdown
  const DiscoverSubItem = ({ id, label, icon }: { id: IdeasMode; label: string; icon: React.ReactNode }) => {
    const on = tab === "ideas" && ideasMode === id;
    return (
      <button onClick={() => goIdeas(id)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 9,
          padding: "8px 10px 8px 40px", borderRadius: 6, cursor: "pointer", border: "none",
          background: on ? "var(--c-chrome-active-bg)" : "transparent",
          color: on ? "var(--c-chrome-accent)" : "var(--c-chrome-dim)", transition: "all 0.14s" }}
        onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "var(--c-chrome-hover)"; }}
        onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", opacity: 0.85,
          transform: "scale(0.82)" }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: on ? 600 : 400, whiteSpace: "nowrap", ...ui }}>{label}</span>
      </button>
    );
  };

  // ── Expandable sidebar model (Notion/Linear-style hierarchy) ──
  interface NavChild { label: string; onClick: () => void; active: boolean; count?: number | null; }
  interface NavParent { id: string; label: string; icon: React.ReactNode; landing?: TabId; owns: TabId[]; children: NavChild[]; }
  const NAV_PARENTS: NavParent[] = [
    {
      id: "research", label: "Research", icon: IconResearchHub, landing: "research",
      owns: ["research", "ideas", "comparison", "analysis", "watchlist"],
      children: [
        { label: "Discover", onClick: () => { setDiscoverOpen(false); goIdeas("all"); }, active: tab === "ideas" },
        { label: "Comparison", onClick: () => switchTab("comparison"), active: tab === "comparison", count: compareTickers.length || null },
        { label: "Analysis", onClick: () => switchTab("analysis"), active: tab === "analysis" },
        { label: "Research Watchlist", onClick: () => switchTab("watchlist"), active: tab === "watchlist" },
        { label: "Replacement Ideas", onClick: () => goIdeas("fromfund"), active: false },
      ],
    },
    {
      id: "workspace", label: "Advisor Workspace", icon: IconWorkspace, landing: "workspace",
      owns: ["workspace", "portfolio", "murderboard"],
      children: [
        { label: "Build Recommendation", onClick: () => switchTab("portfolio"), active: tab === "portfolio" },
        { label: "Portfolio Review", onClick: () => switchTab("murderboard"), active: tab === "murderboard" },
        { label: "Client Portfolios", onClick: () => switchTab("portfolio"), active: false },
        { label: "Present to Client", onClick: () => switchTab("portfolio"), active: false },
        { label: "Opportunity Feed", onClick: () => switchTab("workspace"), active: false },
      ],
    },
    {
      id: "tools", label: "Tools", icon: IconTools,
      owns: ["correlation", "peers", "backtest", "tax", "alerts"],
      children: [
        { label: "Correlation", onClick: () => switchTab("correlation"), active: tab === "correlation" },
        { label: "Peer Rankings", onClick: () => switchTab("peers"), active: tab === "peers" },
        { label: "Backtest", onClick: () => switchTab("backtest"), active: tab === "backtest" },
        { label: "Tax Center", onClick: () => switchTab("tax"), active: tab === "tax" },
        { label: "Alerts", onClick: () => switchTab("alerts"), active: tab === "alerts" },
      ],
    },
  ];
  const isExpanded = (p: NavParent) => expanded.has(p.id) || p.owns.includes(tab);
  const onParentClick = (p: NavParent) => {
    if (p.landing) { switchTab(p.landing); setExpanded((prev) => new Set(prev).add(p.id)); }
    else setExpanded((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; });
  };
  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const ParentRow = ({ p }: { p: NavParent }) => {
    const activeParent = p.landing != null && tab === p.landing;
    const openSec = isExpanded(p);
    return (
      <button onClick={() => onParentClick(p)} title={!open ? p.label : undefined}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, position: "relative",
          padding: open ? "11px 12px" : "11px 0", justifyContent: open ? "flex-start" : "center",
          borderRadius: 8, cursor: "pointer", border: "none",
          borderLeft: activeParent ? "3px solid var(--c-chrome-accent)" : "3px solid transparent",
          background: activeParent ? "var(--c-chrome-active-bg)" : "transparent",
          color: activeParent ? "var(--c-chrome-accent)" : "var(--c-chrome-text)", transition: "all 0.15s" }}
        onMouseEnter={(e) => { if (!activeParent) e.currentTarget.style.background = "var(--c-chrome-hover)"; }}
        onMouseLeave={(e) => { if (!activeParent) e.currentTarget.style.background = "transparent"; }}>
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{p.icon}</span>
        {open && <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", flex: 1, textAlign: "left", ...ui }}>{p.label}</span>}
        {open && (
          <span onClick={(e) => toggleExpand(e, p.id)} style={{ flexShrink: 0, display: "flex", alignItems: "center", color: "var(--c-chrome-muted)", padding: 2,
            transform: openSec ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        )}
      </button>
    );
  };
  const ChildRow = ({ c }: { c: NavChild }) => (
    <button onClick={c.onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9,
      padding: "9px 10px 9px 42px", borderRadius: 6, cursor: "pointer", border: "none",
      background: c.active ? "var(--c-chrome-active-bg)" : "transparent",
      color: c.active ? "var(--c-chrome-accent)" : "var(--c-chrome-dim)", transition: "all 0.14s" }}
      onMouseEnter={(e) => { if (!c.active) { e.currentTarget.style.background = "var(--c-chrome-hover)"; e.currentTarget.style.color = "var(--c-chrome-text)"; } }}
      onMouseLeave={(e) => { if (!c.active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--c-chrome-dim)"; } }}>
      <span style={{ width: 4, height: 4, borderRadius: "50%", flexShrink: 0, background: c.active ? "var(--c-chrome-accent)" : "rgba(255,255,255,0.25)" }} />
      <span style={{ fontSize: 14, fontWeight: c.active ? 600 : 500, whiteSpace: "nowrap", flex: 1, textAlign: "left", ...ui }}>{c.label}</span>
      {c.count != null && <span style={{ fontSize: 9, fontWeight: 600, color: "var(--c-chrome-accent)", background: "rgba(94,234,212,0.16)", borderRadius: 99, padding: "1px 6px", ...mono }}>{c.count}</span>}
    </button>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg }}>

      {/* ── Sidebar ── */}
      <aside style={{
        position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50, width: sidebarW,
        background: CHROME, borderRight: `1px solid rgba(0,0,0,0.5)`,
        display: "flex", flexDirection: "column", overflow: "hidden",
        transition: "width 0.2s cubic-bezier(0.4,0,0.2,1)",
      }}>
        {/* Brand lives in the app header - the sidebar top holds only the toggle. */}
        <div style={{ height: 64, display: "flex", alignItems: "center", gap: 12,
          borderBottom: `1px solid ${CHROME_LINE}`, padding: "0 16px", flexShrink: 0 }}>
          <button onClick={() => setOpen((o) => !o)} aria-label="Toggle sidebar"
            style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid rgba(255,255,255,0.16)`,
              background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0,
              transition: "background var(--dur-fast) var(--ease-out)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-chrome-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ width: 12, height: 1.5, background: "var(--c-chrome-dim)", borderRadius: 1 }} />
            <span style={{ width: 12, height: 1.5, background: "var(--c-chrome-dim)", borderRadius: 1 }} />
            <span style={{ width: 12, height: 1.5, background: "var(--c-chrome-dim)", borderRadius: 1 }} />
          </button>
          {open && (
            <span style={{ fontSize: 11, color: "var(--c-chrome-muted)", letterSpacing: "0.12em", fontWeight: 600,
              textTransform: "uppercase", whiteSpace: "nowrap", ...ui }}>Navigation</span>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          <NavButton item={{ id: "dashboard", label: "Dashboard", icon: IconDashboard }} />
          {NAV_PARENTS.map((p) => (
            <React.Fragment key={p.id}>
              <ParentRow p={p} />
              {open && isExpanded(p) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 1, marginBottom: 4 }}>
                  {p.children.map((c) => <ChildRow key={c.label} c={c} />)}
                </div>
              )}
            </React.Fragment>
          ))}
          <NavButton item={{ id: "assistant", label: "AI Assistant", icon: IconAssistant }} />
        </nav>

        {/* Settings - pinned to the bottom */}
        <div style={{ borderTop: `1px solid ${CHROME_LINE}`, padding: "8px 10px", flexShrink: 0 }}>
          <NavButton item={{ id: "settings", label: "Settings", icon: IconSettings }} sub={open} />
          {open && (
            <div style={{ padding: "8px 12px 4px" }}>
              <div style={{ fontSize: 9.5, color: "var(--c-chrome-muted)", lineHeight: 1.4, ...ui }}>Research aid · verify before client use.</div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ marginLeft: sidebarW, flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
        transition: "margin-left 0.2s cubic-bezier(0.4,0,0.2,1)" }}>

        {/* Top bar: dark chrome - continuous with the sidebar */}
        <header style={{ minHeight: 64, display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 14, padding: "0 24px", background: CHROME, borderBottom: `1px solid rgba(0,0,0,0.5)`,
          boxShadow: "var(--elev-2)", position: "relative", zIndex: 40,
          flexShrink: 0, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Back / forward - in-app navigation history */}
            <div style={{ display: "flex", gap: 3 }}>
              <button onClick={goBack} disabled={!canBack} title="Back"
                style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid rgba(255,255,255,0.14)`,
                  background: "transparent", cursor: canBack ? "pointer" : "default", opacity: canBack ? 1 : 0.35,
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--c-chrome-dim)",
                  transition: "background var(--dur-fast) var(--ease-out)" }}
                onMouseEnter={(e) => { if (canBack) e.currentTarget.style.background = "var(--c-chrome-hover)"; }}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={goForward} disabled={!canForward} title="Forward"
                style={{ width: 30, height: 30, borderRadius: 7, border: `1px solid rgba(255,255,255,0.14)`,
                  background: "transparent", cursor: canForward ? "pointer" : "default", opacity: canForward ? 1 : 0.35,
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--c-chrome-dim)",
                  transition: "background var(--dur-fast) var(--ease-out)" }}
                onMouseEnter={(e) => { if (canForward) e.currentTarget.style.background = "var(--c-chrome-hover)"; }}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            {/* Primary brand location - the header identifies the platform on every page */}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", lineHeight: 1.2 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: "#fff", ...ui, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>ALCA Wealth</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--c-chrome-muted)", ...ui, marginTop: 2, whiteSpace: "nowrap",
                letterSpacing: "0.03em" }}>Advisor Intelligence Platform</span>
            </div>
            {tab !== "dashboard" && (
              <>
                <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.14)", margin: "0 6px" }} />
                <h1 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.78)", margin: 0, whiteSpace: "nowrap", ...ui }}>
                  {titleFor(tab)}
                </h1>
              </>
            )}
            {/* Tray indicator - funds queued for comparison from anywhere */}
            {compareTickers.length > 0 && (
              <button onClick={() => switchTab("comparison")} title="Open comparison"
                style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(94,234,212,0.12)",
                  border: `1px solid rgba(94,234,212,0.38)`, borderRadius: 7, padding: "4px 9px", cursor: "pointer" }}>
                <span style={{ fontSize: 8, fontWeight: 600, color: "var(--c-chrome-accent)", textTransform: "uppercase",
                  letterSpacing: "0.08em", ...ui }}>Tray · {compareTickers.length}</span>
                {compareTickers.map((t) => (
                  <span key={t} style={{ fontSize: 10, fontWeight: 600, color: "#fff", ...mono }}>{t}</span>
                ))}
                <span style={{ fontSize: 11, color: "var(--c-chrome-accent)", marginLeft: 1 }}>→</span>
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Auth status + logout */}
            {(authMode === "full" || authMode === "preview") && (
              <>
                <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.14)", margin: "0 2px" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {authMode === "preview" ? (
                    <span style={{ fontSize: 10.5, color: "#F59E0B", background: "rgba(245,158,11,0.12)",
                      border: `1px solid rgba(245,158,11,0.35)`, borderRadius: 5,
                      padding: "3px 8px", fontWeight: 600, ...ui, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      Preview
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--c-chrome-dim)", ...ui, maxWidth: 160,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {authUser}
                    </span>
                  )}
                  {onLogout && (
                    <button onClick={onLogout}
                      style={{ fontSize: 11, color: "var(--c-chrome-muted)", background: "none",
                        border: `1px solid rgba(255,255,255,0.16)`, borderRadius: 5,
                        padding: "4px 10px", cursor: "pointer", ...ui, transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "var(--c-chrome-muted)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"; }}>
                      Sign out
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        {/* Content - lazy-mounted, hidden when inactive (state persists).
            A faint teal wash falls from under the dark header - depth, not decoration. */}
        <main style={{ flex: 1, padding: "30px 32px 48px",
          background: "linear-gradient(180deg, rgba(14,116,144,0.045) 0%, rgba(14,116,144,0) 300px)" }}>
          <div style={{ display: tab === "dashboard" ? "block" : "none" }}>
            <DashboardTab onNavigate={dashNavigate} railOffset={sidebarW} />
          </div>
          {mounted.has("research") && (
            <div style={{ display: tab === "research" ? "block" : "none" }}><ResearchHubTab go={hubGo} /></div>
          )}
          {mounted.has("workspace") && (
            <div style={{ display: tab === "workspace" ? "block" : "none" }}><AdvisorWorkspaceTab go={hubGo} /></div>
          )}
          {mounted.has("news") && (
            <div style={{ display: tab === "news" ? "block" : "none" }}><NewsTab /></div>
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
          {mounted.has("settings") && (
            <div style={{ display: tab === "settings" ? "block" : "none" }}>
              <SettingsTab theme={theme} setTheme={setTheme} />
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
              <PortfoliosTab onAnalyze={goAnalyze} onFindSimilar={goFindSimilar} />
            </div>
          )}
          {mounted.has("murderboard") && (
            <div style={{ display: tab === "murderboard" ? "block" : "none" }}>
              <MurderBoardTab onAnalyze={goAnalyze} onFindSimilar={goFindSimilar} />
            </div>
          )}
          {/* Roadmap tabs - placeholders */}
          {ROADMAP.filter((r) => r.id === tab).map((r) => (
            <ComingSoonTab key={r.id} spec={r} />
          ))}
        </main>
      </div>
    </div>
  );
}
