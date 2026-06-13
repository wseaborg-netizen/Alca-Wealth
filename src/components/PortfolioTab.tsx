"use client";
import React, { useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { T, ui, mono, cardStyle, cardHighlight } from "./tokens";
import { Label, KPI, Card } from "./ui";
import type { FundRecord } from "../lib/funds";
import {
  blendKpis, blendReturns, blendStressTests,
  type Holding, type BlendedKpis,
} from "../lib/portfolioCalc";

const MAX_HOLDINGS = 8;
const COLORS = ["#4B87FF","#2EC4B6","#E9A23A","#EF4565","#10C87A","#C9913A","#A78BFA","#F472B6"];

// ── helpers ────────────────────────────────────────────────────────────────
const fmt = (v: number | null, decimals = 2, suffix = "") =>
  v == null ? "—" : `${v.toFixed(decimals)}${suffix}`;
const fmtPct = (v: number | null) => v == null ? "—" : `${(v * 100).toFixed(2)}%`;
const colorVal = (v: number | null, positiveGood = true) => {
  if (v == null) return T.dim;
  return positiveGood ? (v >= 0 ? T.green : T.red) : (v <= 0 ? T.green : T.red);
};

// ── sub-components ─────────────────────────────────────────────────────────
function WeightBar({ holdings }: { holdings: Holding[] }) {
  const total = holdings.reduce((s, h) => s + h.weight, 0);
  if (!holdings.length) return null;
  return (
    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden",
      background: T.panel3, gap: 1 }}>
      {holdings.map((h, i) => (
        <div key={h.ticker} style={{
          width: `${(h.weight / Math.max(total, 100)) * 100}%`,
          background: COLORS[i % COLORS.length],
          transition: "width 0.2s",
          minWidth: h.weight > 0 ? 2 : 0,
        }} />
      ))}
    </div>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "7px 0", borderBottom: `1px solid ${T.line}` }}>
      <span style={{ fontSize: 11, color: T.dim, ...ui }}>{label}</span>
      <span style={{ fontSize: 13, color: color ?? T.text, ...mono, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────
export default function PortfolioTab() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  const blended = blendKpis(holdings);
  const chartData = blendReturns(holdings);
  const stressData = blendStressTests(holdings);

  // Add a fund by ticker
  const addFund = useCallback(async (ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    if (holdings.find(h => h.ticker === t)) { setError(`${t} already in portfolio`); return; }
    if (holdings.length >= MAX_HOLDINGS) { setError(`Max ${MAX_HOLDINGS} holdings`); return; }

    setLoading(t);
    setError(null);
    try {
      const res = await fetch(`/api/funds/${t}`);
      if (!res.ok) throw new Error(`${t} not found`);
      const fund: FundRecord = await res.json();
      if (fund.error) throw new Error(fund.error);

      // Equal-weight new addition, then rebalance all evenly
      const newHoldings = [...holdings, { ticker: t, weight: 0, fund }];
      const even = Math.floor(100 / newHoldings.length);
      const rem = 100 - even * (newHoldings.length - 1);
      setHoldings(newHoldings.map((h, i) => ({
        ...h, weight: i === newHoldings.length - 1 ? rem : even,
      })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
      setSearch("");
    }
  }, [holdings]);

  const removeFund = (ticker: string) => {
    const next = holdings.filter(h => h.ticker !== ticker);
    if (next.length === 0) { setHoldings([]); return; }
    // Rebalance remaining evenly
    const even = Math.floor(100 / next.length);
    const rem = 100 - even * (next.length - 1);
    setHoldings(next.map((h, i) => ({ ...h, weight: i === next.length - 1 ? rem : even })));
  };

  const setWeight = (ticker: string, w: number) => {
    setHoldings(prev => prev.map(h => h.ticker === ticker ? { ...h, weight: w } : h));
  };

  const autoBalance = () => {
    if (!holdings.length) return;
    const even = Math.floor(100 / holdings.length);
    const rem = 100 - even * (holdings.length - 1);
    setHoldings(prev => prev.map((h, i) => ({ ...h, weight: i === prev.length - 1 ? rem : even })));
  };

  const weightOk = Math.abs(totalWeight - 100) < 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Header ── */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: T.text, ...ui, margin: 0 }}>
          Portfolio Builder
        </h2>
        <p style={{ fontSize: 12, color: T.dim, marginTop: 4, ...ui }}>
          Add up to {MAX_HOLDINGS} funds, set weights, and see blended performance metrics.
        </p>
      </div>

      {/* ── Add fund search ── */}
      <Card>
        <div style={{ padding: "16px 20px" }}>
          <Label>Add Fund by Ticker</Label>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && addFund(search)}
              placeholder="e.g. VOO, JEPI, FXAIX"
              style={{
                flex: 1, background: T.panel3, border: `1px solid ${T.line}`,
                borderRadius: 6, padding: "8px 12px", color: T.text, fontSize: 13,
                outline: "none", ...mono,
              }}
            />
            <button
              onClick={() => addFund(search)}
              disabled={!search || !!loading || holdings.length >= MAX_HOLDINGS}
              style={{
                padding: "8px 18px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: loading ? T.panel3 : "linear-gradient(135deg, #3A6FE0, #4B87FF)",
                color: loading ? T.dim : "#fff", border: "none", cursor: loading ? "default" : "pointer",
                ...ui,
              }}
            >
              {loading ? "Loading…" : "Add"}
            </button>
          </div>
          {error && (
            <p style={{ fontSize: 11, color: T.red, marginTop: 6, ...ui }}>{error}</p>
          )}
        </div>
      </Card>

      {holdings.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: T.muted }}>
          {/* Empty placeholder pie */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="55" fill="none" stroke={T.line} strokeWidth="18"
                strokeDasharray="6 4" />
              <circle cx="70" cy="70" r="28" fill={T.panel2} />
              <text x="70" y="75" textAnchor="middle" fontSize="22" fill={T.muted}
                fontFamily="'Geist', sans-serif">+</text>
            </svg>
          </div>
          <p style={{ fontSize: 13, ...ui }}>Add funds to build your portfolio</p>
          <p style={{ fontSize: 11, marginTop: 4, ...ui, color: T.muted }}>
            Try: SPY, SCHD, BND, VXUS for a classic 4-fund portfolio
          </p>
        </div>
      )}

      {holdings.length > 0 && (
        <>
          {/* ── Holdings list ── */}
          <Card>
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Label>Holdings ({holdings.length}/{MAX_HOLDINGS})</Label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{
                    fontSize: 11, ...mono,
                    color: weightOk ? T.green : T.amber,
                  }}>
                    {totalWeight}% allocated
                  </span>
                  <button
                    onClick={autoBalance}
                    style={{
                      fontSize: 10, padding: "3px 10px", borderRadius: 4,
                      background: T.panel3, border: `1px solid ${T.line2}`,
                      color: T.dim, cursor: "pointer", ...ui,
                    }}
                  >
                    Auto-balance
                  </button>
                </div>
              </div>

              {/* Weight bar */}
              <WeightBar holdings={holdings} />

              {/* Holdings rows */}
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {holdings.map((h, i) => (
                  <div key={h.ticker} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px", borderRadius: 6,
                    background: T.panel3, border: `1px solid ${T.line}`,
                  }}>
                    {/* Color dot */}
                    <div style={{ width: 8, height: 8, borderRadius: "50%",
                      background: COLORS[i % COLORS.length], flexShrink: 0 }} />

                    {/* Ticker + name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, ...mono }}>
                        {h.ticker}
                      </div>
                      <div style={{ fontSize: 10, color: T.dim, ...ui,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {h.fund.name}
                      </div>
                    </div>

                    {/* Weight slider */}
                    <input
                      type="range" min={1} max={99} value={h.weight}
                      onChange={e => setWeight(h.ticker, Number(e.target.value))}
                      style={{ width: 100, accentColor: COLORS[i % COLORS.length] }}
                    />

                    {/* Weight input */}
                    <input
                      type="number" min={0} max={100} value={h.weight}
                      onChange={e => setWeight(h.ticker, Math.min(100, Math.max(0, Number(e.target.value))))}
                      style={{
                        width: 52, textAlign: "right",
                        background: T.panel2, border: `1px solid ${T.line}`,
                        borderRadius: 4, padding: "4px 6px",
                        color: T.text, fontSize: 13, ...mono,
                      }}
                    />
                    <span style={{ fontSize: 11, color: T.dim, ...mono }}>%</span>

                    {/* Remove */}
                    <button
                      onClick={() => removeFund(h.ticker)}
                      style={{
                        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                        background: "transparent", border: `1px solid ${T.line}`,
                        color: T.muted, cursor: "pointer", fontSize: 12,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* ── Metrics + Chart row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 16 }}>

            {/* Blended KPIs */}
            <Card>
              <div style={{ padding: "16px 20px" }}>
                <Label>Blended Metrics</Label>
                <div style={{ marginTop: 12 }}>
                  <MetricRow label="1-Year Return"
                    value={fmtPct(blended.return1y)}
                    color={colorVal(blended.return1y)} />
                  <MetricRow label="3-Year CAGR"
                    value={fmtPct(blended.return3y)}
                    color={colorVal(blended.return3y)} />
                  <MetricRow label="5-Year CAGR"
                    value={fmtPct(blended.return5y)}
                    color={colorVal(blended.return5y)} />
                  <MetricRow label="Sharpe (3y)"
                    value={fmt(blended.sharpe3y)}
                    color={blended.sharpe3y != null ? (blended.sharpe3y >= 1 ? T.green : blended.sharpe3y >= 0.5 ? T.amber : T.red) : T.dim} />
                  <MetricRow label="Sortino (3y)"
                    value={fmt(blended.sortino3y)} />
                  <MetricRow label="Std Dev (3y)"
                    value={fmt(blended.stdDev3y != null ? blended.stdDev3y * 100 : null, 1, "%")} />
                  <MetricRow label="Max Drawdown (3y)"
                    value={fmtPct(blended.maxDrawdown3y)}
                    color={colorVal(blended.maxDrawdown3y, false)} />
                  <MetricRow label="Beta (3y)"
                    value={fmt(blended.beta3y)} />
                  <MetricRow label="Alpha (3y)"
                    value={fmt(blended.alpha3y != null ? blended.alpha3y * 100 : null, 2, "%")}
                    color={colorVal(blended.alpha3y)} />
                  <MetricRow label="TTM Yield"
                    value={fmt(blended.ttmYield != null ? blended.ttmYield * 100 : null, 2, "%")}
                    color={T.cyan} />
                  <MetricRow label="Blended Expense Ratio"
                    value={fmt(blended.expenseRatio != null ? blended.expenseRatio * 100 : null, 2, "%")}
                    color={blended.expenseRatio != null ? (blended.expenseRatio < 0.005 ? T.green : blended.expenseRatio < 0.01 ? T.amber : T.red) : T.dim} />
                </div>
              </div>
            </Card>

            {/* Performance chart */}
            <Card>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Label>3-Year Cumulative Return</Label>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 12, height: 2, background: T.blue }} />
                      <span style={{ fontSize: 10, color: T.dim, ...ui }}>Portfolio</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 12, height: 2, background: T.muted, borderTop: "2px dashed" }} />
                      <span style={{ fontSize: 10, color: T.dim, ...ui }}>Benchmark</span>
                    </div>
                  </div>
                </div>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <XAxis dataKey="date" hide />
                      <YAxis
                        tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
                        tick={{ fill: T.dim, fontSize: 9, fontFamily: "Geist Mono, monospace" }}
                        axisLine={false} tickLine={false} width={42}
                      />
                      <Tooltip
                        contentStyle={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 6 }}
                        labelStyle={{ color: T.dim, fontSize: 10 }}
                        formatter={(v: unknown, name: unknown) => {
                          const n = typeof v === "number" ? v : 0;
                          return [`${n > 0 ? "+" : ""}${n.toFixed(2)}%`, name === "portfolio" ? "Portfolio" : "Benchmark"];
                        }}
                      />
                      <ReferenceLine y={0} stroke={T.line2} strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="portfolio" stroke={T.blue}
                        dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="benchmark" stroke={T.muted}
                        dot={false} strokeWidth={1} strokeDasharray="4 3" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 220, display: "flex", alignItems: "center",
                    justifyContent: "center", color: T.muted, fontSize: 12, ...ui }}>
                    Not enough data to chart
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* ── Stress Tests ── */}
          {stressData.length > 0 && (
            <Card>
              <div style={{ padding: "16px 20px" }}>
                <Label>Stress Test — Portfolio vs Benchmark</Label>
                <div style={{ marginTop: 12, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", fontSize: 10, color: T.dim,
                          padding: "4px 8px", ...ui, fontWeight: 500 }}>Period</th>
                        <th style={{ textAlign: "right", fontSize: 10, color: T.blue,
                          padding: "4px 8px", ...ui, fontWeight: 500 }}>Portfolio</th>
                        <th style={{ textAlign: "right", fontSize: 10, color: T.dim,
                          padding: "4px 8px", ...ui, fontWeight: 500 }}>Benchmark</th>
                        <th style={{ textAlign: "right", fontSize: 10, color: T.dim,
                          padding: "4px 8px", ...ui, fontWeight: 500 }}>Vs. Bench</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stressData.map(s => {
                        const diff = s.portfolioReturn - s.benchReturn;
                        return (
                          <tr key={s.label} style={{ borderTop: `1px solid ${T.line}` }}>
                            <td style={{ padding: "8px 8px", fontSize: 12, color: T.text, ...ui }}>{s.label}</td>
                            <td style={{ padding: "8px 8px", textAlign: "right", fontSize: 12,
                              color: s.portfolioReturn >= 0 ? T.green : T.red, ...mono, fontWeight: 600 }}>
                              {(s.portfolioReturn * 100).toFixed(1)}%
                            </td>
                            <td style={{ padding: "8px 8px", textAlign: "right", fontSize: 12,
                              color: s.benchReturn >= 0 ? T.green : T.red, ...mono }}>
                              {(s.benchReturn * 100).toFixed(1)}%
                            </td>
                            <td style={{ padding: "8px 8px", textAlign: "right", fontSize: 12,
                              color: diff >= 0 ? T.green : T.red, ...mono }}>
                              {diff >= 0 ? "+" : ""}{(diff * 100).toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {/* ── Allocation breakdown + Pie ── */}
          <Card>
            <div style={{ padding: "16px 20px" }}>
              <Label>Allocation Breakdown</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 24,
                alignItems: "center", marginTop: 12 }}>

                {/* Bar breakdown */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {holdings.map((h, i) => (
                    <div key={h.ticker} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ width: 48, fontSize: 12, fontWeight: 700, color: T.text, ...mono }}>
                        {h.ticker}
                      </span>
                      <div style={{ flex: 1, height: 5, borderRadius: 3,
                        background: T.panel3, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 3,
                          background: COLORS[i % COLORS.length],
                          width: `${h.weight}%`, transition: "width 0.3s ease",
                        }} />
                      </div>
                      <span style={{ width: 36, textAlign: "right", fontSize: 12,
                        color: T.dim, ...mono }}>{h.weight}%</span>
                      <span style={{ fontSize: 10, color: T.muted, ...ui, width: 88,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {h.fund.category}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Pie chart */}
                <div style={{ flexShrink: 0 }}>
                  <ResponsiveContainer width={190} height={190}>
                    <PieChart>
                      <Pie
                        data={holdings.map((h, i) => ({
                          name: h.ticker, value: h.weight, color: COLORS[i % COLORS.length],
                        }))}
                        cx="50%" cy="50%"
                        innerRadius={46} outerRadius={72}
                        paddingAngle={holdings.length > 1 ? 2 : 0}
                        dataKey="value"
                        strokeWidth={0}
                        isAnimationActive={false}
                      >
                        {holdings.map((h, i) => (
                          <Cell key={h.ticker} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: unknown) => [`${v}%`]}
                        contentStyle={{
                          background: T.panel2, border: `1px solid ${T.line}`,
                          borderRadius: 6, fontSize: 11,
                          fontFamily: "'Geist', sans-serif",
                        }}
                      />
                      <Legend
                        iconType="circle" iconSize={7}
                        wrapperStyle={{ fontSize: 10, fontFamily: "'Geist', sans-serif" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
