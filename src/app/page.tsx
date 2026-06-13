"use client";
import React, { useState, useEffect, useRef } from "react";
import { T, ui, lynx } from "@/components/tokens";
import FundGrid from "@/components/FundGrid";
import { AlphaMark, HeroMark } from "@/components/Brand";

const ACC = "#0A0A0B";    // Lynx brand — black
const ACC_DARK = "#EFEFEF"; // Lynx brand — dark mode

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="12" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="2" y="12" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="12" y="12" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    ),
    title: "4,600+ Fund Universe",
    desc: "Screen every major ETF and mutual fund in one place. Style box, sector, fixed income — the full market, instantly accessible.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <polyline points="3,16 8,10 12,13 19,5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="19" cy="5" r="2" fill="currentColor"/>
      </svg>
    ),
    title: "Live Market Data",
    desc: "Real-time prices, 1/3/5-year returns, Sharpe ratio, max drawdown, alpha, beta — all fetched live, nothing stale.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <path d="M4 6h14M4 11h10M4 16h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <circle cx="17" cy="15" r="3.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M19.5 17.5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    title: "Multi-Factor Screening",
    desc: "Filter by expense ratio, Sharpe, alpha, dividend yield, track record, and style box simultaneously. Screen like an analyst.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="5" width="8" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="12" y="5" width="8" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M10 12h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    title: "Head-to-Head Comparison",
    desc: "Stack any two funds side by side. Performance charts, risk metrics, cost — everything to make the call.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <path d="M11 2L13.5 8.5H20L14.5 12.5L16.5 19L11 15L5.5 19L7.5 12.5L2 8.5H8.5L11 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      </svg>
    ),
    title: "Advisor Hub",
    desc: "Curated workflows for advisory work — discovery, analysis, replacements, and comparisons in one hub.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <path d="M3 3h16v4H3zM3 10h7v9H3zM12 10h7v4h-7zM12 17h7v2h-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      </svg>
    ),
    title: "Analytics Suite",
    desc: "Correlation matrix, peer rankings, performance attribution — institutional tools, advisor-ready.",
  },
];

const STATS = [
  { value: "4,607", label: "Funds" },
  { value: "15+",   label: "Metrics" },
  { value: "Live",  label: "Data" },
  { value: "Fast",  label: "Interface" },
];

const DIFFERENCES = [
  { them: "Bloomberg Terminal",   cost: "$2,000+/mo",        note: "Overkill for fund research. Built for trading desks." },
  { them: "Morningstar Direct",   cost: "$200+/mo per seat", note: "Powerful data, legacy interface. Not workflow-driven." },
  { them: "YCharts",              cost: "$300–500/mo/user",  note: "Good charts, limited screening depth. Expensive." },
];

export default function Home() {
  // ── Auth state ────────────────────────────────────────────────────────────
  // mode: null=checking, "none"=public, "preview"=guest, "full"=logged in
  const [authMode, setAuthMode]   = useState<null | "none" | "preview" | "full">(null);
  const [authUser, setAuthUser]   = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [previewPw, setPreviewPw] = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [loginErr, setLoginErr]   = useState("");
  const [previewErr, setPreviewErr] = useState("");
  const [loading, setLoading]     = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [theme, setThemeLocal]    = useState<"light" | "dark">("light");
  const [scrolled, setScrolled]   = useState(false);
  const featuresRef = useRef<HTMLDivElement>(null);

  // ── On mount: check existing session ─────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("gf_theme");
    if (saved === "dark" || saved === "light") {
      setThemeLocal(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
    // Check Supabase session
    fetch("/api/auth").then(r => r.json()).then(d => {
      if (d.mode === "full") { setAuthMode("full"); setAuthUser(d.user); }
      else { setAuthMode("none"); }
    }).catch(() => setAuthMode("none"));
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Login handlers ────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) { setLoginErr("Enter your email and password."); return; }
    setLoading(true); setLoginErr("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email, password }),
      });
      const d = await res.json();
      if (!res.ok) { setLoginErr(d.error ?? "Login failed."); }
      else { setAuthMode("full"); setAuthUser(d.user); }
    } catch { setLoginErr("Network error — try again."); }
    setLoading(false);
  };

  const handlePreview = async () => {
    if (!previewPw) { setPreviewErr("Enter the preview password."); return; }
    setPreviewLoading(true); setPreviewErr("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", password: previewPw }),
      });
      const d = await res.json();
      if (!res.ok) { setPreviewErr(d.error ?? "Incorrect password."); }
      else { setAuthMode("preview"); }
    } catch { setPreviewErr("Network error — try again."); }
    setPreviewLoading(false);
  };

  // ── Render app if authed ──────────────────────────────────────────────────
  if (authMode === "full" || authMode === "preview") {
    return <FundGrid authMode={authMode} authUser={authUser} onLogout={async () => {
      await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }) });
      setAuthMode("none"); setAuthUser(null); setEmail(""); setPassword(""); setPreviewPw("");
    }} />;
  }

  // Still checking session — show nothing to avoid flash
  if (authMode === null) return <div style={{ minHeight: "100vh", background: "var(--c-bg)" }} />;

  const isDark    = theme === "dark";
  const acc       = isDark ? ACC_DARK : ACC;
  const cardBg    = isDark ? "var(--c-panel)"  : "#FFFFFF";
  const cardBrd   = isDark ? "var(--c-line)"   : "#E4E4E7";
  const inputBg   = isDark ? "var(--c-panel2)" : "#FAFAFA";
  const inputBrd  = isDark ? "var(--c-line2)"  : "#D4D4D8";
  const sectionBg = isDark ? "#111113"         : "#F7F7F8";
  const divLine   = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

  return (
    <div style={{ background: T.bg, minHeight: "100vh", overflowX: "hidden" }}>

      {/* ── Sticky nav ── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "0 40px", height: 58,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: scrolled
          ? isDark ? "rgba(10,10,11,0.92)" : "rgba(255,255,255,0.92)"
          : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? `1px solid ${divLine}` : "1px solid transparent",
        transition: "all 0.3s",
      }}>
        {/* Lynx wordmark — nav brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AlphaMark size={30} radius={7} />
          <span style={{
            ...lynx, fontSize: 20, fontWeight: 300,
            letterSpacing: "0.07em", color: T.text,
            textTransform: "uppercase", lineHeight: 1,
          }}>
            Lynx
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => featuresRef.current?.scrollIntoView({ behavior: "smooth" })}
            style={{ background: "none", border: "none", cursor: "pointer",
              fontSize: 12.5, color: T.dim, ...ui, padding: "6px 14px",
              borderRadius: 7, transition: "color 0.15s", letterSpacing: "0.01em" }}
            onMouseEnter={e => (e.currentTarget.style.color = T.text)}
            onMouseLeave={e => (e.currentTarget.style.color = T.dim)}
          >
            Features
          </button>
          <button
            onClick={() => document.getElementById("login-card")?.scrollIntoView({ behavior: "smooth", block: "center" })}
            style={{ background: acc, border: "none", cursor: "pointer",
              fontSize: 12.5, fontWeight: 600, color: isDark ? "#0A0A0B" : "#FFFFFF", ...ui,
              padding: "7px 18px", borderRadius: 8, transition: "opacity 0.15s",
              letterSpacing: "0.01em" }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            Enter →
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        position: "relative", overflow: "hidden", paddingTop: 58,
      }}>
        {/* Subtle grid */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.35,
          backgroundImage: "radial-gradient(circle, var(--c-line) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 70% 65% at 50% 50%, #000 0%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 65% at 50% 50%, #000 0%, transparent 100%)",
        }} />

        {/* Very subtle ambient */}
        <div style={{
          position: "absolute", width: 700, height: 500, borderRadius: "50%",
          background: isDark
            ? "radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(0,0,0,0.025) 0%, transparent 70%)",
          filter: "blur(80px)", pointerEvents: "none", left: "0%", top: "10%",
        }} />

        <div style={{
          maxWidth: 1200, margin: "0 auto", padding: "80px 40px",
          width: "100%", display: "grid",
          gridTemplateColumns: "1fr 420px", gap: 80, alignItems: "center",
        }}>

          {/* ── Left: headline ── */}
          <div>
            {/* Live badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
              borderRadius: 20, padding: "5px 14px", marginBottom: 32,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%", background: "#16A34A",
                boxShadow: "0 0 6px rgba(22,163,74,0.7)",
                animation: "lx-pulse 2s infinite",
              }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: T.dim, ...ui, letterSpacing: "0.06em" }}>
                LIVE · Internal Research Platform
              </span>
            </div>

            {/* Big Lynx headline — split into two lines so it always fits */}
            <h1 style={{
              ...lynx,
              fontSize: "clamp(48px, 6.5vw, 86px)",
              fontWeight: 300,
              letterSpacing: "0.08em",
              lineHeight: 0.95,
              color: T.text, margin: "0 0 6px",
              textTransform: "uppercase",
            }}>
              Lynx
            </h1>

            {/* By The Capital Group — attribution line */}
            <div style={{
              ...lynx,
              fontSize: "clamp(12px, 1.3vw, 15px)",
              fontWeight: 300,
              fontStyle: "italic",
              letterSpacing: "0.06em",
              color: T.dim,
              margin: "0 0 26px",
            }}>
              By The Capital Group
            </div>

            {/* Sub-headline — Geist */}
            <p style={{
              fontSize: "clamp(16px, 2vw, 19px)", color: T.dim,
              lineHeight: 1.6, margin: "0 0 14px", maxWidth: 480, ...ui,
              fontWeight: 400,
            }}>
              Fund research &amp; analytics, built for advisors.
            </p>
            <p style={{
              fontSize: 15, color: T.muted,
              lineHeight: 1.65, margin: "0 0 40px", maxWidth: 460, ...ui,
            }}>
              Screen 4,600+ funds by style, cost, risk, and alpha. Compare head-to-head,
              track your watchlist, and make better decisions — without the Bloomberg price tag.
            </p>

            {/* CTA row — login card on right handles entry */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={() => featuresRef.current?.scrollIntoView({ behavior: "smooth" })}
                style={{
                  background: "transparent",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                  borderRadius: 10, padding: "12px 24px",
                  fontSize: 14, color: T.dim, ...ui, cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = T.dim; e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"; }}
              >
                See features ↓
              </button>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 36, marginTop: 52, flexWrap: "wrap" }}>
              {STATS.map(s => (
                <div key={s.label}>
                  <div style={{ ...lynx, fontSize: 26, fontWeight: 300, color: T.text, letterSpacing: "0.04em", lineHeight: 1 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, ...ui, marginTop: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: login card ── */}
          <div id="login-card" style={{
            background: cardBg,
            border: `1px solid ${cardBrd}`,
            borderRadius: 20, padding: "40px 36px 36px",
            boxShadow: isDark
              ? "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)"
              : "0 20px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)",
          }}>
            {/* Card brand */}
            <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 16 }}>
              {/* Logo mark — dark pill */}
              <div style={{
                width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                background: "#0A0A0B",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <HeroMark size={42} />
              </div>
              <div>
                <div style={{ ...lynx, fontSize: 22, fontWeight: 300, letterSpacing: "0.05em", color: T.text, textTransform: "uppercase", lineHeight: 1 }}>
                  Lynx
                </div>
                <div style={{ fontSize: 9.5, color: T.muted, letterSpacing: "0.07em", textTransform: "uppercase", ...ui, marginTop: 5 }}>
                  Fund Analytics · The Capital Group
                </div>
              </div>
            </div>

            {/* ── Tier 1: Full account login ── */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...ui, marginBottom: 12 }}>
                Sign in to your account
              </div>

              <div style={{ marginBottom: 10 }}>
                <input type="email" placeholder="Email address" value={email}
                  onChange={e => { setEmail(e.target.value); setLoginErr(""); }}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 13px",
                    background: inputBg, border: `1px solid ${loginErr ? "#DC2626" : inputBrd}`,
                    borderRadius: 8, fontSize: 13, color: T.text, outline: "none",
                    fontFamily: "'Geist', sans-serif", transition: "border-color 0.15s" }}
                  onFocus={e => (e.currentTarget.style.borderColor = acc)}
                  onBlur={e => (e.currentTarget.style.borderColor = loginErr ? "#DC2626" : inputBrd)}
                />
              </div>

              <div style={{ position: "relative", marginBottom: 10 }}>
                <input type={showPass ? "text" : "password"} placeholder="Password" value={password}
                  onChange={e => { setPassword(e.target.value); setLoginErr(""); }}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 38px 10px 13px",
                    background: inputBg, border: `1px solid ${loginErr ? "#DC2626" : inputBrd}`,
                    borderRadius: 8, fontSize: 13, color: T.text, outline: "none",
                    fontFamily: "'Geist', sans-serif", transition: "border-color 0.15s" }}
                  onFocus={e => (e.currentTarget.style.borderColor = acc)}
                  onBlur={e => (e.currentTarget.style.borderColor = loginErr ? "#DC2626" : inputBrd)}
                />
                <button onClick={() => setShowPass(s => !s)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 2 }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
                    {showPass && <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>}
                  </svg>
                </button>
              </div>

              {loginErr && <div style={{ fontSize: 11.5, color: "#DC2626", ...ui, marginBottom: 8 }}>{loginErr}</div>}

              <button onClick={handleLogin} disabled={loading}
                style={{ width: "100%", padding: "10px 0", borderRadius: 8, cursor: loading ? "wait" : "pointer",
                  background: acc, color: isDark ? "#0A0A0B" : "#fff",
                  border: "none", fontSize: 13, fontWeight: 600, ...ui,
                  opacity: loading ? 0.7 : 1, transition: "opacity 0.15s" }}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </div>

            {/* ── Divider ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1, height: 1, background: cardBrd }} />
              <span style={{ fontSize: 10, color: T.muted, ...ui, letterSpacing: "0.08em", textTransform: "uppercase" }}>or preview</span>
              <div style={{ flex: 1, height: 1, background: cardBrd }} />
            </div>

            {/* ── Tier 2: Preview password ── */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: T.dim, ...ui, marginBottom: 10 }}>
                Have the employee preview code? Browse without saving.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="password" placeholder="Preview password" value={previewPw}
                  onChange={e => { setPreviewPw(e.target.value); setPreviewErr(""); }}
                  onKeyDown={e => e.key === "Enter" && handlePreview()}
                  style={{ flex: 1, padding: "10px 13px", boxSizing: "border-box",
                    background: inputBg, border: `1px solid ${previewErr ? "#DC2626" : inputBrd}`,
                    borderRadius: 8, fontSize: 13, color: T.text, outline: "none",
                    fontFamily: "'Geist', sans-serif", transition: "border-color 0.15s" }}
                  onFocus={e => (e.currentTarget.style.borderColor = acc)}
                  onBlur={e => (e.currentTarget.style.borderColor = previewErr ? "#DC2626" : inputBrd)}
                />
                <button onClick={handlePreview} disabled={previewLoading}
                  style={{ padding: "10px 16px", borderRadius: 8, cursor: previewLoading ? "wait" : "pointer",
                    background: "transparent", border: `1px solid ${cardBrd}`,
                    fontSize: 13, color: T.dim, ...ui, whiteSpace: "nowrap",
                    transition: "all 0.15s", opacity: previewLoading ? 0.6 : 1 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = acc; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = cardBrd; e.currentTarget.style.color = T.dim; }}>
                  {previewLoading ? "…" : "Enter →"}
                </button>
              </div>
              {previewErr && <div style={{ fontSize: 11.5, color: "#DC2626", ...ui, marginTop: 6 }}>{previewErr}</div>}
            </div>

            <p style={{ textAlign: "center", marginTop: 14, marginBottom: 0, fontSize: 10, color: T.muted, ...ui, lineHeight: 1.5 }}>
              Full account saves watchlist &amp; preferences across devices.
            </p>
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          opacity: 0.35, animation: "lx-bounce 2.5s infinite",
        }}>
          <span style={{ fontSize: 9, color: T.muted, ...ui, letterSpacing: "0.04em" }}>SCROLL</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4l4 5 4-5" stroke="var(--c-muted)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ── Features section ── */}
      <div ref={featuresRef} style={{ background: sectionBg, borderTop: `1px solid ${divLine}`, padding: "100px 40px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 70 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: T.muted, letterSpacing: "0.06em",
              textTransform: "uppercase", ...ui, marginBottom: 16 }}>
              Platform
            </div>
            <h2 style={{
              ...lynx, fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 300,
              letterSpacing: "0.08em", color: T.text, margin: "0 0 16px",
              textTransform: "uppercase",
            }}>
              Everything in one place
            </h2>
            <p style={{ fontSize: 15, color: T.dim, maxWidth: 480, margin: "0 auto", lineHeight: 1.7, ...ui }}>
              Built by an advisor who got tired of switching between six tools to answer one client question.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 18 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{
                background: cardBg,
                border: `1px solid ${cardBrd}`,
                borderRadius: 14, padding: "26px 26px 22px",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = isDark
                    ? "0 12px 40px rgba(0,0,0,0.35)"
                    : "0 8px 32px rgba(0,0,0,0.06)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10, marginBottom: 16,
                  background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: T.text,
                }}>
                  {f.icon}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text, ...ui, marginBottom: 7, letterSpacing: "-0.01em" }}>
                  {f.title}
                </div>
                <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.65, ...ui }}>
                  {f.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Why Lynx section ── */}
      <div style={{ background: T.bg, borderTop: `1px solid ${divLine}`, padding: "100px 40px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "start" }}>

          {/* Left */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 500, color: T.muted, letterSpacing: "0.06em",
              textTransform: "uppercase", ...ui, marginBottom: 16 }}>
              Why Lynx
            </div>
            <h2 style={{
              ...lynx, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300,
              letterSpacing: "0.06em", color: T.text, margin: "0 0 20px",
              textTransform: "uppercase", lineHeight: 1.1,
            }}>
              Professional grade.<br/>No price tag.
            </h2>
            <p style={{ fontSize: 15, color: T.dim, lineHeight: 1.75, margin: "0 0 32px", ...ui }}>
              Advisors shouldn't need a Bloomberg terminal to answer basic fund research questions.
              Lynx brings institutional-quality screening, risk analytics, and comparison tools
              into a modern interface built for how you actually work.
            </p>

            {[
              "Morningstar + fi360 data integration (coming)",
              "Built by an advisor, for advisors",
              "Modern interface — nothing legacy",
              "Internal tool — no client data, ever",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 13 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                  background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 2.5" stroke={T.text} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span style={{ fontSize: 13.5, color: T.dim, ...ui }}>{item}</span>
              </div>
            ))}
          </div>

          {/* Right — comparison */}
          <div style={{ paddingTop: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 500, color: T.muted, ...ui,
              letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 16 }}>
              vs. The alternatives
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {DIFFERENCES.map((d, i) => (
                <div key={i} style={{
                  background: cardBg, border: `1px solid ${cardBrd}`,
                  borderRadius: 12, padding: "16px 18px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, ...ui }}>{d.them}</div>
                    <div style={{
                      fontSize: 11, fontWeight: 500, color: T.muted, ...ui,
                      background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                      padding: "3px 9px", borderRadius: 6, letterSpacing: "0.01em",
                    }}>
                      {d.cost}
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: T.muted, ...ui, lineHeight: 1.5 }}>{d.note}</div>
                </div>
              ))}

              {/* Lynx card — highlighted */}
              <div style={{
                background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)"}`,
                borderRadius: 12, padding: "16px 18px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ ...lynx, fontSize: 18, fontWeight: 300, color: T.text, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    Lynx
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: T.text, ...ui,
                    background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)",
                    padding: "3px 9px", borderRadius: 6,
                  }}>
                    Internal tool
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: T.dim, ...ui, lineHeight: 1.5 }}>
                  Built specifically for this firm. Fast, modern, and gets out of the way.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom CTA ── */}
      <div style={{
        background: sectionBg, borderTop: `1px solid ${divLine}`,
        padding: "90px 40px", textAlign: "center",
      }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <h2 style={{
            ...lynx, fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 300,
            letterSpacing: "0.1em", color: T.text, margin: "0 0 18px",
            textTransform: "uppercase",
          }}>
            Start researching.
          </h2>
          <p style={{ fontSize: 15, color: T.dim, lineHeight: 1.65, margin: "0 0 34px", ...ui }}>
            No login required to explore. Sign in when you're ready to save watchlists and preferences across devices.
          </p>
          <button
            onClick={() => document.getElementById("login-card")?.scrollIntoView({ behavior: "smooth", block: "center" })}
            style={{
              background: acc, color: isDark ? "#0A0A0B" : "#FFFFFF",
              border: "none", borderRadius: 12, padding: "15px 40px",
              fontSize: 14.5, fontWeight: 600, ...ui, cursor: "pointer",
              transition: "all 0.2s", letterSpacing: "0.01em",
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.8"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            Enter Lynx →
          </button>
          <p style={{ marginTop: 20, fontSize: 10.5, color: T.muted, ...ui, letterSpacing: "0.03em" }}>
            Internal research aid · Verify before client use
          </p>
        </div>
      </div>

      <style>{`
        @keyframes lx-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes lx-bounce {
          0%,100%{transform:translateX(-50%) translateY(0)}
          50%{transform:translateX(-50%) translateY(7px)}
        }
        @media(max-width:860px){
          .lx-hero-grid{grid-template-columns:1fr!important}
          .lx-diff-grid{grid-template-columns:1fr!important}
        }
      `}</style>
    </div>
  );
}
