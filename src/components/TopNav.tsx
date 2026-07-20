"use client";
import React, { useEffect, useRef, useState } from "react";
import { ui } from "./tokens";
import { useMediaQuery } from "./motion";

// ── ALCA Wealth top navigation ───────────────────────────────────────────────
// A floating, rounded horizontal bar (the app's constant dark chrome) with
// animated mega-menu dropdowns. Purely presentational: every leaf carries an
// onClick supplied by AppShell, so links only ever point at routes that exist.

export interface NavLeaf { label: string; desc?: string; onClick: () => void; active?: boolean }
// A nav entry is either a dropdown (has leaves) or a direct link (has onClick).
export interface NavSection { id: string; label: string; leaves?: NavLeaf[]; onClick?: () => void }

interface TopNavProps {
  sections: NavSection[];
  activeSection: string | null;      // id of the section owning the current tab
  onBrand: () => void;               // → home
  onAbout: () => void;               // → home, scroll to About
  onSearch: () => void;              // → Screen
  onSettings: () => void;            // → Settings
  authMode?: "full" | "preview" | "none" | null;
  authUser?: string | null;
  authWorkspace?: string | null;   // default firm/workspace indicator (legacy)
  accountName?: string | null;     // profile display name for the top-right line
  onLogout?: () => void;
  canBack: boolean; canForward: boolean;
  goBack: () => void; goForward: () => void;
}

const CHROME = "var(--c-chrome)";
const ACCENT = "var(--c-chrome-accent)";
const TXT = "var(--c-chrome-text)";
const DIM = "var(--c-chrome-dim)";
const MUT = "var(--c-chrome-muted)";
const HOVER = "var(--c-chrome-hover)";
const LINE = "var(--c-chrome-line)";

function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="alca-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5EEAD4" />
          <stop offset="100%" stopColor="#0E7490" />
        </linearGradient>
      </defs>
      <rect x="1.2" y="1.2" width="29.6" height="29.6" rx="8" stroke="url(#alca-mark)" strokeWidth="1.4" opacity="0.7" />
      <path d="M8 22L16 8l8 14" stroke="url(#alca-mark)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.4 16.2h9.2" stroke="url(#alca-mark)" strokeWidth="2.1" strokeLinecap="round" />
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
        <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", ...ui }}>ALCA Wealth</span>
        <span style={{ fontSize: 9, fontWeight: 500, color: MUT, letterSpacing: "0.16em", textTransform: "uppercase", ...ui, marginTop: 3 }}>
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
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10.4" y1="10.4" x2="14" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const IconGear = (
  // Standard cog (lucide "settings") — unmistakably Settings, not a theme toggle.
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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

// ── Desktop mega-menu ─────────────────────────────────────────────────────────
// The wrapper starts at the trigger's bottom edge with padding acting as a
// hover bridge, so the cursor can travel from the label into the menu without
// ever leaving the hover area — the menu no longer vanishes mid-crossing.
function MegaMenu({ section, onLeaf }: { section: NavSection; onLeaf: () => void }) {
  return (
    <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
      paddingTop: 10, zIndex: 5 }}>
      <div
        role="menu"
        style={{
          // Solid surface, no backdrop-filter: blurring the animated hero behind
          // the menu forced a full re-blur every frame and made the nav feel laggy.
          position: "relative", minWidth: 340, maxWidth: 460, background: "#13151B",
          border: `1px solid ${LINE}`, borderRadius: 16, padding: 8,
          boxShadow: "0 24px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
          animation: "alca-menu-in 0.15s cubic-bezier(0.16,1,0.3,1)", willChange: "transform, opacity",
        }}
      >
        {/* pointer notch */}
        <span style={{ position: "absolute", top: -6, left: "50%", width: 12, height: 12,
          transform: "translateX(-50%) rotate(45deg)", background: "#13151B",
          borderLeft: `1px solid ${LINE}`, borderTop: `1px solid ${LINE}` }} />
        <div style={{ display: "grid", gridTemplateColumns: (section.leaves?.length ?? 0) > 4 ? "1fr 1fr" : "1fr", gap: 2 }}>
          {(section.leaves ?? []).map((leaf) => (
            <button key={leaf.label} role="menuitem" onClick={() => { leaf.onClick(); onLeaf(); }}
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
                padding: "11px 13px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left",
                background: leaf.active ? "var(--c-chrome-active-bg)" : "transparent",
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
  const { sections, activeSection, onBrand, onAbout, onSearch, onSettings,
    authMode, authUser, accountName, onLogout, canBack, canForward, goBack, goForward } = props;
  const isMobile = useMediaQuery("(max-width: 960px)");
  const [openId, setOpenId] = useState<string | null>(null);
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpenId(null); setMobileOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click outside the nav closes any open menu.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenId(null);
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
    width: 34, height: 34, borderRadius: 9, border: `1px solid rgba(255,255,255,0.14)`,
    background: "transparent", cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", color: DIM, transition: "all 0.15s var(--ease-out)", ...extra,
  });

  return (
    <>
      <style>{`
        @keyframes alca-menu-in { from { opacity: 0; transform: translateX(-50%) translateY(-6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes alca-sheet-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
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
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpenId(null);
          }}
          style={{
            // Near-opaque background instead of a live backdrop blur: the blur was
            // re-sampled every frame over the animated hero and caused visible lag.
            pointerEvents: "auto", margin: "0 auto", maxWidth: 1400,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
            height: 60, padding: "0 12px 0 8px", borderRadius: 18,
            background: scrolled ? "rgba(14,15,19,0.97)" : CHROME,
            border: `1px solid ${scrolled ? "rgba(255,255,255,0.12)" : LINE}`,
            boxShadow: scrolled ? "0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)" : "0 6px 24px rgba(0,0,0,0.3)",
            transform: "translateZ(0)",
            transition: "background 0.3s, border-color 0.3s, box-shadow 0.3s",
          }}>
          {/* Left: brand + history */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Wordmark onClick={onBrand} />
            {!isMobile && (
              <div style={{ display: "flex", gap: 3, marginLeft: 6 }}>
                <button onClick={goBack} disabled={!canBack} aria-label="Back" title="Back"
                  style={ctrlBtn({ opacity: canBack ? 1 : 0.32, cursor: canBack ? "pointer" : "default", width: 30, height: 30 })}
                  onMouseEnter={(e) => { if (canBack) e.currentTarget.style.background = HOVER; }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <IconArrow dir="l" />
                </button>
                <button onClick={goForward} disabled={!canForward} aria-label="Forward" title="Forward"
                  style={ctrlBtn({ opacity: canForward ? 1 : 0.32, cursor: canForward ? "pointer" : "default", width: 30, height: 30 })}
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
                // Direct link — no dropdown, opens the workspace overview.
                if (!s.leaves) {
                  return (
                    <button key={s.id} onClick={s.onClick}
                      onMouseEnter={(e) => { setOpenId(null); e.currentTarget.style.color = TXT; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = isActive ? TXT : DIM; }}
                      style={{ position: "relative", padding: "9px 14px", borderRadius: 10, border: "none",
                        cursor: "pointer", background: "transparent", color: isActive ? TXT : DIM,
                        fontSize: 14, fontWeight: 500, ...ui, transition: "color 0.15s" }}>
                      {s.label}
                      {isActive && <span style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)",
                        width: 5, height: 5, borderRadius: "50%", background: ACCENT }} />}
                    </button>
                  );
                }
                return (
                  <div key={s.id} style={{ position: "relative" }}
                    onMouseEnter={() => openMenu(s.id)}>
                    <button
                      aria-haspopup="menu" aria-expanded={open}
                      onClick={() => setOpenId(open ? null : s.id)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px",
                        borderRadius: 10, border: "none", cursor: "pointer", background: open ? HOVER : "transparent",
                        color: isActive || open ? TXT : DIM, fontSize: 14, fontWeight: 500, ...ui,
                        transition: "all 0.15s var(--ease-out)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = TXT)}
                      onMouseLeave={(e) => { if (!open) e.currentTarget.style.color = isActive ? TXT : DIM; }}>
                      {s.label}
                      <span style={{ color: MUT }}><IconChevron open={open} /></span>
                      {isActive && <span style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)",
                        width: 5, height: 5, borderRadius: "50%", background: ACCENT }} />}
                    </button>
                    {open && <MegaMenu section={s} onLeaf={() => setOpenId(null)} />}
                  </div>
                );
              })}
              <button onClick={onAbout}
                style={{ padding: "9px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: "transparent", color: DIM, fontSize: 14, fontWeight: 500, ...ui, transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = TXT)}
                onMouseLeave={(e) => (e.currentTarget.style.color = DIM)}>
                About
              </button>
            </div>
          )}

          {/* Right: search + account (desktop) / hamburger (mobile) */}
          {!isMobile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <button onClick={onSearch} aria-label="Search funds" title="Search funds"
                style={ctrlBtn()}
                onMouseEnter={(e) => { e.currentTarget.style.background = HOVER; e.currentTarget.style.color = TXT; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = DIM; }}>
                {IconSearch}
              </button>
              <button onClick={onSettings} aria-label="Settings" title="Settings"
                style={ctrlBtn()}
                onMouseEnter={(e) => { e.currentTarget.style.background = HOVER; e.currentTarget.style.color = TXT; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = DIM; }}>
                {IconGear}
              </button>
              {(authMode === "full" || authMode === "preview") && (
                <>
                  <span style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />
                  {authMode === "preview" ? (
                    <span style={{ fontSize: 10, color: "#F59E0B", background: "rgba(245,158,11,0.12)",
                      border: `1px solid rgba(245,158,11,0.35)`, borderRadius: 6, padding: "4px 9px",
                      fontWeight: 600, ...ui, letterSpacing: "0.05em", textTransform: "uppercase" }}>Preview</span>
                  ) : (
                    <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3, maxWidth: 170, textAlign: "right" }}>
                      <span style={{ fontSize: 12, color: DIM, ...ui, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{accountName || authUser}</span>
                      <span style={{ fontSize: 10, color: MUT, ...ui, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Personal Workspace</span>
                    </span>
                  )}
                </>
              )}
              {onLogout && (
                <button onClick={onLogout}
                  style={{ fontSize: 12, color: MUT, background: "none", border: `1px solid rgba(255,255,255,0.16)`,
                    borderRadius: 8, padding: "8px 12px", cursor: "pointer", ...ui, transition: "all 0.15s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = MUT; e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"; }}>
                  Sign out
                </button>
              )}
              {!onLogout && authMode === "none" && (
                <a href="/login"
                  style={{ fontSize: 12.5, fontWeight: 600, color: "#04252E", textDecoration: "none",
                    background: "linear-gradient(135deg, #5EEAD4 0%, #0E7490 100%)",
                    borderRadius: 8, padding: "9px 15px", ...ui }}>
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
        <div style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(6,7,10,0.6)",
          backdropFilter: "blur(4px)" }} onClick={() => setMobileOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", top: 80, left: 14, right: 14, maxHeight: "82vh", overflowY: "auto",
              background: "rgba(16,18,24,0.99)", border: `1px solid ${LINE}`, borderRadius: 18, padding: 14,
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)", animation: "alca-sheet-in 0.22s cubic-bezier(0.16,1,0.3,1)" }}>
            {sections.map((s) => s.leaves ? (
              <div key={s.id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: MUT, ...ui, textTransform: "uppercase",
                  letterSpacing: "0.1em", padding: "6px 8px" }}>{s.label}</div>
                {s.leaves.map((leaf) => (
                  <button key={leaf.label} onClick={() => { leaf.onClick(); setMobileOpen(false); }}
                    style={{ width: "100%", textAlign: "left", padding: "11px 10px", borderRadius: 10, border: "none",
                      cursor: "pointer", background: leaf.active ? "var(--c-chrome-active-bg)" : "transparent",
                      color: leaf.active ? ACCENT : TXT, fontSize: 15, fontWeight: 500, ...ui }}>
                    {leaf.label}
                  </button>
                ))}
              </div>
            ) : (
              <button key={s.id} onClick={() => { s.onClick?.(); setMobileOpen(false); }}
                style={{ width: "100%", textAlign: "left", padding: "12px 10px", borderRadius: 10, border: "none",
                  cursor: "pointer", background: activeSection === s.id ? "var(--c-chrome-active-bg)" : "transparent",
                  color: activeSection === s.id ? ACCENT : TXT, fontSize: 15, fontWeight: 600, ...ui, marginBottom: 4 }}>
                {s.label}
              </button>
            ))}
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
                  border: `1px solid rgba(255,255,255,0.16)`, cursor: "pointer", background: "none",
                  color: MUT, fontSize: 13, ...ui }}>
                Sign out
              </button>
            )}
            {!onLogout && authMode === "none" && (
              <a href="/login"
                style={{ display: "block", marginTop: 8, padding: "12px 0", borderRadius: 10, textAlign: "center",
                  background: "linear-gradient(135deg, #5EEAD4 0%, #0E7490 100%)", color: "#04252E",
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
