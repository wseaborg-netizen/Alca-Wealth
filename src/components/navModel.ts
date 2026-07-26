/**
 * Phase 2 navigation model — the single source of truth for the authenticated
 * product shell's navigation structure. Pure data (no React, no side effects) so
 * it can be asserted directly in tests and consumed by AppShell/TopNav.
 *
 * PRIMARY navigation is exactly four destinations: Home, Firm Funds, Discover,
 * Reviews. The contextual fund workspace (fund detail / Analyze) is intentionally
 * NOT primary — it is reached contextually from within Discover and other tools.
 * Models and Portfolios are preserved but demoted to the secondary Tools menu.
 */

/** Stable ids for the four primary nav destinations. */
export type PrimaryNavId = "home" | "firmfunds" | "discover" | "reviews";

export interface NavItem {
  id: string;
  label: string;
  /** One-line description (used by the secondary Tools menu). */
  desc?: string;
}

/** The four — and only four — primary navigation destinations. */
export const PRIMARY_NAV: readonly (NavItem & { id: PrimaryNavId })[] = [
  { id: "home",      label: "Home" },
  { id: "firmfunds", label: "Firm Funds" },
  { id: "discover",  label: "Discover" },
  { id: "reviews",   label: "Reviews" },
] as const;

/**
 * Discover's internal sections — the consolidated discovery tools. These reuse
 * the existing engines (screener + equity style box + shortlist, similar-to-
 * ticker, comparison, fund analysis, watchlist); nothing is reimplemented.
 */
export const DISCOVER_SECTIONS: readonly NavItem[] = [
  { id: "overview",  label: "Overview" },
  { id: "find",      label: "Find Funds" },   // ScreenTab: screener + equity style box + shortlist
  { id: "compare",   label: "Compare" },      // CompareTab
  { id: "analyze",   label: "Analyze" },      // AnalysisTab (contextual fund workspace)
  { id: "watchlist", label: "Watchlist" },
] as const;

/**
 * Secondary "Tools" menu — utility destinations that are preserved but are NOT
 * primary navigation. Portfolio and Model live here after the Phase 2 nav
 * restructure (their routes/code are unchanged).
 */
export const UTILITY_NAV: readonly NavItem[] = [
  { id: "workspace",   label: "Portfolio",    desc: "Build & diagnose allocations" },
  { id: "model",       label: "Model",        desc: "Scenario & projection analysis" },
  { id: "expansion",   label: "Expansion",    desc: "Add funds to Alca's universe" },
  { id: "lists",       label: "Saved Lists",  desc: "Commonly used funds & watchlists" },
  { id: "correlation", label: "Correlation",  desc: "Find true diversifiers" },
  { id: "peers",       label: "Peer Rankings", desc: "Category leaderboards" },
  { id: "backtest",    label: "Backtest",     desc: "Historical what-if" },
  { id: "tax",         label: "Tax Center",   desc: "Tax-aware fund analysis" },
  { id: "alerts",      label: "Alerts",       desc: "Threshold notifications" },
  { id: "assistant",   label: "AI Assistant", desc: "Ask the fund universe" },
] as const;

/** Convenience: the primary nav labels, in order. */
export const PRIMARY_NAV_LABELS = PRIMARY_NAV.map((n) => n.label);
