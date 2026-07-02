"use client";
import React, { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
} from "recharts";
import { T, ui, mono } from "./tokens";
import { Card, Label, Btn } from "./ui";
import {
  type Client, type RiskLevel, type Goal, type AccountType,
  RISK_LABELS, ACCOUNT_LABELS, GOAL_LABELS,
  newClient, loadClients, upsertClient, deleteClient, totalAssets, totalHoldings,
} from "../lib/client";
import {
  type Vehicle, type Sleeve, type PlacementResult,
  targetSleeves, placeAssets, assetClassMix, equityFraction,
} from "../lib/portfolioModel";
import { computeTaxEfficiency } from "../lib/tax";
import type { FundRecord } from "../lib/funds";
import { blendKpis, blendReturns, type Holding, type BlendedKpis, type BlendedChartPoint } from "../lib/portfolioCalc";

const money = (v: number) => (v == null ? "-" : "$" + Math.round(v).toLocaleString("en-US"));
const pctv = (v: number | null, d = 1) => (v == null ? "-" : `${v.toFixed(d)}%`);
const num2 = (v: number | null) => (v == null ? "-" : v.toFixed(2));

const SLICE = ["#0E7490", "#0891B2", "#38BDF8", "#B45309", "#D97706", "#71717A", "#334155"];

const inputStyle: React.CSSProperties = {
  background: T.panel3, border: `1px solid ${T.line2}`, borderRadius: 7,
  padding: "8px 11px", color: T.text, fontSize: 13, outline: "none", ...ui, width: "100%", boxSizing: "border-box",
};
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10.5, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", ...ui }}>{label}</span>
      {children}
    </div>
  );
}

interface Side { kpi: BlendedKpis; taxScore: number | null; series: BlendedChartPoint[]; n: number; }

interface MatchFund {
  ticker: string; name: string; vehicle: string; category: string;
  expenseRatio: number | null; compositeScore: number; reason: string;
  kpi: { return1y: number | null; sharpe3y: number | null; maxDrawdown3y: number | null; ttmYield: number | null };
}

async function fetchHoldings(items: { ticker: string; weight: number }[]): Promise<Holding[]> {
  const r = await Promise.all(items.map(async (it) => {
    try {
      const res = await fetch(`/api/funds/${it.ticker}`);
      if (!res.ok) return null;
      const f: FundRecord = await res.json();
      if (f.error) return null;
      return { ticker: it.ticker, weight: it.weight, fund: f } as Holding;
    } catch { return null; }
  }));
  return r.filter((h): h is Holding => h != null);
}
async function analyzeSide(items: { ticker: string; weight: number }[]): Promise<Side | null> {
  const holdings = await fetchHoldings(items);
  if (!holdings.length) return null;
  const tw = holdings.reduce((s, h) => s + h.weight, 0) || 1;
  const taxScore = Math.round(holdings.reduce((s, h) => s + computeTaxEfficiency({
    category: h.fund.category, name: h.fund.name, vehicle: h.fund.vehicle,
    expenseRatio: h.fund.expenseRatio, kpi: { ttmYield: h.fund.kpi.ttmYield },
  }).score * h.weight, 0) / tw);
  return { kpi: blendKpis(holdings), taxScore, series: blendReturns(holdings), n: holdings.length };
}

export default function PortfoliosTab({ onAnalyze, onFindSimilar }: {
  onAnalyze?: (t: string) => void; onFindSimilar?: (t: string) => void;
} = {}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [draft, setDraft] = useState<Client>(newClient());
  const [vehicle, setVehicle] = useState<Vehicle>("ETF");
  const [view, setView] = useState<"build" | "compare" | "match">("build");

  // Build
  const [built, setBuilt] = useState<{ sleeves: Sleeve[]; placement: PlacementResult } | null>(null);
  const [metrics, setMetrics] = useState<BlendedKpis | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [variantLabel, setVariantLabel] = useState("");

  // Compare
  const [cur, setCur] = useState<Side | null>(null);
  const [prop, setProp] = useState<Side | null>(null);
  const [cmpLoading, setCmpLoading] = useState(false);
  const [ran, setRan] = useState(false);

  // Match (client-profile fund finder)
  const [matchFunds, setMatchFunds] = useState<MatchFund[] | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchErr, setMatchErr] = useState("");

  useEffect(() => {
    const list = loadClients();
    setClients(list);
    if (list.length) setDraft(list[0]);
  }, []);

  const set = <K extends keyof Client>(k: K, v: Client[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setAccount = (type: AccountType, balance: number) =>
    setDraft((d) => ({ ...d, accounts: d.accounts.map((a) => (a.type === type ? { ...a, balance } : a)) }));

  const saveClient = () => { const c = { ...draft, name: draft.name.trim() || "Untitled Client" }; setClients(upsertClient(c)); setDraft(c); };
  const selectClient = (id: string) => {
    const c = clients.find((x) => x.id === id);
    if (c) { setDraft(c); setBuilt(null); setMetrics(null); setCur(null); setProp(null); setRan(false); setVariantLabel(""); }
  };
  const removeClient = () => { const list = deleteClient(draft.id); setClients(list); setDraft(list[0] ?? newClient()); setBuilt(null); setCur(null); setProp(null); };

  const total = totalAssets(draft);
  const eqFrac = equityFraction(draft);

  const generate = async (client: Client, label = "") => {
    const base = targetSleeves(client, vehicle);
    // Data-driven selection: screen each sleeve's category and pick the best-scoring fund.
    setSelecting(true);
    let sleeves = base;
    try {
      const res = await fetch("/api/portfolio/select", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: client.goal, sleeves: base.map((s) => ({ key: s.key, category: s.category, vehicle: s.fund.vehicle, seed: s.fund.ticker })) }),
      });
      if (res.ok) {
        const data = await res.json();
        const picks = data.picks ?? {};
        sleeves = base.map((s) => {
          const p = picks[s.key];
          return p ? { ...s, fund: { ticker: p.ticker, name: p.name, vehicle: p.vehicle }, reason: p.reason } : s;
        });
      }
    } catch { /* keep curated defaults */ }
    setSelecting(false);
    const placement = placeAssets(client, sleeves, vehicle);
    setBuilt({ sleeves, placement }); setVariantLabel(label); setActiveIdx(0);
    // Blended metrics
    setMetricsLoading(true); setMetrics(null);
    const uniq = Array.from(new Map(sleeves.map((s) => [s.fund.ticker, s])).values())
      .map((s) => ({ ticker: s.fund.ticker, weight: Math.round(s.weight * 100) }));
    const side = await analyzeSide(uniq);
    setMetrics(side?.kpi ?? null); setMetricsLoading(false);
  };
  const build = () => void generate(draft);
  const applyVariant = (patch: Partial<Client>, label: string) => {
    const nd = { ...draft, ...patch }; setDraft(nd); void generate(nd, label);
  };

  const setHolding = (i: number, key: "ticker" | "value", v: string) =>
    setDraft((d) => ({ ...d, holdings: d.holdings.map((h, j) => j === i ? { ...h, [key]: key === "ticker" ? v.toUpperCase() : (Number(v) || 0) } : h) }));
  const addHolding = () => setDraft((d) => ({ ...d, holdings: [...d.holdings, { ticker: "", value: 0 }] }));
  const removeHolding = (i: number) => setDraft((d) => ({ ...d, holdings: d.holdings.filter((_, j) => j !== i) }));

  const runCompare = async () => {
    setCmpLoading(true); setRan(true); saveClient();
    const totVal = totalHoldings(draft) || 1;
    const currentItems = draft.holdings.filter((h) => h.ticker && h.value > 0).map((h) => ({ ticker: h.ticker, weight: (h.value / totVal) * 100 }));
    const sleeves = targetSleeves(draft, vehicle);
    const proposedItems = sleeves.map((s) => ({ ticker: s.fund.ticker, weight: s.weight * 100 }));
    const [c, p] = await Promise.all([
      currentItems.length ? analyzeSide(currentItems) : Promise.resolve(null),
      analyzeSide(proposedItems),
    ]);
    setCur(c); setProp(p); setCmpLoading(false);
  };

  // Match funds to the client's profile (reuses the profile matcher engine).
  const runMatch = async () => {
    setMatchLoading(true); setMatchErr(""); setMatchFunds(null);
    const risk = draft.risk <= 2 ? "conservative" : draft.risk === 3 ? "moderate" : "aggressive";
    const horizon = draft.horizonYears == null ? "medium" : draft.horizonYears < 3 ? "short" : draft.horizonYears <= 10 ? "medium" : "long";
    const income = draft.goal === "income" ? "high" : draft.goal === "balanced" ? "some" : "none";
    try {
      const res = await fetch("/api/recommend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskTolerance: risk, timeHorizon: horizon, incomeNeed: income, costSensitivity: "medium", assetClass: "Any", vehicle, notes: "" }),
      });
      const data = await res.json();
      if (data.message && !data.funds?.length) throw new Error(data.message);
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMatchFunds(data.funds ?? []);
    } catch (e) { setMatchErr((e as Error).message); }
    setMatchLoading(false);
  };

  const mix = built ? assetClassMix(built.sleeves) : null;
  const donutData = built ? built.sleeves.map((s, i) => ({
    ticker: s.fund.ticker, label: s.label, pct: Math.round(s.weight * 100), value: s.weight * 100, color: SLICE[i % SLICE.length],
  })) : [];

  // Merge proposed + current cumulative return series for the performance chart
  const perfData = (() => {
    if (!prop?.series?.length && !cur?.series?.length) return [] as { date: string; proposed?: number; current?: number }[];
    const map = new Map<string, { date: string; proposed?: number; current?: number }>();
    (prop?.series ?? []).forEach((p) => map.set(p.date, { date: p.date, proposed: p.portfolio }));
    (cur?.series ?? []).forEach((p) => { const e = map.get(p.date) ?? { date: p.date }; e.current = p.portfolio; map.set(p.date, e); });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  })();

  const cmpRows: Array<[string, number | null, number | null, boolean, (v: number | null) => string]> =
    cur && prop ? [
      ["1-Year Return", cur.kpi.return1y, prop.kpi.return1y, true, (v) => pctv(v)],
      ["3-Year CAGR", cur.kpi.return3y, prop.kpi.return3y, true, (v) => pctv(v)],
      ["5-Year CAGR", cur.kpi.return5y, prop.kpi.return5y, true, (v) => pctv(v)],
      ["Sharpe (3y)", cur.kpi.sharpe3y, prop.kpi.sharpe3y, true, num2],
      ["Max Drawdown (3y)", cur.kpi.maxDrawdown3y, prop.kpi.maxDrawdown3y, true, (v) => pctv(v)],
      ["TTM Yield", cur.kpi.ttmYield, prop.kpi.ttmYield, true, (v) => pctv(v, 2)],
      ["Blended Expense", cur.kpi.expenseRatio, prop.kpi.expenseRatio, false, (v) => pctv(v, 2)],
      ["Tax Efficiency (0-100)", cur.taxScore, prop.taxScore, true, (v) => (v == null ? "-" : String(v))],
    ] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1080 }}>
      <div>
        <h2 style={{ ...ui, fontSize: 22, fontWeight: 300, color: T.text, margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>Portfolios</h2>
        <p style={{ fontSize: 12.5, color: T.dim, marginTop: 4, ...ui }}>
          Build a target portfolio for a client with asset location, then flip to Compare it against
          what they hold today.
        </p>
      </div>

      {/* Shared client bar + view flip */}
      <Card>
        <div style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.06em" }}>Client</span>
          <select value={draft.id} onChange={(e) => selectClient(e.target.value)} style={{ ...inputStyle, width: "auto", minWidth: 170 }}>
            {clients.length === 0 && <option value={draft.id}>New client</option>}
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name || "Untitled"}</option>)}
            {clients.length > 0 && !clients.find((c) => c.id === draft.id) && <option value={draft.id}>{draft.name || "New client"}</option>}
          </select>
          <Btn small onClick={() => { setDraft(newClient()); setBuilt(null); setCur(null); setProp(null); setRan(false); }}>+ New</Btn>
          <Btn small onClick={saveClient}>Save</Btn>
          {clients.find((c) => c.id === draft.id) && <Btn small onClick={removeClient}>Delete</Btn>}
          <div style={{ flex: 1 }} />
          {/* View flip */}
          <div style={{ display: "inline-flex", border: `1px solid ${T.line2}`, borderRadius: 8, overflow: "hidden" }}>
            {(["build", "compare", "match"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} style={{ padding: "7px 15px", fontSize: 12.5, ...ui, cursor: "pointer",
                border: "none", background: view === v ? T.text : "transparent", color: view === v ? T.bg : T.dim, fontWeight: 600 }}>
                {v === "build" ? "Build" : v === "compare" ? "Compare" : "Match Funds"}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ══════════════ BUILD VIEW ══════════════ */}
      {view === "build" && (
        <>
          <Card>
            <div style={{ padding: "18px 20px" }}>
              <Label>Client Profile</Label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 12 }}>
                <Field label="Name"><input style={inputStyle} value={draft.name} placeholder="e.g. Jane Doe" onChange={(e) => set("name", e.target.value)} /></Field>
                <Field label="Age"><input style={inputStyle} type="number" value={draft.age ?? ""} placeholder="58" onChange={(e) => set("age", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                <Field label="Horizon (yrs)"><input style={inputStyle} type="number" value={draft.horizonYears ?? ""} placeholder="15" onChange={(e) => set("horizonYears", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                <Field label="Tax bracket (%)"><input style={inputStyle} type="number" value={draft.taxBracket ?? ""} placeholder="32" onChange={(e) => set("taxBracket", e.target.value === "" ? null : Number(e.target.value))} /></Field>
                <Field label="State"><input style={inputStyle} value={draft.state} placeholder="CA" onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} /></Field>
                <Field label="Goal"><select style={inputStyle} value={draft.goal} onChange={(e) => set("goal", e.target.value as Goal)}>{(Object.keys(GOAL_LABELS) as Goal[]).map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}</select></Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <Field label={`Risk tolerance - ${RISK_LABELS[draft.risk]}`}>
                  <input type="range" min={1} max={5} step={1} value={draft.risk} onChange={(e) => set("risk", Number(e.target.value) as RiskLevel)} style={{ width: "100%", accentColor: T.data }} />
                </Field>
              </div>
              <div style={{ marginTop: 16 }}>
                <Label>Accounts &amp; Balances</Label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 10 }}>
                  {(["taxable", "traditional", "roth"] as AccountType[]).map((t) => {
                    const acct = draft.accounts.find((a) => a.type === t);
                    return <Field key={t} label={ACCOUNT_LABELS[t]}><input style={inputStyle} type="number" value={acct?.balance || ""} placeholder="$0" onChange={(e) => setAccount(t, Number(e.target.value) || 0)} /></Field>;
                  })}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
                <div style={{ display: "inline-flex", border: `1px solid ${T.line2}`, borderRadius: 8, overflow: "hidden" }}>
                  {(["ETF", "Mutual Fund"] as Vehicle[]).map((v) => (
                    <button key={v} onClick={() => setVehicle(v)} style={{ padding: "8px 16px", fontSize: 12, ...ui, cursor: "pointer", border: "none", background: vehicle === v ? T.text : "transparent", color: vehicle === v ? T.bg : T.dim, fontWeight: 600 }}>{v}</button>
                  ))}
                </div>
                <Btn accent onClick={build}>{selecting ? "Selecting best funds..." : "Build Portfolio ->"}</Btn>
                <span style={{ fontSize: 11, color: T.muted, ...ui }}>Investable <b style={{ color: T.text, ...mono }}>{money(total)}</b> · target equity <b style={{ color: T.text, ...mono }}>{Math.round(eqFrac * 100)}%</b></span>
              </div>
            </div>
          </Card>

          {built && (
            <>
              {/* Donut + refine */}
              <Card>
                <div style={{ padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Label>Target Allocation</Label>
                    {variantLabel && <span style={{ fontSize: 10.5, color: T.data, background: `${T.data}18`, borderRadius: 10, padding: "3px 10px", ...ui, fontWeight: 600 }}>Variant: {variantLabel}</span>}
                  </div>
                  {mix && (
                    <div style={{ fontSize: 11, color: T.muted, ...ui, marginTop: 4 }}>
                      {Math.round(mix.equity * 100)}% equity / {Math.round((mix.fixed + mix.cash) * 100)}% bonds &amp; cash - driven by {RISK_LABELS[draft.risk].toLowerCase()} risk{draft.horizonYears ? `, ${draft.horizonYears}-yr horizon` : ""}{draft.age ? `, age ${draft.age}` : ""}, {GOAL_LABELS[draft.goal].toLowerCase()} goal. Funds screened and scored per sleeve on cost, risk-adjusted return, downside &amp; more.
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, alignItems: "center", marginTop: 8 }}>
                    <div style={{ height: 300, position: "relative" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={82} outerRadius={116}
                            onMouseEnter={(_: unknown, i: number) => setActiveIdx(i)}
                            paddingAngle={1.5} isAnimationActive={false} stroke="none">
                            {donutData.map((d, i) => <Cell key={i} fill={d.color} opacity={activeIdx === i ? 1 : 0.5}
                              style={{ transition: "opacity 0.15s", transformOrigin: "center",
                                transform: activeIdx === i ? "scale(1.05)" : "scale(1)" }} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      {donutData[activeIdx] && (
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                          alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: T.text, ...mono }}>{donutData[activeIdx].ticker}</div>
                          <div style={{ fontSize: 11, color: T.dim, ...ui, maxWidth: 130, textAlign: "center", lineHeight: 1.3 }}>{donutData[activeIdx].label}</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: donutData[activeIdx].color, ...mono, marginTop: 3 }}>{donutData[activeIdx].pct}%</div>
                        </div>
                      )}
                    </div>
                    <div>
                      {mix && (
                        <div style={{ display: "flex", gap: 18, marginBottom: 12 }}>
                          {([["equity", "Equity"], ["fixed", "Fixed Income"], ["cash", "Cash"]] as [keyof typeof mix, string][]).filter(([k]) => mix[k] > 0).map(([k, l]) => (
                            <div key={k}><span style={{ fontSize: 11, color: T.muted, ...ui }}>{l}</span><div style={{ fontSize: 18, color: T.text, ...mono, fontWeight: 600 }}>{Math.round(mix[k] * 100)}%</div></div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {built.sleeves.map((s, i) => (
                          <div key={s.key} onMouseEnter={() => setActiveIdx(i)} title={s.reason} style={{ display: "grid", gridTemplateColumns: "10px 1fr 56px 30px", gap: 9, alignItems: "center",
                            padding: "6px 8px", borderRadius: 6, cursor: "default", background: activeIdx === i ? T.panel3 : "transparent" }}>
                            <span style={{ width: 9, height: 9, borderRadius: 2, background: SLICE[i % SLICE.length] }} />
                            <span style={{ fontSize: 12, color: T.dim, ...ui, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
                            <span style={{ fontSize: 12.5, color: T.text, ...mono, fontWeight: 700 }}>{s.fund.ticker}</span>
                            <span style={{ fontSize: 12.5, color: T.data, ...mono, fontWeight: 600, textAlign: "right" }}>{Math.round(s.weight * 100)}%</span>
                          </div>
                        ))}
                      </div>
                      {built.sleeves[activeIdx]?.reason && (
                        <div style={{ marginTop: 10, padding: "8px 11px", background: T.panel3, border: `1px solid ${T.line}`, borderRadius: 7, fontSize: 10.5, color: T.dim, ...ui, lineHeight: 1.45 }}>
                          <b style={{ color: T.text, ...mono }}>{built.sleeves[activeIdx].fund.ticker}</b> selected: {built.sleeves[activeIdx].reason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Refine - whole portfolio + per fund */}
                  <div style={{ marginTop: 14, borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
                    <Label>Refine - Recommend Something New</Label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: T.muted, ...ui }}>Whole portfolio:</span>
                      <Btn small onClick={() => applyVariant({ risk: Math.min(5, draft.risk + 1) as RiskLevel }, "More aggressive")}>More aggressive</Btn>
                      <Btn small onClick={() => applyVariant({ risk: Math.max(1, draft.risk - 1) as RiskLevel }, "More conservative")}>More conservative</Btn>
                      <Btn small onClick={() => applyVariant({ goal: "income" }, "Income tilt")}>Income tilt</Btn>
                      <Btn small onClick={() => applyVariant({ goal: "growth" }, "Growth tilt")}>Growth tilt</Btn>
                    </div>
                    {onFindSimilar && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: T.muted, ...ui }}>Swap an individual fund:</span>
                        {built.sleeves.map((s) => (
                          <button key={s.key} onClick={() => onFindSimilar(s.fund.ticker)} style={{ fontSize: 11, ...mono, padding: "4px 10px",
                            borderRadius: 6, border: `1px solid ${T.line2}`, background: T.panel, color: T.dim, cursor: "pointer" }}>{s.fund.ticker} &rarr;</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Asset location */}
              <Card>
                <div style={{ padding: "18px 20px" }}>
                  <Label>Asset Location - What to Buy in Each Account</Label>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(built.placement.plans.length, 1)}, 1fr)`, gap: 14, marginTop: 12 }}>
                    {built.placement.plans.map((p) => (
                      <div key={p.type} style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.line}`, background: T.panel3 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...ui }}>{p.label}</div>
                          <div style={{ fontSize: 11, color: T.dim, ...mono }}>{money(p.balance)}</div>
                        </div>
                        <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                          {p.lots.map((l, i) => (
                            <div key={i}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, ...mono }}>{l.ticker}</span>
                                <span style={{ fontSize: 12.5, color: T.text, ...mono, fontWeight: 600 }}>{money(l.amount)}</span>
                              </div>
                              <div style={{ fontSize: 10, color: T.muted, ...ui }}>{l.label}</div>
                              {l.note && <div style={{ fontSize: 10, color: T.amber, ...ui, marginTop: 2 }}>{l.note}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {built.placement.insights.length > 0 && (
                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                      {built.placement.insights.map((t, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ color: T.data, fontSize: 12, lineHeight: 1.5 }}>&bull;</span>
                          <span style={{ fontSize: 11.5, color: T.dim, ...ui, lineHeight: 1.5 }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* Snapshot */}
              <Card>
                <div style={{ padding: "18px 20px" }}>
                  <Label>Blended Portfolio Snapshot</Label>
                  {metricsLoading && <div style={{ fontSize: 12, color: T.muted, ...ui, marginTop: 12 }}>Loading live metrics...</div>}
                  {!metricsLoading && metrics && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
                      {([["1-Yr Return", pctv(metrics.return1y)], ["3-Yr CAGR", pctv(metrics.return3y)], ["Sharpe (3y)", num2(metrics.sharpe3y)], ["Max Drawdown", pctv(metrics.maxDrawdown3y)],
                        ["TTM Yield", pctv(metrics.ttmYield, 2)], ["Blended Expense", pctv(metrics.expenseRatio, 2)], ["Beta (3y)", num2(metrics.beta3y)], ["Alpha (3y)", pctv(metrics.alpha3y, 2)]] as [string, string][]).map(([l, v]) => (
                        <div key={l} style={{ background: T.panel3, border: `1px solid ${T.line}`, borderRadius: 8, padding: "10px 12px" }}>
                          <div style={{ fontSize: 9.5, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: T.text, ...mono, marginTop: 3 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!metricsLoading && !metrics && <div style={{ fontSize: 12, color: T.muted, ...ui, marginTop: 12 }}>Live metrics unavailable right now (data source). The allocation and placement above are still valid.</div>}
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {/* ══════════════ COMPARE VIEW ══════════════ */}
      {view === "compare" && (
        <>
          <Card>
            <div style={{ padding: "16px 20px" }}>
              <Label>Current Holdings</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
                {draft.holdings.length === 0 && <span style={{ fontSize: 12, color: T.muted, ...ui }}>Add the funds this client owns today.</span>}
                {draft.holdings.map((h, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input style={{ ...inputStyle, width: 110, ...mono }} placeholder="TICKER" value={h.ticker} onChange={(e) => setHolding(i, "ticker", e.target.value)} />
                    <input style={{ ...inputStyle, width: 130 }} type="number" placeholder="$ value" value={h.value || ""} onChange={(e) => setHolding(i, "value", e.target.value)} />
                    <button onClick={() => removeHolding(i)} style={{ width: 24, height: 24, borderRadius: "50%", background: "transparent", border: `1px solid ${T.line2}`, color: T.muted, cursor: "pointer" }}>&times;</button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
                <Btn small onClick={addHolding}>+ Add holding</Btn>
                <span style={{ fontSize: 12, color: T.dim, ...mono }}>Total <b style={{ color: T.text }}>{money(totalHoldings(draft))}</b></span>
                <div style={{ flex: 1 }} />
                <Btn accent onClick={runCompare}>{cmpLoading ? "Comparing..." : "Compare to Proposed -&gt;"}</Btn>
              </div>
            </div>
          </Card>

          {ran && !cmpLoading && prop && (
            <>
              {/* Performance chart */}
              {perfData.length > 1 && (
                <Card>
                  <div style={{ padding: "18px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <Label>Performance to Date (3-yr cumulative)</Label>
                      <div style={{ display: "flex", gap: 16 }}>
                        <span style={{ fontSize: 10, color: T.dim, ...ui }}><span style={{ display: "inline-block", width: 12, height: 2, background: T.data, verticalAlign: "middle", marginRight: 4 }} />Proposed</span>
                        <span style={{ fontSize: 10, color: T.dim, ...ui }}><span style={{ display: "inline-block", width: 12, height: 2, background: T.muted, verticalAlign: "middle", marginRight: 4 }} />Current</span>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={perfData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <XAxis dataKey="date" hide />
                        <YAxis tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} tick={{ fill: T.dim, fontSize: 9, fontFamily: "Geist Mono, monospace" }} axisLine={false} tickLine={false} width={42} />
                        <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 6 }} labelStyle={{ color: T.dim, fontSize: 10 }}
                          formatter={(v: unknown, name: unknown) => { const n = typeof v === "number" ? v : 0; return [`${n > 0 ? "+" : ""}${n.toFixed(2)}%`, name === "proposed" ? "Proposed" : "Current"]; }} />
                        <ReferenceLine y={0} stroke={T.line2} strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="proposed" stroke={T.data} dot={false} strokeWidth={2} connectNulls />
                        <Line type="monotone" dataKey="current" stroke={T.muted} dot={false} strokeWidth={1.6} strokeDasharray="4 3" connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}

              {/* Metric table */}
              <Card>
                <div style={{ padding: "18px 20px" }}>
                  {!cur && <div style={{ fontSize: 12, color: T.amber, ...ui, marginBottom: 12 }}>No current holdings entered (or none returned data) - showing the proposed model only.</div>}
                  <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.7fr", gap: 10, paddingBottom: 8, borderBottom: `1px solid ${T.line}` }}>
                    <span /><span style={{ fontSize: 11, color: T.dim, ...ui, fontWeight: 600, textAlign: "right" }}>Current</span>
                    <span style={{ fontSize: 11, color: T.text, ...ui, fontWeight: 600, textAlign: "right" }}>Proposed</span>
                    <span style={{ fontSize: 11, color: T.muted, ...ui, fontWeight: 600, textAlign: "right" }}>Better</span>
                  </div>
                  {cmpRows.map(([label, cv, pv, hib, fmt]) => {
                    const better = cv != null && pv != null ? (hib ? (pv > cv ? "P" : pv < cv ? "C" : "=") : (pv < cv ? "P" : pv > cv ? "C" : "=")) : "-";
                    return (
                      <div key={label} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.7fr", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${T.line}` }}>
                        <span style={{ fontSize: 12.5, color: T.dim, ...ui }}>{label}</span>
                        <span style={{ fontSize: 13, color: T.text, ...mono, textAlign: "right" }}>{fmt(cv)}</span>
                        <span style={{ fontSize: 13, color: T.text, ...mono, textAlign: "right", fontWeight: 600 }}>{fmt(pv)}</span>
                        <span style={{ fontSize: 12, textAlign: "right", ...mono, fontWeight: 700, color: better === "P" ? T.green : better === "C" ? T.amber : T.muted }}>{better === "P" ? "Proposed" : better === "C" ? "Current" : "-"}</span>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 12, fontSize: 11, color: T.muted, ...ui }}>Tip: switch to Build to adjust the proposed model, then come back to Compare.</div>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {/* ══════════════ MATCH VIEW ══════════════ */}
      {view === "match" && (
        <>
          <Card>
            <div style={{ padding: "16px 20px" }}>
              <Label>Match Funds to This Client</Label>
              <p style={{ fontSize: 12.5, color: T.dim, ...ui, marginTop: 6, lineHeight: 1.5 }}>
                Screens the universe and ranks funds to {draft.name || "this client"}&apos;s profile - {RISK_LABELS[draft.risk].toLowerCase()} risk,
                {draft.horizonYears ? ` ${draft.horizonYears}-yr horizon,` : ""} {GOAL_LABELS[draft.goal].toLowerCase()} goal, {vehicle} preference.
                Change the profile or vehicle in the Build tab to re-target.
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
                <div style={{ display: "inline-flex", border: `1px solid ${T.line2}`, borderRadius: 8, overflow: "hidden" }}>
                  {(["ETF", "Mutual Fund"] as Vehicle[]).map((v) => (
                    <button key={v} onClick={() => setVehicle(v)} style={{ padding: "7px 14px", fontSize: 12, ...ui, cursor: "pointer", border: "none", background: vehicle === v ? T.text : "transparent", color: vehicle === v ? T.bg : T.dim, fontWeight: 600 }}>{v}</button>
                  ))}
                </div>
                <Btn accent onClick={runMatch}>{matchLoading ? "Matching..." : "Find matching funds ->"}</Btn>
                {matchErr && <span style={{ fontSize: 11.5, color: T.red, ...ui }}>{matchErr}</span>}
              </div>
            </div>
          </Card>

          {matchFunds && matchFunds.length > 0 && (
            <Card>
              <div style={{ padding: "16px 20px" }}>
                <Label>Top {Math.min(matchFunds.length, 12)} matches for this profile</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {matchFunds.slice(0, 12).map((f, i) => (
                    <div key={f.ticker} style={{ border: `1px solid ${T.line}`, borderRadius: 8, padding: "10px 13px", background: T.panel }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 10, ...mono, color: T.muted, width: 16 }}>{i + 1}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: T.text, ...mono }}>{f.ticker}</span>
                        <span style={{ fontSize: 11, color: T.dim, ...ui, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
                        <span style={{ fontSize: 9, ...ui, color: T.muted }}>{f.category} · {f.vehicle}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.data, ...mono }}>{f.compositeScore}</span>
                      </div>
                      <div style={{ fontSize: 11, color: T.dim, ...ui, marginTop: 5, marginLeft: 26, lineHeight: 1.4 }}>{f.reason}</div>
                      <div style={{ display: "flex", gap: 14, marginTop: 7, marginLeft: 26, alignItems: "center", flexWrap: "wrap" }}>
                        {([["1Y", pctv(f.kpi.return1y)], ["Sharpe", num2(f.kpi.sharpe3y)], ["Yield", pctv(f.kpi.ttmYield, 2)], ["Expense", f.expenseRatio != null ? pctv(f.expenseRatio, 2) : "-"]] as [string, string][]).map(([l, v]) => (
                          <span key={l} style={{ fontSize: 10.5, color: T.muted, ...ui }}>{l} <b style={{ color: T.dim, ...mono }}>{v}</b></span>
                        ))}
                        <div style={{ flex: 1 }} />
                        {onAnalyze && <button onClick={() => onAnalyze(f.ticker)} style={{ fontSize: 10.5, ...ui, padding: "3px 10px", borderRadius: 6, border: `1px solid ${T.line2}`, background: T.panel, color: T.dim, cursor: "pointer" }}>Analyze</button>}
                        {onFindSimilar && <button onClick={() => onFindSimilar(f.ticker)} style={{ fontSize: 10.5, ...ui, padding: "3px 10px", borderRadius: 6, border: `1px solid ${T.line2}`, background: T.panel, color: T.dim, cursor: "pointer" }}>Find similar</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
          {matchFunds && matchFunds.length === 0 && !matchLoading && (
            <Card><div style={{ padding: "16px 20px", fontSize: 12, color: T.muted, ...ui }}>No matches returned right now. Try a different vehicle, or check back once the data source is warmed up.</div></Card>
          )}
        </>
      )}
    </div>
  );
}
