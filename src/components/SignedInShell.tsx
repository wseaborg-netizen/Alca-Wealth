"use client";
import React, { useState } from "react";
import { ui, mono } from "./tokens";
import { useMediaQuery } from "./motion";
import { UTILITY_NAV } from "./navModel";

/**
 * Shared signed-in application shell — the ONE authenticated chrome.
 *
 * Wraps EVERY authenticated route (Overview and every other tab) in a consistent
 * left sidebar + top navigation + search / notifications / profile, over the
 * light blue-gray surface. Individual page content renders as `children`; this
 * component never redesigns that content. The ALCA Wealth logo returns to the
 * signed-in Overview (never the Public Homepage). The old floating TopNav is not
 * used by any authenticated route.
 */

// Shared Overview design-system palette (exported so pages match the shell).
export const C = {
  bg: "#F5F8FD", panel: "#FFFFFF", ink: "#0F1B33", dim: "#475467", mute: "#7A879C",
  line: "#E6ECF5", line2: "#DCE4F0", blue: "#2563EB", blueSoft: "#EAF1FE",
  green: "#059669", red: "#DC2626", amber: "#B45309", sky: "#EAF3FC",
};

// Sidebar = the main destinations only (Overview / Monitor / Research / Markets
// live in the TOP nav and are never repeated here). "__settings" opens the modal.
const SIDEBAR: { label: string; dest: string; icon: string; badgeKey?: "attention" }[] = [
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
  { label: "Markets", dest: "watchlist" },
];
// Which sidebar label is active for a given app tab.
const SIDE_ACTIVE: Record<string, string> = {
  dashboard: "Overview", alerts: "Attention", firmfunds: "Firm Funds", watchlist: "Watchlist",
  analysis: "Analytics", reviews: "Reviews", research: "Discover", ideas: "Discover", comparison: "Discover",
};
const TOP_ACTIVE: Record<string, string> = { dashboard: "Overview", firmfunds: "Monitor", research: "Research", watchlist: "Markets" };

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

function Logo({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="ALCA Wealth — Overview"
      style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: "2px 4px 18px" }}>
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden><path d="M8 24L16 6l8 18" stroke={C.blue} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /><path d="M11.5 18h9" stroke={C.blue} strokeWidth="2.2" strokeLinecap="round" /></svg>
      {!collapsed && <span style={{ fontSize: 16, fontWeight: 700, color: C.ink, ...ui, letterSpacing: "-0.01em" }}>ALCA Wealth</span>}
    </button>
  );
}

function Sidebar({ active, go, onSettings, onOverview, attention, collapsed }: {
  active: string | null; go: (d: string) => void; onSettings: () => void; onOverview: () => void; attention: number; collapsed: boolean;
}) {
  return (
    <aside aria-label="Primary" style={{ width: collapsed ? 64 : 208, flexShrink: 0, borderRight: `1px solid ${C.line}`, background: C.panel,
      position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column", padding: collapsed ? "18px 10px" : "18px 14px", boxSizing: "border-box" }}>
      <Logo collapsed={collapsed} onClick={onOverview} />
      <nav aria-label="Sections" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {SIDEBAR.map((s) => {
          const isActive = active === s.label;
          return (
            <button key={s.label} onClick={() => (s.dest === "__settings" ? onSettings() : go(s.dest))} aria-current={isActive ? "page" : undefined}
              style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: collapsed ? "10px" : "10px 12px",
                justifyContent: collapsed ? "center" : "flex-start", borderRadius: 9, border: "none", cursor: "pointer",
                background: isActive ? C.blueSoft : "transparent", color: isActive ? C.blue : C.dim, ...ui, fontSize: 13.5, fontWeight: isActive ? 600 : 500 }}>
              <Ico n={s.icon} s={18} c={isActive ? C.blue : C.mute} />
              {!collapsed && <span style={{ flex: 1, textAlign: "left" }}>{s.label}</span>}
              {!collapsed && s.badgeKey === "attention" && attention > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 700, ...mono, color: "#fff", background: C.red, borderRadius: 999, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{attention}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Secondary Tools — preserves access to Portfolio, Model, Expansion, Saved
          Lists and the other utility destinations within the shell (no lost routes). */}
      <div style={{ marginTop: 16 }}>
        {!collapsed && <div style={{ ...ui, fontSize: 10, fontWeight: 700, color: C.mute, textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 12px 6px" }}>Tools</div>}
        <nav aria-label="Tools" style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: collapsed ? "none" : 210, overflowY: "auto" }}>
          {UTILITY_NAV.map((n) => (
            <button key={n.id} onClick={() => go(n.id)} title={n.desc}
              style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: collapsed ? "8px" : "7px 12px",
                justifyContent: collapsed ? "center" : "flex-start", borderRadius: 8, border: "none", cursor: "pointer",
                background: "transparent", color: C.dim, ...ui, fontSize: 12.5, fontWeight: 500 }}>
              {collapsed ? <span style={{ width: 6, height: 6, borderRadius: 999, background: C.mute }} /> : <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.label}</span>}
            </button>
          ))}
        </nav>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 14 }}>
        {!collapsed && <div style={{ fontSize: 11, color: C.mute, ...ui, lineHeight: 1.5 }}>Built for advisory teams.</div>}
      </div>
    </aside>
  );
}

function TopBar({ activeTop, go, onSearch, onNotifications, onSettings, onLogout, accountName, unread, isMobile, onMenu }: {
  activeTop: string | null; go: (d: string) => void; onSearch: () => void; onNotifications: () => void;
  onSettings: () => void; onLogout?: () => void;
  accountName: string | null; unread: number; isMobile: boolean; onMenu: () => void;
}) {
  const [acct, setAcct] = useState(false);
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
          {TOP_TABS.map((t) => {
            const isActive = activeTop === t.label;
            return (
              <button key={t.label} onClick={() => go(t.dest)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 2px", ...ui, fontSize: 14, whiteSpace: "nowrap",
                  fontWeight: isActive ? 600 : 500, color: isActive ? C.ink : C.dim, borderBottom: `2px solid ${isActive ? C.blue : "transparent"}` }}>{t.label}</button>
            );
          })}
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
        <div style={{ position: "relative" }}>
          <button aria-label="Account" aria-haspopup="menu" aria-expanded={acct} onClick={() => setAcct((o) => !o)}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.panel, border: `1px solid ${C.line2}`, borderRadius: 999, padding: "4px 8px 4px 4px", cursor: "pointer" }}>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: C.blue, color: "#fff", ...ui, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {(accountName ?? "You").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            {!isMobile && <span style={{ ...ui, fontSize: 12.5, fontWeight: 600, color: C.ink, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{accountName ?? "Account"}</span>}
            <Ico n="chevron" s={13} c={C.mute} />
          </button>
          {acct && (
            <>
              <div onClick={() => setAcct(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
              <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 31, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(16,24,40,0.14)", minWidth: 150, padding: 5 }}>
                <button role="menuitem" onClick={() => { setAcct(false); onSettings(); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 11px", border: "none", background: "none", cursor: "pointer", ...ui, fontSize: 13, color: C.ink, borderRadius: 7 }}>Settings</button>
                {onLogout && <button role="menuitem" onClick={() => { setAcct(false); onLogout(); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 11px", border: "none", background: "none", cursor: "pointer", ...ui, fontSize: 13, color: C.red, borderRadius: 7 }}>Sign out</button>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SignedInShell({ activeTab, go, onSearch, onNotifications, onSettings, onLogout, accountName, unread, attention, children }: {
  activeTab: string;
  go: (dest: string) => void;
  onSearch: () => void;
  onNotifications: () => void;
  onSettings: () => void;
  onLogout?: () => void;
  accountName: string | null;
  unread: number;
  attention: number;
  children: React.ReactNode;
}) {
  const isMobile = useMediaQuery("(max-width: 720px)");
  const isTablet = useMediaQuery("(max-width: 1080px)");
  const [mobileNav, setMobileNav] = useState(false);
  const overview = () => go("dashboard");
  const sideActive = SIDE_ACTIVE[activeTab] ?? null;
  const topActive = TOP_ACTIVE[activeTab] ?? null;
  // The Overview owns a full-bleed mountain hero; other pages get a padded container.
  const padded = activeTab !== "dashboard";

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", ...ui }}>
      {!isMobile && <Sidebar active={sideActive} go={go} onSettings={onSettings} onOverview={overview} attention={attention} collapsed={isTablet} />}

      {isMobile && mobileNav && (
        <div onClick={() => setMobileNav(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,27,51,0.4)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 232, height: "100%", background: C.panel }}>
            <Sidebar active={sideActive} go={(d) => { setMobileNav(false); go(d); }} onSettings={() => { setMobileNav(false); onSettings(); }} onOverview={() => { setMobileNav(false); overview(); }} attention={attention} collapsed={false} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar activeTop={topActive} go={go} onSearch={onSearch} onNotifications={onNotifications} onSettings={onSettings} onLogout={onLogout}
          accountName={accountName} unread={unread} isMobile={isMobile} onMenu={() => setMobileNav(true)} />
        <main style={{ flex: 1, minWidth: 0, padding: padded ? (isMobile ? "20px 16px 48px" : "24px clamp(18px,2.6vw,28px) 56px") : 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
