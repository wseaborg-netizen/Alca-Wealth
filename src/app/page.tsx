"use client";
import React, { useState, useEffect, useRef } from "react";
import { T, ui, mono, lynx } from "@/components/tokens";
import FundGrid from "@/components/FundGrid";

const ACC = "#0A0A0B";    // RazorBill brand, black
const ACC_DARK = "#EFEFEF"; // RazorBill brand, dark mode

const STATS = [
  { value: "4,607", label: "Funds" },
  { value: "15+",   label: "Metrics" },
  { value: "Live",  label: "Data" },
];

// ── Read-only tool mockups for the scroll-down preview ──────────────────────────
// Static sample data, styled like the real app. Nothing interactive.

function Spark({ up = true }: { up?: boolean }) {
  const pts = up
    ? "0,20 14,15 28,17 42,9 56,11 70,5 84,7 100,2"
    : "0,3 14,7 28,5 42,11 56,9 70,15 84,13 100,18";
  return (
    <svg viewBox="0 0 100 22" width="100%" height="26" preserveAspectRatio="none" style={{ marginTop: 4 }}>
      <polyline points={pts} fill="none" stroke={up ? T.green : T.red} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function MockDashboard() {
  const idx = [
    { l: "S&P 500", v: "5,431.20", c: "+0.62%" },
    { l: "Dow", v: "42,100.4", c: "+0.34%" },
    { l: "Nasdaq", v: "17,890.6", c: "+0.81%" },
  ];
  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {idx.map((x) => (
          <div key={x.l} style={{ border: `1px solid ${T.line}`, borderRadius: 8, padding: "10px 12px", background: T.panel }}>
            <div style={{ fontSize: 9, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.08em" }}>{x.l}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: T.text, ...mono }}>{x.v}</span>
              <span style={{ fontSize: 11, color: T.green, ...mono }}>{x.c}</span>
            </div>
            <Spark up />
          </div>
        ))}
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: 8, padding: "10px 14px", background: T.panel, display: "flex", gap: 26, fontSize: 11, ...mono, color: T.dim, flexWrap: "wrap" }}>
        <span>10Y <b style={{ color: T.text }}>4.21%</b></span>
        <span>2Y <b style={{ color: T.text }}>4.18%</b></span>
        <span>Fed Funds <b style={{ color: T.text }}>5.25%</b></span>
        <span>CPI <b style={{ color: T.text }}>3.1%</b></span>
      </div>
    </div>
  );
}

function MockScreen() {
  const rows = [
    { t: "QQQ", e: "0.20", s: "1.34", r: "+31.2%", sc: 91 },
    { t: "VUG", e: "0.04", s: "1.28", r: "+29.0%", sc: 88 },
    { t: "SPY", e: "0.09", s: "1.20", r: "+24.9%", sc: 85 },
    { t: "VTI", e: "0.03", s: "1.12", r: "+24.1%", sc: 83 },
    { t: "SCHD", e: "0.06", s: "0.94", r: "+12.3%", sc: 76 },
  ];
  const cols = "56px 1fr 1fr 1fr 96px";
  return (
    <div style={{ padding: 18 }}>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: 8, overflow: "hidden", background: T.panel }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "9px 14px", borderBottom: `1px solid ${T.line}`, fontSize: 9, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          <span>Fund</span><span>Exp %</span><span>Sharpe</span><span>1Y</span><span>Score</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.t} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "10px 14px", borderBottom: i < rows.length - 1 ? `1px solid ${T.line}` : "none", alignItems: "center", fontSize: 12, ...mono }}>
            <span style={{ fontWeight: 600, color: T.text }}>{r.t}</span>
            <span style={{ color: T.dim }}>{r.e}</span>
            <span style={{ color: T.dim }}>{r.s}</span>
            <span style={{ color: T.green }}>{r.r}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ flex: 1, height: 5, borderRadius: 3, background: T.line, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${r.sc}%`, background: T.text }} />
              </span>
              <span style={{ fontSize: 10, color: T.dim }}>{r.sc}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCompare() {
  const funds = [
    { t: "VTI", Expense: "0.03%", Sharpe: "1.12", "Max DD": "-18.4%", Yield: "1.3%" },
    { t: "SPY", Expense: "0.09%", Sharpe: "1.20", "Max DD": "-18.1%", Yield: "1.2%" },
    { t: "SCHD", Expense: "0.06%", Sharpe: "0.94", "Max DD": "-14.2%", Yield: "3.5%" },
  ];
  const metrics = ["Expense", "Sharpe", "Max DD", "Yield"] as const;
  return (
    <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
      {funds.map((f) => (
        <div key={f.t} style={{ border: `1px solid ${T.line}`, borderRadius: 8, background: T.panel, overflow: "hidden" }}>
          <div style={{ padding: "9px 12px", borderBottom: `1px solid ${T.line}`, ...lynx, fontSize: 16, fontWeight: 300, color: T.text, letterSpacing: "0.04em" }}>{f.t}</div>
          <div style={{ padding: "6px 12px 10px" }}>
            {metrics.map((m) => (
              <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 11, ...ui }}>
                <span style={{ color: T.muted }}>{m}</span>
                <span style={{ color: T.text, ...mono }}>{(f as Record<string, string>)[m]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MockAnalyze() {
  const line = "M0,70 C22,66 32,60 46,57 C62,54 72,47 92,45 C112,43 122,37 142,31 C162,25 178,29 198,21 C218,13 232,17 250,7";
  const tiles: [string, string, string][] = [
    ["1Y Return", "+24.9%", T.green],
    ["Sharpe", "1.20", T.text],
    ["Max DD", "-18.4%", T.red],
  ];
  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10 }}>
        {tiles.map(([l, v, c]) => (
          <div key={l} style={{ flex: 1, border: `1px solid ${T.line}`, borderRadius: 8, padding: "9px 12px", background: T.panel }}>
            <div style={{ fontSize: 9, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.07em" }}>{l}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: c, ...mono, marginTop: 3 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: 8, background: T.panel, padding: "12px 14px" }}>
        <div style={{ fontSize: 9, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Growth of $10,000</div>
        <svg viewBox="0 0 250 80" width="100%" height="120" preserveAspectRatio="none" style={{ display: "block" }}>
          <defs>
            <linearGradient id="mk-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.green} stopOpacity="0.2" />
              <stop offset="100%" stopColor={T.green} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L250,80 L0,80 Z`} fill="url(#mk-area)" />
          <path d={line} fill="none" stroke={T.green} strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

const TOOLS = [
  { name: "Dashboard", desc: "Markets, rates, and headlines in one view.", Mock: MockDashboard },
  { name: "Screen",    desc: "Filter the fund universe by cost, risk, return, and yield.", Mock: MockScreen },
  { name: "Compare",   desc: "Funds side by side on the metrics that matter.", Mock: MockCompare },
  { name: "Analyze",   desc: "Returns, risk, and charts for a single fund.", Mock: MockAnalyze },
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
    } catch { setLoginErr("Network error. Try again."); }
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
    } catch { setPreviewErr("Network error. Try again."); }
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
        {/* RazorBill wordmark — nav brand */}
        <div style={{ display: "flex", alignItems: "center", color: T.text }}>
          <span style={{
            ...lynx, fontSize: 20, fontWeight: 300,
            letterSpacing: "0.07em", color: T.text,
            textTransform: "uppercase", lineHeight: 1,
          }}>
            RazorBill
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
            Preview
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
        {/* Razorbill photo background */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: "url(/razorbill.jpg)",
          backgroundSize: "cover", backgroundPosition: "center",
        }} />
        {/* Readability scrim — theme-matched, heavier on the left behind the text,
            lighter elsewhere so the razorbill reads through clearly */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          background: isDark
            ? "linear-gradient(to right, rgba(10,10,11,0.72) 0%, rgba(10,10,11,0.5) 45%, rgba(10,10,11,0.32) 100%)"
            : "linear-gradient(to right, rgba(250,250,250,0.78) 0%, rgba(250,250,250,0.55) 45%, rgba(250,250,250,0.34) 100%)",
        }} />
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
          position: "relative", zIndex: 2,
        }}>

          {/* ── Left: headline ── */}
          <div>
            {/* Big RazorBill headline */}
            <h1 style={{
              ...lynx,
              fontSize: "clamp(48px, 6.5vw, 86px)",
              fontWeight: 300,
              letterSpacing: "0.08em",
              lineHeight: 0.95,
              color: T.text, margin: "0 0 6px",
              textTransform: "uppercase",
            }}>
              RazorBill
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

            {/* Sub-headline */}
            <p style={{
              fontSize: "clamp(16px, 2vw, 19px)", color: T.dim,
              lineHeight: 1.6, margin: "0 0 36px", maxWidth: 480, ...ui,
              fontWeight: 400,
            }}>
              Fund research and analytics for advisors.
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
                See it in action ↓
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
            {/* Card brand — wordmark */}
            <div style={{ marginBottom: 0 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...lynx, fontSize: 24, fontWeight: 300, letterSpacing: "0.05em", color: T.text, textTransform: "uppercase", lineHeight: 1 }}>
                  RazorBill
                </div>
                <div style={{ fontSize: 9.5, color: T.muted, letterSpacing: "0.07em", textTransform: "uppercase", ...ui, marginTop: 5 }}>
                  Fund Analytics · The Capital Group
                </div>
              </div>
              {/* Underline — professional divider */}
              <div style={{
                width: "100%", height: 1,
                background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)",
                marginBottom: 24,
              }} />
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

      {/* ── Tool preview (read-only screenshots) ── */}
      <div ref={featuresRef} style={{ background: sectionBg, borderTop: `1px solid ${divLine}`, padding: "80px 40px 100px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: T.muted, letterSpacing: "0.08em",
            textTransform: "uppercase", ...ui, marginBottom: 52, textAlign: "center" }}>
            A look inside
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 60 }}>
            {TOOLS.map((t) => (
              <div key={t.name}>
                <div style={{ ...lynx, fontSize: 22, fontWeight: 300, color: T.text, letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1 }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 14, color: T.dim, ...ui, marginTop: 8, marginBottom: 16 }}>{t.desc}</div>
                <div style={{
                  borderRadius: 12, overflow: "hidden",
                  border: `1px solid ${cardBrd}`,
                  boxShadow: isDark ? "0 16px 50px rgba(0,0,0,0.4)" : "0 16px 50px rgba(0,0,0,0.08)",
                }}>
                  <div style={{ height: 34, display: "flex", alignItems: "center", gap: 7, padding: "0 14px",
                    borderBottom: `1px solid ${cardBrd}`, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
                    {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
                      <span key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.9 }} />
                    ))}
                  </div>
                  <div style={{ background: isDark ? "#0E0E10" : "#FAFAFA", pointerEvents: "none" }}>
                    <t.Mock />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p style={{ textAlign: "center", marginTop: 60, fontSize: 10.5, color: T.muted, ...ui, letterSpacing: "0.03em" }}>
            Internal research aid. Verify before client use.
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
