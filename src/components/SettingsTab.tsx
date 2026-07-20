"use client";
import React, { useEffect, useRef, useState } from "react";
import { T, ui, mono } from "./tokens";
import { UNIVERSE, UNIVERSE_GENERATED_AT } from "@/lib/universe";
import { loadPrefs, savePrefs, applyMotionPref, type Prefs, type LandingPref, type BenchmarkPref, type MotionPref } from "@/lib/prefs";
import pkg from "../../package.json";

// ── Settings drawer ───────────────────────────────────────────────────────────
// A compact right-side drawer: Appearance, Workspace Preferences, Data &
// Methodology, About. Preferences persist per device via localStorage — there
// is no cross-device sync, and the drawer says so. Every control shown here is
// wired to real application behavior; the data facts below are verified against
// the actual pipeline (FMP primary, Tiingo history fallback; the classification
// file carries its real generatedAt).

export type Theme = "light" | "dark" | "system";

const UNIVERSE_COUNT = UNIVERSE.length;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
      color: T.muted, ...ui, margin: "0 0 4px" }}>{children}</h3>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 14, padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...ui }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: T.dim, marginTop: 2, ...ui, lineHeight: 1.45 }}>{sub}</div>}
      </div>
      {children && <div style={{ flexShrink: 0 }}>{children}</div>}
    </div>
  );
}

function Segmented<V extends string>({ value, onChange, options, label }: {
  value: V; onChange: (v: V) => void; options: { id: V; label: string }[]; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label}
      style={{ display: "inline-flex", gap: 2, background: T.panel3, border: `1px solid ${T.line}`,
        borderRadius: 9, padding: 3 }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button key={o.id} role="radio" aria-checked={on} onClick={() => onChange(o.id)}
            style={{ padding: "6px 12px", borderRadius: 6, cursor: on ? "default" : "pointer",
              fontSize: 12, fontWeight: on ? 600 : 500, ...ui,
              color: on ? "#fff" : T.dim, background: on ? T.blue : "transparent",
              border: "none", transition: "all 0.14s" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ width: 40, height: 23, borderRadius: 99, border: `1px solid ${on ? T.blue : T.line2}`,
        background: on ? T.blue : T.panel3, position: "relative", cursor: "pointer", transition: "background 0.15s" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 19 : 2, width: 17, height: 17,
        borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        transition: "left 0.15s" }} />
    </button>
  );
}

function InfoDisclosure({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details style={{ borderBottom: `1px solid ${T.line}`, padding: "10px 0" }}>
      <summary style={{ fontSize: 12.5, fontWeight: 600, color: T.blue, ...ui, cursor: "pointer" }}>{title}</summary>
      <div style={{ fontSize: 12, color: T.dim, ...ui, lineHeight: 1.6, marginTop: 8 }}>{children}</div>
    </details>
  );
}

// ── System Health (internal diagnostics) ──────────────────────────────────────
// Reads the normalized snapshot from /api/health/system (auth-gated, safe
// fields only). Rendered only for authenticated (internal) users. Status
// wording: Healthy / Warning / Needs attention.

type HealthStatus = "healthy" | "warning" | "error";
interface HealthCheck {
  key: string; label: string; status: HealthStatus; summary: string;
  details?: Record<string, unknown>; checkedAt: string;
}
interface HealthPayload { generatedAt: string; overall: HealthStatus; checks: HealthCheck[] }

const HEALTH_TONE: Record<HealthStatus, { dot: string; label: string }> = {
  healthy: { dot: "#22c55e", label: "Healthy" },
  warning: { dot: "#f59e0b", label: "Warning" },
  error:   { dot: "#ef4444", label: "Needs attention" },
};

function StatusPill({ status }: { status: HealthStatus }) {
  const tone = HEALTH_TONE[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 700,
      color: tone.dot, background: `${tone.dot}18`, border: `1px solid ${tone.dot}44`,
      borderRadius: 999, padding: "2px 9px", ...ui, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: tone.dot }} />
      {tone.label}
    </span>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function SystemHealthSection() {
  const [data, setData] = useState<HealthPayload | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/health/system", { cache: "no-store" });
      if (!r.ok) { setError(r.status === 401 ? "Sign in to view system health." : "Health check unavailable."); setData(null); return; }
      setData(await r.json() as HealthPayload);
    } catch {
      setError("Could not reach the health endpoint."); setData(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void run(); }, [run]);

  return (
    <section aria-label="System health">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <SectionLabel>System Health</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {data && <StatusPill status={data.overall} />}
          <button onClick={() => void run()} disabled={loading}
            style={{ padding: "5px 11px", borderRadius: 7, border: `1px solid ${T.line2}`, background: T.panel,
              color: loading ? T.muted : T.dim, fontSize: 11, fontWeight: 600, cursor: loading ? "default" : "pointer", ...ui }}>
            {loading ? "Checking…" : "Refresh Health"}
          </button>
        </div>
      </div>
      <p style={{ fontSize: 10.5, color: T.muted, ...ui, margin: "2px 0 10px" }}>
        Internal diagnostics — live status of ALCA’s core systems. Not a marketing claim.
      </p>

      {data === undefined && !error && (
        <div style={{ fontSize: 12, color: T.dim, ...ui, padding: "10px 0" }}>Checking systems…</div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: T.amber, background: `${T.amber}14`, border: `1px solid ${T.amber}44`,
          borderRadius: 9, padding: "10px 12px", ...ui }}>{error}</div>
      )}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.checks.map((c) => (
            <details key={c.key} style={{ border: `1px solid ${T.line2}`, borderRadius: 10, background: T.panel, padding: "10px 12px" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                cursor: "pointer", listStyle: "none" }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text, ...ui }}>{c.label}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: T.dim, ...ui, marginTop: 2, lineHeight: 1.4 }}>{c.summary}</span>
                </span>
                <StatusPill status={c.status} />
              </summary>
              <div style={{ marginTop: 8, borderTop: `1px solid ${T.line}`, paddingTop: 8 }}>
                <div style={{ fontSize: 10.5, color: T.muted, ...ui, marginBottom: 6 }}>Last checked {fmtTime(c.checkedAt)}</div>
                {c.details && (
                  <pre style={{ margin: 0, fontSize: 11, color: T.dim, ...mono, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    background: T.panel3, border: `1px solid ${T.line}`, borderRadius: 7, padding: "8px 10px", overflowX: "auto" }}>
                    {Object.entries(c.details).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join("\n")}
                  </pre>
                )}
              </div>
            </details>
          ))}
          <div style={{ fontSize: 10.5, color: T.muted, ...ui, marginTop: 2 }}>Last checked {fmtTime(data.generatedAt)}</div>
        </div>
      )}
    </section>
  );
}

export default function SettingsDrawer({ open, onClose, theme, setTheme, environment }: {
  open: boolean; onClose: () => void;
  theme: Theme; setTheme: (t: Theme) => void;
  environment?: "full" | "preview" | "none" | null;
}) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPrefs(loadPrefs());
    returnFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      returnFocus.current?.focus?.();
    };
  }, [open, onClose]);

  const update = (patch: Partial<Prefs>) => {
    const next = savePrefs(patch);
    setPrefs(next);
    if (patch.motion) applyMotionPref(patch.motion);
  };

  if (!open) return null;

  const generated = UNIVERSE_GENERATED_AT
    ? new Date(UNIVERSE_GENERATED_AT).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;
  const commit = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  return (
    <div role="dialog" aria-modal="true" aria-label="Settings" style={{ position: "fixed", inset: 0, zIndex: 300 }}>
      {/* backdrop */}
      <div onClick={onClose} aria-hidden
        style={{ position: "absolute", inset: 0, background: "rgba(10,12,16,0.42)",
          animation: "alca-fade-in 0.18s ease-out both" }} />
      {/* panel */}
      <div
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "min(460px, 100vw)",
          background: T.bg, borderLeft: `1px solid ${T.line}`, boxShadow: "-16px 0 48px rgba(0,0,0,0.22)",
          display: "flex", flexDirection: "column",
          animation: "alca-drawer-in 0.24s cubic-bezier(0.16,1,0.3,1) both" }}>
        <style>{`
          @keyframes alca-drawer-in { from { transform: translateX(28px); opacity: 0; } to { transform: none; opacity: 1; } }
          @keyframes alca-fade-in { from { opacity: 0; } to { opacity: 1; } }
        `}</style>

        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, ...ui, margin: 0 }}>Settings</h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close settings"
            style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.line2}`, cursor: "pointer",
              background: T.panel, color: T.dim, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, transition: "color 0.14s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.dim)}>×</button>
        </div>

        {/* body */}
        <div style={{ overflowY: "auto", padding: "18px 20px 26px", display: "flex", flexDirection: "column", gap: 26 }}>

          {/* ── Appearance ── */}
          <section aria-label="Appearance">
            <SectionLabel>Appearance</SectionLabel>
            <Row label="Theme" sub="System follows your device preference.">
              <Segmented<Theme> label="Theme" value={theme} onChange={setTheme}
                options={[{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }, { id: "system", label: "System" }]} />
            </Row>
            <Row label="Motion" sub="Reduced disables interface animation.">
              <Segmented<MotionPref> label="Motion" value={prefs.motion} onChange={(m) => update({ motion: m })}
                options={[{ id: "system", label: "System" }, { id: "full", label: "Full" }, { id: "reduced", label: "Reduced" }]} />
            </Row>
          </section>

          {/* ── Workspace Preferences ── */}
          <section aria-label="Workspace preferences">
            <SectionLabel>Workspace Preferences</SectionLabel>
            <Row label="Default landing page" sub="Where ALCA opens on this device.">
              <select value={prefs.landing} onChange={(e) => update({ landing: e.target.value as LandingPref })}
                aria-label="Default landing page"
                style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line2}`,
                  background: T.panel, color: T.text, fontSize: 12.5, ...ui }}>
                <option value="home">Home page</option>
                <option value="dashboard">Advisor Overview</option>
                <option value="research">Research</option>
                <option value="workspace">Portfolio</option>
                <option value="model">Model</option>
              </select>
            </Row>
            <Row label="Default benchmark" sub="Pre-selected in Model comparisons.">
              <select value={prefs.benchmark} onChange={(e) => update({ benchmark: e.target.value as BenchmarkPref })}
                aria-label="Default benchmark"
                style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.line2}`,
                  background: T.panel, color: T.text, fontSize: 12.5, ...mono }}>
                {(["SPY", "AGG", "VXUS"] as const).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Row>
            <Row label="Open last workspace" sub="Return to where you left off, overriding the landing page.">
              <Toggle label="Open last workspace" on={prefs.openLast} onChange={(v) => update({ openLast: v })} />
            </Row>
            <p style={{ fontSize: 10.5, color: T.muted, ...ui, margin: "10px 0 0" }}>
              Preferences are saved on this device only.
            </p>
          </section>

          {/* ── Data & Methodology ── */}
          <section aria-label="Data and methodology">
            <SectionLabel>Data &amp; Methodology</SectionLabel>
            <Row label="Fund universe" sub="Verified, classified funds available to screen, compare, and analyze.">
              <span style={{ fontSize: 14, fontWeight: 700, color: T.data, ...mono }}>{UNIVERSE_COUNT.toLocaleString()}</span>
            </Row>
            <Row label="Data coverage"
              sub="Fund profiles, market quotes, historical prices & dividends, expenses, risk metrics, classifications, and benchmark comparisons." />
            <Row label="Data sources" sub="Prices delayed and unofficial.">
              <span style={{ fontSize: 11.5, color: T.dim, ...ui, textAlign: "right" }}>
                Financial Modeling Prep · Tiingo
              </span>
            </Row>
            {generated && (
              <Row label="Classification data" sub="When the fund classification file was last generated.">
                <span style={{ fontSize: 12, color: T.dim, ...mono }}>{generated}</span>
              </Row>
            )}
            <InfoDisclosure title="View Methodology">
              Fund classifications use a deterministic, rule-based ALCA Wealth taxonomy applied to provider
              fund profiles, with human verification — only verified funds appear in the universe. Performance
              and risk metrics (returns, volatility, drawdown, Sharpe, capture) are computed from 3–5 years of
              price history against three broad benchmarks (SPY, AGG, VXUS), so benchmark-relative statistics
              are approximations. Screening ranks funds by weighted category-relative percentiles. Model
              projections are deterministic, assumption-based illustrations — not simulations or forecasts.
            </InfoDisclosure>
            <InfoDisclosure title="View Data Disclosures">
              Market data is provided by third-party sources (Financial Modeling Prep as primary, Tiingo as a
              history fallback), is delayed, and may contain errors or gaps. Expense ratios come from static reference data and may lag
              provider updates. Nothing in ALCA Wealth is investment advice; historical performance does not
              guarantee future results.
            </InfoDisclosure>
          </section>

          {/* ── System Health (internal, authenticated users only) ── */}
          {(environment === "full" || environment === "preview") && <SystemHealthSection />}

          {/* ── About ── */}
          <section aria-label="About ALCA Wealth">
            <SectionLabel>About</SectionLabel>
            <Row label="ALCA Wealth"
              sub="Research, portfolio construction, and scenario-modeling tools for financial professionals." />
            {environment && (
              <Row label="Environment">
                <span style={{ fontSize: 11, fontWeight: 700, color: environment === "preview" ? T.amber : T.green,
                  background: T.panel3, border: `1px solid ${T.line2}`, borderRadius: 6, padding: "3px 9px",
                  textTransform: "capitalize", ...ui }}>{environment}</span>
              </Row>
            )}
            <Row label="Version">
              <span style={{ fontSize: 12, color: T.dim, ...mono }}>{pkg.version}{commit ? ` · ${commit}` : ""}</span>
            </Row>
            <p style={{ fontSize: 11.5, color: T.muted, ...ui, lineHeight: 1.6, margin: "14px 0 0" }}>
              ALCA Wealth provides research and analytical tools for financial professionals. Data,
              classifications, recommendations, and modeled results should be independently reviewed
              before being used in an investment decision.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
