"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { T, ui, mono } from "../tokens";
import { loadPrefs } from "../../lib/prefs";
import {
  projectPaths, saveScenario, spreadReturns, validateReturns,
  fmtMoney, fmtMoneyFull,
  type ModelAssumptions, type SavedScenario,
} from "../../lib/model";
import {
  Card, CardTitle, Field, PrimaryBtn, GhostBtn, StatTile, ErrorList, TickerInput,
  MethodSelect, PathReturnFields, Methodology, DEFAULTS, PATH_COLORS,
  fetchStats, histReturn, type FundStats, type Method,
} from "./shared";
import { ModelChart, tripleSeries, pathLine, extrasFrom, type ChartSeries } from "./ModelChart";

// ════════════════════════════════════════════════════════════════════════════
//  Fund vs. Benchmark — two clearly separated sections:
//  A. Historical Comparison (facts: real shared price history)
//  B. Illustrative Projection (assumptions: editable Downside/Base/Upside)
// ════════════════════════════════════════════════════════════════════════════

const BENCH_CHOICES = ["SPY", "AGG", "VXUS"];

/** Growth of $10,000 over the shared history of two funds, merged by month. */
function growth10k(f: FundStats, b: FundStats): { data: { date: string; fund: number; bench: number }[]; from: string; to: string } | null {
  const bByDate = new Map(b.growth.map((p) => [p.date, p.fundReturn]));
  const shared = f.growth.filter((p) => bByDate.has(p.date));
  if (shared.length < 6) return null;
  const f0 = shared[0].fundReturn, b0 = bByDate.get(shared[0].date)!;
  const data = shared.map((p) => ({
    date: p.date,
    fund: +(10_000 * (1 + p.fundReturn / 100) / (1 + f0 / 100)).toFixed(0),
    bench: +(10_000 * (1 + bByDate.get(p.date)! / 100) / (1 + b0 / 100)).toFixed(0),
  }));
  return { data, from: shared[0].date, to: shared[shared.length - 1].date };
}

/** Small dedicated historical chart (dates on x-axis, real data only). */
function HistoricalChart({ f, b }: { f: FundStats; b: FundStats }) {
  const g = useMemo(() => growth10k(f, b), [f, b]);
  if (!g) return (
    <p style={{ fontSize: 12.5, color: T.muted, ...ui, margin: 0 }}>
      Not enough shared price history to draw a growth comparison.
    </p>
  );
  // Reuse ModelChart by mapping month index; label ticks by year from dates.
  const series: ChartSeries[] = [
    { label: `${f.ticker} (historical)`, points: g.data.map((p, i) => ({ month: i, value: p.fund })), color: PATH_COLORS.base, width: 2.2 },
    { label: `${b.ticker} benchmark (historical)`, points: g.data.map((p, i) => ({ month: i, value: p.bench })), color: PATH_COLORS.up, dash: "6 4" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ModelChart height={240} series={series}
        ariaLabel={`Historical growth of $10,000: ${f.ticker} versus ${b.ticker}, ${g.from} to ${g.to}`} />
      <div style={{ fontSize: 11, color: T.muted, ...ui }}>
        Growth of $10,000 · shared history {g.from} → {g.to} · x-axis in years since period start ·
        computed from adjusted prices (net of fund expenses). Past performance, not a forecast.
      </div>
    </div>
  );
}

export function FundBenchmark({ prefill }: { prefill?: SavedScenario | null }) {
  const [ticker, setTicker] = useState((prefill?.extra?.ticker as string) ?? "");
  const [bench, setBench] = useState((prefill?.extra?.benchmark as string) ?? loadPrefs().benchmark);
  const [a, setA] = useState<ModelAssumptions>(
    prefill?.assumptions ?? { ...DEFAULTS, years: 10, monthlyContribution: 0, initial: 10_000 });
  const [method, setMethod] = useState<Method>("historical");
  const [showBenchPaths, setShowBenchPaths] = useState(false);
  const [stats, setStats] = useState<Map<string, FundStats> | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  const load = async (t: string, bn: string) => {
    if (!t) return;
    setLoading(true); setErr(""); setSaved(false);
    try {
      const m = await fetchStats(t === bn ? [t] : [t, bn]);
      setStats(m);
      // Initialize path assumptions from the fund's historical record (net of
      // expenses) with the transparent default ±2pt spread — fully editable.
      const st = m.get(t.toUpperCase());
      const hr = st ? histReturn(st) : null;
      if (hr && method === "historical") setA((prev) => ({ ...prev, ...spreadReturns(hr.ret) }));
    } catch { setErr("Could not load historical data for that ticker."); }
    setLoading(false);
  };

  const f = stats?.get(ticker); const b = stats?.get(bench);
  const same = !!f && ticker === bench;
  const fHist = f ? histReturn(f) : null;
  const bHist = b ? histReturn(b) : null;

  const applyMethod = (m: Method) => {
    setMethod(m);
    if (m === "historical" && fHist) setA((prev) => ({ ...prev, ...spreadReturns(fHist.ret) }));
  };

  const effA: ModelAssumptions = { ...a, annualVol: f?.vol3y ?? a.annualVol, expenseRatio: f?.expenseRatio ?? a.expenseRatio };
  const returnErrs = validateReturns(effA);
  const result = useMemo(() => (f && !returnErrs.length ? projectPaths(effA) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f, effA.years, effA.initial, effA.monthlyContribution, effA.downReturn, effA.baseReturn, effA.upReturn, effA.inflation, effA.expenseRatio, returnErrs.length]);
  // Benchmark projection always uses the benchmark's own historical base (net),
  // so the comparison stays meaningful even with advisor-defined fund paths.
  const benchResult = useMemo(() => {
    if (!b || bHist == null || same) return null;
    // Volatility never drives paths; benchmark ER isn't displayed — carry the
    // current assumption / zero rather than inventing a number.
    return projectPaths({ ...effA, ...spreadReturns(bHist.ret), annualVol: b.vol3y ?? effA.annualVol, expenseRatio: b.expenseRatio ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, bHist?.ret, same, effA.years, effA.initial, effA.monthlyContribution, effA.inflation]);

  // Resume: auto-load data for a saved comparison.
  const resumed = useRef(false);
  useEffect(() => {
    if (prefill && !resumed.current && ticker) { resumed.current = true; void load(ticker, bench); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // ── Tradeoff summary (facts, framed neutrally) ──
  const tradeoffs: string[] = [];
  if (f && b && !same) {
    const fr = fHist?.ret, br = bHist?.ret;
    if (fr != null && br != null) tradeoffs.push(fr > br
      ? `Historical return was higher than the benchmark (${fr.toFixed(1)}% vs ${br.toFixed(1)}% annualized).`
      : `Historical return was lower than the benchmark (${fr.toFixed(1)}% vs ${br.toFixed(1)}% annualized).`);
    if (f.vol3y != null && b.vol3y != null) tradeoffs.push(f.vol3y > b.vol3y
      ? `Volatility was higher (${f.vol3y.toFixed(1)}% vs ${b.vol3y.toFixed(1)}%) — historically a bumpier ride.`
      : `Volatility was lower (${f.vol3y.toFixed(1)}% vs ${b.vol3y.toFixed(1)}%) — historically a steadier ride.`);
    if (f.maxDD5y != null && b.maxDD5y != null) tradeoffs.push(Math.abs(f.maxDD5y) > Math.abs(b.maxDD5y)
      ? `Maximum drawdown was deeper (${f.maxDD5y.toFixed(1)}% vs ${b.maxDD5y.toFixed(1)}%).`
      : `Maximum drawdown was shallower (${f.maxDD5y.toFixed(1)}% vs ${b.maxDD5y.toFixed(1)}%).`);
    if (f.expenseRatio != null && b.expenseRatio != null) tradeoffs.push(f.expenseRatio > b.expenseRatio
      ? `Expenses are higher (${f.expenseRatio.toFixed(2)}% vs ${b.expenseRatio.toFixed(2)}%).`
      : `Expenses are lower or comparable (${f.expenseRatio.toFixed(2)}% vs ${b.expenseRatio.toFixed(2)}%).`);
  }

  const asOf = f?.fetchedAt ? new Date(f.fetchedAt).toLocaleDateString() : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── selection ── */}
      <Card>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.05em" }}>Fund</span>
            <TickerInput value={ticker} onPick={setTicker} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.05em" }}>Benchmark</span>
            <select value={bench} onChange={(e) => setBench(e.target.value)}
              style={{ padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.line2}`, background: T.panel, color: T.text, fontSize: 13, ...ui }}>
              {BENCH_CHOICES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <PrimaryBtn onClick={() => load(ticker, bench)} disabled={!ticker || loading}>
            {loading ? "Loading…" : "Compare Fund"}
          </PrimaryBtn>
        </div>
        {err && <p style={{ fontSize: 12.5, color: T.red, ...ui, margin: "10px 0 0" }}>{err}</p>}
      </Card>

      {same && (
        <Card style={{ borderColor: `${T.amber}55` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, ...ui }}>Same investment selected on both sides</div>
          <p style={{ fontSize: 12.5, color: T.dim, ...ui, margin: "6px 0 0", lineHeight: 1.6 }}>
            {ticker} is being compared with itself, so every historical and modeled figure is identical —
            this is not a meaningful comparison. Choose a different benchmark ({BENCH_CHOICES.filter((x) => x !== ticker).join(" or ")}) to see real differences.
          </p>
        </Card>
      )}

      {f && (
        <>
          {/* ── A · Historical Comparison (facts) ── */}
          <Card>
            <CardTitle sub="past performance, not a forecast">Historical Comparison</CardTitle>
            {!same && b && <HistoricalChart f={f} b={b} />}
            <div style={{ overflowX: "auto", marginTop: !same && b ? 16 : 0 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
                <thead><tr>
                  {["", f.ticker, ...(!same && b ? [`${b.ticker} (benchmark)`] : [])].map((h, i) => (
                    <th key={i} style={{ textAlign: "left", fontSize: 11, color: T.muted, ...ui, padding: "6px 12px 8px 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {([
                    [`Annualized return (${fHist?.period ?? "3–5-year"})`, fHist?.ret ?? null, bHist?.ret ?? null, "%"],
                    ["Volatility (3-year, annualized)", f.vol3y, b?.vol3y ?? null, "%"],
                    ["Max drawdown (5-year)", f.maxDD5y, b?.maxDD5y ?? null, "%"],
                    ["Expense ratio", f.expenseRatio, b?.expenseRatio ?? null, "%"],
                  ] as [string, number | null, number | null, string][]).map(([label, fv, bv]) => (
                    <tr key={label} style={{ borderTop: `1px solid ${T.line}` }}>
                      <td style={{ fontSize: 12.5, color: T.dim, ...ui, padding: "9px 12px 9px 0" }}>{label}</td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: T.text, ...mono, padding: "9px 12px 9px 0" }}>{fv == null ? "—" : `${fv.toFixed(2)}%`}</td>
                      {!same && b && <td style={{ fontSize: 13, color: T.dim, ...mono, padding: "9px 0" }}>{bv == null ? "—" : `${bv.toFixed(2)}%`}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 11, color: T.muted, ...ui, margin: "12px 0 0" }}>
              Source: platform price history (Tiingo){asOf ? ` · data as of ${asOf}` : ""} ·
              returns computed from adjusted prices, already net of fund expenses.
            </p>
          </Card>

          {/* ── B · Illustrative Projection (assumptions) ── */}
          <Card>
            <CardTitle sub="assumption-driven, not a forecast">Illustrative Projection</CardTitle>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
              <Field label="Starting value ($)" value={a.initial} step={1000} min={0} onChange={(v) => setA({ ...a, initial: Math.max(0, v) })} />
              <Field label="Monthly contribution ($)" value={a.monthlyContribution} step={50} min={0} onChange={(v) => setA({ ...a, monthlyContribution: Math.max(0, v) })} />
              <Field label="Horizon (years)" value={a.years} step={1} min={1} max={60} width={80} onChange={(v) => setA({ ...a, years: Math.min(60, Math.max(1, v)) })} />
              <MethodSelect value={method} onChange={applyMethod} hasHistorical={!!fHist}
                historicalLabel={fHist ? `Historical return (${fHist.period}, ${fHist.ret.toFixed(1)}%)` : undefined} />
              <PathReturnFields a={a} onChange={(patch) => { setA({ ...a, ...patch }); setMethod("custom"); }} />
              {!same && bHist != null && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: T.dim, ...ui, cursor: "pointer", paddingBottom: 9 }}>
                  <input type="checkbox" checked={showBenchPaths} onChange={(e) => setShowBenchPaths(e.target.checked)} />
                  Show benchmark downside/upside
                </label>
              )}
            </div>
            <ErrorList errors={returnErrs} />
            {method === "historical" && fHist && (
              <p style={{ fontSize: 11.5, color: T.muted, ...ui, margin: "12px 0 0", lineHeight: 1.55 }}>
                Base initialized from {f.ticker}&apos;s {fHist.period} historical annualized return ({fHist.ret.toFixed(1)}%, net of expenses);
                Downside/Upside start at base ∓/± 2 percentage points. This is still illustrative — historical data does not
                predict future performance. Edit any value to override.
              </p>
            )}
          </Card>

          {result && (
            <>
              <ModelChart
                ariaLabel={`Illustrative projected value of ${f.ticker}${!same && b ? ` versus ${b.ticker}` : ""} over ${effA.years} years under the selected assumptions`}
                series={[
                  ...tripleSeries(result, f.ticker),
                  ...(benchResult ? [
                    { label: `${b!.ticker} benchmark (base)`, points: pathLine(benchResult, "base"), color: "#C084FC", width: 1.8 },
                    ...(showBenchPaths ? [
                      { label: `${b!.ticker} upside`, points: pathLine(benchResult, "up"), color: "#C084FC", dash: "2 4", width: 1.2 },
                      { label: `${b!.ticker} downside`, points: pathLine(benchResult, "down"), color: "#C084FC", dash: "2 4", width: 1.2 },
                    ] : []),
                  ] : []),
                ]}
                extraByMonth={extrasFrom(result)}
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
                <StatTile label="Modeled ending — Base Path" value={fmtMoney(result.ending.base)} sub={`${effA.years}y · illustrative`} />
                <StatTile label="Downside Path" value={fmtMoney(result.ending.down)} sub={`${effA.downReturn.toFixed(1)}%/yr assumption`} />
                <StatTile label="Upside Path" value={fmtMoney(result.ending.up)} sub={`${effA.upReturn.toFixed(1)}%/yr assumption`} />
                {benchResult && (
                  <StatTile label={`vs ${b!.ticker} (base)`}
                    value={`${result.ending.base >= benchResult.ending.base ? "+" : "−"}${fmtMoney(Math.abs(result.ending.base - benchResult.ending.base))}`}
                    sub={`benchmark base ending ${fmtMoney(benchResult.ending.base)}`} />
                )}
                <StatTile label="Total contributions" value={fmtMoney(result.totals.contributed)} sub={`plus ${fmtMoneyFull(effA.initial)} starting value`} />
                <StatTile label="Est. embedded expenses" value={fmtMoney(result.totals.feesApprox)}
                  sub={`${effA.expenseRatio.toFixed(2)}%/yr — already inside the net return`} />
              </div>

              {tradeoffs.length > 0 && (
                <Card>
                  <CardTitle>Tradeoff summary</CardTitle>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {tradeoffs.map((t) => <li key={t} style={{ fontSize: 12.5, color: T.dim, ...ui, lineHeight: 1.7 }}>{t}</li>)}
                  </ul>
                  <p style={{ fontSize: 11.5, color: T.muted, ...ui, margin: "10px 0 0" }}>
                    A higher modeled ending value does not make one investment automatically better —
                    weigh return against volatility, drawdown, and cost for the client&apos;s situation.
                  </p>
                </Card>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <GhostBtn onClick={() => { saveScenario({ name: `${f.ticker} vs ${bench}`, tool: "fund-benchmark", subject: `${f.ticker} vs ${bench}`, assumptions: effA, extra: { ticker: f.ticker, benchmark: bench } }); setSaved(true); }}>
                  {saved ? "Saved ✓" : "Save scenario"}
                </GhostBtn>
              </div>
              <Methodology a={effA}
                facts={[
                  `${f.ticker}: ${fHist ? `${fHist.period} annualized return ${fHist.ret.toFixed(2)}%` : "no historical return available"}${f.vol3y != null ? `, volatility ${f.vol3y.toFixed(1)}%` : ""}${f.expenseRatio != null ? `, expense ratio ${f.expenseRatio.toFixed(2)}%` : ""}.`,
                  ...(!same && b ? [`${b.ticker}: ${bHist ? `${bHist.period} annualized return ${bHist.ret.toFixed(2)}%` : "no historical return available"}${b.vol3y != null ? `, volatility ${b.vol3y.toFixed(1)}%` : ""}${b.expenseRatio != null ? `, expense ratio ${b.expenseRatio.toFixed(2)}%` : ""}.` ] : []),
                ]}
                extra={[
                  "The benchmark projection always uses the benchmark's own historical base return, so it stays a meaningful reference when fund assumptions are advisor-defined.",
                ]} />
            </>
          )}
        </>
      )}
      {!f && !loading && (
        <p style={{ fontSize: 12.5, color: T.muted, ...ui }}>
          Enter a fund and choose a benchmark, then Compare Fund to load its historical record and model an illustrative projection.
        </p>
      )}
    </div>
  );
}
