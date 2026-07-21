"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { T, ui, mono } from "../tokens";
import { findFund } from "../../lib/universe";
import { useMergedUniverse } from "../../lib/universeClient";
import type { ModelHandoff } from "../../lib/handoff";
import { loadClients, upsertClient, newClient } from "../../lib/client";
import {
  projectPaths, saveScenario, spreadReturns, validateReturns, validateHoldings,
  fmtMoney, type ModelAssumptions, type SavedScenario,
} from "../../lib/model";
import {
  Card, CardTitle, Field, PrimaryBtn, GhostBtn, StatTile, ErrorList, TickerInput,
  SourceBanner, MethodSelect, PathReturnFields, Methodology, SustainabilityTile,
  DEFAULTS, deriveAssumptions, type DerivedAssumptions, type Method,
} from "./shared";
import { ModelChart, tripleSeries, extrasFrom } from "./ModelChart";

// ════════════════════════════════════════════════════════════════════════════
//  Portfolio Projection — four input groups:
//  1 Portfolio (facts) · 2 Cash Flows · 3 Economic · 4 Projection Assumptions
// ════════════════════════════════════════════════════════════════════════════

interface Holding { ticker: string; weight: number }

export function PortfolioProjection({ prefill, handoff, onReturnToPortfolio }: {
  prefill?: SavedScenario | null; handoff?: ModelHandoff | null; onReturnToPortfolio?: () => void;
}) {
  // Known tickers from the LIVE merged universe (base + verified dynamic funds).
  const { funds: universe } = useMergedUniverse();
  const KNOWN_TICKERS = useMemo(() => new Set(universe.map((f) => f.ticker)), [universe]);
  const [holdings, setHoldings] = useState<Holding[]>(
    handoff ? handoff.primary.holdings.map((h) => ({ ticker: h.ticker, weight: h.weight }))
    : (prefill?.extra?.holdings as Holding[]) ?? []);
  const [a, setA] = useState<ModelAssumptions>(
    handoff ? { ...DEFAULTS, years: handoff.horizonYears || DEFAULTS.years, monthlyWithdrawal: 0 }
    : prefill?.assumptions ?? { ...DEFAULTS });
  const [method, setMethod] = useState<Method>("custom");
  const [derived, setDerived] = useState<DerivedAssumptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [real, setReal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedAs, setSavedAs] = useState("");
  const [err, setErr] = useState("");

  const rows = holdings.filter((h) => h.ticker.trim() || h.weight > 0);
  const valid = holdings.filter((h) => h.ticker && h.weight > 0);
  const totalW = valid.reduce((s, h) => s + h.weight, 0);
  const holdingErrs = rows.length ? validateHoldings(holdings, KNOWN_TICKERS) : [];

  const derive = async (hs: Holding[], skipValidation = false) => {
    if (!hs.length) return;
    if (!skipValidation && holdingErrs.length) return;
    setLoading(true); setErr("");
    try {
      const d = await deriveAssumptions(hs);
      if (d) {
        setDerived(d);
        setA((prev) => ({ ...prev, ...spreadReturns(d.baseReturn),
          ...(d.annualVol != null ? { annualVol: d.annualVol } : {}),
          ...(d.expenseRatio != null ? { expenseRatio: d.expenseRatio } : {}) }));
        setMethod("historical");
      } else setErr("No historical data found for those tickers.");
    } catch { setErr("Could not load holding data."); }
    setLoading(false);
  };

  // Handoff from Portfolio: assumptions derive automatically — no re-entry needed.
  const derivedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!handoff) return;
    const key = handoff.primary.name;
    if (derivedFor.current === key) return;
    derivedFor.current = key;
    void derive(handoff.primary.holdings.map((h) => ({ ticker: h.ticker, weight: h.weight })), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff]);

  // ── Portfolio facts (measured, from derived stats) ──
  const facts = useMemo(() => {
    if (!derived) return null;
    let eq = 0, tot = 0, dd = 0, ddW = 0;
    for (const h of valid) {
      const u = findFund(h.ticker.toUpperCase());
      if (u) { tot += h.weight; if (u.benchmark !== "AGG") eq += h.weight; }
      const st = derived.stats.get(h.ticker.toUpperCase());
      if (st?.maxDD5y != null) { dd += st.maxDD5y * h.weight; ddW += h.weight; }
    }
    return {
      count: valid.length,
      equityPct: tot > 0 ? Math.round((eq / tot) * 100) : null,
      weightedDD: ddW > 0 ? dd / ddW : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived, holdings]);

  const returnErrs = validateReturns(a);
  const blocked = [...(rows.length ? holdingErrs : []), ...returnErrs];
  const effA = a;
  // The engine is deterministic and cheap (years × 12 steps × 3 paths) — a
  // straight recompute is simpler and safer than memo invalidation.
  const result = blocked.length ? null : projectPaths(effA);

  // ── Explicit save-back actions — Model never silently overwrites a portfolio ──
  const holdingsToClient = (base: ReturnType<typeof newClient>, name: string) => ({
    ...base, name,
    holdings: valid.map((h) => ({ ticker: h.ticker.toUpperCase(), value: Math.round(effA.initial * (h.weight / (totalW || 100))) })),
    horizonYears: effA.years, updatedAt: Date.now(),
  });
  const saveAsNewPortfolio = () => {
    if (!valid.length) return;
    const name = `${(handoff?.primary.name.replace(/^Proposed — |^Current — /, "") || "Modeled portfolio")} (Model ${new Date().toLocaleDateString()})`;
    upsertClient(holdingsToClient(newClient(), name));
    setSavedAs(name);
  };
  const updateOriginal = () => {
    if (!handoff?.clientId || !valid.length) return;
    const orig = loadClients().find((c) => c.id === handoff.clientId);
    if (!orig) return;
    if (!window.confirm(`Overwrite the saved holdings on "${orig.name || "Untitled Client"}" with this modeled portfolio? This cannot be undone.`)) return;
    upsertClient({ ...orig, holdings: valid.map((h) => ({ ticker: h.ticker.toUpperCase(), value: Math.round(effA.initial * (h.weight / (totalW || 100))) })), updatedAt: Date.now() });
    setSavedAs(orig.name || "Untitled Client");
  };

  const sustainabilityDetail = result ? (() => {
    const dep = result.depletionMonth;
    const entries: [string, number | undefined][] = [["Downside", dep.down], ["Base", dep.base], ["Upside", dep.up]];
    const survives = entries.filter(([, m]) => m == null).map(([n]) => n);
    const depletes = entries.filter(([, m]) => m != null);
    if (!depletes.length) return "All three modeled paths remain above zero through the full horizon.";
    return [
      survives.length ? `${survives.join(" and ")} path${survives.length > 1 ? "s" : ""} last${survives.length > 1 ? "" : "s"} the horizon.` : "No modeled path lasts the horizon.",
      ...depletes.map(([n, m]) => `${n} path is depleted around year ${Math.ceil(m! / 12)}.`),
    ].join(" ");
  })() : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {handoff && <SourceBanner pf={handoff.primary} horizon={handoff.horizonYears} onReturn={onReturnToPortfolio} loading={loading} />}

      {/* ── 1 · Portfolio (facts) ── */}
      <Card>
        <CardTitle sub="holdings, weights, expenses — measured facts, not assumptions">1 · Portfolio</CardTitle>
        {holdings.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {holdings.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <TickerInput value={h.ticker} onPick={(t) => setHoldings(holdings.map((x, j) => j === i ? { ...x, ticker: t } : x))} />
                <input type="number" value={h.weight} min={0} step={5} aria-label="Weight %"
                  onChange={(e) => setHoldings(holdings.map((x, j) => j === i ? { ...x, weight: parseFloat(e.target.value) || 0 } : x))}
                  style={{ width: 70, padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.line2}`, background: T.panel, color: T.text, fontSize: 13.5, ...mono }} />
                <span style={{ fontSize: 12, color: T.muted, ...ui }}>%</span>
                {derived?.stats.get(h.ticker) && <span style={{ fontSize: 11, color: T.muted, ...ui }}>{derived.stats.get(h.ticker)!.name.slice(0, 34)}</span>}
                <button onClick={() => setHoldings(holdings.filter((_, j) => j !== i))} aria-label="Remove holding"
                  style={{ border: "none", background: "none", color: T.muted, cursor: "pointer", fontSize: 15 }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: holdings.length ? 12 : 0, flexWrap: "wrap", alignItems: "center" }}>
          <GhostBtn onClick={() => setHoldings([...holdings, { ticker: "", weight: 0 }])}>+ Add holding</GhostBtn>
          {holdings.length > 0 && (
            <>
              <GhostBtn onClick={() => { const t = totalW || 1; setHoldings(holdings.map((h) => ({ ...h, weight: +(h.weight / t * 100).toFixed(1) }))); }}>Normalize weights</GhostBtn>
              <PrimaryBtn onClick={() => derive(valid)} disabled={!valid.length || !!holdingErrs.length || loading}>
                {loading ? "Loading…" : "Derive historical statistics"}
              </PrimaryBtn>
              <span style={{ fontSize: 11.5, color: Math.abs(totalW - 100) <= 0.5 ? T.muted : T.amber, ...ui, ...mono }}>
                Total {totalW.toFixed(1)}%
              </span>
            </>
          )}
          {!holdings.length && (
            <span style={{ fontSize: 12, color: T.muted, ...ui }}>
              Optional — add holdings to derive historical statistics, or model with advisor-defined assumptions below.
            </span>
          )}
        </div>
        <ErrorList errors={holdingErrs} />
        {err && <p style={{ fontSize: 12.5, color: T.red, ...ui, margin: "8px 0 0" }}>{err}</p>}

        {derived && facts && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${T.line}`, paddingTop: 12,
            display: "flex", flexWrap: "wrap", gap: "8px 22px" }}>
            {([
              ["Holdings", `${facts.count}`],
              ["Mix", facts.equityPct != null ? `~${facts.equityPct}% equity · ~${100 - facts.equityPct}% fixed income & cash` : "—"],
              ["Weighted expense ratio", derived.expenseRatio != null ? `${derived.expenseRatio.toFixed(2)}%` : "—"],
              [`Historical return (${derived.period})`, `${derived.baseReturn.toFixed(2)}%/yr`],
              ["Historical volatility", derived.annualVol != null ? `${derived.annualVol.toFixed(1)}%` : "—"],
              ["Avg max drawdown (5y, weighted)", facts.weightedDD != null ? `${facts.weightedDD.toFixed(1)}%` : "—"],
              ["Data as of", derived.asOf ?? "—"],
            ] as [string, string][]).map(([l, v]) => (
              <span key={l} style={{ fontSize: 11.5, color: T.dim, ...ui }}>
                <span style={{ color: T.muted }}>{l}: </span><span style={{ fontWeight: 600, ...mono }}>{v}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* ── 2 · Cash Flows ── */}
      <Card>
        <CardTitle>2 · Cash Flows</CardTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <Field label="Starting value ($)" value={a.initial} step={5000} min={0} onChange={(v) => setA({ ...a, initial: Math.max(0, v) })} />
          <Field label="Monthly contribution ($)" value={a.monthlyContribution} step={100} min={0} onChange={(v) => setA({ ...a, monthlyContribution: Math.max(0, v) })} />
          <Field label="Monthly withdrawal ($)" value={a.monthlyWithdrawal} step={100} min={0} onChange={(v) => setA({ ...a, monthlyWithdrawal: Math.max(0, v) })} />
          <Field label="Horizon (years)" value={a.years} step={1} min={1} max={60} width={80} onChange={(v) => setA({ ...a, years: Math.min(60, Math.max(1, v)) })} />
        </div>
      </Card>

      {/* ── 3 · Economic Assumptions ── */}
      <Card>
        <CardTitle>3 · Economic Assumptions</CardTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <Field label="Inflation (%/yr)" value={a.inflation} step={0.25} min={0} width={90} onChange={(v) => setA({ ...a, inflation: Math.max(0, v) })} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: T.dim, ...ui, cursor: "pointer", paddingBottom: 9 }}>
            <input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} />
            Show inflation-adjusted values
          </label>
        </div>
      </Card>

      {/* ── 4 · Projection Assumptions ── */}
      <Card>
        <CardTitle sub="illustrative and editable — not a forecast">4 · Projection Assumptions</CardTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <MethodSelect value={method}
            onChange={(m) => { setMethod(m); if (m === "historical" && derived) setA((prev) => ({ ...prev, ...spreadReturns(derived.baseReturn),
              ...(derived.annualVol != null ? { annualVol: derived.annualVol } : {}),
              ...(derived.expenseRatio != null ? { expenseRatio: derived.expenseRatio } : {}) })); }}
            hasHistorical={!!derived}
            historicalLabel={derived ? `Historical return (${derived.period}, ${derived.baseReturn.toFixed(1)}%)` : undefined} />
          <PathReturnFields a={a} onChange={(patch) => { setA({ ...a, ...patch }); setMethod("custom"); }} />
          <Field label="Volatility — risk metric (%)" value={a.annualVol} step={0.5} min={0} width={90}
            onChange={(v) => setA({ ...a, annualVol: Math.max(0, v) })} />
          <Field label="Expense ratio — fact (%/yr)" value={a.expenseRatio} step={0.05} min={0} width={90}
            onChange={(v) => setA({ ...a, expenseRatio: Math.max(0, v) })} />
        </div>
        <ErrorList errors={returnErrs} />
        {method === "historical" && derived && (
          <p style={{ fontSize: 11.5, color: T.muted, ...ui, margin: "12px 0 0", lineHeight: 1.55 }}>
            Derived from the portfolio&apos;s {derived.period} history: base return {derived.baseReturn.toFixed(2)}%/yr (net of expenses),
            volatility {derived.annualVol != null ? `${derived.annualVol.toFixed(1)}%` : "—"}, weighted expenses {derived.expenseRatio != null ? `${derived.expenseRatio.toFixed(2)}%` : "—"}.
            Downside/Upside start at base ∓/± 2 percentage points. Historical data does not predict future
            performance — edit any value to override.
          </p>
        )}
        <p style={{ fontSize: 11.5, color: T.muted, ...ui, margin: "10px 0 0" }}>
          Return assumptions are net of fund expenses; volatility is shown for risk context and never adjusts a return path.
        </p>
      </Card>

      {/* ── Output ── */}
      {result ? (
        <>
          <ModelChart
            ariaLabel={`Illustrative projected portfolio value over ${effA.years} years under the selected assumptions`}
            series={tripleSeries(result, "", real)}
            real={real}
            extraByMonth={extrasFrom(result)}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <StatTile label="Ending — Base Path (nominal)" value={fmtMoney(result.ending.base)} sub={`${effA.baseReturn.toFixed(1)}%/yr assumption`} />
            <StatTile label="Ending — Base Path (inflation-adj.)" value={fmtMoney(result.ending.baseReal)} sub={`${effA.inflation.toFixed(1)}%/yr inflation assumption`} />
            <StatTile label="Ending — Downside Path" value={fmtMoney(result.ending.down)} sub={`${effA.downReturn.toFixed(1)}%/yr assumption`} />
            <StatTile label="Ending — Upside Path" value={fmtMoney(result.ending.up)} sub={`${effA.upReturn.toFixed(1)}%/yr assumption`} />
            <StatTile label="Total contributions" value={fmtMoney(result.totals.contributed)} />
            <StatTile label="Planned withdrawals" value={fmtMoney(result.totals.withdrawn)} sub={result.depletionMonth.base ? "intended — base path depletes early" : undefined} />
            <StatTile label="Est. embedded expenses" value={fmtMoney(result.totals.feesApprox)} sub={`${effA.expenseRatio.toFixed(2)}%/yr — already inside the net return`} />
            <SustainabilityTile result={result} />
          </div>
          {sustainabilityDetail && (
            <Card>
              <CardTitle>Sustainability</CardTitle>
              <p style={{ fontSize: 12.5, color: T.dim, ...ui, margin: 0, lineHeight: 1.65 }}>{sustainabilityDetail}</p>
            </Card>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <GhostBtn onClick={() => { saveScenario({ name: handoff?.primary.name ?? (valid.length ? `${valid.length}-fund projection` : "Portfolio projection"), tool: "projection", subject: valid.map((h) => h.ticker).join(" / ") || "Advisor-defined assumptions", assumptions: effA, extra: { holdings } }); setSaved(true); }}>
              {saved ? "Saved ✓" : "Save scenario"}
            </GhostBtn>
            {valid.length > 0 && <GhostBtn onClick={saveAsNewPortfolio}>Save as New Portfolio</GhostBtn>}
            {handoff?.clientId && <GhostBtn onClick={updateOriginal}>Update Original Portfolio…</GhostBtn>}
            {savedAs && <span style={{ fontSize: 12, color: T.green, ...ui }}>Saved to portfolios: {savedAs} ✓</span>}
          </div>
          <Methodology a={effA}
            facts={derived ? [
              `Portfolio: ${valid.map((h) => `${h.ticker} ${h.weight}%`).join(", ")}.`,
              `Derived (${derived.period} history${derived.asOf ? `, as of ${derived.asOf}` : ""}): return ${derived.baseReturn.toFixed(2)}%/yr net, volatility ${derived.annualVol != null ? derived.annualVol.toFixed(1) + "%" : "—"}, weighted expenses ${derived.expenseRatio != null ? derived.expenseRatio.toFixed(2) + "%" : "—"}.`,
            ] : valid.length ? [`Portfolio: ${valid.map((h) => `${h.ticker} ${h.weight}%`).join(", ")}.`] : undefined} />
        </>
      ) : (
        <Card style={{ borderColor: `${T.amber}55` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, ...ui }}>Projection paused — fix the inputs above</div>
          <p style={{ fontSize: 12.5, color: T.dim, ...ui, margin: "6px 0 0", lineHeight: 1.6 }}>
            The projection runs only with a valid portfolio (or no holdings) and valid Downside ≤ Base ≤ Upside return assumptions.
            The exact problems are listed under the affected section.
          </p>
        </Card>
      )}
    </div>
  );
}
