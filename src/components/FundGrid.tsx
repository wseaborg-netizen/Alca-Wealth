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
import { AlphaMark } from "./Brand";

// ── Roadmap / idea tabs (placeholders — not built yet) ──────────────────────────
const mk = (paths: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">{paths}</svg>
);

const ROADMAP: RoadmapSpec[] = [
  { id: "portfolio", label: "Portfolio", title: "Model Portfolio Builder",
    icon: mk(<><path d="M8 1.5V8l5.6 3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/></>),
    blurb: "Assemble a model portfolio from the fund universe, set target weights, and see blended cost, risk and exposure in one view. Fund-level only — no client accounts.",
    bullets: ["Add funds and set target weights", "Blended expense, yield, Sharpe & drawdown", "Asset-class & sector exposure", "Overlap detection between holdings", "Save & reuse model templates"] },
  { id: "backtest", label: "Backtest", title: "Backtest & What-If",
    icon: mk(<><circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 4.6V8l2.4 1.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></>),
    blurb: "Run a historical what-if on a single fund or a blend — see how the mix would have grown, its drawdowns, and how it behaved through past market regimes.",
    bullets: ["Growth-of-$10k for a fund or blend", "Max drawdown & recovery time", "Stress-period performance", "Compare two blends side by side", "Rebalancing-frequency options"] },
  { id: "alerts", label: "Alerts", title: "Alerts",
    icon: mk(<><path d="M4 7a4 4 0 0 1 8 0c0 3 1 4 1 4H3s1-1 1-4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M6.5 13a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></>),
    blurb: "Get notified when a fund crosses a threshold you care about — a drawdown, a yield level, an expense change, or a rating shift.",
    bullets: ["Set metric thresholds per fund", "Drawdown, yield, expense & rating triggers", "Email or in-app notifications", "Tie alerts to a watchlist or theme"] },
  { id: "tax", label: "Tax Center", title: "Tax Center",
    icon: mk(<><line x1="4" y1="12" x2="12" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="5" cy="5" r="1.6" stroke="currentColor" strokeWidth="1.3"/><circle cx="11" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.3"/></>),
    blurb: "Compare the tax efficiency of funds and surface tax-aware swap ideas — all at the fund level, no client data involved.",
    bullets: ["Estimated tax drag by fund", "Asset-location (taxable vs IRA) guidance", "Tax-efficient swap candidates", "Wash-sale-aware suggestions"] },
  { id: "assistant", label: "AI Assistant", title: "Research Assistant",
    icon: mk(<><path d="M2.5 4.3a1.8 1.8 0 0 1 1.8-1.8h7.4a1.8 1.8 0 0 1 1.8 1.8v4a1.8 1.8 0 0 1-1.8 1.8H7l-3 2.4V10.1H4.3a1.8 1.8 0 0 1-1.8-1.8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></>),
    blurb: "Ask plain-English questions about the fund universe — e.g. 'cheapest large-cap value with low drawdown' — and get an answer plus the matching funds, ready to compare or analyze.",
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
    <path d="M8 1.5a4.5 4.5 0 0 0-2.7 8.1c.45.34.7.86.7 1.4v.5h4v-.5c0-.54.25-1.06.7-1.4A4.5 4.5 0 0 0 8 1.5Z"
      stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <line x1="6.2" y1="13.5" x2="9.8" y2="13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <line x1="6.8" y1="15" x2="9.2" y2="15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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

type TabId = "dashboard" | "news" | "ideas" | "analysis" | "comparison" | "settings"
  | "portfolio" | "watchlist" | "backtest" | "correlation" | "peers" | "alerts" | "tax" | "assistant";

interface NavItem { id: TabId; label: string; icon: React.ReactNode; }
interface NavGroup { id: string; title: string; items: NavItem[]; }

const GROUPS: NavGroup[] = [
  {
    id: "markets", title: "Markets",
    items: [
      { id: "dashboard", label: "Dashboard", icon: IconDashboard },
      { id: "news",      label: "News",      icon: IconNews },
    ],
  },
  {
    id: "workspace", title: "Advisor Hub",
    items: [
      { id: "ideas",      label: "Discover",   icon: IconIdeas },
      { id: "comparison", label: "Comparison", icon: IconComparison },
      { id: "analysis",   label: "Analysis",   icon: IconAnalysis },
    ],
  },
  {
    id: "watchlist-group", title: "Watchlist",
    items: [
      { id: "watchlist", label: "Watchlist", icon: mk(<><path d="M8 2.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11.3l-3.4 1.7.7-3.8L2.5 6.5l3.8-.5L8 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></>) },
    ],
  },
  {
    id: "analytics", title: "Analytics",
    items: [
      { id: "correlation", label: "Correlation",   icon: mk(<><path d="M2.5 2.5v11h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="5.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="11.5" cy="5" r="1.2" fill="currentColor"/></>) },
      { id: "peers",       label: "Peer Rankings", icon: mk(<><rect x="2" y="9" width="3" height="5" rx="0.6" stroke="currentColor" strokeWidth="1.3"/><rect x="6.5" y="6" width="3" height="8" rx="0.6" stroke="currentColor" strokeWidth="1.3"/><rect x="11" y="3" width="3" height="11" rx="0.6" stroke="currentColor" strokeWidth="1.3"/></>) },
    ],
  },
  {
    id: "roadmap", title: "Roadmap · Ideas",
    items: ROADMAP.map((r) => ({ id: r.id as TabId, label: r.label, icon: r.icon })),
  },
];

// The core workflow tabs — shown as quick-access boxes in the top bar
const WORKFLOW: NavItem[] = GROUPS[1].items;
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

  // Shared "focus fund" + tray — the glue that carries data across tabs
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [analysisTicker, setAnalysisTicker] = useState("");
  const [recommendSeed, setRecommendSeed]   = useState("");
  const [ideasMode, setIdeasMode]           = useState<IdeasMode>("all");
  const [discoverOpen, setDiscoverOpen]     = useState(false);

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
  // Add to the comparison tray WITHOUT navigating away — build a list from anywhere.
  const addToCompare = (t: string) => {
    const up = t.toUpperCase();
    setCompareTickers((prev) => (prev.includes(up) ? prev : [...prev, up].slice(0, 6)));
  };
  const goFindSimilar = (t: string) => { setRecommendSeed(t.toUpperCase()); navigate("ideas", "fromfund"); };
  const goIdeas = (m: IdeasMode) => navigate("ideas", m);

  // Adapter for the dashboard showcase tour → routes find/recommend into the Discover hub
  const dashNavigate = (t: "news" | "find" | "analysis" | "comparison" | "recommendation" | "discover") => {
    if (t === "discover") { setDiscoverOpen(true); goIdeas("all"); }
    else if (t === "find") goIdeas("find");
    else if (t === "recommendation") goIdeas("fromfund");
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
          width: "100%", display: "flex", alignItems: "center", gap: 10, position: "relative",
          padding: open ? "8px 10px" : "9px 0",
          paddingLeft: open ? (sub ? 22 : 10) : 0,
          justifyContent: open ? "flex-start" : "center",
          borderRadius: 6, cursor: "pointer", border: "none",
          borderLeft: active ? `3px solid ${T.blue}` : "3px solid transparent",
          background: active ? T.blueL : "transparent",
          color: active ? T.blueD : T.dim, transition: "all 0.15s",
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.panel2; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{item.icon}</span>
        {open && (
          <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 400, whiteSpace: "nowrap",
            flex: 1, textAlign: "left", ...ui }}>{item.label}</span>
        )}
        {open && count != null && (
          <span style={{ fontSize: 9, fontWeight: 600, color: "#fff", background: T.blue,
            borderRadius: 99, padding: "1px 6px", ...mono }}>{count}</span>
        )}
        {open && isDiscover && (
          <span style={{ flexShrink: 0, display: "flex", alignItems: "center", color: T.muted,
            transform: discoverOpen ? "rotate(180deg)" : "none", transition: "transform 0.18s" }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        )}
        {!open && count != null && (
          <span style={{ position: "absolute", top: 6, right: 8, width: 7, height: 7,
            borderRadius: "50%", background: T.blue }} />
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
          padding: "6px 10px 6px 40px", borderRadius: 6, cursor: "pointer", border: "none",
          background: on ? T.blueL : "transparent", color: on ? T.blueD : T.dim, transition: "all 0.14s" }}
        onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.panel2; }}
        onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", opacity: 0.85,
          transform: "scale(0.82)" }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: on ? 600 : 400, whiteSpace: "nowrap", ...ui }}>{label}</span>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg }}>

      {/* ── Sidebar ── */}
      <aside style={{
        position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 50, width: sidebarW,
        background: T.panel, borderRight: `1px solid ${T.line}`,
        display: "flex", flexDirection: "column", overflow: "hidden",
        transition: "width 0.2s cubic-bezier(0.4,0,0.2,1)",
      }}>
        <div style={{ height: 60, display: "flex", alignItems: "center", gap: 12,
          borderBottom: `1px solid ${T.line}`, padding: "0 14px", flexShrink: 0 }}>
          <button onClick={() => setOpen((o) => !o)} aria-label="Toggle sidebar"
            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.line2}`,
              background: T.panel, cursor: "pointer", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4, flexShrink: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.panel2)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "var(--c-panel)")}
          >
            <span style={{ width: 12, height: 1.5, background: T.dim, borderRadius: 1 }} />
            <span style={{ width: 12, height: 1.5, background: T.dim, borderRadius: 1 }} />
            <span style={{ width: 12, height: 1.5, background: T.dim, borderRadius: 1 }} />
          </button>
          {open && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden", color: T.text }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif", fontSize: 16, fontWeight: 300, letterSpacing: "0.05em", color: T.text, textTransform: "uppercase", lineHeight: 1, whiteSpace: "nowrap" }}>Lynx</div>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: "0.04em",
                  textTransform: "uppercase", marginTop: 4, ...ui }}>Fund Analytics</div>
              </div>
              <AlphaMark height={18} />
            </div>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
          {open ? (
            GROUPS.map((g) => (
              <div key={g.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 300, color: T.muted, textTransform: "uppercase",
                  letterSpacing: "0.07em", padding: "6px 10px 4px",
                  fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif" }}>{g.title}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {g.items.map((item) => (
                    <React.Fragment key={item.id}>
                      <NavButton item={item} sub />
                      {item.id === "ideas" && discoverOpen && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 1, marginBottom: 2 }}>
                          {DISCOVER_SECTIONS.map((s) => (
                            <DiscoverSubItem key={s.id} id={s.id} label={s.short} icon={s.icon} />
                          ))}
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {GROUPS.map((g, gi) => (
                <React.Fragment key={g.id}>
                  {gi > 0 && <div style={{ height: 1, background: T.line, margin: "6px 8px" }} />}
                  {g.items.map((item) => <NavButton key={item.id} item={item} />)}
                </React.Fragment>
              ))}
            </div>
          )}
        </nav>

        {/* Settings — pinned to the bottom */}
        <div style={{ borderTop: `1px solid ${T.line}`, padding: "8px 8px", flexShrink: 0 }}>
          <NavButton item={{ id: "settings", label: "Settings", icon: IconSettings }} sub={open} />
          {open && (
            <div style={{ padding: "8px 12px 4px" }}>
              <div style={{ fontSize: 9, color: T.muted, ...mono }}>Lynx v1</div>
              <div style={{ fontSize: 9, color: T.muted, lineHeight: 1.4, ...ui }}>Research aid · verify before client use.</div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ marginLeft: sidebarW, flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
        transition: "margin-left 0.2s cubic-bezier(0.4,0,0.2,1)" }}>

        {/* Top bar: page title + tray + workflow switcher */}
        <header style={{ minHeight: 60, display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 14, padding: "0 22px", background: T.panel, borderBottom: `1px solid ${T.line}`,
          flexShrink: 0, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Back / forward — in-app navigation history */}
            <div style={{ display: "flex", gap: 2 }}>
              <button onClick={goBack} disabled={!canBack} title="Back"
                style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.line2}`,
                  background: T.panel, cursor: canBack ? "pointer" : "default", opacity: canBack ? 1 : 0.4,
                  display: "flex", alignItems: "center", justifyContent: "center", color: T.dim }}
                onMouseEnter={(e) => { if (canBack) e.currentTarget.style.background = T.panel2; }}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--c-panel)")}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={goForward} disabled={!canForward} title="Forward"
                style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.line2}`,
                  background: T.panel, cursor: canForward ? "pointer" : "default", opacity: canForward ? 1 : 0.4,
                  display: "flex", alignItems: "center", justifyContent: "center", color: T.dim }}
                onMouseEnter={(e) => { if (canForward) e.currentTarget.style.background = T.panel2; }}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--c-panel)")}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            <h1 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: 0, whiteSpace: "nowrap", ...ui }}>
              {titleFor(tab)}
            </h1>
            {/* Tray indicator — funds queued for comparison from anywhere */}
            {compareTickers.length > 0 && (
              <button onClick={() => switchTab("comparison")} title="Open comparison"
                style={{ display: "flex", alignItems: "center", gap: 6, background: T.blueL,
                  border: `1px solid ${T.blue}55`, borderRadius: 7, padding: "4px 9px", cursor: "pointer" }}>
                <span style={{ fontSize: 8, fontWeight: 600, color: T.blueD, textTransform: "uppercase",
                  letterSpacing: "0.08em", ...ui }}>Tray · {compareTickers.length}</span>
                {compareTickers.map((t) => (
                  <span key={t} style={{ fontSize: 10, fontWeight: 600, color: T.blue, ...mono }}>{t}</span>
                ))}
                <span style={{ fontSize: 11, color: T.blue, marginLeft: 1 }}>→</span>
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Single Advisor Hub CTA — scrolls to the showcase on dashboard */}
            <button
              onClick={() => {
                if (tab !== "dashboard") switchTab("dashboard");
                // Scroll to showcase after a tick so the dashboard panel is visible
                setTimeout(() => {
                  const el = document.getElementById("af-showcase");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }, tab !== "dashboard" ? 120 : 0);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 9, padding: "9px 18px",
                borderRadius: 9, cursor: "pointer",
                background: "var(--c-accent)", color: "var(--c-bg)",
                border: "1px solid var(--c-accentD)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)"; e.currentTarget.style.opacity = "0.88"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)"; e.currentTarget.style.opacity = "1"; }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
              <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", ...ui }}>Advisor Hub</span>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h9M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {/* Brand mark + wordmark, top-right */}
            <div style={{ width: 1, height: 26, background: T.line, margin: "0 2px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.text }}>
              <span style={{
                fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif",
                fontSize: 17, fontWeight: 300, letterSpacing: "0.06em",
                color: T.text, textTransform: "uppercase", lineHeight: 1,
                whiteSpace: "nowrap",
              }}>
                Lynx
              </span>
              <AlphaMark height={22} />
            </div>

            {/* Auth status + logout */}
            {(authMode === "full" || authMode === "preview") && (
              <>
                <div style={{ width: 1, height: 26, background: T.line, margin: "0 2px" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {authMode === "preview" ? (
                    <span style={{ fontSize: 10.5, color: T.amber, background: `${T.amber}18`,
                      border: `1px solid ${T.amber}44`, borderRadius: 5,
                      padding: "3px 8px", fontWeight: 600, ...ui, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      Preview
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: T.dim, ...ui, maxWidth: 160,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {authUser}
                    </span>
                  )}
                  {onLogout && (
                    <button onClick={onLogout}
                      style={{ fontSize: 11, color: T.muted, background: "none",
                        border: `1px solid ${T.line2}`, borderRadius: 5,
                        padding: "4px 10px", cursor: "pointer", ...ui, transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.dim; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.line2; }}>
                      Sign out
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        {/* Content — lazy-mounted, hidden when inactive (state persists) */}
        <main style={{ flex: 1, padding: "28px 28px 40px" }}>
          <div style={{ display: tab === "dashboard" ? "block" : "none" }}>
            <DashboardTab onNavigate={dashNavigate} railOffset={sidebarW} />
          </div>
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
          {/* Watchlist — real feature */}
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
          {/* Analytics group — coming soon placeholders */}
          {tab === "correlation" && (
            <ComingSoonTab spec={{ id: "correlation", label: "Correlation", title: "Correlation Matrix",
              icon: mk(<><path d="M2.5 2.5v11h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="5.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="11.5" cy="5" r="1.2" fill="currentColor"/></>),
              blurb: "Drop in a set of funds and see how correlated they really are — find true diversifiers and spot redundant, overlapping holdings.",
              bullets: ["Color-coded correlation heatmap", "Rolling correlation over time", "Flags near-duplicate holdings", "Surfaces low-correlation diversifiers"] }} />
          )}
          {tab === "peers" && (
            <ComingSoonTab spec={{ id: "peers", label: "Peer Rankings", title: "Peer Rankings",
              icon: mk(<><rect x="2" y="9" width="3" height="5" rx="0.6" stroke="currentColor" strokeWidth="1.3"/><rect x="6.5" y="6" width="3" height="8" rx="0.6" stroke="currentColor" strokeWidth="1.3"/><rect x="11" y="3" width="3" height="11" rx="0.6" stroke="currentColor" strokeWidth="1.3"/></>),
              blurb: "Category leaderboards — see where any fund ranks against its peers on every metric, with percentile tables and top-of-category lists.",
              bullets: ["Category leaderboards by metric", "Percentile rank vs peers", "Top funds per category", "Filter by vehicle & cost"] }} />
          )}
          {/* Roadmap tabs — placeholders */}
          {ROADMAP.filter((r) => r.id === tab).map((r) => (
            <ComingSoonTab key={r.id} spec={r} />
          ))}
        </main>
      </div>
    </div>
  );
}
