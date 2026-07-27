"use client";
import React from "react";
import { ui, mono } from "./tokens";
import { Reveal, useMediaQuery, usePrefersReducedMotion } from "./motion";

/**
 * ALCA Wealth — PUBLIC, signed-out homepage.
 *
 * A self-contained marketing surface for two audiences: prospective advisory
 * firms, and returning advisors who were signed out and need an immediate path
 * back in (Sign In sits in the top nav AND the hero, above the fold).
 *
 * Pure presentation. It makes NO API calls, exposes NO firm data, and holds NO
 * live market data — the product preview is an explicitly labelled illustrative
 * mockup built from HTML/CSS/SVG. When rendered to an authenticated viewer (who
 * opened the marketing page from the app), it drops its own public chrome and
 * lets the app's TopNav stand; `authMode === "none"` renders the full public
 * nav + footer.
 *
 * Destinations are real existing routes: Sign In → /login, Request a Demo →
 * /contact (the existing contact route), About ALCA → /about, Security →
 * /security. Primary-workflow nav items smooth-scroll to on-page sections rather
 * than pushing signed-out visitors into protected app areas.
 */

// ── Brand palette (public marketing only) ─────────────────────────────────────
const C = {
  navy: "#04142E",
  deep: "#071B38",
  royal: "#1769FF",
  royalD: "#0F53D9",
  cyan: "#16C7E8",
  ink: "#0A1730",
  mute: "#667085",
  light: "#F7F9FC",
  white: "#FFFFFF",
  border: "rgba(12,31,64,0.10)",
  navBorder: "rgba(255,255,255,0.10)",
  onNavy: "#EAF1FF",
  onNavyDim: "rgba(224,233,247,0.66)",
};
const SERIF = "var(--font-serif)";

const LINK = { login: "/login", demo: "/contact", about: "/about", security: "/security" } as const;

// Primary-workflow anchors (on-page; never send signed-out users into protected app pages).
const NAV_ITEMS: { label: string; href: string; external?: boolean }[] = [
  { label: "Home", href: "#top" },
  { label: "Firm Funds", href: "#firm-funds" },
  { label: "Discover", href: "#discover" },
  { label: "Reviews", href: "#reviews" },
  { label: "About ALCA", href: LINK.about, external: true },
  { label: "Tools", href: "#capabilities" },
];

// ── Container ─────────────────────────────────────────────────────────────────
function Container({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ width: "100%", maxWidth: 1440, margin: "0 auto", boxSizing: "border-box", ...style }}>{children}</div>;
}

// ── Brand mark ────────────────────────────────────────────────────────────────
function Brand({ dark }: { dark?: boolean }) {
  const fg = dark ? C.onNavy : C.ink;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 11 }}>
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
        <circle cx="16" cy="16" r="15" stroke={dark ? "rgba(255,255,255,0.5)" : C.ink} strokeWidth="1.4" />
        <path d="M16 8.5l5.4 12h-3l-.95-2.3h-2.9L13.6 20.5h-3L16 8.5zm0 4.7l-.95 2.35h1.9L16 13.2z" fill={dark ? C.onNavy : C.ink} />
      </svg>
      <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: fg, ...ui }}>ALCA Wealth</span>
    </span>
  );
}

// ── CTA button (as anchor — real navigation, no-JS safe) ──────────────────────
function Btn({ href, children, variant, block }: { href: string; children: React.ReactNode; variant: "royal" | "outlineLight" | "outlineDark" | "ghostLight"; block?: boolean }) {
  const base: React.CSSProperties = {
    display: block ? "flex" : "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "13px 24px", borderRadius: 11, fontSize: 15, fontWeight: 600, ...ui,
    textDecoration: "none", cursor: "pointer", transition: "background 0.16s, border-color 0.16s, transform 0.16s, box-shadow 0.16s",
    width: block ? "100%" : undefined, boxSizing: "border-box", whiteSpace: "nowrap",
  };
  const v: Record<string, React.CSSProperties> = {
    royal: { background: C.royal, color: "#fff", border: "1px solid transparent", boxShadow: "0 8px 22px rgba(23,105,255,0.28)" },
    outlineLight: { background: "transparent", color: C.ink, border: `1px solid ${C.border}` },
    outlineDark: { background: "rgba(255,255,255,0.04)", color: C.onNavy, border: "1px solid rgba(255,255,255,0.22)" },
    ghostLight: { background: C.white, color: C.ink, border: `1px solid ${C.border}` },
  };
  return (
    <a href={href} className="alca-cta" style={{ ...base, ...v[variant] }}>{children}</a>
  );
}

// ── Line icons for the workflow / capabilities ────────────────────────────────
function Icon({ name, c = "currentColor" }: { name: string; c?: string }) {
  const p: Record<string, React.ReactNode> = {
    funds: <><rect x="3" y="3" width="7" height="7" rx="1.4" /><rect x="14" y="3" width="7" height="7" rx="1.4" /><rect x="3" y="14" width="7" height="7" rx="1.4" /><rect x="14" y="14" width="7" height="7" rx="1.4" /></>,
    discover: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></>,
    reviews: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12l2 2 4-4" /></>,
    shield: <><path d="M12 3l7 3v5c0 4.4-3 7.4-7 8.8C8 17.4 5 14.4 5 10V6z" /><path d="M9 11.5l2 2 4-4" /></>,
    layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
    doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 9h6M9 12.5h6M9 16h4" /></>,
    lock: <><rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name]}
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Public navigation
// ══════════════════════════════════════════════════════════════════════════════
function PublicNav() {
  const isMobile = useMediaQuery("(max-width: 900px)");
  const [open, setOpen] = React.useState(false);
  // No reset effect needed: the mobile menu only renders while `isMobile` is true,
  // and the hamburger is the only control that sets `open`.

  const navLink = (label: string, href: string, external?: boolean) => (
    <a key={label} href={href} {...(external ? {} : {})}
      onClick={() => setOpen(false)}
      className="alca-navlink"
      style={{ color: C.onNavyDim, textDecoration: "none", fontSize: 14, fontWeight: 500, ...ui,
        padding: "8px 2px", borderBottom: "2px solid transparent", transition: "color 0.15s" }}>
      {label}
    </a>
  );

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(4,20,46,0.86)",
      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderBottom: `1px solid ${C.navBorder}` }}>
      <Container style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 20, padding: isMobile ? "14px 20px" : "16px 40px" }}>
        <a href="#top" aria-label="ALCA Wealth home" style={{ textDecoration: "none" }}><Brand dark /></a>

        {!isMobile && (
          <nav aria-label="Primary" style={{ display: "flex", alignItems: "center", gap: 30 }}>
            {NAV_ITEMS.map((n) => navLink(n.label, n.href, n.external))}
          </nav>
        )}

        {!isMobile ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <a href={LINK.login} className="alca-navlink" style={{ color: C.onNavy, textDecoration: "none", fontSize: 14, fontWeight: 600, ...ui, padding: "10px 8px" }}>Sign In</a>
            <Btn href={LINK.demo} variant="royal">Request a Demo <span aria-hidden>→</span></Btn>
          </div>
        ) : (
          <button aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="alca-mobile-menu"
            onClick={() => setOpen((o) => !o)}
            style={{ display: "inline-flex", flexDirection: "column", gap: 5, background: "none", border: "none", cursor: "pointer", padding: 8 }}>
            <span style={{ width: 22, height: 2, background: C.onNavy, borderRadius: 2, transition: "transform 0.2s", transform: open ? "translateY(7px) rotate(45deg)" : "none" }} />
            <span style={{ width: 22, height: 2, background: C.onNavy, borderRadius: 2, opacity: open ? 0 : 1, transition: "opacity 0.2s" }} />
            <span style={{ width: 22, height: 2, background: C.onNavy, borderRadius: 2, transition: "transform 0.2s", transform: open ? "translateY(-7px) rotate(-45deg)" : "none" }} />
          </button>
        )}
      </Container>

      {isMobile && open && (
        <div id="alca-mobile-menu" style={{ borderTop: `1px solid ${C.navBorder}`, background: C.navy, padding: "10px 20px 20px" }}>
          <nav aria-label="Primary" style={{ display: "flex", flexDirection: "column" }}>
            {NAV_ITEMS.map((n) => (
              <a key={n.label} href={n.href} onClick={() => setOpen(false)}
                style={{ color: C.onNavy, textDecoration: "none", fontSize: 16, fontWeight: 500, ...ui, padding: "13px 0", borderBottom: `1px solid ${C.navBorder}` }}>
                {n.label}
              </a>
            ))}
          </nav>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            <Btn href={LINK.login} variant="outlineDark" block>Sign In</Btn>
            <Btn href={LINK.demo} variant="royal" block>Request a Demo <span aria-hidden>→</span></Btn>
          </div>
        </div>
      )}
    </header>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Illustrative product preview (HTML/CSS/SVG — no data, no API, decorative)
// ══════════════════════════════════════════════════════════════════════════════
function ReviewChip({ label, tone }: { label: string; tone: string }) {
  return <span style={{ fontSize: 9.5, fontWeight: 600, color: tone, background: `${tone}1f`, border: `1px solid ${tone}55`,
    borderRadius: 999, padding: "2px 7px", ...ui, whiteSpace: "nowrap" }}>{label}</span>;
}

function ProductPreview() {
  const reduced = usePrefersReducedMotion();
  const kpis = [
    { label: "Firm Funds", v: "24", tone: C.ink },
    { label: "Under Review", v: "3", tone: "#B45309" },
    { label: "Upcoming", v: "5", tone: "#0E7490" },
    { label: "Reviewed", v: "8", tone: "#047857" },
  ];
  const reviews = [
    { t: "SCHD", d: "Reviewed", tone: "#047857" },
    { t: "VXUS", d: "Under review", tone: "#B45309" },
    { t: "BND", d: "Reviewed", tone: "#047857" },
    { t: "VTI", d: "Upcoming", tone: "#0E7490" },
  ];
  const steps = ["Evidence", "Alternatives", "Decision", "Complete"];
  return (
    <div role="img" aria-label="Illustrative preview of the ALCA advisor workspace: firm-fund counts, a risk and expense chart, a recent-reviews list, and an open-review workflow."
      style={{ position: "relative", perspective: 1400 }}>
      {/* soft cyan glow behind */}
      <div aria-hidden style={{ position: "absolute", inset: "-8% -6% -12% 6%", background: "radial-gradient(60% 55% at 60% 40%, rgba(22,199,232,0.20), transparent 70%)", filter: "blur(6px)", pointerEvents: "none" }} />

      {/* dark product side-rail behind the main panel */}
      <div aria-hidden style={{ position: "absolute", left: -2, top: 26, bottom: 26, width: 132,
        background: "linear-gradient(180deg,#0A2145,#071B38)", border: `1px solid ${C.navBorder}`,
        borderRadius: 16, boxShadow: "0 30px 60px rgba(2,10,26,0.5)", padding: "18px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ height: 8, width: 70, borderRadius: 4, background: "rgba(255,255,255,0.14)" }} />
        {["Home", "Firm Funds", "Discover", "Reviews"].map((l, i) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: i === 1 ? C.cyan : "rgba(255,255,255,0.16)" }} />
            <span style={{ fontSize: 10, color: i === 1 ? C.onNavy : "rgba(234,241,255,0.55)", ...ui, fontWeight: i === 1 ? 600 : 500 }}>{l}</span>
          </div>
        ))}
      </div>

      {/* main light panel */}
      <div style={{ position: "relative", marginLeft: 64, background: C.white, borderRadius: 16,
        border: `1px solid ${C.border}`, boxShadow: "0 40px 80px rgba(2,10,26,0.45)",
        padding: "16px 16px 18px", transform: reduced ? "none" : "rotateY(-6deg) rotateX(2deg)", transformStyle: "preserve-3d" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, ...ui }}>Advisor Overview</span>
          <span style={{ fontSize: 9.5, fontWeight: 600, color: C.mute, background: C.light, border: `1px solid ${C.border}`,
            borderRadius: 999, padding: "3px 9px", ...ui }}>Illustrative workspace</span>
        </div>

        {/* KPI tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
          {kpis.map((k) => (
            <div key={k.label} style={{ background: C.light, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 8px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.tone, ...mono, lineHeight: 1 }}>{k.v}</div>
              <div style={{ fontSize: 8.5, color: C.mute, ...ui, marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* two columns: risk/expense chart + recent reviews */}
        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 10 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 10px 6px" }}>
            <div style={{ fontSize: 9.5, color: C.mute, ...ui, marginBottom: 6 }}>Risk &amp; Expense Exposure</div>
            <svg viewBox="0 0 180 70" width="100%" height="62" aria-hidden>
              <defs>
                <linearGradient id="pp-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.royal} stopOpacity="0.22" /><stop offset="1" stopColor={C.royal} stopOpacity="0" /></linearGradient>
              </defs>
              <path d="M2 52 L26 46 L50 48 L74 38 L98 40 L122 30 L146 32 L178 22 L178 68 L2 68 Z" fill="url(#pp-a)" />
              <path d="M2 52 L26 46 L50 48 L74 38 L98 40 L122 30 L146 32 L178 22" fill="none" stroke={C.royal} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 60 L26 58 L50 59 L74 54 L98 55 L122 50 L146 51 L178 46" fill="none" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 10px" }}>
            <div style={{ fontSize: 9.5, color: C.mute, ...ui, marginBottom: 7 }}>Recent Reviews</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {reviews.map((r) => (
                <div key={r.t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.ink, ...mono }}>{r.t}</span>
                  <ReviewChip label={r.d} tone={r.tone} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* floating Open Review workflow card */}
      <div aria-hidden style={{ position: "absolute", right: -6, bottom: -18, width: 168, background: C.white,
        borderRadius: 13, border: `1px solid ${C.border}`, boxShadow: "0 26px 50px rgba(2,10,26,0.4)", padding: "13px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.ink, ...ui, marginBottom: 10 }}>Open Review</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {steps.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 13, height: 13, borderRadius: 999, flexShrink: 0,
                background: i === 0 ? C.royal : "transparent", border: `1.5px solid ${i === 0 ? C.royal : "rgba(12,31,64,0.22)"}` }} />
              <span style={{ fontSize: 10.5, color: i === 0 ? C.ink : C.mute, fontWeight: i === 0 ? 600 : 500, ...ui }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Sections
// ══════════════════════════════════════════════════════════════════════════════
function Hero() {
  const isMobile = useMediaQuery("(max-width: 900px)");
  return (
    <section id="top" style={{ position: "relative", overflow: "hidden", background: `linear-gradient(160deg, ${C.navy} 0%, ${C.deep} 62%, #0A2246 100%)`, color: C.onNavy }}>
      {/* subtle technical linework + sparse points (decorative, static) */}
      <svg aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} preserveAspectRatio="xMidYMid slice" viewBox="0 0 1440 720">
        {/* subtle edge linework only (right side) + sparse points */}
        <g fill="none" stroke="rgba(120,170,255,0.12)" strokeWidth="1">
          <path d="M980 -80 Q 1240 300 1060 800" />
        </g>
        <g fill="rgba(150,200,255,0.45)">
          {[[1180, 140], [1320, 420], [1010, 560], [760, 120]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 2 ? 1.6 : 1} />)}
        </g>
      </svg>
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(55% 60% at 82% 46%, rgba(22,199,232,0.14), transparent 70%)" }} />

      <Container style={{ position: "relative", padding: isMobile ? "44px 20px 52px" : "clamp(44px,5vh,72px) 40px clamp(36px,4.5vh,56px)",
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "40% 60%", gap: isMobile ? 40 : 40, alignItems: "center" }}>

        {/* copy */}
        <Reveal y={14}>
          <div>
            <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 500,
              fontSize: isMobile ? "clamp(46px,15vw,60px)" : "clamp(58px,6.2vw,96px)",
              lineHeight: 1.02, letterSpacing: "-0.015em" }}>
              <span style={{ display: "block", color: "#F4F8FF" }}>Research.</span>
              <span style={{ display: "block", color: "#F4F8FF" }}>Review.</span>
              <span style={{ display: "block", color: C.cyan }}>Monitor.</span>
            </h1>
            <p style={{ margin: "24px 0 0", fontSize: isMobile ? 16 : 18, lineHeight: 1.6, color: C.onNavyDim, maxWidth: 440, ...ui }}>
              ALCA helps advisory teams monitor funds, evaluate alternatives, and maintain a documented review process.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
              <Btn href={LINK.login} variant="royal">Sign In</Btn>
              <Btn href={LINK.demo} variant="outlineDark">Request a Demo <span aria-hidden>→</span></Btn>
            </div>
          </div>
        </Reveal>

        {/* product preview — enlarged and nudged up to match the reference */}
        <Reveal y={20} delay={90} style={{ minWidth: 0 }}>
          <div style={{ margin: isMobile ? "0 auto" : "0 -8% 0 6%", maxWidth: isMobile ? 440 : "none",
            transform: isMobile ? "none" : "translateY(-10px) scale(1.17)", transformOrigin: "left center" }}>
            <ProductPreview />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

function WorkflowSection() {
  const isMobile = useMediaQuery("(max-width: 900px)");
  const stages = [
    { id: "firm-funds", n: "01", icon: "funds", title: "Firm Funds", body: "Monitor the funds used across your firm with visibility into status, performance, risk, and cost." },
    { id: "discover", n: "02", icon: "discover", title: "Discover", body: "Research and compare alternatives using consistent fund data and side-by-side analysis." },
    { id: "reviews", n: "03", icon: "reviews", title: "Reviews", body: "Document the evidence, alternatives, rationale, and final decision for each fund review." },
  ];
  return (
    <section style={{ position: "relative", background: C.white, borderRadius: "28px 28px 0 0", marginTop: -32, paddingTop: isMobile ? 44 : 60 }}>
      <Container style={{ padding: isMobile ? "0 20px 64px" : "0 40px 112px" }}>
        <Reveal>
          <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", color: C.royal, ...ui }}>THE ALCA WORKFLOW</span>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? "clamp(28px,7vw,34px)" : "clamp(34px,3.4vw,44px)",
              color: C.ink, margin: "14px 0 0", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
              A clear path from research to decision.
            </h2>
          </div>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto 1fr auto 1fr", gap: isMobile ? 22 : 8,
          alignItems: "start", marginTop: isMobile ? 40 : 60 }}>
          {stages.map((s, i) => (
            <React.Fragment key={s.id}>
              <Reveal y={16} delay={i * 70}>
                <div id={s.id} style={{ scrollMarginTop: 90, textAlign: isMobile ? "left" : "center", maxWidth: 340, margin: "0 auto" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: isMobile ? "flex-start" : "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 46, height: 46,
                      borderRadius: 12, background: C.light, border: `1px solid ${C.border}`, color: C.royal }}>
                      <Icon name={s.icon} c={C.royal} />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.mute, ...mono }}>{s.n}</span>
                  </div>
                  <h3 style={{ fontSize: 19, fontWeight: 700, color: C.ink, ...ui, margin: "16px 0 0", letterSpacing: "-0.01em" }}>{s.title}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: C.mute, ...ui, margin: "9px 0 0" }}>{s.body}</p>
                </div>
              </Reveal>
              {!isMobile && i < stages.length - 1 && (
                <div aria-hidden style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 14, color: "rgba(12,31,64,0.22)" }}>
                  <svg width="52" height="12" viewBox="0 0 52 12" fill="none"><path d="M0 6h46M42 2l5 4-5 4" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </Container>
    </section>
  );
}

function CapabilitiesSection() {
  const isMobile = useMediaQuery("(max-width: 900px)");
  const isTablet = useMediaQuery("(max-width: 1180px)");
  const caps = [
    { icon: "shield", title: "Centralized Fund Oversight", body: "Maintain a consistent view of the funds approved, watched, considered, restricted, or retired by the firm." },
    { icon: "layers", title: "Consistent Research", body: "Compare funds using a common set of performance, risk, expense, and classification data." },
    { icon: "doc", title: "Documented Reviews", body: "Keep evidence, alternatives, rationale, and decisions connected in one review record." },
    { icon: "lock", title: "Controlled Access", body: "Keep firm workflows within authenticated, firm-scoped workspaces." },
  ];
  return (
    <section id="capabilities" style={{ background: C.light, borderTop: `1px solid ${C.border}`, scrollMarginTop: 80 }}>
      <Container style={{ padding: isMobile ? "56px 20px" : "104px 40px" }}>
        <Reveal>
          <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", color: C.royal, ...ui }}>BUILT FOR ADVISORY TEAMS</span>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? "clamp(28px,7vw,34px)" : "clamp(34px,3.4vw,44px)",
              color: C.ink, margin: "14px 0 0", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
              Structure across the fund-review process.
            </h2>
          </div>
        </Reveal>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(4,1fr)",
          gap: isMobile ? 16 : 22, marginTop: isMobile ? 36 : 56 }}>
          {caps.map((c, i) => (
            <Reveal key={c.title} y={16} delay={i * 60}>
              <div style={{ height: "100%", background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: "22px 22px 24px", boxSizing: "border-box" }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 42, height: 42,
                  borderRadius: 11, background: "rgba(23,105,255,0.08)", color: C.royal }}><Icon name={c.icon} c={C.royal} /></span>
                <h3 style={{ fontSize: 16.5, fontWeight: 700, color: C.ink, ...ui, margin: "16px 0 0", letterSpacing: "-0.01em" }}>{c.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: C.mute, ...ui, margin: "8px 0 0" }}>{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

function FinalCTA() {
  const isMobile = useMediaQuery("(max-width: 900px)");
  return (
    <section style={{ position: "relative", overflow: "hidden", background: `linear-gradient(160deg, ${C.deep}, ${C.navy})`, color: C.onNavy }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(70% 80% at 50% 0%, rgba(23,105,255,0.16), transparent 62%)" }} />
      <Container style={{ position: "relative", padding: isMobile ? "64px 20px" : "104px 40px", textAlign: "center" }}>
        <Reveal>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: isMobile ? "clamp(28px,7vw,34px)" : "clamp(34px,3.4vw,46px)",
              color: "#F4F8FF", margin: 0, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
              Ready to see ALCA in practice?
            </h2>
            <p style={{ fontSize: isMobile ? 15.5 : 17, lineHeight: 1.6, color: C.onNavyDim, ...ui, margin: "16px 0 0" }}>
              See how ALCA can support your firm&apos;s fund oversight and review process.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 30 }}>
              <Btn href={LINK.login} variant="royal">Sign In</Btn>
              <Btn href={LINK.demo} variant="outlineDark">Request a Demo <span aria-hidden>→</span></Btn>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

function Footer() {
  const isMobile = useMediaQuery("(max-width: 760px)");
  const year = new Date().getFullYear();
  const cols: { label: string; href: string }[] = [
    { label: "Firm Funds", href: "#firm-funds" },
    { label: "Discover", href: "#discover" },
    { label: "Reviews", href: "#reviews" },
    { label: "About ALCA", href: LINK.about },
    { label: "Security", href: LINK.security },
    { label: "Sign In", href: LINK.login },
    { label: "Request a Demo", href: LINK.demo },
  ];
  return (
    <footer style={{ background: C.navy, borderTop: `1px solid ${C.navBorder}`, color: C.onNavyDim }}>
      <Container style={{ padding: isMobile ? "36px 20px" : "48px 40px", display: "flex",
        flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 24, alignItems: isMobile ? "flex-start" : "center" }}>
        <a href="#top" aria-label="ALCA Wealth home" style={{ textDecoration: "none" }}><Brand dark /></a>
        <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? "12px 18px" : 22 }}>
          {cols.map((c) => (
            <a key={c.label} href={c.href} style={{ color: C.onNavyDim, textDecoration: "none", fontSize: 13.5, fontWeight: 500, ...ui }} className="alca-navlink">{c.label}</a>
          ))}
        </nav>
      </Container>
      <div style={{ borderTop: `1px solid ${C.navBorder}` }}>
        <Container style={{ padding: isMobile ? "16px 20px" : "16px 40px", fontSize: 12, color: "rgba(224,233,247,0.5)", ...ui }}>
          © {year} ALCA Wealth
        </Container>
      </div>
    </footer>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function HomeTab() {
  // The public marketing page always uses its own dark public header + footer
  // (never the authenticated app's white TopNav — AppShell hides that on the
  // home tab). This is presentation only; no app/auth logic here.
  return (
    // Full-bleed out of AppShell's padded <main>.
    <div style={{ margin: "0 -32px", background: C.light }}>
      <style>{`
        .alca-cta:hover { transform: translateY(-1px); }
        a.alca-navlink:hover { color: #FFFFFF !important; }
        @media (prefers-reduced-motion: reduce) { .alca-cta:hover { transform: none; } }
      `}</style>

      <PublicNav />
      <Hero />
      <WorkflowSection />
      <CapabilitiesSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
