"use client";
import React, { useEffect, useMemo, useState } from "react";
import { T, ui, mono } from "../tokens";
import { findFund } from "../../lib/universe";
import { useMergedUniverse } from "../../lib/universeClient";
import type { HandoffPortfolio } from "../../lib/handoff";
import {
  spreadReturns, validateReturns,
  type ModelAssumptions,
} from "../../lib/model";

// ── Shared constants ──────────────────────────────────────────────────────────

export const DISCLAIMER = "Illustrative advisor analysis. Results depend on assumptions and are not guarantees of future performance.";

export const DEFAULTS: ModelAssumptions = {
  years: 20, initial: 100_000, monthlyContribution: 500, monthlyWithdrawal: 0,
  ...spreadReturns(6), annualVol: 10, inflation: 2.5, expenseRatio: 0.1,
};

/** One color per path, used consistently across every Model chart + tile. */
export const PATH_COLORS = { down: "#F5B04B", base: "#5EEAD4", up: "#38BDF8" } as const;
/** One color per scenario/series slot — chips, lines, legend, tables all match. */
export const SCEN_COLORS = ["#5EEAD4", "#38BDF8", "#F5B04B", "#C084FC"];

// ── Historical stats pulled from the existing compare endpoint ────────────────

export interface FundStats {
  ticker: string; name: string; expenseRatio: number | null;
  ret3y: number | null; ret5y: number | null; vol3y: number | null; maxDD5y: number | null;
  /** Cumulative growth since the period start (monthly, %), fund + its benchmark. */
  growth: { date: string; fundReturn: number; benchReturn: number }[];
  benchmark: string;
  fetchedAt: number | null;
}

export async function fetchStats(tickers: string[]): Promise<Map<string, FundStats>> {
  const res = await fetch("/api/compare", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickers }),
  });
  if (!res.ok) throw new Error("stats fetch failed");
  const data = await res.json();
  const map = new Map<string, FundStats>();
  for (const f of data.funds ?? []) {
    map.set(f.ticker, {
      ticker: f.ticker, name: f.name, expenseRatio: f.expenseRatio,
      ret3y: f.kpi?.return3y ?? null, ret5y: f.kpi?.return5y ?? null,
      vol3y: f.kpi?.stdDev3y ?? null, maxDD5y: f.kpi?.maxDrawdown5y ?? null,
      growth: f.kpi?.rolling3y ?? [], benchmark: f.benchmark,
      fetchedAt: f.fetchedAt ?? null,
    });
  }
  return map;
}

/** Best available historical annualized return + which period it covers.
    Computed from adjusted price history, so it is already NET of expenses. */
export function histReturn(f: FundStats): { ret: number; period: string } | null {
  if (f.ret5y != null) return { ret: f.ret5y, period: "5-year" };
  if (f.ret3y != null) return { ret: f.ret3y, period: "3-year" };
  return null;
}

export interface DerivedAssumptions {
  baseReturn: number;         // weighted historical annualized return, net of expenses
  annualVol: number | null;   // weighted historical volatility — null when no holding has it
  expenseRatio: number | null;// weighted expense ratio — null when no holding has one
  period: string;             // e.g. "5-year" / "3–5-year"
  asOf: string | null;        // data as-of date
  stats: Map<string, FundStats>;
}

/** Weighted historical stats for a set of holdings (simple weighted averages —
    correlations ignored; stated in Methodology). Each stat is averaged only
    over the holdings that actually HAVE it — missing data is never replaced
    with an invented value; a stat with no data at all comes back null. */
export async function deriveAssumptions(holdings: { ticker: string; weight: number }[]): Promise<DerivedAssumptions | null> {
  const m = await fetchStats(holdings.map((h) => h.ticker));
  let ret = 0, retW = 0, vol = 0, volW = 0, exp = 0, expW = 0;
  const periods = new Set<string>();
  let asOfMs: number | null = null;
  for (const h of holdings) {
    const st = m.get(h.ticker.toUpperCase()); if (!st) continue;
    const hr = histReturn(st);
    if (hr) { periods.add(hr.period); ret += hr.ret * h.weight; retW += h.weight; }
    if (st.vol3y != null) { vol += st.vol3y * h.weight; volW += h.weight; }
    if (st.expenseRatio != null) { exp += st.expenseRatio * h.weight; expW += h.weight; }
    if (st.fetchedAt) asOfMs = Math.max(asOfMs ?? 0, st.fetchedAt);
  }
  if (retW === 0) return null; // no usable return history at all
  return {
    baseReturn: +(ret / retW).toFixed(2),
    annualVol: volW > 0 ? +(vol / volW).toFixed(2) : null,
    expenseRatio: expW > 0 ? +(exp / expW).toFixed(3) : null,
    period: [...periods].sort().join(" / ") || "3–5-year",
    asOf: asOfMs ? new Date(asOfMs).toLocaleDateString() : null,
    stats: m,
  };
}

/** Rough equity share of a handoff portfolio via the universe's benchmark mapping. */
export function equityShare(pf: HandoffPortfolio): number | null {
  let eq = 0, tot = 0;
  for (const h of pf.holdings) {
    const f = findFund(h.ticker.toUpperCase()); if (!f) continue;
    tot += h.weight;
    if (f.benchmark !== "AGG") eq += h.weight;
  }
  return tot > 0 ? Math.round((eq / tot) * 100) : null;
}

// ── Layout primitives ─────────────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14,
      boxShadow: "var(--c-card-shadow)", padding: "20px 22px", ...style }}>{children}</div>
  );
}

/** Card headline with an optional subdued qualifier. */
export function CardTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, ...ui, marginBottom: 12 }}>
      {children}{sub && <span style={{ fontWeight: 500, color: T.muted, fontSize: 11.5, marginLeft: 8 }}>{sub}</span>}
    </div>
  );
}

export function Notice() {
  return (
    <div role="note" style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "rgba(180,83,9,0.06)",
      border: "1px solid rgba(180,83,9,0.25)", borderRadius: 10, padding: "10px 14px" }}>
      <span style={{ color: T.amber, flexShrink: 0, marginTop: 1 }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/><path d="M8 5v3.6M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </span>
      <span style={{ fontSize: 12, color: T.dim, ...ui, lineHeight: 1.5 }}>{DISCLAIMER}</span>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.05em",
};

export function Field({ label, value, onChange, step = 1, min, max, suffix, width = 120, invalid }: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; suffix?: string; width?: number; invalid?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input type="number" value={Number.isFinite(value) ? value : 0} step={step} min={min} max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(Number.isFinite(v) ? v : 0);
          }}
          style={{ width, padding: "9px 11px", borderRadius: 9,
            border: `1px solid ${invalid ? T.red : T.line2}`,
            background: T.panel, color: T.text, fontSize: 13.5, ...mono, outline: "none" }} />
        {suffix && <span style={{ fontSize: 12, color: T.muted, ...ui }}>{suffix}</span>}
      </span>
    </label>
  );
}

export function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "10px 18px", borderRadius: 10, border: "none", cursor: disabled ? "default" : "pointer",
        background: disabled ? T.panel3 : T.blue, color: disabled ? T.muted : "#fff",
        fontSize: 13, fontWeight: 600, ...ui, transition: "background 0.15s" }}>{children}</button>
  );
}
export function GhostBtn({ children, onClick, disabled, danger }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "10px 15px", borderRadius: 10, cursor: disabled ? "default" : "pointer", background: T.panel,
        border: `1px solid ${danger ? `${T.red}55` : T.line2}`, color: disabled ? T.muted : danger ? T.red : T.dim,
        fontSize: 13, fontWeight: 600, ...ui, opacity: disabled ? 0.6 : 1 }}>{children}</button>
  );
}

export function StatTile({ label, value, sub, tone, icon }: {
  label: string; value: string; sub?: string; tone?: "up" | "down"; icon?: React.ReactNode;
}) {
  return (
    <div style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 11, padding: "13px 16px", minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: tone === "down" ? T.red : tone === "up" ? T.green : T.text, ...mono,
        marginTop: 4, display: "flex", alignItems: "center", gap: 7, overflow: "hidden", textOverflow: "ellipsis" }}>
        {icon}{value}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.muted, ...ui, marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}

/** Inline error list shown under invalid inputs — names the exact problem. */
export function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul role="alert" style={{ margin: "10px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
      {errors.map((e) => <li key={e} style={{ fontSize: 12.5, color: T.red, ...ui, lineHeight: 1.5 }}>{e}</li>)}
    </ul>
  );
}

// ── Ticker typeahead (reuses the classified universe, client-side) ───────────
export function TickerInput({ value, onPick, placeholder = "Ticker" }: { value: string; onPick: (t: string) => void; placeholder?: string }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const { funds: universe } = useMergedUniverse();
  useEffect(() => setQ(value), [value]);
  const matches = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s || s === value) return [];
    return universe.filter((f) => f.ticker.startsWith(s) || f.name.toUpperCase().includes(s)).slice(0, 6);
  }, [q, value, universe]);
  return (
    <div style={{ position: "relative" }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <input value={q} placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value.toUpperCase()); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" && matches.length) { onPick(matches[0].ticker); setOpen(false); } }}
        aria-label="Fund ticker"
        style={{ width: 110, padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.line2}`,
          background: T.panel, color: T.text, fontSize: 13.5, ...mono, outline: "none", textTransform: "uppercase" }} />
      {open && matches.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 20, minWidth: 280,
          background: T.panel, border: `1px solid ${T.line2}`, borderRadius: 10, overflow: "hidden", boxShadow: "var(--elev-3)" }}>
          {matches.map((f) => (
            <button key={f.ticker} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(f.ticker); setQ(f.ticker); setOpen(false); }}
              style={{ display: "flex", gap: 10, width: "100%", padding: "9px 12px", border: "none",
                background: "transparent", cursor: "pointer", textAlign: "left", alignItems: "center" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.blueL)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.blue, ...mono, width: 52 }}>{f.ticker}</span>
              <span style={{ fontSize: 12, color: T.dim, ...ui, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Source banner (portfolio handoff) ─────────────────────────────────────────
export function SourceBanner({ pf, horizon, onReturn, loading }: {
  pf: HandoffPortfolio; horizon?: number | null; onReturn?: () => void; loading?: boolean;
}) {
  const eq = equityShare(pf);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      background: T.blueL, border: `1px solid ${T.blue}44`, borderRadius: 12, padding: "12px 16px" }}>
      <span style={{ display: "flex", color: T.blue, flexShrink: 0 }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><line x1="4.5" y1="6" x2="11.5" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="4.5" y1="8.5" x2="9.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
      </span>
      <span style={{ flex: 1, minWidth: 200 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.text, ...ui }}>
          Loaded from Portfolio — {pf.name}
        </span>
        <span style={{ display: "block", fontSize: 11.5, color: T.dim, ...ui, marginTop: 2 }}>
          {loading ? "Loading portfolio into Model · preparing scenarios · running illustrative projection…"
            : `${pf.holdings.length} holdings${eq != null ? ` · ~${eq}% equity · ~${100 - eq}% fixed income & cash` : ""}${horizon ? ` · ${horizon}y horizon` : ""}`}
        </span>
      </span>
      {onReturn && (
        <button onClick={onReturn}
          style={{ padding: "7px 13px", borderRadius: 8, cursor: "pointer", background: T.panel,
            border: `1px solid ${T.line2}`, color: T.dim, fontSize: 11.5, fontWeight: 600, ...ui, flexShrink: 0 }}>
          ← Return to Portfolio
        </button>
      )}
    </div>
  );
}

// ── Assumption method + path-return inputs ────────────────────────────────────

export type Method = "historical" | "custom";

export function MethodSelect({ value, onChange, hasHistorical, historicalLabel }: {
  value: Method; onChange: (m: Method) => void; hasHistorical: boolean; historicalLabel?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={labelStyle}>Assumption method</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Method)}
        style={{ padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.line2}`, background: T.panel,
          color: T.text, fontSize: 13, ...ui, outline: "none" }}>
        <option value="historical" disabled={!hasHistorical}>
          {historicalLabel ?? "Historical return"}{hasHistorical ? "" : " (load data first)"}
        </option>
        <option value="custom">Advisor-defined</option>
      </select>
    </label>
  );
}

/** The three editable path-return assumptions (net of fund expenses). */
export function PathReturnFields({ a, onChange }: {
  a: ModelAssumptions; onChange: (patch: Partial<ModelAssumptions>) => void;
}) {
  const errs = validateReturns(a);
  const bad = (field: "downReturn" | "baseReturn" | "upReturn") =>
    errs.some((e) => e.toLowerCase().startsWith(
      field === "downReturn" ? "downside" : field === "baseReturn" ? "base" : "upside"));
  return (
    <>
      <Field label="Downside return (%/yr)" value={a.downReturn} step={0.25} width={90}
        invalid={bad("downReturn")} onChange={(v) => onChange({ downReturn: v })} />
      <Field label="Base return (%/yr)" value={a.baseReturn} step={0.25} width={90}
        invalid={bad("baseReturn")} onChange={(v) => onChange({ baseReturn: v })} />
      <Field label="Upside return (%/yr)" value={a.upReturn} step={0.25} width={90}
        invalid={bad("upReturn")} onChange={(v) => onChange({ upReturn: v })} />
    </>
  );
}

// ── Methodology (facts vs assumptions) ────────────────────────────────────────

export function Methodology({ a, facts, extra }: {
  a: ModelAssumptions;
  /** Historical/portfolio facts relevant to this workflow (already formatted). */
  facts?: string[];
  extra?: string[];
}) {
  return (
    <details style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: "14px 18px" }}>
      <summary style={{ fontSize: 13, fontWeight: 600, color: T.text, ...ui, cursor: "pointer" }}>
        Assumptions and Methodology
      </summary>
      <div style={{ margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Facts (measured, historical)
          </div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
            {[
              ...(facts ?? []),
              "Historical return, volatility, and drawdown come from the platform's 3–5 year adjusted price history.",
              "Historical returns are computed from adjusted prices, so they are already net of each fund's expense ratio — expenses are never subtracted twice.",
              "Expense ratios and holdings/weights are portfolio facts, shown for context.",
            ].map((l) => <li key={l} style={{ fontSize: 12, color: T.dim, ...ui, lineHeight: 1.5 }}>{l}</li>)}
          </ul>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Assumptions (illustrative, editable)
          </div>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
            {[
              `Return paths: Downside ${a.downReturn.toFixed(1)}% · Base ${a.baseReturn.toFixed(1)}% · Upside ${a.upReturn.toFixed(1)}% per year, net of fund expenses. These are independent assumption paths — not probability bands, confidence intervals, or forecasts.`,
              `By default, Downside and Upside start at the Base assumption ∓/± 2 percentage points; all three are editable.`,
              `Volatility (${a.annualVol.toFixed(1)}%) is shown as a risk metric for context. It does not adjust any return path.`,
              `Inflation assumption: ${a.inflation.toFixed(1)}% per year (used for the inflation-adjusted view).`,
              "Deterministic monthly compounding — no simulations or random draws.",
              "Weighted portfolio statistics are simple weighted averages and ignore correlations between holdings.",
              "Rebalancing, taxes, and trading costs are not modeled.",
              "Historical performance does not guarantee future results. Modeled outcomes are illustrative, not investment guarantees.",
              ...(extra ?? []),
            ].map((l) => <li key={l} style={{ fontSize: 12, color: T.dim, ...ui, lineHeight: 1.5 }}>{l}</li>)}
          </ul>
        </div>
      </div>
    </details>
  );
}

/** Sustainability verdict with a readable label + icon (never color alone). */
export function SustainabilityTile({ result }: { result: import("../../lib/model").ModelResult }) {
  const dep = result.depletionMonth;
  const paths: [string, number | undefined][] = [["Downside", dep.down], ["Base", dep.base], ["Upside", dep.up]];
  const depleted = paths.filter(([, m]) => m != null);
  const ok = depleted.length === 0;
  const worst = depleted.length ? Math.min(...depleted.map(([, m]) => m!)) : null;
  const icon = ok
    ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5 8.2l2 2 4-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
    : <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 2L14.5 13.5H1.5L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8 6.5v3M8 11.7h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
  return (
    <StatTile
      label="Sustainability"
      icon={icon}
      value={ok ? "Lasts the horizon" : `Depletes ~yr ${Math.ceil(worst! / 12)}`}
      tone={ok ? "up" : "down"}
      sub={ok
        ? "All modeled paths stay above zero through the horizon"
        : paths.map(([name, m]) => m != null ? `${name} path depletes ~yr ${Math.ceil(m / 12)}` : `${name} path lasts`).join(" · ")}
    />
  );
}
