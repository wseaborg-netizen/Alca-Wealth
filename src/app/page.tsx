"use client";
import React, { useState, useEffect, useRef } from "react";
import { T, ui, mono, lynx } from "@/components/tokens";
import AppShell from "@/components/AppShell";
import {
  AreaChart, Area, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from "recharts";
import { UNIVERSE } from "@/lib/universe";

const ACC = "#0A0A0B";    // Tool brand, black
const ACC_DARK = "#EFEFEF"; // Tool brand, dark mode

// ── TEMP: demo mode ─────────────────────────────────────────────────────────
// When true, the lock screen / homepage is skipped and the app opens straight
// into the tool (guest "preview" mode) - for showing coworkers without login.
// Set back to `false` to restore the normal lock screen. Nothing is deleted.
const SHOW_TOOL_DIRECTLY = true;

// Live fund count - derived from the universe so the stat never goes stale.
const UNIVERSE_COUNT = UNIVERSE.length;

const STATS = [
  { value: UNIVERSE_COUNT.toLocaleString("en-US"), label: "Funds" },
  { value: "15+",   label: "Metrics" },
  { value: "Live",  label: "Data" },
];

// ── Advisor Hub showcase for the lock screen ────────────────────────────────

const MOCK_FIND = [
  { ticker: "SCHD", name: "Schwab US Dividend Equity", score: 94 },
  { ticker: "VOO",  name: "Vanguard S&P 500",          score: 89 },
  { ticker: "DGRO", name: "iShares Core Div Growth",    score: 86 },
];
const MOCK_RADAR = [
  { metric: "Cost", VOO: 96, ARKK: 34 },
  { metric: "Risk Adj", VOO: 80, ARKK: 26 },
  { metric: "Downside", VOO: 74, ARKK: 18 },
  { metric: "Alpha", VOO: 52, ARKK: 44 },
  { metric: "Consistency", VOO: 85, ARKK: 22 },
  { metric: "Yield", VOO: 58, ARKK: 10 },
];
const MOCK_GROWTH = [12, 13, 12.4, 14, 15.2, 14.6, 16, 17.5, 17, 18.8, 20, 19.4, 21.5, 23, 22.4, 24, 26, 25.3, 27.5, 29, 28.4, 31, 33, 34.2];

const LOCK_ICONS: Record<string, React.ReactNode> = {
  discover: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5a4.5 4.5 0 0 0-2.7 8.1c.45.34.7.86.7 1.4v.5h4v-.5c0-.54.25-1.06.7-1.4A4.5 4.5 0 0 0 8 1.5Z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <line x1="6.2" y1="13.5" x2="9.8" y2="13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="6.8" y1="15" x2="9.2" y2="15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  analysis: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 9l2-2 1.5 1.5L11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="5" y1="4" x2="11" y2="4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  comparison: (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h5v8H2zM9 2h5v10H9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
};

function FindPreview() {
  const cells = [0, 1, 0, 0, 1, 0, 0, 0, 0];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 18, alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", ...ui, marginBottom: 6 }}>Style box</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
          {cells.map((on, i) => (
            <div key={i} style={{ aspectRatio: "1.5/1", borderRadius: 4,
              background: on ? T.data : T.panel3, border: `1px solid ${on ? T.data : T.line2}` }} />
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 22, fontWeight: 600, color: T.data, ...mono, lineHeight: 1 }}>{UNIVERSE_COUNT}</div>
        <div style={{ fontSize: 10, color: T.dim, ...ui }}>funds in database</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {MOCK_FIND.map((f, i) => (
          <div key={f.ticker} style={{ display: "flex", alignItems: "center", gap: 12, background: T.panel,
            border: `1px solid ${T.line}`, borderRadius: 8, padding: "9px 13px" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, ...mono, width: 16 }}>{i + 1}</span>
            <div style={{ width: 56 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...mono }}>{f.ticker}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: T.dim, ...ui, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
              <div style={{ height: 4, background: T.panel3, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${f.score}%`, background: T.data, borderRadius: 2 }} />
              </div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.data, ...mono }}>{f.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalysisPreview() {
  const pts = MOCK_GROWTH.map((v, i) => ({ i, v }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "rgba(22,163,74,0.10)", border: `1px solid ${T.green}44`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text, ...mono }}>SCHD</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: "#fff", background: T.green, borderRadius: 4, padding: "2px 7px", ...ui }}>STRONG</span>
          </div>
          <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, ...ui, marginTop: 6 }}>
            Low cost, top-quartile risk-adjusted return, and shallow drawdowns make this a high-conviction core holding.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[["▲", T.green, "0.06% expense - cheaper than 96% of peers"],
            ["▲", T.green, "Sharpe 1.18 · downside capture 84%"],
            ["▼", T.amber, "Yield trails high-income alternatives"]].map(([sym, c, txt], i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: c as string }}>{sym}</span>
              <span style={{ fontSize: 11, color: T.dim, ...ui }}>{txt}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", ...ui, marginBottom: 4 }}>Growth vs benchmark</div>
        <div style={{ filter: `drop-shadow(0 0 6px ${T.data}33)` }}>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={pts} margin={{ top: 4, right: 2, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="g-analysis-lock" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.data} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={T.data} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={T.data} strokeWidth={1.8} fill="url(#g-analysis-lock)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: T.dim, ...ui }}>3-year</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.green, ...mono }}>+34.2%</span>
        </div>
      </div>
    </div>
  );
}

function ComparisonPreview() {
  const rows: [string, string, string][] = [
    ["Sharpe 3Y", "1.18", "0.41"],
    ["Max DD", "−24%", "−61%"],
    ["Expense", "0.03%", "0.75%"],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "center" }}>
      <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: "6px 10px" }}>
        <ResponsiveContainer width="100%" height={186}>
          <RadarChart data={MOCK_RADAR} margin={{ top: 8, right: 18, bottom: 8, left: 18 }}>
            <PolarGrid stroke={T.line} />
            <PolarAngleAxis dataKey="metric" tick={{ fill: T.dim, fontSize: 8.5, fontFamily: "'Geist', sans-serif" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="VOO" dataKey="VOO" stroke={T.data} fill={T.data} fillOpacity={0.15} strokeWidth={1.5} />
            <Radar name="ARKK" dataKey="ARKK" stroke={T.amber} fill={T.amber} fillOpacity={0.12} strokeWidth={1.5} />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'Geist', sans-serif" }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 64px", gap: 0,
          fontSize: 10, color: T.muted, ...ui, paddingBottom: 6, borderBottom: `1px solid ${T.line}` }}>
          <span>Metric</span>
          <span style={{ textAlign: "right", color: T.data, fontWeight: 600, ...mono }}>VOO</span>
          <span style={{ textAlign: "right", color: T.amber, fontWeight: 600, ...mono }}>ARKK</span>
        </div>
        {rows.map(([m, a, b]) => (
          <div key={m} style={{ display: "grid", gridTemplateColumns: "1fr 64px 64px",
            padding: "9px 0", borderBottom: `1px solid ${T.line}` }}>
            <span style={{ fontSize: 11, color: T.dim, ...ui }}>{m}</span>
            <span style={{ textAlign: "right", fontSize: 12, fontWeight: 600, color: T.green, ...mono }}>{a}</span>
            <span style={{ textAlign: "right", fontSize: 12, fontWeight: 600, color: T.dim, ...mono }}>{b}</span>
          </div>
        ))}
        <div style={{ fontSize: 10, color: T.muted, ...ui, marginTop: 8 }}>Up to 4 funds, side by side.</div>
      </div>
    </div>
  );
}

function VolSurface3D() {
  const COLS = 9, ROWS = 6;
  const originX = 118, originY = 128;
  const cellW = 30, depthX = 19, depthY = -12;
  const vol = (c: number, r: number) => {
    const x = (c - (COLS - 1) / 2) / ((COLS - 1) / 2);
    return 18 + x * x * 36 + r * 5;
  };
  const project = (c: number, r: number): [number, number] => {
    const z = vol(c, r);
    return [originX + c * cellW + r * depthX, originY + r * depthY - z];
  };
  const rowPaths: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    let d = "";
    for (let c = 0; c < COLS; c++) { const [x, y] = project(c, r); d += (c === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " "; }
    rowPaths.push(d);
  }
  const colPaths: string[] = [];
  for (let c = 0; c < COLS; c++) {
    let d = "";
    for (let r = 0; r < ROWS; r++) { const [x, y] = project(c, r); d += (r === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " "; }
    colPaths.push(d);
  }
  return (
    <div style={{ position: "relative", width: "100%", overflow: "hidden", borderRadius: 10 }}>
      <svg viewBox="0 0 360 150" width="100%" height="150" preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", filter: "drop-shadow(0 0 6px rgba(0,0,0,0.18))" }}>
        <defs>
          <linearGradient id="vol-grad-lock" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--c-muted)" />
            <stop offset="50%" stopColor="var(--c-accent)" />
            <stop offset="100%" stopColor="var(--c-muted)" />
          </linearGradient>
        </defs>
        {colPaths.map((d, i) => (
          <path key={"c" + i} d={d} fill="none" stroke="var(--c-line2)" strokeWidth={0.8} opacity={0.7} />
        ))}
        {rowPaths.map((d, i) => (
          <path key={"r" + i} d={d} fill="none" stroke="url(#vol-grad-lock)"
            strokeWidth={1.6} opacity={0.35 + (i / (ROWS - 1)) * 0.6}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
    </div>
  );
}

function LockShowcaseSection({
  tab, name, tagline, onLoginScroll, children,
}: {
  tab: string; name: string; tagline: string; onLoginScroll: () => void; children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const accent = "#EDEDEA"; // near-white accent - reads on the black splash
  return (
    <div
      onClick={onLoginScroll}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: T.panel, border: `1px solid ${hover ? accent : T.line}`, borderRadius: 14,
        overflow: "hidden", cursor: "pointer",
        transform: hover ? "translateY(-3px)" : "none",
        boxShadow: hover ? `0 10px 30px ${accent}22, 0 2px 6px rgba(16,24,40,0.06)` : "0 1px 2px rgba(16,24,40,0.04)",
        transition: "transform 0.18s cubic-bezier(0.4,0,0.2,1), box-shadow 0.18s, border-color 0.18s",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 22px",
        borderBottom: `1px solid ${T.line}` }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: accent + "14", border: `1px solid ${accent}33`,
          display: "flex", alignItems: "center", justifyContent: "center", color: accent }}>
          {LOCK_ICONS[tab]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 300, color: T.text,
            fontFamily: "var(--font-text)", letterSpacing: "0.06em" }}>{name}</span>
          <div style={{ fontSize: 12, color: T.dim, ...ui, marginTop: 1 }}>{tagline}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
          background: hover ? accent : accent + "12",
          border: `1px solid ${hover ? accent : accent + "33"}`,
          color: hover ? "#0A0A0B" : accent,
          borderRadius: 8, padding: "8px 14px", transition: "all 0.18s" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", ...ui }}>Sign in to use →</span>
        </div>
      </div>
      <div style={{ padding: "20px 22px", background: T.panel2, pointerEvents: "none" }}>
        {children}
      </div>
    </div>
  );
}

function LockShowcase({ onLoginScroll }: { onLoginScroll: () => void }) {
  const sections = [
    { tab: "discover", name: "Discover",
      tagline: `Source funds for clients - screen ${UNIVERSE_COUNT} funds by cost, risk, return, and yield.`,
      body: <FindPreview /> },
    { tab: "comparison", name: "Comparison",
      tagline: "Put up to 4 funds head-to-head across every factor, percentile, and tax angle.",
      body: <ComparisonPreview /> },
    { tab: "analysis", name: "Analysis",
      tagline: "A plain-English verdict on any fund - strengths, watch-outs, growth vs benchmark.",
      body: <AnalysisPreview /> },
  ];
  return (
    <div>
      {/* Advisor Hub banner */}
      <div style={{
        background: "var(--c-panel)",
        border: "1px solid var(--c-line)", borderRadius: 14, padding: "22px 26px", marginBottom: 18,
        position: "relative", overflow: "hidden",
        boxShadow: "0 4px 18px rgba(0,0,0,0.06)",
        display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "center",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.025, pointerEvents: "none",
          backgroundImage: "radial-gradient(circle, var(--c-text) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div style={{ position: "relative" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9.5, fontWeight: 500,
            letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-dim)",
            background: "var(--c-panel2)", border: "1px solid var(--c-line2)",
            borderRadius: 20, padding: "4px 11px", ...ui }}>
            ★ Advisor Hub
          </span>
          <div style={{ fontSize: 22, fontWeight: 300, color: "var(--c-text)", marginTop: 11,
            fontFamily: "var(--font-text)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            The Advisor Hub
          </div>
          <div style={{ fontSize: 13, color: "var(--c-dim)", ...ui, marginTop: 6, lineHeight: 1.55, maxWidth: 520 }}>
            Everything ALCA does for your workflow - find funds, pressure-test them, and
            build a recommendation. Sign in to get started.
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 16 }}>
            {[[String(UNIVERSE_COUNT), "funds in universe"], ["16", "metrics per fund"], ["3", "research tools"]].map(([n, l]) => (
              <div key={l}>
                <div style={{ fontSize: 20, fontWeight: 600, color: "var(--c-text)", ...mono, lineHeight: 1 }}>{n}</div>
                <div style={{ fontSize: 9.5, color: "var(--c-muted)", ...ui, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <VolSurface3D />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sections.map((s) => (
          <LockShowcaseSection key={s.tab} tab={s.tab} name={s.name} tagline={s.tagline} onLoginScroll={onLoginScroll}>
            {s.body}
          </LockShowcaseSection>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  // ── Auth state ────────────────────────────────────────────────────────────
  // mode: null=checking, "none"=public, "preview"=guest, "full"=logged in
  const [authMode, setAuthMode]   = useState<null | "none" | "preview" | "full">(SHOW_TOOL_DIRECTLY ? "preview" : null);
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
    // Demo mode: skip the lock screen entirely, go straight to the tool.
    if (SHOW_TOOL_DIRECTLY) return;
    // The lock screen is always a fully black splash - force dark tokens
    // regardless of the saved theme. (AppShell restores the user's real theme
    // on its own mount after sign-in.)
    setThemeLocal("dark");
    document.documentElement.setAttribute("data-theme", "dark");
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
    return <AppShell authMode={authMode} authUser={authUser} onLogout={async () => {
      // In demo mode, keep coworkers inside the tool (don't drop to the hidden lock screen).
      if (SHOW_TOOL_DIRECTLY) return;
      await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }) });
      setAuthMode("none"); setAuthUser(null); setEmail(""); setPassword(""); setPreviewPw("");
    }} />;
  }

  // Still checking session - black to match the splash, no flash
  if (authMode === null) return <div style={{ minHeight: "100vh", background: "#000000" }} />;

  const isDark    = theme === "dark";
  const acc       = isDark ? ACC_DARK : ACC;
  const sectionBg = "#000000";
  const divLine   = "rgba(255,255,255,0.06)";

  // ── Cinematic dark hero palette ──────────────────────────────────────────
  // The lock screen is always a dark splash, independent of the app theme, so
  // the razorbill photo reads as a moody, full-bleed hero. (App theme resumes
  // after sign-in.)
  const H = {
    text:    "#F7F7F4",
    dim:     "rgba(247,247,244,0.66)",
    muted:   "rgba(247,247,244,0.42)",
    cardBg:  "rgba(13,13,15,0.58)",
    cardBrd: "rgba(255,255,255,0.12)",
    inputBg: "rgba(255,255,255,0.055)",
    inputBrd:"rgba(255,255,255,0.16)",
    acc:     "#F7F7F4",
    accText: "#0A0A0B",
  };

  // Nav adapts: light over the dark hero, theme-matched once scrolled into the showcase.
  const navText    = scrolled ? T.text : H.text;
  const navDim     = scrolled ? T.dim  : H.dim;
  const navAcc     = scrolled ? acc    : H.acc;
  const navAccText = scrolled ? (isDark ? "#0A0A0B" : "#FFFFFF") : H.accText;

  return (
    <div style={{ background: "#000000", minHeight: "100vh", overflowX: "hidden" }}>

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
        {/* Tool wordmark - nav brand */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{
            ...lynx, fontSize: 20, fontWeight: 300,
            letterSpacing: "0.07em", color: navText,
            textTransform: "uppercase", lineHeight: 1, transition: "color 0.3s",
          }}>
            ALCA
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => featuresRef.current?.scrollIntoView({ behavior: "smooth" })}
            style={{ background: "none", border: "none", cursor: "pointer",
              fontSize: 12.5, color: navDim, ...ui, padding: "6px 14px",
              borderRadius: 7, transition: "color 0.15s", letterSpacing: "0.01em" }}
            onMouseEnter={e => (e.currentTarget.style.color = navText)}
            onMouseLeave={e => (e.currentTarget.style.color = navDim)}
          >
            Preview
          </button>
          <button
            onClick={() => document.getElementById("login-card")?.scrollIntoView({ behavior: "smooth", block: "center" })}
            style={{ background: navAcc, border: "none", cursor: "pointer",
              fontSize: 12.5, fontWeight: 600, color: navAccText, ...ui,
              padding: "7px 18px", borderRadius: 8, transition: "opacity 0.15s",
              letterSpacing: "0.01em" }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            Enter →
          </button>
        </div>
      </nav>

      {/* ── Hero - cinematic black lock screen ── */}
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        position: "relative", overflow: "hidden", paddingTop: 58,
        background: "#000000",
      }}>
        {/* Razorbill photo - emerging from black, edges feathered so it has no seam */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: "url(/razorbill.jpg)",
          backgroundSize: "82%", backgroundPosition: "38% 24%",
          backgroundRepeat: "no-repeat",
          maskImage: "radial-gradient(112% 108% at 43% 42%, #000 42%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(112% 108% at 43% 42%, #000 42%, transparent 72%)",
        }} />
        {/* Cinematic vignette - keeps the bird luminous, sinks the edges to pure black */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          background: "radial-gradient(110% 125% at 56% 42%, transparent 0%, transparent 26%, rgba(0,0,0,0.5) 58%, rgba(0,0,0,1) 92%)",
        }} />
        {/* Left-edge fade - anchors the wordmark without washing the bird out */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          background: "linear-gradient(to right, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.66) 22%, rgba(0,0,0,0.14) 44%, transparent 58%)",
        }} />
        {/* Right-edge fade - pulls the black across the login card so it floats on black */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          background: "linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.94) 18%, rgba(0,0,0,0.55) 34%, transparent 52%)",
        }} />
        {/* Bottom grounding gradient */}
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: "42%", zIndex: 1,
          background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)",
        }} />
        {/* Fine film grain for richness */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 1, opacity: 0.05, pointerEvents: "none",
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }} />

        <div style={{
          maxWidth: 1240, margin: "0 auto", padding: "80px 48px",
          width: "100%", display: "grid",
          gridTemplateColumns: "1fr 400px", gap: 64, alignItems: "center",
          position: "relative", zIndex: 2,
        }}>

          {/* ── Left: headline ── */}
          <div>
            {/* Big Tool headline */}
            <h1 style={{
              ...lynx,
              fontSize: "clamp(52px, 7vw, 96px)",
              fontWeight: 300,
              letterSpacing: "0.09em",
              lineHeight: 0.95,
              color: H.text, margin: "0 0 8px",
              textTransform: "uppercase",
              textShadow: "0 2px 40px rgba(0,0,0,0.5)",
            }}>
              ALCA
            </h1>

            {/* By The Capital Group - attribution line */}
            <div style={{
              ...lynx,
              fontSize: "clamp(12px, 1.3vw, 15px)",
              fontWeight: 300,
              fontStyle: "italic",
              letterSpacing: "0.06em",
              color: H.dim,
              margin: "0 0 26px",
            }}>
              By The Capital Group
            </div>

            {/* Sub-headline */}
            <p style={{
              fontSize: "clamp(16px, 2vw, 19px)", color: H.dim,
              lineHeight: 1.6, margin: "0 0 36px", maxWidth: 440, ...ui,
              fontWeight: 400,
              textShadow: "0 1px 20px rgba(0,0,0,0.6)",
            }}>
              Fund research and analytics for advisors.
            </p>

            {/* CTA row - login card on right handles entry */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={() => featuresRef.current?.scrollIntoView({ behavior: "smooth" })}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 10, padding: "12px 24px",
                  fontSize: 14, color: H.dim, ...ui, cursor: "pointer",
                  transition: "all 0.2s", backdropFilter: "blur(8px)",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = H.text; e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = H.dim; e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; }}
              >
                See it in action ↓
              </button>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 36, marginTop: 52, flexWrap: "wrap" }}>
              {STATS.map(s => (
                <div key={s.label}>
                  <div style={{ ...lynx, fontSize: 26, fontWeight: 300, color: H.text, letterSpacing: "0.04em", lineHeight: 1 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 11, color: H.muted, ...ui, marginTop: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: login card - frosted glass over the bird ── */}
          <div id="login-card" style={{
            background: H.cardBg,
            border: `1px solid ${H.cardBrd}`,
            borderRadius: 18, padding: "38px 34px 32px",
            backdropFilter: "blur(26px) saturate(135%)",
            WebkitBackdropFilter: "blur(26px) saturate(135%)",
            boxShadow: "0 40px 100px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.07)",
          }}>
            {/* Card brand - wordmark */}
            <div style={{ marginBottom: 0 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ ...lynx, fontSize: 24, fontWeight: 300, letterSpacing: "0.05em", color: H.text, textTransform: "uppercase", lineHeight: 1 }}>
                  ALCA
                </div>
                <div style={{ fontSize: 9.5, color: H.muted, letterSpacing: "0.07em", textTransform: "uppercase", ...ui, marginTop: 5 }}>
                  Fund Analytics · The Capital Group
                </div>
              </div>
              {/* Underline - professional divider */}
              <div style={{
                width: "100%", height: 1,
                background: "rgba(255,255,255,0.12)",
                marginBottom: 24,
              }} />
            </div>

            {/* ── Tier 1: Full account login ── */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: H.text, ...ui, marginBottom: 12 }}>
                Sign in to your account
              </div>

              <div style={{ marginBottom: 10 }}>
                <input type="email" placeholder="Email address" value={email}
                  onChange={e => { setEmail(e.target.value); setLoginErr(""); }}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 13px",
                    background: H.inputBg, border: `1px solid ${loginErr ? "#F87171" : H.inputBrd}`,
                    borderRadius: 8, fontSize: 13, color: H.text, outline: "none",
                    fontFamily: "'Geist', sans-serif", transition: "border-color 0.15s" }}
                  onFocus={e => (e.currentTarget.style.borderColor = H.acc)}
                  onBlur={e => (e.currentTarget.style.borderColor = loginErr ? "#F87171" : H.inputBrd)}
                />
              </div>

              <div style={{ position: "relative", marginBottom: 10 }}>
                <input type={showPass ? "text" : "password"} placeholder="Password" value={password}
                  onChange={e => { setPassword(e.target.value); setLoginErr(""); }}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 38px 10px 13px",
                    background: H.inputBg, border: `1px solid ${loginErr ? "#F87171" : H.inputBrd}`,
                    borderRadius: 8, fontSize: 13, color: H.text, outline: "none",
                    fontFamily: "'Geist', sans-serif", transition: "border-color 0.15s" }}
                  onFocus={e => (e.currentTarget.style.borderColor = H.acc)}
                  onBlur={e => (e.currentTarget.style.borderColor = loginErr ? "#F87171" : H.inputBrd)}
                />
                <button onClick={() => setShowPass(s => !s)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: H.muted, padding: 2 }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
                    {showPass && <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>}
                  </svg>
                </button>
              </div>

              {loginErr && <div style={{ fontSize: 11.5, color: "#F87171", ...ui, marginBottom: 8 }}>{loginErr}</div>}

              <button onClick={handleLogin} disabled={loading}
                style={{ width: "100%", padding: "10px 0", borderRadius: 8, cursor: loading ? "wait" : "pointer",
                  background: H.acc, color: H.accText,
                  border: "none", fontSize: 13, fontWeight: 600, ...ui,
                  opacity: loading ? 0.7 : 1, transition: "opacity 0.15s" }}>
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </div>

            {/* ── Divider ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1, height: 1, background: H.cardBrd }} />
              <span style={{ fontSize: 10, color: H.muted, ...ui, letterSpacing: "0.08em", textTransform: "uppercase" }}>or preview</span>
              <div style={{ flex: 1, height: 1, background: H.cardBrd }} />
            </div>

            {/* ── Tier 2: Preview password ── */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: H.dim, ...ui, marginBottom: 10 }}>
                Have the employee preview code? Browse without saving.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="password" placeholder="Preview password" value={previewPw}
                  onChange={e => { setPreviewPw(e.target.value); setPreviewErr(""); }}
                  onKeyDown={e => e.key === "Enter" && handlePreview()}
                  style={{ flex: 1, padding: "10px 13px", boxSizing: "border-box",
                    background: H.inputBg, border: `1px solid ${previewErr ? "#F87171" : H.inputBrd}`,
                    borderRadius: 8, fontSize: 13, color: H.text, outline: "none",
                    fontFamily: "'Geist', sans-serif", transition: "border-color 0.15s" }}
                  onFocus={e => (e.currentTarget.style.borderColor = H.acc)}
                  onBlur={e => (e.currentTarget.style.borderColor = previewErr ? "#F87171" : H.inputBrd)}
                />
                <button onClick={handlePreview} disabled={previewLoading}
                  style={{ padding: "10px 16px", borderRadius: 8, cursor: previewLoading ? "wait" : "pointer",
                    background: "transparent", border: `1px solid ${H.cardBrd}`,
                    fontSize: 13, color: H.dim, ...ui, whiteSpace: "nowrap",
                    transition: "all 0.15s", opacity: previewLoading ? 0.6 : 1 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = H.acc; e.currentTarget.style.color = H.text; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = H.cardBrd; e.currentTarget.style.color = H.dim; }}>
                  {previewLoading ? "…" : "Enter →"}
                </button>
              </div>
              {previewErr && <div style={{ fontSize: 11.5, color: "#F87171", ...ui, marginTop: 6 }}>{previewErr}</div>}
            </div>

            <p style={{ textAlign: "center", marginTop: 14, marginBottom: 0, fontSize: 10, color: H.muted, ...ui, lineHeight: 1.5 }}>
              Full account saves watchlist &amp; preferences across devices.
            </p>
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          opacity: 0.5, animation: "lx-bounce 2.5s infinite",
        }}>
          <span style={{ fontSize: 9, color: H.muted, ...ui, letterSpacing: "0.04em" }}>SCROLL</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4l4 5 4-5" stroke="rgba(247,247,244,0.5)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ── Advisor Hub showcase ── */}
      <div ref={featuresRef} style={{ background: sectionBg, borderTop: `1px solid ${divLine}`, padding: "80px 40px 100px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ fontSize: 10, fontWeight: 500, color: T.muted, letterSpacing: "0.08em",
            textTransform: "uppercase", ...ui, marginBottom: 52, textAlign: "center" }}>
            A look inside
          </div>
          <LockShowcase onLoginScroll={() => {
            document.getElementById("login-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }} />
          <p style={{ textAlign: "center", marginTop: 48, fontSize: 10.5, color: T.muted, ...ui, letterSpacing: "0.03em" }}>
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
