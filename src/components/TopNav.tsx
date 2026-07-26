"use client";
import React, { useEffect, useRef, useState } from "react";
import { ui } from "./tokens";
import { useMediaQuery } from "./motion";

// ── ALCA Wealth top navigation ───────────────────────────────────────────────
// A floating, rounded horizontal bar in the platform's LIGHT chrome (white
// surface, dark text, blue accent) with animated mega-menu dropdowns. Purely
// presentational: every leaf carries an onClick supplied by AppShell, so links
// only ever point at routes that exist.

export interface NavLeaf { label: string; desc?: string; onClick: () => void; active?: boolean }
// A nav entry is either a dropdown (has leaves) or a direct link (has onClick).
export interface NavSection { id: string; label: string; leaves?: NavLeaf[]; onClick?: () => void }

interface TopNavProps {
  sections: NavSection[];
  utilitySection?: NavSection;       // secondary "Tools" menu (NOT primary nav)
  activeSection: string | null;      // id of the section owning the current tab
  onBrand: () => void;               // → home
  onAbout: () => void;               // → home, scroll to About
  onSearch: () => void;              // → Screen
  onSettings: () => void;            // → Settings
  onAlerts?: () => void;             // → Alerts tab (bell)
  unreadCount?: number | null;       // unread alert count for the bell badge
  authMode?: "full" | "preview" | "none" | null;
  authUser?: string | null;
  authWorkspace?: string | null;   // default firm/workspace indicator (legacy)
  accountName?: string | null;     // profile display name for the top-right line
  onLogout?: () => void;
  canBack: boolean; canForward: boolean;
  goBack: () => void; goForward: () => void;
}

// Light chrome palette.
const LINE = "#E6EAF1";
const TXT = "#101828";
const DIM = "#5B6472";
const MUT = "#98A2B3";
const HOVER = "rgba(16,24,40,0.05)";
const ACCENT = "#2563EB";

function BrandMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#0B0D12" />
      <path d="M9.5 21.5L16 9.5l6.5 12" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.4 16.6h7.2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Wordmark({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="ALCA Wealth home"
      style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none",
        cursor: "pointer", padding: "4px 6px", borderRadius: 8 }}>
      <BrandMark />
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1, textAlign: "left" }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: TXT, letterSpacing: "-0.01em", ...ui }}>ALCA Wealth</span>
        <span style={{ fontSize: 8.5, fontWeight: 600, color: MUT, letterSpacing: "0.18em", textTransform: "uppercase", ...ui, marginTop: 3 }}>
          Advisor OS
        </span>
      </span>
    </button>
  );
}

const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none"
    style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s var(--ease-out)" }}>
    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconSearch = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10.4" y1="10.4" x2="14" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const IconBell = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2.6a3.6 3.6 0 0 1 3.6 3.6c0 2.8 1.1 3.6 1.1 3.6H3.3s1.1-.8 1.1-3.6A3.6 3.6 0 0 1 8 2.6zM6.8 12.6a1.3 1.3 0 0 0 2.4 0" />
  </svg>
);
const IconGear = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconArrow = ({ dir }: { dir: "l" | "r" }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d={dir === "l" ? "M10 3.5L5.5 8l4.5 4.5" : "M6 3.5L10.5 8 6 12.5"}
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function initialsOf(name?: string | null, email?: string | null): string {
  const n = name?.trim();
  if (n) {
    const parts = n.split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return (email?.[0] ?? "A").toUpperCase();
}

// ── Desktop mega-menu (light surface) ─────────────────────────────────────────
function MegaMenu({ section, onLeaf }: { section: NavSection; onLeaf: () => void }) {
  return (
    <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
      paddingTop: 10, zIndex: 5 }}>
      <div
        role="menu"
        style={{
          position: "relative", minWidth: 340, maxWidth: 460, background: "#FFFFFF",
          border: `1px solid ${LINE}`, borderRadius: 16, padding: 8,
          boxShadow: "0 24px 60px rgba(16,24,40,0.16), 0 4px 12px rgba(16,24,40,0.06)",
          animation: "alca-menu-in 0.15s cubic-bezier(0.16,1,0.3,1)", willChange: "transform, opacity",
        }}
      >
        {/* pointer notch */}
        <span style={{ position: "absolute", top: -6, left: "50%", width: 12, height: 12,
          transform: "translateX(-50%) rotate(45deg)", background: "#FFFFFF",
          borderLeft: `1px solid ${LINE}`, borderTop: `1px solid ${LINE}` }} />
        <div style={{ display: "grid", gridTemplateColumns: (section.leaves?.length ?? 0) > 4 ? "1fr 1fr" : "1fr", gap: 2 }}>
          {(section.leaves ?? []).map((leaf) => (
            <button key={leaf.label} role="menuitem" onClick={() => { leaf.onClick(); onLeaf(); }}
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
                padding: "11px 13px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left",
                background: leaf.active ? "rgba(37,99,235,0.07)" : "transparent",
                transition: "background 0.14s var(--ease-out)" }}
              onMouseEnter={(e) => { if (!leaf.active) e.currentTarget.style.background = HOVER; }}
              onMouseLeave={(e) => { if (!leaf.active) e.currentTarget.style.background = "transparent"; }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: leaf.active ? ACCENT : TXT, ...ui }}>{leaf.label}</span>
              {leaf.desc && <span style={{ fontSize: 11.5, color: MUT, ...ui, lineHeight: 1.45 }}>{leaf.desc}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TopNav(props: TopNavProps) {
  const { sections, utilitySection, activeSection, onBrand, onAbout, onSearch, onSettings, onAlerts, unreadCount,
    authMode, authUser, accountName, onLogout, canBack, canForward, goBack, goForward } = props;
  const isMobile = useMediaQuery("(max-width: 960px)");
  const compact = useMediaQuery("(max-width: 1280px)");
  const [openId, setOpenId] = useState<string | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpenId(null); setMobileOpen(false); setAcctOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside the nav closes any open menu.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) { setOpenId(null); setAcctOpen(false); }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  // lock body scroll while the mobile sheet is open
  useEffect(() => {
    if (mobileOpen) { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }
  }, [mobileOpen]);

  const openMenu = (id: string) => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpenId(id); };
  // Short close delay (~200ms): starts when the cursor leaves the nav, cancelled
  // the moment it re-enters the trigger or the open menu.
  const scheduleClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpenId(null), 200); };

  const ctrlBtn = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: 34, height: 34, borderRadius: 9, border: `1px solid ${LINE}`,
    background: "transparent", cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", color: DIM, transition: "all 0.15s var(--ease-out)", ...extra,
  });

  const badge = unreadCount && unreadCount > 0 ? (unreadCount > 9 ? "9+" : String(unreadCount)) : null;

  return (
    <>
      <style>{`
        @keyframes alca-menu-in { from { opacity: 0; transform: translateX(-50%) translateY(-6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes alca-sheet-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes alca-acct-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Fixed floating bar */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: isMobile ? "10px 14px" : "14px 22px", pointerEvents: "none" }}>
        <nav
          ref={navRef}
          onMouseLeave={scheduleClose}
          onMouseEnter={() => { if (closeTimer.current) clearTimeout(closeTimer.current); }}
          onBlurCapture={(e) => {
            // Close when keyboard focus leaves the nav entirely.
            if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOpenId(null); setAcctOpen(false); }
          }}
          style={{
            pointerEvents: "auto", margin: "0 auto", maxWidth: 1400,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
            height: 60, padding: "0 10px 0 8px", borderRadius: 18,
            background: scrolled ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.92)",
            backdropFilter: "blur(10px)",
            border: `1px solid ${LINE}`,
            boxShadow: scrolled ? "0 12px 36px rgba(16,24,40,0.12), 0 2px 8px rgba(16,24,40,0.05)" : "0 6px 22px rgba(16,24,40,0.07)",
            transform: "translateZ(0)",
            transition: "background 0.3s, border-color 0.3s, box-shadow 0.3s",
          }}>
          {/* Left: brand + history */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Wordmark onClick={onBrand} />
            {!isMobile && (
              <div style={{ display: "flex", gap: 3, marginLeft: 4 }}>
                <button onClick={goBack} disabled={!canBack} aria-label="Back" title="Back"
                  style={ctrlBtn({ opacity: canBack ? 1 : 0.35, cursor: canBack ? "pointer" : "default", width: 30, height: 30, border: "none" })}
                  onMouseEnter={(e) => { if (canBack) e.currentTarget.style.background = HOVER; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <IconArrow dir="l" />
                </button>
                <button onClick={goForward} disabled={!canForward} aria-label="Forward" title="Forward"
                  style={ctrlBtn({ opacity: canForward ? 1 : 0.35, cursor: canForward ? "pointer" : "default", width: 30, height: 30, border: "none" })}
                  onMouseEnter={(e) => { if (canForward) e.currentTarget.style.background = HOVER; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <IconArrow dir="r" />
                </button>
              </div>
            )}
          </div>

          {/* Center: primary menu (desktop) */}
          {!isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {sections.map((s) => {
                const open = openId === s.id;
                const isActive = activeSection === s.id;
                const underline = isActive && (
                  <span style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)",
                    width: 20, height: 2.5, borderRadius: 2, background: ACCENT }} />
                );
                // Direct link — no dropdown, opens the workspace overview.
                if (!s.leaves) {
                  return (
                    <button key={s.id} onClick={s.onClick}
                      onMouseEnter={(e) => { setOpenId(null); e.currentTarget.style.color = TXT; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = isActive ? TXT : DIM; }}
                      style={{ position: "relative", padding: "9px 13px", borderRadius: 10, border: "none",
                        cursor: "pointer", background: "transparent", color: isActive ? TXT : DIM,
                        fontSize: 13.5, fontWeight: isActive ? 600 : 500, ...ui, transition: "color 0.15s" }}>
                      {s.label}
                      {underline}
                    </button>
                  );
                }
                return (
                  <div key={s.id} style={{ position: "relative" }}
                    onMouseEnter={() => openMenu(s.id)}>
                    <button
                      aria-haspopup="menu" aria-expanded={open}
                      onClick={() => setOpenId(open ? null : s.id)}
                      style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "9px 13px",
                        borderRadius: 10, border: "none", cursor: "pointer", background: open ? HOVER : "transparent",
                        color: isActive || open ? TXT : DIM, fontSize: 13.5, fontWeight: isActive ? 600 : 500, ...ui,
                        transition: "all 0.15s var(--ease-out)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = TXT)}
                      onMouseLeave={(e) => { if (!open) e.currentTarget.style.color = isActive ? TXT : DIM; }}>
                      {s.label}
                      <span style={{ color: MUT }}><IconChevron open={open} /></span>
                      {underline}
                    </button>
                    {open && <MegaMenu section={s} onLeaf={() => setOpenId(null)} />}
                  </div>
                );
              })}
              <button onClick={onAbout}
                style={{ padding: "9px 13px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: "transparent", color: DIM, fontSize: 13.5, fontWeight: 500, ...ui, transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = TXT)}
                onMouseLeave={(e) => (e.currentTarget.style.color = DIM)}>
                About ALCA
              </button>
            </div>
          )}

          {/* Right: tools + search + bell + account (desktop) / hamburger (mobile) */}
          {!isMobile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {/* Secondary "Tools" utility menu — deliberately NOT a primary nav item. */}
              {utilitySection && utilitySection.leaves && (
                <div style={{ position: "relative" }}
                  onMouseEnter={() => openMenu(utilitySection.id)}>
                  <button
                    aria-haspopup="menu" aria-expanded={openId === utilitySection.id}
                    onClick={() => setOpenId(openId === utilitySection.id ? null : utilitySection.id)}
                    style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 11px",
                      borderRadius: 9, border: `1px solid ${LINE}`, cursor: "pointer",
                      background: openId === utilitySection.id ? HOVER : "transparent",
                      color: openId === utilitySection.id ? TXT : DIM, fontSize: 13, fontWeight: 500, ...ui,
                      transition: "all 0.15s var(--ease-out)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = TXT)}
                    onMouseLeave={(e) => { if (openId !== utilitySection.id) e.currentTarget.style.color = DIM; }}>
                    {utilitySection.label}
                    <span style={{ color: MUT }}><IconChevron open={openId === utilitySection.id} /></span>
                  </button>
                  {openId === utilitySection.id && (
                    <div style={{ position: "absolute", top: "100%", right: 0, paddingTop: 10, zIndex: 5 }}>
                      <div role="menu" style={{ position: "relative", minWidth: 340, maxWidth: 460,
                        background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 16, padding: 8,
                        boxShadow: "0 24px 60px rgba(16,24,40,0.16), 0 4px 12px rgba(16,24,40,0.06)",
                        animation: "alca-menu-in 0.15s cubic-bezier(0.16,1,0.3,1)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: (utilitySection.leaves.length > 4 ? "1fr 1fr" : "1fr"), gap: 2 }}>
                          {utilitySection.leaves.map((leaf) => (
                            <button key={leaf.label} role="menuitem" onClick={() => { leaf.onClick(); setOpenId(null); }}
                              style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
                                padding: "11px 13px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left",
                                background: leaf.active ? "rgba(37,99,235,0.07)" : "transparent",
                                transition: "background 0.14s var(--ease-out)" }}
                              onMouseEnter={(e) => { if (!leaf.active) e.currentTarget.style.background = HOVER; }}
                              onMouseLeave={(e) => { if (!leaf.active) e.currentTarget.style.background = "transparent"; }}>
                              <span style={{ fontSize: 13.5, fontWeight: 600, color: leaf.active ? ACCENT : TXT, ...ui }}>{leaf.label}</span>
                              {leaf.desc && <span style={{ fontSize: 11.5, color: MUT, ...ui, lineHeight: 1.45 }}>{leaf.desc}</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {compact ? (
                <button onClick={onSearch} aria-label="Search funds" title="Search funds"
                  style={ctrlBtn()}
                  onMouseEnter={(e) => { e.currentTarget.style.background = HOVER; e.currentTarget.style.color = TXT; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = DIM; }}>
                  {IconSearch}
                </button>
              ) : (
                <button onClick={onSearch} aria-label="Search funds"
                  style={{ display: "flex", alignItems: "center", gap: 9, width: 220, height: 36, padding: "0 13px",
                    borderRadius: 10, border: `1px solid ${LINE}`, background: "#F5F7FA", cursor: "text",
                    color: MUT, transition: "border-color 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#C9D2E0")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = LINE)}>
                  {IconSearch}
                  <span style={{ fontSize: 12, ...ui }}>Search funds, reports…</span>
                </button>
              )}
              {onAlerts && (
                <button onClick={onAlerts} aria-label={badge ? `Alerts — ${badge} unread` : "Alerts"} title="Alerts"
                  style={ctrlBtn({ position: "relative" })}
                  onMouseEnter={(e) => { e.currentTarget.style.background = HOVER; e.currentTarget.style.color = TXT; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = DIM; }}>
                  {IconBell}
                  {badge && (
                    <span style={{ position: "absolute", top: -5, right: -5, minWidth: 16, height: 16, padding: "0 4px",
                      borderRadius: 999, background: "#EF4444", color: "#fff", fontSize: 9.5, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center", ...ui, border: "2px solid #fff" }}>{badge}</span>
                  )}
                </button>
              )}
              {(authMode === "full" || authMode === "preview") && (
                <>
                  <span style={{ width: 1, height: 24, background: LINE }} />
                  {authMode === "preview" ? (
                    <span style={{ fontSize: 10, color: "#B45309", background: "rgba(245,158,11,0.1)",
                      border: `1px solid rgba(245,158,11,0.35)`, borderRadius: 6, padding: "4px 9px",
                      fontWeight: 600, ...ui, letterSpacing: "0.05em", textTransform: "uppercase" }}>Preview</span>
                  ) : (
                    <div style={{ position: "relative" }}>
                      <button onClick={() => setAcctOpen((o) => !o)} aria-haspopup="menu" aria-expanded={acctOpen}
                        style={{ display: "flex", alignItems: "center", gap: 9, background: acctOpen ? HOVER : "none",
                          border: "none", cursor: "pointer", padding: "5px 8px", borderRadius: 10, transition: "background 0.15s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = HOVER)}
                        onMouseLeave={(e) => { if (!acctOpen) e.currentTarget.style.background = "none"; }}>
                        <span style={{ width: 30, height: 30, borderRadius: "50%", background: "#E7EEFB", color: ACCENT,
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, ...ui }}>
                          {initialsOf(accountName, authUser)}
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3, maxWidth: 150, textAlign: "left" }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: TXT, ...ui, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{accountName || authUser}</span>
                          <span style={{ fontSize: 10, color: MUT, ...ui, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Personal Workspace</span>
                        </span>
                        <span style={{ color: MUT }}><IconChevron open={acctOpen} /></span>
                      </button>
                      {acctOpen && (
                        <div role="menu" style={{ position: "absolute", top: "calc(100% + 10px)", right: 0, minWidth: 180,
                          background: "#fff", border: `1px solid ${LINE}`, borderRadius: 13, padding: 6,
                          boxShadow: "0 20px 50px rgba(16,24,40,0.16), 0 4px 12px rgba(16,24,40,0.06)",
                          animation: "alca-acct-in 0.14s cubic-bezier(0.16,1,0.3,1)" }}>
                          <button role="menuitem" onClick={() => { setAcctOpen(false); onSettings(); }}
                            style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 11px",
                              borderRadius: 9, border: "none", cursor: "pointer", background: "none", color: TXT,
                              fontSize: 12.5, fontWeight: 500, ...ui, textAlign: "left" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = HOVER)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                            <span style={{ color: DIM, display: "flex" }}>{IconGear}</span>Settings
                          </button>
                          {onLogout && (
                            <button role="menuitem" onClick={() => { setAcctOpen(false); onLogout(); }}
                              style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 11px",
                                borderRadius: 9, border: "none", cursor: "pointer", background: "none", color: "#B42318",
                                fontSize: 12.5, fontWeight: 500, ...ui, textAlign: "left" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(180,35,24,0.06)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 14H3.5V2H6M10.5 11l3-3-3-3M13.5 8H6.5" />
                              </svg>
                              Sign out
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {authMode === "preview" && onLogout && (
                    <button onClick={onLogout}
                      style={{ fontSize: 12, color: DIM, background: "none", border: `1px solid ${LINE}`,
                        borderRadius: 8, padding: "8px 12px", cursor: "pointer", ...ui, transition: "all 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = TXT; e.currentTarget.style.borderColor = "#C9D2E0"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = DIM; e.currentTarget.style.borderColor = LINE; }}>
                      Sign out
                    </button>
                  )}
                </>
              )}
              {authMode === "none" && (
                <a href="/login"
                  style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", textDecoration: "none",
                    background: ACCENT, borderRadius: 9, padding: "9px 16px", ...ui }}>
                  Sign in
                </a>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={onSearch} aria-label="Search funds" style={ctrlBtn()}>{IconSearch}</button>
              <button onClick={() => setMobileOpen((o) => !o)} aria-label="Menu" aria-expanded={mobileOpen}
                style={ctrlBtn({ flexDirection: "column", gap: 4 })}>
                <span style={{ width: 15, height: 1.6, background: DIM, borderRadius: 1, transition: "transform 0.2s",
                  transform: mobileOpen ? "translateY(5.6px) rotate(45deg)" : "none" }} />
                <span style={{ width: 15, height: 1.6, background: DIM, borderRadius: 1, opacity: mobileOpen ? 0 : 1, transition: "opacity 0.2s" }} />
                <span style={{ width: 15, height: 1.6, background: DIM, borderRadius: 1, transition: "transform 0.2s",
                  transform: mobileOpen ? "translateY(-5.6px) rotate(-45deg)" : "none" }} />
              </button>
            </div>
          )}
        </nav>
      </header>

      {/* Mobile sheet */}
      {isMobile && mobileOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(16,24,40,0.32)",
          backdropFilter: "blur(4px)" }} onClick={() => setMobileOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", top: 80, left: 14, right: 14, maxHeight: "82vh", overflowY: "auto",
              background: "#FFFFFF", border: `1px solid ${LINE}`, borderRadius: 18, padding: 14,
              boxShadow: "0 24px 60px rgba(16,24,40,0.22)", animation: "alca-sheet-in 0.22s cubic-bezier(0.16,1,0.3,1)" }}>
            {sections.map((s) => s.leaves ? (
              <div key={s.id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: MUT, ...ui, textTransform: "uppercase",
                  letterSpacing: "0.1em", padding: "6px 8px" }}>{s.label}</div>
                {s.leaves.map((leaf) => (
                  <button key={leaf.label} onClick={() => { leaf.onClick(); setMobileOpen(false); }}
                    style={{ width: "100%", textAlign: "left", padding: "11px 10px", borderRadius: 10, border: "none",
                      cursor: "pointer", background: leaf.active ? "rgba(37,99,235,0.07)" : "transparent",
                      color: leaf.active ? ACCENT : TXT, fontSize: 15, fontWeight: 500, ...ui }}>
                    {leaf.label}
                  </button>
                ))}
              </div>
            ) : (
              <button key={s.id} onClick={() => { s.onClick?.(); setMobileOpen(false); }}
                style={{ width: "100%", textAlign: "left", padding: "12px 10px", borderRadius: 10, border: "none",
                  cursor: "pointer", background: activeSection === s.id ? "rgba(37,99,235,0.07)" : "transparent",
                  color: activeSection === s.id ? ACCENT : TXT, fontSize: 15, fontWeight: 600, ...ui, marginBottom: 4 }}>
                {s.label}
              </button>
            ))}
            {utilitySection?.leaves && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: MUT, ...ui, textTransform: "uppercase",
                  letterSpacing: "0.1em", padding: "6px 8px" }}>{utilitySection.label}</div>
                {utilitySection.leaves.map((leaf) => (
                  <button key={leaf.label} onClick={() => { leaf.onClick(); setMobileOpen(false); }}
                    style={{ width: "100%", textAlign: "left", padding: "11px 10px", borderRadius: 10, border: "none",
                      cursor: "pointer", background: leaf.active ? "rgba(37,99,235,0.07)" : "transparent",
                      color: leaf.active ? ACCENT : TXT, fontSize: 15, fontWeight: 500, ...ui }}>
                    {leaf.label}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => { onAbout(); setMobileOpen(false); }}
              style={{ width: "100%", textAlign: "left", padding: "11px 10px", borderRadius: 10, border: "none",
                cursor: "pointer", background: "transparent", color: TXT, fontSize: 15, fontWeight: 500, ...ui }}>
              About
            </button>
            <button onClick={() => { onSettings(); setMobileOpen(false); }}
              style={{ width: "100%", textAlign: "left", padding: "11px 10px", borderRadius: 10, border: "none",
                cursor: "pointer", background: "transparent", color: TXT, fontSize: 15, fontWeight: 500, ...ui }}>
              Settings
            </button>
            {onLogout && (
              <button onClick={() => { onLogout(); setMobileOpen(false); }}
                style={{ width: "100%", marginTop: 8, padding: "11px 0", borderRadius: 10,
                  border: `1px solid ${LINE}`, cursor: "pointer", background: "none",
                  color: DIM, fontSize: 13, ...ui }}>
                Sign out
              </button>
            )}
            {!onLogout && authMode === "none" && (
              <a href="/login"
                style={{ display: "block", marginTop: 8, padding: "12px 0", borderRadius: 10, textAlign: "center",
                  background: ACCENT, color: "#fff",
                  fontSize: 14, fontWeight: 700, textDecoration: "none", ...ui }}>
                Sign in
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
