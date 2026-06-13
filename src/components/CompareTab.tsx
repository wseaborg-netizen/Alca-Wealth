"use client";
import React, { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
  LineChart, Line, Cell,
} from "recharts";
import { T, mono, chartTooltip, ui } from "./tokens";
import { Btn, Label, Spinner, ErrBanner, Card } from "./ui";
import { computeTaxEfficiency } from "../lib/tax";

const SERIES = [T.data, T.text, "#8A8A92", T.cyan, T.amber, T.green];
const MAX_COMPARE = 6;

const PCT_LABELS: Record<string, string> = {
  cost: "Cost Efficiency",
  riskAdj: "Risk-Adjusted Return",
  downside: "Downside Protection",
  alpha: "Alpha Generation",
  consistency: "Consistency",
  yield: "Income / Yield",
};

interface StressTest { label: string; fundReturn: number | null; benchReturn: number | null }

interface FundData {
  ticker: string; name: string; vehicle: string; category: string;
  expenseRatio: number | null; aumFormatted: string; fundAge: number | null; peerCount?: number;
  kpi: {
    return1y: number | null; return3y: number | null; return5y: number | null;
    sharpe3y: number | null; sortino3y: number | null; calmar3y: number | null;
    infoRatio3y: number | null; alpha3y: number | null; beta3y: number | null;
    upsideCapture3y: number | null; downsideCapture3y: number | null;
    maxDrawdown5y: number | null; stdDev3y: number | null; battingAvg3y: number | null;
    ttmYield: number | null; divGrowth3y: number | null;
    rolling3y: { date: string; fundReturn: number; benchReturn: number }[];
    stressTests: StressTest[];
  };
  percentiles: { cost: number; riskAdj: number; downside: number; alpha: number; consistency: number; yield: number };
  error?: string;
}

function fmt(v: number | null, dec = 2, suffix = "") {
  if (v == null) return "—";
  return v.toFixed(dec) + suffix;
}

const KPI_ROWS: [string, (f: FundData) => string][] = [
  ["1Y Return",       (f) => fmt(f.kpi.return1y, 2, "%")],
  ["3Y CAGR",         (f) => fmt(f.kpi.return3y, 2, "%")],
  ["5Y CAGR",         (f) => fmt(f.kpi.return5y, 2, "%")],
  ["Sharpe 3Y",       (f) => fmt(f.kpi.sharpe3y, 2)],
  ["Sortino 3Y",      (f) => fmt(f.kpi.sortino3y, 2)],
  ["Calmar 3Y",       (f) => fmt(f.kpi.calmar3y, 2)],
  ["Info Ratio 3Y",   (f) => fmt(f.kpi.infoRatio3y, 2)],
  ["Alpha 3Y",        (f) => fmt(f.kpi.alpha3y, 2, "%")],
  ["Beta 3Y",         (f) => fmt(f.kpi.beta3y, 2)],
  ["Std Dev 3Y",      (f) => fmt(f.kpi.stdDev3y, 2, "%")],
  ["Max DD 5Y",       (f) => fmt(f.kpi.maxDrawdown5y, 1, "%")],
  ["Up Capture 3Y",   (f) => fmt(f.kpi.upsideCapture3y, 1)],
  ["Dn Capture 3Y",   (f) => fmt(f.kpi.downsideCapture3y, 1)],
  ["Batting Avg 3Y",  (f) => fmt(f.kpi.battingAvg3y, 1, "%")],
  ["TTM Yield",       (f) => fmt(f.kpi.ttmYield, 2, "%")],
  ["Div Growth 3Y",   (f) => fmt(f.kpi.divGrowth3y, 1, "%")],
  ["Expense Ratio",   (f) => fmt(f.expenseRatio, 2, "%")],
  ["AUM",             (f) => f.aumFormatted],
  ["Fund Age",        (f) => fmt(f.fundAge, 1, "y")],
];

const RAD_KEYS: [string, keyof FundData["percentiles"]][] = [
  ["Cost",        "cost"],
  ["Risk Adj",    "riskAdj"],
  ["Downside",    "downside"],
  ["Alpha",       "alpha"],
  ["Consistency", "consistency"],
  ["Yield",       "yield"],
];

/** Color for a percentile value */
function pctColor(v: number): string {
  if (v >= 70) return T.green;
  if (v >= 40) return T.amber;
  return T.red;
}

/** Scorecard — grouped horizontal bars per metric, one bar per fund */
function PercentileScorecard({ funds }: { funds: FundData[] }) {
  const PCT_KEYS = Object.keys(PCT_LABELS) as (keyof FundData["percentiles"])[];
  // Build recharts data: one row per metric, each fund is a property
  const chartData = PCT_KEYS.map(key => {
    const row: Record<string, string | number> = { metric: PCT_LABELS[key] };
    funds.forEach(f => { row[f.ticker] = f.percentiles[key]; });
    return row;
  });

  return (
    <Card style={{ padding: "18px 20px" }}>
      <Label>Percentile Scorecard — vs. all funds in category (higher = better)</Label>
      <div style={{ marginTop: 16 }}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 50, left: 110, bottom: 0 }}
          >
            <CartesianGrid stroke={T.line} horizontal={false} />
            <XAxis type="number" domain={[0, 100]}
              tick={{ fill: T.muted, fontSize: 9, fontFamily: "'Geist', sans-serif" }}
              axisLine={false} tickLine={false}
              tickFormatter={(v: number) => `${v}th`}
            />
            <YAxis type="category" dataKey="metric"
              tick={{ fill: T.dim, fontSize: 10, fontFamily: "'Geist', sans-serif" }}
              axisLine={false} tickLine={false} width={108}
            />
            <ReferenceLine x={50} stroke={T.line2} strokeDasharray="3 3" />
            <Tooltip
              {...chartTooltip}
              formatter={(v: unknown, name: unknown) => [`${v}th percentile`, String(name)]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, fontFamily: "'Geist', sans-serif" }}
            />
            {funds.map((f, i) => (
              <Bar key={f.ticker} dataKey={f.ticker} fill={SERIES[i]}
                radius={[0, 3, 3, 0]} barSize={10}>
                {chartData.map((row, ri) => (
                  <Cell key={ri} fill={SERIES[i]} fillOpacity={0.85} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Numeric summary grid */}
      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.line}` }}>
              <th style={{ textAlign: "left", fontSize: 9, color: T.muted,
                padding: "4px 8px", ...ui, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>
                Category
              </th>
              {funds.map((f, i) => (
                <th key={f.ticker} style={{ textAlign: "center", fontSize: 11, color: SERIES[i],
                  padding: "4px 8px", ...mono, fontWeight: 600 }}>
                  {f.ticker}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PCT_KEYS.map(key => (
              <tr key={key} style={{ borderBottom: `1px solid ${T.line}` }}>
                <td style={{ fontSize: 11, color: T.dim, padding: "7px 8px", ...ui }}>
                  {PCT_LABELS[key]}
                </td>
                {funds.map(f => {
                  const v = f.percentiles[key];
                  return (
                    <td key={f.ticker} style={{ textAlign: "center", padding: "7px 8px" }}>
                      <span style={{
                        fontSize: 12, fontWeight: 600, color: pctColor(v), ...mono,
                        background: pctColor(v) + "18",
                        padding: "2px 7px", borderRadius: 4,
                      }}>
                        {v}th
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function CompareTab({
  tickers, setTickers, onAnalyze,
}: { tickers: string[]; setTickers: (t: string[]) => void; onAnalyze?: (t: string) => void }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [funds, setFunds] = useState<FundData[] | null>(null);

  const add = () => {
    const t = input.trim().toUpperCase();
    if (t && !tickers.includes(t) && tickers.length < MAX_COMPARE) setTickers([...tickers, t]);
    setInput("");
  };

  const remove = (t: string) => { setTickers(tickers.filter((x) => x !== t)); setFunds(null); };

  const clear = () => { setTickers([]); setFunds(null); setErr(""); setInput(""); };

  const run = async () => {
    if (!tickers.length) return;
    setLoading(true); setErr(""); setFunds(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Compare failed");
      setFunds(data.funds);
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
  };

  const radarData = funds
    ? RAD_KEYS.map(([label, key]) => {
        const row: Record<string, string | number> = { metric: label };
        funds.forEach((f) => { row[f.ticker] = f.percentiles[key]; });
        return row;
      })
    : [];

  const rolling3yData = (() => {
    if (!funds?.length) return [];
    const dateSet = new Set<string>();
    funds.forEach((f) => f.kpi.rolling3y.forEach((p) => dateSet.add(p.date)));
    const dates = [...dateSet].sort();
    return dates.map((date) => {
      const row: Record<string, number | string> = { date };
      funds.forEach((f) => {
        const pt = f.kpi.rolling3y.find((p) => p.date === date);
        if (pt != null) row[f.ticker] = pt.fundReturn;
      });
      const pt0 = funds[0]?.kpi.rolling3y.find((p) => p.date === date);
      if (pt0 != null) row["Benchmark"] = pt0.benchReturn;
      return row;
    });
  })();

  const stressLabels = funds?.[0]?.kpi.stressTests.map((s) => s.label) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Ticker input ── */}
      <Card style={{ padding: "18px 20px" }}>
        <div style={{ fontSize: 20, fontWeight: 300, letterSpacing: "0.04em",
          textTransform: "uppercase", color: T.text, marginBottom: 14,
          fontFamily: "'Cormorant Garamond', 'Cormorant', Georgia, serif" }}>
          Cross-Reference
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder="Ticker (max 6) — press Enter to add"
            style={{ flex: 1, background: T.panel2, color: T.text,
              border: `1px solid ${T.line}`, borderRadius: 6, outline: "none",
              padding: "8px 12px", fontSize: 13, ...ui }} />
          <Btn onClick={add} disabled={tickers.length >= MAX_COMPARE}>Add</Btn>
          <Btn accent onClick={run} disabled={loading || !tickers.length}>Compare</Btn>
          <Btn onClick={clear} disabled={!tickers.length && !funds}>Clear</Btn>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {tickers.map((t, i) => (
            <span key={t} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: SERIES[i % SERIES.length] + "15",
              border: `1px solid ${SERIES[i % SERIES.length]}44`,
              color: SERIES[i % SERIES.length],
              borderRadius: 5, padding: "4px 10px", fontSize: 12, fontWeight: 600, ...mono,
            }}>
              {t}
              <span onClick={() => remove(t)} style={{ cursor: "pointer",
                color: T.dim, fontSize: 14, lineHeight: 1, fontWeight: 400 }}>×</span>
            </span>
          ))}
          {!tickers.length && (
            <span style={{ fontSize: 12, color: T.muted, ...ui }}>
              Add tickers to compare — up to 6 funds side by side.
            </span>
          )}
        </div>
      </Card>

      {loading && <Spinner label="LOADING FUND DATA…" />}
      <ErrBanner msg={err} />

      {/* Empty-state preview — shows what you'll get before adding funds */}
      {!funds && !loading && !err && (
        <Card style={{ padding: "20px 22px" }}>
          <Label>What you&apos;ll be able to compare</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
            {[
              { icon: "🛡", title: "Profile Radar", desc: "Percentile profile across cost, risk-adjusted return, downside, alpha, consistency & yield." },
              { icon: "📈", title: "Cumulative Return", desc: "3-year growth of each fund vs. its benchmark, rebased to 0%." },
              { icon: "⚖️", title: "Sharpe vs. Sortino", desc: "Risk-adjusted return side by side — ≥ 1.0 is strong." },
              { icon: "◎", title: "Tax Efficiency", desc: "An A–D grade and best account type (taxable vs. IRA/401k) for each fund." },
              { icon: "📊", title: "Percentile Scorecard", desc: "How each fund ranks vs. its category on every factor." },
              { icon: "🌊", title: "Stress Tests", desc: "How each held up in past selloffs vs. the benchmark." },
            ].map((t) => (
              <div key={t.title} style={{ border: `1.5px dashed ${T.line2}`, borderRadius: 10,
                padding: "16px 16px", background: T.panel2 }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{t.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...ui, marginBottom: 5 }}>{t.title}</div>
                <div style={{ fontSize: 11.5, color: T.dim, lineHeight: 1.55, ...ui }}>{t.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.muted, ...ui, marginTop: 14, textAlign: "center" }}>
            Add up to 6 tickers above and hit <strong style={{ color: T.dim }}>Compare</strong> to populate all of these.
          </div>
        </Card>
      )}

      {funds && funds.length > 0 && (
        <>
          {/* ── Radar + Sharpe bar ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* Radar */}
            <Card style={{ padding: "16px 18px" }}>
              <Label>Profile Overview — percentile by category</Label>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} margin={{ top: 10, right: 24, bottom: 10, left: 24 }}>
                  <PolarGrid stroke={T.line} />
                  <PolarAngleAxis dataKey="metric"
                    tick={{ fill: T.dim, fontSize: 10, fontFamily: "'Geist', sans-serif" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  {funds.map((f, i) => (
                    <Radar key={f.ticker} name={f.ticker} dataKey={f.ticker}
                      stroke={SERIES[i]} fill={SERIES[i]} fillOpacity={0.15}
                      strokeWidth={1.5} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'Geist', sans-serif" }} />
                  <Tooltip {...chartTooltip} formatter={(v: unknown) => [`${v}th percentile`]} />
                </RadarChart>
              </ResponsiveContainer>
              {/* Average percentile summary */}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${funds.length}, 1fr)`,
                gap: 8, borderTop: `1px solid ${T.line}`, paddingTop: 12, marginTop: 4 }}>
                {funds.map((f, i) => {
                  const avg = Math.round(Object.values(f.percentiles).reduce((a, b) => a + b, 0) / 6);
                  const c = avg >= 70 ? T.green : avg >= 40 ? T.amber : T.red;
                  return (
                    <div key={f.ticker} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 600, color: c, lineHeight: 1, ...mono }}>{avg}</div>
                      <div style={{ fontSize: 9, color: SERIES[i], marginTop: 4, fontWeight: 600, ...mono }}>{f.ticker}</div>
                      <div style={{ fontSize: 8.5, color: T.muted, ...ui }}>avg percentile</div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Sharpe vs Sortino */}
            <Card style={{ padding: "16px 18px" }}>
              <Label>Sharpe vs. Sortino (3Y) — ≥ 1.0 is strong</Label>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={funds.map(f => ({ name: f.ticker, Sharpe: f.kpi.sharpe3y, Sortino: f.kpi.sortino3y }))}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <CartesianGrid stroke={T.line} vertical={false} />
                  <XAxis dataKey="name"
                    tick={{ fill: T.text, fontSize: 11, fontFamily: "'Geist', sans-serif" }}
                    stroke={T.line} />
                  <YAxis tick={{ fill: T.dim, fontSize: 10, fontFamily: "'Geist', sans-serif" }} stroke={T.line} />
                  <Tooltip {...chartTooltip} cursor={{ fill: "#ffffff06" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine y={1} stroke={T.green} strokeDasharray="4 4" />
                  <Bar dataKey="Sharpe" fill={T.data} radius={[3, 3, 0, 0]} barSize={20} />
                  <Bar dataKey="Sortino" fill={T.cyan} radius={[3, 3, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* ── Tax efficiency (folded in from the old Tax tool) ── */}
          <Card style={{ padding: "16px 20px" }}>
            <Label>Tax Efficiency — suitability for a taxable account</Label>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${funds.length}, 1fr)`, gap: 12, marginTop: 12 }}>
              {funds.map((f, i) => {
                const tax = computeTaxEfficiency(f);
                const colors: Record<string, string> = { A: T.green, B: "#16A34A", C: T.amber, D: T.red };
                const bg: Record<string, string> = { A: "#DCFCE7", B: "#F0FDF4", C: "#FEF9C3", D: "#FEF2F2" };
                return (
                  <div key={f.ticker} style={{ border: `1px solid ${T.line}`, borderRadius: 8,
                    padding: "12px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: SERIES[i], ...mono }}>{f.ticker}</span>
                      <div style={{ width: 34, height: 34, borderRadius: 8, background: bg[tax.rating],
                        border: `1px solid ${colors[tax.rating]}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 18, fontWeight: 600, color: colors[tax.rating], ...mono }}>{tax.rating}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.text, ...ui }}>{tax.ratingLabel}</div>
                    <div style={{ fontSize: 10, color: T.dim, lineHeight: 1.45, ...ui }}>{tax.accountRec}</div>
                    <div style={{ fontSize: 10, color: T.muted, ...ui }}>Est. tax drag {tax.dragEstimate}</div>
                    {onAnalyze && (
                      <button onClick={() => onAnalyze(f.ticker)} style={{ fontSize: 10, color: T.blue,
                        background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", ...ui }}>
                        Full analysis →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── Cumulative return chart ── */}
          {rolling3yData.length > 2 && (
            <Card style={{ padding: "16px 18px" }}>
              <Label>3-Year Cumulative Return (rebased to 0%)</Label>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={rolling3yData} margin={{ right: 16, top: 4 }}>
                  <CartesianGrid stroke={T.line} vertical={false} />
                  <XAxis dataKey="date"
                    tick={{ fill: T.dim, fontSize: 9, fontFamily: "'Geist', sans-serif" }}
                    stroke={T.line} tickFormatter={(d: string) => d.slice(2)} interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fill: T.dim, fontSize: 10, fontFamily: "'Geist', sans-serif" }}
                    stroke={T.line}
                    tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                  />
                  <Tooltip {...chartTooltip}
                    formatter={(v: unknown) => {
                      const n = Number(v);
                      return [`${n > 0 ? "+" : ""}${n.toFixed(1)}%`];
                    }}
                  />
                  <ReferenceLine y={0} stroke={T.line2} />
                  {funds.map((f, i) => (
                    <Line key={f.ticker} type="monotone" dataKey={f.ticker}
                      stroke={SERIES[i]} dot={false} strokeWidth={1.5} />
                  ))}
                  <Line type="monotone" dataKey="Benchmark" stroke={T.muted}
                    dot={false} strokeWidth={1} strokeDasharray="5 3" />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* ── Percentile scorecard ── */}
          <PercentileScorecard funds={funds} />

          {/* ── KPI table ── */}
          <Card style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.data}` }}>
                  <th style={{ textAlign: "left", padding: "10px 14px",
                    fontSize: 9, color: T.muted, textTransform: "uppercase",
                    letterSpacing: "0.1em", ...ui, fontWeight: 500 }}>Metric</th>
                  {funds.map((f, i) => (
                    <th key={f.ticker} style={{ textAlign: "right", padding: "10px 14px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: SERIES[i], ...mono }}>
                        {f.ticker}
                      </div>
                      <div style={{ fontSize: 10, color: T.dim, fontWeight: 400, ...ui }}>
                        {f.vehicle}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {KPI_ROWS.map(([label, accessor]) => (
                  <tr key={label} style={{ borderBottom: `1px solid ${T.line}` }}>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: T.dim, ...ui }}>{label}</td>
                    {funds.map((f) => (
                      <td key={f.ticker} style={{ padding: "8px 14px", textAlign: "right",
                        fontSize: 12, color: T.text, ...mono, fontWeight: 500 }}>
                        {accessor(f)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* ── Stress tests ── */}
          {stressLabels.length > 0 && (
            <Card style={{ overflowX: "auto" }}>
              <div style={{ padding: "12px 14px 4px", fontSize: 10, color: T.dim,
                textTransform: "uppercase", letterSpacing: "0.1em", ...ui }}>
                Historical Stress Tests
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.line}` }}>
                    <th style={{ textAlign: "left", padding: "6px 14px",
                      fontSize: 9, color: T.muted, textTransform: "uppercase", ...ui, fontWeight: 500 }}>
                      Period
                    </th>
                    {funds.map((f, i) => (
                      <th key={f.ticker} style={{ textAlign: "right", padding: "6px 14px",
                        fontSize: 11, color: SERIES[i], ...mono, fontWeight: 600 }}>
                        {f.ticker}
                      </th>
                    ))}
                    <th style={{ textAlign: "right", padding: "6px 14px",
                      fontSize: 9, color: T.muted, textTransform: "uppercase", ...ui, fontWeight: 500 }}>
                      Benchmark
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stressLabels.map(label => (
                    <tr key={label} style={{ borderBottom: `1px solid ${T.line}` }}>
                      <td style={{ padding: "9px 14px", fontSize: 11, color: T.dim, ...ui }}>{label}</td>
                      {funds.map(f => {
                        const v = f.kpi.stressTests.find(s => s.label === label)?.fundReturn ?? null;
                        return (
                          <td key={f.ticker} style={{ padding: "9px 14px", textAlign: "right",
                            fontSize: 12, fontWeight: 600, ...mono,
                            color: v == null ? T.dim : v >= 0 ? T.green : T.red }}>
                            {v != null ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%` : "—"}
                          </td>
                        );
                      })}
                      <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 11, ...mono, color: T.dim }}>
                        {(() => {
                          const v = funds[0]?.kpi.stressTests.find(s => s.label === label)?.benchReturn ?? null;
                          return v != null ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%` : "—";
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
