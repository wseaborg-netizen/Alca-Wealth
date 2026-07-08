"use client";
import React, { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
} from "recharts";
import { T, R, ui, mono } from "./tokens";
import { Card, Label, Btn, PageHeader } from "./ui";
import { ProfileMode } from "./RecommendTab";
import {
  type Client, type RiskLevel, type Goal, type AccountType, type CostSensitivity,
  riskLabel, ACCOUNT_LABELS, GOAL_LABELS, COST_LABELS,
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

// Guide-rail tick labels under the risk slider - the thumb rests anywhere continuously.
const RISK_TICKS: [number, string][] = [
  [1, "Conservative"], [2, "Mod. Conservative"], [3, "Moderate"], [4, "Mod. Aggressive"], [5, "Aggressive"],
];

// ── Guided builder config (maps friendly inputs onto the existing Client model) ──
// Continuous age → inferred planning horizon (keeps the algorithm's horizon input).
const inferHorizon = (age: number) => age < 35 ? 30 : age < 50 ? 20 : age < 60 ? 14 : age < 70 ? 9 : 5;
// Growth ↔ Income slider position (0-100) → the existing three goals.
const goalFromPos = (p: number): Goal => (p < 34 ? "growth" : p > 66 ? "income" : "balanced");
const posFromGoal = (g: Goal): number => (g === "growth" ? 12 : g === "income" ? 88 : 50);
const goalBlurb = (p: number): string =>
  p < 20 ? "Maximize long-term appreciation; accept larger swings for higher expected return."
  : p < 40 ? "Growth-leaning: mostly equity with a stabilizing bond sleeve."
  : p < 60 ? "A balanced core - roughly even growth and stability through most markets."
  : p < 80 ? "Income-leaning: emphasizes yield and downside protection over growth."
  : "Prioritize yield and capital stability; minimize drawdowns.";
// Tax optimization tier → the existing tax-bracket / muni-swap logic (no algorithm change).
const TAX_TIERS: { key: string; label: string; bracket: number; sub: string }[] = [
  { key: "none", label: "None",     bracket: 0,  sub: "Ignore tax considerations." },
  { key: "low",  label: "Low",      bracket: 15, sub: "Light tax awareness in fund selection." },
  { key: "mod",  label: "Moderate", bracket: 24, sub: "Balance tax efficiency with returns." },
  { key: "high", label: "High",     bracket: 32, sub: "Favor tax-efficient funds; muni swap in taxable." },
  { key: "max",  label: "Maximum",  bracket: 37, sub: "Maximize after-tax outcomes throughout." },
];
// Portfolio philosophy = advisor intent. Maps to the existing cost-sensitivity input.
const PHILOSOPHIES: { key: string; label: string; desc: string; cost: CostSensitivity }[] = [
  { key: "lowcost",  label: "Lowest Cost",           desc: "Cheapest funds that fit each sleeve.", cost: "high" },
  { key: "quality",  label: "Highest Quality",       desc: "Best-in-class funds regardless of fee.", cost: "low" },
  { key: "diversify",label: "Maximum Diversification",desc: "Spread risk across the broadest set.", cost: "medium" },
  { key: "income",   label: "Income Focus",          desc: "Lean toward yield and cash flow.", cost: "medium" },
  { key: "tax",      label: "Tax Optimized",         desc: "Prioritize after-tax efficiency.", cost: "medium" },
  { key: "blend",    label: "Blend",                 desc: "A balanced, all-around construction.", cost: "medium" },
];
const RISK_DESC: Record<number, string> = {
  1: "Capital protection first. Heavy fixed income, minimal equity, shallow drawdowns.",
  2: "Defensive tilt. Mostly bonds with a modest equity sleeve for slow growth.",
  3: "A balanced core. Roughly even growth and stability through most markets.",
  4: "Growth-oriented. Equity-heavy, accepting larger swings for higher return.",
  5: "Maximum growth. Almost all equity, expect significant volatility.",
};
// Plain-English explanation of each asset-class sleeve (used in Present mode).
const ASSET_EXPLAIN: Record<string, { title: string; body: string }> = {
  us:    { title: "US Equity", body: "The growth engine - broad ownership of American companies. Drives long-term appreciation and typically the largest slice of the equity allocation." },
  smid:  { title: "US Small / Mid Cap", body: "Smaller domestic companies with higher growth potential and higher volatility - a return amplifier used in more aggressive mixes." },
  intl:  { title: "International Developed", body: "Companies in developed economies outside the US (Europe, Japan). Adds diversification and currency exposure so the portfolio isn't reliant on one market." },
  em:    { title: "Emerging Markets", body: "Faster-growing developing economies. Higher risk and reward - a small sleeve that lifts long-run return potential." },
  core:  { title: "Core Bond", body: "High-quality bonds that cushion equity drops and provide steady income. The ballast that reduces overall portfolio swings." },
  short: { title: "Short-Term Bond", body: "Shorter-maturity bonds with lower interest-rate sensitivity - stability and liquidity for near-term needs." },
  tips:  { title: "Inflation-Protected (TIPS)", body: "Bonds indexed to inflation, protecting purchasing power when prices rise." },
  cash:  { title: "Cash / Money Market", body: "Highly liquid reserves for stability and short-term needs, with minimal risk." },
};
const STEP_META: { title: string; subtitle: string }[] = [
  { title: "Client Profile",       subtitle: "Who are we building this portfolio for?" },
  { title: "Investment Objective", subtitle: "Where should this portfolio sit between growth and income?" },
  { title: "Risk Profile",         subtitle: "How much volatility can the client tolerate?" },
  { title: "Preferences",          subtitle: "Tax, allocation, and how you want the portfolio built." },
  { title: "Review",               subtitle: "Confirm the inputs, then generate the recommendation." },
];
const LOADING_MSGS = [
  "Analyzing client profile…", "Determining strategic allocation…", "Evaluating fund universe…",
  "Optimizing diversification…", "Applying tax considerations…", "Generating recommendation…",
];

const fmtUSD = (n: number) => (n > 0 ? "$" + n.toLocaleString("en-US") : "");
const parseUSD = (s: string) => Number(s.replace(/[^0-9]/g, "")) || 0;

// Large selectable choice card used across the wizard steps.
function ChoiceCard({ selected, title, sub, onClick }: {
  selected: boolean; title: string; sub?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      padding: "16px 16px", borderRadius: R.lg, cursor: "pointer", textAlign: "left",
      border: `1.5px solid ${selected ? T.blue : T.line2}`, background: selected ? T.blueL : T.panel,
      boxShadow: selected ? "none" : "var(--c-card-shadow)", transition: "border-color 0.14s, background 0.14s",
      display: "flex", flexDirection: "column", gap: 3, minWidth: 0, ...ui,
    }}>
      <span style={{ fontSize: 14.5, fontWeight: 600, color: selected ? T.blue : T.text, letterSpacing: "-0.01em" }}>{title}</span>
      {sub && <span style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.4 }}>{sub}</span>}
    </button>
  );
}

// Row with a label + iOS-style switch, used for the preference toggles.
function ToggleRow({ label, sub, on, onToggle }: {
  label: string; sub?: string; on: boolean; onToggle: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      padding: "13px 16px", border: `1px solid ${T.line}`, borderRadius: R.lg, background: T.panel }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, ...ui }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: T.muted, ...ui, marginTop: 2, maxWidth: 460, lineHeight: 1.4 }}>{sub}</div>}
      </div>
      <button onClick={onToggle} role="switch" aria-checked={on} aria-label={label} style={{ width: 42, height: 24, borderRadius: 99,
        border: "none", cursor: "pointer", background: on ? T.blue : T.line2, position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
        <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: "50%",
          background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
      </button>
    </div>
  );
}

// Staged "premium loading" sequence shown while the portfolio generates.
function BuildingExperience() {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, LOADING_MSGS.length - 1)), 430);
    return () => clearInterval(t);
  }, []);
  return (
    <Card>
      <div style={{ padding: "48px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
        <div style={{ position: "relative", width: 34, height: 34 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${T.line2}` }} />
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid transparent",
            borderTopColor: T.blue, animation: "spin 0.7s linear infinite" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, minWidth: 250 }}>
          {LOADING_MSGS.map((m, idx) => (
            <div key={m} style={{ display: "flex", alignItems: "center", gap: 10,
              opacity: idx <= i ? 1 : 0.35, transition: "opacity 0.3s" }}>
              <span style={{ width: 15, height: 15, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                color: idx < i ? T.blue : T.muted }}>
                {idx < i
                  ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <span style={{ width: 5, height: 5, borderRadius: "50%", background: idx === i ? T.blue : T.line2 }} />}
              </span>
              <span style={{ fontSize: 13.5, color: idx === i ? T.text : T.dim, fontWeight: idx === i ? 600 : 400, ...ui }}>{m}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

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
  const [vehicle, setVehicle] = useState<Vehicle>("Both");
  const [view, setView] = useState<"build" | "compare">("build");

  // Build
  const [built, setBuilt] = useState<{ sleeves: Sleeve[]; placement: PlacementResult } | null>(null);
  const [metrics, setMetrics] = useState<BlendedKpis | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [variantLabel, setVariantLabel] = useState("");
  const [matchToken, setMatchToken] = useState(0);  // bumped on every build to run the fund matcher

  // Guided builder wizard
  const [wizardStep, setWizardStep] = useState(1);        // 1..5
  const [generating, setGenerating] = useState(false);    // drives the loading experience
  const [spouseOn, setSpouseOn] = useState(false);        // optional couples planning
  const [goalPos, setGoalPos] = useState(50);             // Growth(0) ↔ Income(100) → goal
  const [taxTier, setTaxTier] = useState(0);              // 0..4 → tax bracket / muni logic
  const [usEquityPct, setUsEquityPct] = useState(65);     // US vs International equity preference
  const [philosophy, setPhilosophy] = useState("blend");  // advisor intent → cost sensitivity
  const [blendedTax, setBlendedTax] = useState<number | null>(null); // captured blended tax score for results
  const [present, setPresent] = useState(false);          // client-facing presentation overlay
  const [presentHover, setPresentHover] = useState(0);    // active pie slice in presentation

  // Compare
  const [cur, setCur] = useState<Side | null>(null);
  const [prop, setProp] = useState<Side | null>(null);
  const [cmpLoading, setCmpLoading] = useState(false);
  const [ran, setRan] = useState(false);


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
    if (c) {
      setDraft(c); setBuilt(null); setMetrics(null); setCur(null); setProp(null); setRan(false); setVariantLabel("");
      setGoalPos(posFromGoal(c.goal));
      setSpouseOn(c.spouseAge != null);
      const tier = TAX_TIERS.reduce((best, t, i) => (c.taxBracket ?? 0) >= t.bracket ? i : best, 0);
      setTaxTier(tier);
      setWizardStep(1);
    }
  };
  const removeClient = () => { const list = deleteClient(draft.id); setClients(list); setDraft(list[0] ?? newClient()); setBuilt(null); setCur(null); setProp(null); };

  const total = totalAssets(draft);
  const eqFrac = equityFraction(draft);

  const generate = async (client: Client, label = "", veh: Vehicle = vehicle) => {
    // Advisor US/International preference feeds the equity split as an optional override.
    const base = targetSleeves(client, veh, { intlShare: (100 - usEquityPct) / 100 });
    // Data-driven selection: screen each sleeve's category and pick the best-scoring fund.
    // Pass the chosen vehicle straight through - "Both" leaves the pool unconstrained.
    setSelecting(true);
    let sleeves = base;
    try {
      const res = await fetch("/api/portfolio/select", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: client.goal, sleeves: base.map((s) => ({ key: s.key, category: s.category, vehicle: veh, seed: s.fund.ticker })) }),
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
    const placement = placeAssets(client, sleeves, veh);
    setBuilt({ sleeves, placement }); setVariantLabel(label); setActiveIdx(0);
    setMatchToken((t) => t + 1);  // run the fund matcher off the same profile
    // Blended metrics
    setMetricsLoading(true); setMetrics(null);
    const uniq = Array.from(new Map(sleeves.map((s) => [s.fund.ticker, s])).values())
      .map((s) => ({ ticker: s.fund.ticker, weight: Math.round(s.weight * 100) }));
    const side = await analyzeSide(uniq);
    setMetrics(side?.kpi ?? null); setBlendedTax(side?.taxScore ?? null); setMetricsLoading(false);
  };
  // Total investable → single taxable bucket (advisors think in total first; account
  // optimization happens later in Step 4). Editing the total clears any prior split.
  const setTotalInvestable = (v: number) =>
    setDraft((d) => ({ ...d, accounts: d.accounts.map((a) => ({ ...a, balance: a.type === "taxable" ? v : 0 })) }));
  // Asset-location split: set a tax-advantaged account; taxable absorbs the remainder so
  // the total the advisor entered stays fixed.
  const setSubAccount = (type: AccountType, v: number) =>
    setDraft((d) => {
      const totalNow = d.accounts.reduce((s, a) => s + (a.balance || 0), 0);
      const otherSubs = d.accounts.filter((a) => a.type !== "taxable" && a.type !== type).reduce((s, a) => s + (a.balance || 0), 0);
      const taxable = Math.max(0, totalNow - v - otherSubs);
      return { ...d, accounts: d.accounts.map((a) => a.type === type ? { ...a, balance: v } : a.type === "taxable" ? { ...a, balance: taxable } : a) };
    });

  // Wizard "Generate": fold the friendly wizard inputs (goal slider, tax tier, philosophy)
  // into the Client the algorithm already consumes, then hold the loading long enough to
  // feel like a real engine even when data is cached.
  const runGenerate = async () => {
    const client: Client = {
      ...draft,
      goal: goalFromPos(goalPos),
      taxBracket: TAX_TIERS[taxTier].bracket,
      costSensitivity: PHILOSOPHIES.find((p) => p.key === philosophy)?.cost ?? "medium",
      horizonYears: draft.age != null ? inferHorizon(spouseOn && draft.spouseAge != null ? Math.min(draft.age, draft.spouseAge) : draft.age) : draft.horizonYears,
    };
    setDraft(client);
    setGenerating(true);
    try { await Promise.all([generate(client), new Promise((r) => setTimeout(r, 2600))]); }
    finally { setGenerating(false); }
  };
  const editInputs = () => { setBuilt(null); setMetrics(null); setWizardStep(5); };
  const startOver = () => { setBuilt(null); setMetrics(null); setWizardStep(1); };
  const setVehicleAndRebuild = (v: Vehicle) => { setVehicle(v); void generate(draft, variantLabel, v); };
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

  // ── Wizard-derived values ──
  const taxableBal = draft.accounts.find((a) => a.type === "taxable")?.balance || 0;
  const etfOn = vehicle === "ETF" || vehicle === "Both";
  const mfOn = vehicle === "Mutual Fund" || vehicle === "Both";
  const toggleVehicle = (which: "etf" | "mf") => {
    const e = which === "etf" ? !etfOn : etfOn;
    const m = which === "mf" ? !mfOn : mfOn;
    if (!e && !m) return;  // require at least one vehicle
    setVehicle(e && m ? "Both" : e ? "ETF" : "Mutual Fund");
  };
  const goalTitle = (() => { const g = goalFromPos(goalPos); return g === "growth" ? "Growth" : g === "income" ? "Income" : "Balanced"; })();
  const vehiclesLabel = vehicle === "Both" ? "ETFs + Mutual Funds" : vehicle === "ETF" ? "ETFs" : "Mutual Funds";
  const reviewGroups: { title: string; step: number; items: { label: string; value: string }[] }[] = [
    { title: "Client Profile", step: 1, items: [
      { label: "Primary age", value: draft.age != null ? String(draft.age) : "—" },
      ...(spouseOn && draft.spouseAge != null ? [{ label: "Spouse age", value: String(draft.spouseAge) }] : []),
      { label: "Total investable", value: fmtUSD(total) || "—" },
    ] },
    { title: "Investment Objective", step: 2, items: [{ label: "Position", value: goalTitle }] },
    { title: "Risk Profile", step: 3, items: [{ label: "Level", value: `${riskLabel(draft.risk)} · ${draft.risk.toFixed(1)}` }] },
    { title: "Tax Optimization", step: 4, items: [{ label: "Tier", value: TAX_TIERS[taxTier].label }] },
    { title: "Allocation Preferences", step: 4, items: [
      { label: "US / International", value: `${usEquityPct}% / ${100 - usEquityPct}%` },
      { label: "Vehicles", value: vehiclesLabel },
    ] },
    { title: "Portfolio Philosophy", step: 4, items: [{ label: "Approach", value: PHILOSOPHIES.find((p) => p.key === philosophy)?.label ?? "" }] },
  ];

  const mix = built ? assetClassMix(built.sleeves) : null;
  // Recommendation framing: name the strategy from its equity weight, and score
  // diversification from sleeve concentration (normalized inverse-HHI, 0-100).
  const strategyName = (() => {
    const eq = mix ? mix.equity : eqFrac;
    if (eq >= 0.80) return "Aggressive Growth";
    if (eq >= 0.66) return "Growth";
    if (eq >= 0.55) return "Balanced Growth";
    if (eq >= 0.45) return "Balanced Core";
    if (eq >= 0.32) return "Conservative Income";
    return "Capital Preservation";
  })();
  const divScore = (() => {
    if (!built || built.sleeves.length === 0) return null;
    const ws = built.sleeves.map((s) => s.weight);
    const hhi = ws.reduce((s, w) => s + w * w, 0);
    const n = ws.length;
    const norm = n > 1 ? (1 - hhi) / (1 - 1 / n) : 0;
    return Math.round(Math.max(0, Math.min(1, norm)) * 100);
  })();
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
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1080 }}>
      <PageHeader title="Portfolios"
        subtitle="Build a target portfolio for a client with asset location and matched funds, then flip to Compare it against what they hold today." />

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
            {(["build", "compare"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} style={{ padding: "7px 15px", fontSize: 12.5, ...ui, cursor: "pointer",
                border: "none", background: view === v ? T.text : "transparent", color: view === v ? T.bg : T.dim, fontWeight: 600 }}>
                {v === "build" ? "Build" : "Compare"}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ══════════════ BUILD VIEW ══════════════ */}
      {view === "build" && (
        <>
          {/* ─────── Guided builder wizard ─────── */}
          {!built && !generating && (
            <Card>
              <div style={{ padding: "24px 26px" }}>
                {/* Progress + step heading */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                    {STEP_META.map((_, i) => (
                      <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < wizardStep ? T.blue : T.line2, transition: "background 0.2s" }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, ...ui, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 5 }}>Step {wizardStep} of 5</div>
                  <h2 style={{ ...ui, fontSize: 20, fontWeight: 600, color: T.text, margin: 0, letterSpacing: "-0.01em" }}>{STEP_META[wizardStep - 1].title}</h2>
                  <p style={{ fontSize: 13, color: T.dim, marginTop: 4, ...ui }}>{STEP_META[wizardStep - 1].subtitle}</p>
                </div>

                <div key={wizardStep} className="alca-step">
                {/* STEP 1 - Client profile */}
                {wizardStep === 1 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                        <Label>Client age</Label>
                        <button onClick={() => { const on = !spouseOn; setSpouseOn(on); if (on && draft.spouseAge == null) set("spouseAge", draft.age ?? 58); }}
                          style={{ fontSize: 11.5, color: T.blue, background: "none", border: "none", cursor: "pointer", padding: 0, ...ui, fontWeight: 500 }}>
                          {spouseOn ? "Remove spouse" : "+ Add spouse"}
                        </button>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                        <span style={{ fontSize: 40, fontWeight: 700, color: T.text, ...ui, letterSpacing: "-0.02em", lineHeight: 1 }}>{draft.age ?? 58}</span>
                        <span style={{ fontSize: 14, color: T.muted, ...ui }}>years old</span>
                      </div>
                      <input type="range" min={18} max={100} step={1} value={draft.age ?? 58}
                        onChange={(e) => { const a = Number(e.target.value); setDraft((d) => ({ ...d, age: a, horizonYears: inferHorizon(spouseOn && d.spouseAge != null ? Math.min(a, d.spouseAge) : a) })); }}
                        style={{ width: "100%", maxWidth: 560, accentColor: T.blue, display: "block", marginTop: 12 }} />
                      {spouseOn && (
                        <div style={{ marginTop: 20 }}>
                          <Label>Spouse age</Label>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                            <span style={{ fontSize: 40, fontWeight: 700, color: T.text, ...ui, letterSpacing: "-0.02em", lineHeight: 1 }}>{draft.spouseAge ?? 58}</span>
                            <span style={{ fontSize: 14, color: T.muted, ...ui }}>years old</span>
                          </div>
                          <input type="range" min={18} max={100} step={1} value={draft.spouseAge ?? 58}
                            onChange={(e) => { const sa = Number(e.target.value); setDraft((d) => ({ ...d, spouseAge: sa, horizonYears: inferHorizon(d.age != null ? Math.min(d.age, sa) : sa) })); }}
                            style={{ width: "100%", maxWidth: 560, accentColor: T.blue, display: "block", marginTop: 12 }} />
                          <div style={{ fontSize: 11.5, color: T.muted, ...ui, marginTop: 8 }}>Planning horizon uses the younger of the two.</div>
                        </div>
                      )}
                    </div>
                    <div>
                      <Label>Total investable assets</Label>
                      <input value={fmtUSD(total)} onChange={(e) => setTotalInvestable(parseUSD(e.target.value))}
                        inputMode="numeric" placeholder="$1,000,000"
                        style={{ ...inputStyle, ...mono, fontSize: 26, fontWeight: 600, padding: "14px 16px", maxWidth: 340, borderRadius: R.md }} />
                      <div style={{ fontSize: 11.5, color: T.muted, ...ui, marginTop: 8 }}>Across all accounts. You can split it by account type later for tax-aware placement.</div>
                    </div>
                  </div>
                )}

                {/* STEP 2 - Objective (Growth ↔ Income) */}
                {wizardStep === 2 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center", padding: "8px 0 2px" }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: T.text, ...ui, letterSpacing: "-0.02em" }}>{goalTitle}</div>
                    <div style={{ width: "100%", maxWidth: 560 }}>
                      <input type="range" min={0} max={100} step={1} value={goalPos}
                        onChange={(e) => setGoalPos(Number(e.target.value))}
                        style={{ width: "100%", accentColor: T.blue, display: "block" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                        {["Growth", "Balanced", "Income"].map((l) => (
                          <span key={l} style={{ fontSize: 11, color: T.muted, ...ui, fontWeight: 500 }}>{l}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ maxWidth: 520, textAlign: "center", fontSize: 13.5, color: T.dim, ...ui, lineHeight: 1.6, marginTop: 4 }}>{goalBlurb(goalPos)}</div>
                  </div>
                )}

                {/* STEP 3 - Risk profile */}
                {wizardStep === 3 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center", padding: "6px 0 2px" }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: T.text, ...ui, letterSpacing: "-0.02em" }}>{riskLabel(draft.risk)}</div>
                      <div style={{ fontSize: 12, color: T.muted, ...mono, marginTop: 2 }}>{draft.risk.toFixed(1)} / 5.0</div>
                    </div>
                    <div style={{ width: "100%", maxWidth: 560, position: "relative", paddingBottom: 22 }}>
                      <input type="range" min={1} max={5} step={0.1} value={draft.risk}
                        onChange={(e) => set("risk", Number(e.target.value) as RiskLevel)}
                        style={{ width: "100%", accentColor: T.blue, display: "block" }} />
                      <div style={{ position: "absolute", left: 0, right: 0, top: 22, display: "flex", justifyContent: "space-between", pointerEvents: "none" }}>
                        {RISK_TICKS.map(([n, label]) => (
                          <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div style={{ width: 1, height: 5, background: T.line2 }} />
                            <span style={{ fontSize: 9, color: T.muted, ...ui, marginTop: 2, whiteSpace: "nowrap" }}>{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ maxWidth: 520, textAlign: "center", fontSize: 13.5, color: T.dim, ...ui, lineHeight: 1.6 }}>{RISK_DESC[Math.round(draft.risk)]}</div>
                    <div style={{ display: "flex", gap: 28, marginTop: 4 }}>
                      <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: T.muted, ...ui }}>Target equity</div><div style={{ fontSize: 20, fontWeight: 600, color: T.text, ...mono }}>{Math.round(eqFrac * 100)}%</div></div>
                      <div style={{ textAlign: "center" }}><div style={{ fontSize: 11, color: T.muted, ...ui }}>Bonds &amp; cash</div><div style={{ fontSize: 20, fontWeight: 600, color: T.text, ...mono }}>{Math.round((1 - eqFrac) * 100)}%</div></div>
                    </div>
                  </div>
                )}

                {/* STEP 4 - Preferences (tax, allocation, philosophy) */}
                {wizardStep === 4 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
                    <div>
                      <Label>Tax optimization</Label>
                      <div style={{ display: "inline-flex", border: `1px solid ${T.line2}`, borderRadius: R.md, overflow: "hidden", marginTop: 4 }}>
                        {TAX_TIERS.map((t, i) => (
                          <button key={t.key} onClick={() => setTaxTier(i)} style={{ padding: "9px 16px", fontSize: 12.5, ...ui, cursor: "pointer",
                            border: "none", borderLeft: i === 0 ? "none" : `1px solid ${T.line2}`,
                            background: taxTier === i ? T.blue : "transparent", color: taxTier === i ? "#fff" : T.dim, fontWeight: 600 }}>{t.label}</button>
                        ))}
                      </div>
                      <div style={{ fontSize: 12, color: T.muted, ...ui, marginTop: 8 }}>{TAX_TIERS[taxTier].sub}</div>
                    </div>

                    <div>
                      <Label>US vs International equity</Label>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", maxWidth: 560, marginTop: 4 }}>
                        <span style={{ fontSize: 13.5, ...ui, color: T.text }}>US <b style={{ ...mono }}>{usEquityPct}%</b></span>
                        <span style={{ fontSize: 13.5, ...ui, color: T.text }}>International <b style={{ ...mono }}>{100 - usEquityPct}%</b></span>
                      </div>
                      <input type="range" min={0} max={100} step={5} value={usEquityPct}
                        onChange={(e) => setUsEquityPct(Number(e.target.value))}
                        style={{ width: "100%", maxWidth: 560, accentColor: T.blue, display: "block", marginTop: 8 }} />
                      <div style={{ fontSize: 11.5, color: T.muted, ...ui, marginTop: 8 }}>Splits the equity sleeve between domestic and international holdings.</div>
                    </div>

                    <div>
                      <Label>Portfolio philosophy</Label>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 12, marginTop: 4 }}>
                        {PHILOSOPHIES.map((p) => (
                          <ChoiceCard key={p.key} selected={philosophy === p.key} title={p.label} sub={p.desc}
                            onClick={() => { setPhilosophy(p.key); set("costSensitivity", p.cost); }} />
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>Investment vehicles</Label>
                      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                        {([["ETFs", etfOn, () => toggleVehicle("etf")], ["Mutual Funds", mfOn, () => toggleVehicle("mf")]] as [string, boolean, () => void][]).map(([lbl, on, fn]) => (
                          <button key={lbl} onClick={fn} style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 16px", borderRadius: R.md, cursor: "pointer",
                            border: `1.5px solid ${on ? T.blue : T.line2}`, background: on ? T.blueL : T.panel, ...ui, fontSize: 13.5, fontWeight: 600, color: on ? T.blue : T.dim }}>
                            <span style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${on ? T.blue : T.line2}`, background: on ? T.blue : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                              {on && <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </span>
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 5 - Review (grouped summary cards) */}
                {wizardStep === 5 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                    {reviewGroups.map((g) => (
                      <div key={g.title} style={{ border: `1px solid ${T.line}`, borderRadius: R.lg, padding: "14px 16px", background: T.panel }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text, ...ui }}>{g.title}</span>
                          <button onClick={() => setWizardStep(g.step)} style={{ fontSize: 11.5, color: T.blue, background: "none", border: "none", cursor: "pointer", padding: 0, ...ui, fontWeight: 500 }}>Edit</button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {g.items.map((it) => (
                            <div key={it.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                              <span style={{ fontSize: 12, color: T.muted, ...ui }}>{it.label}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, ...ui, textAlign: "right" }}>{it.value || "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </div>

                {/* Footer nav */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 26, paddingTop: 20, borderTop: `1px solid ${T.line}` }}>
                  <div>{wizardStep > 1 && <Btn ghost onClick={() => setWizardStep((s) => s - 1)}>← Back</Btn>}</div>
                  {wizardStep < 5
                    ? <Btn accent onClick={() => setWizardStep((s) => s + 1)}>Continue →</Btn>
                    : <Btn accent onClick={runGenerate}>Generate Recommendation →</Btn>}
                </div>
              </div>
            </Card>
          )}

          {/* Premium loading experience */}
          {generating && <BuildingExperience />}

          {built && !generating && (
            <>
              {/* ─────── Recommendation summary ─────── */}
              <Card>
                <div style={{ padding: "24px 26px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ width: 20, height: 20, borderRadius: "50%", background: `${T.green}1E`, color: T.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </span>
                        <span style={{ fontSize: 11, color: T.green, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", ...ui }}>Recommended portfolio</span>
                      </div>
                      <h2 style={{ ...ui, fontSize: 26, fontWeight: 600, color: T.text, margin: 0, letterSpacing: "-0.015em" }}>{strategyName}</h2>
                      {mix && (
                        <p style={{ fontSize: 13.5, color: T.dim, ...ui, marginTop: 6, lineHeight: 1.55, maxWidth: 640 }}>
                          A {riskLabel(draft.risk).toLowerCase()}-risk strategy: {Math.round(mix.equity * 100)}% equity / {Math.round((mix.fixed + mix.cash) * 100)}% bonds &amp; cash across {new Set(built.sleeves.map((s) => s.fund.ticker)).size} funds, tuned to a {GOAL_LABELS[draft.goal].toLowerCase()} objective.
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Btn small ghost onClick={editInputs}>Edit inputs</Btn>
                      <Btn small ghost onClick={startOver}>Start over</Btn>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 12, marginTop: 20 }}>
                    {([
                      ["Risk Level", `${riskLabel(draft.risk)}`],
                      ["Expected Return", metricsLoading ? "…" : pctv(metrics?.return3y ?? null)],
                      ["Expected Drawdown", metricsLoading ? "…" : pctv(metrics?.maxDrawdown3y ?? null)],
                      ["Expense Ratio", metricsLoading ? "…" : pctv(metrics?.expenseRatio ?? null, 2)],
                      ["Tax Efficiency", blendedTax == null ? (metricsLoading ? "…" : "—") : `${blendedTax}/100`],
                      ["Diversification", divScore == null ? "—" : `${divScore}/100`],
                    ] as [string, string][]).map(([l, v]) => (
                      <div key={l} style={{ background: T.panel3, border: `1px solid ${T.line}`, borderRadius: R.md, padding: "13px 14px" }}>
                        <div style={{ fontSize: 10, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                        <div style={{ fontSize: 19, fontWeight: 600, color: T.text, ...mono, marginTop: 5 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Primary actions */}
                  <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
                    <Btn accent onClick={() => setPresent(true)}>Present to Client →</Btn>
                    <Btn onClick={() => document.getElementById("alca-analysis")?.scrollIntoView({ behavior: "smooth" })}>View Analysis</Btn>
                    <Btn ghost disabled>Export PDF · soon</Btn>
                  </div>

                  {/* Why this recommendation? */}
                  <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${T.line}` }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, ...ui, marginBottom: 10 }}>Why this recommendation?</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        `At age ${draft.age ?? "—"}${spouseOn && draft.spouseAge != null ? ` (planning to the younger spouse, ${Math.min(draft.age ?? 999, draft.spouseAge)})` : ""}, an inferred ${draft.horizonYears ?? "—"}-year horizon supports a ${mix ? Math.round(mix.equity * 100) : "—"}% equity weight.`,
                        `A ${riskLabel(draft.risk).toLowerCase()} risk profile set the growth-vs-stability balance and the small/mid and emerging-market tilts.`,
                        `Tax optimization "${TAX_TIERS[taxTier].label}" ${taxTier >= 3 ? "favors tax-efficient funds and swaps in municipals for the taxable sleeve" : taxTier === 0 ? "applies no tax adjustments" : "applies light tax awareness in fund selection"}.`,
                        `Your ${usEquityPct}% US / ${100 - usEquityPct}% international preference shaped the equity split.`,
                        `Each sleeve's fund was selected by screening its category on cost, risk-adjusted return, downside protection and yield.`,
                      ].map((t, i) => (
                        <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                          <span style={{ color: T.blue, flexShrink: 0, marginTop: 6, width: 5, height: 5, borderRadius: "50%", background: T.blue }} />
                          <span style={{ fontSize: 12.5, color: T.dim, ...ui, lineHeight: 1.55 }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              <div id="alca-analysis" />

              {/* Donut + refine */}
              <Card>
                <div style={{ padding: "18px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <Label>Target Allocation</Label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {variantLabel && <span style={{ fontSize: 10.5, color: T.data, background: `${T.data}18`, borderRadius: 10, padding: "3px 10px", ...ui, fontWeight: 600 }}>Variant: {variantLabel}</span>}
                      <span style={{ fontSize: 10.5, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.06em" }}>Vehicle</span>
                      <div style={{ display: "inline-flex", border: `1px solid ${T.line2}`, borderRadius: 8, overflow: "hidden" }}>
                        {(["Both", "ETF", "Mutual Fund"] as Vehicle[]).map((v) => (
                          <button key={v} onClick={() => setVehicleAndRebuild(v)} disabled={selecting} style={{ padding: "6px 12px", fontSize: 11.5, ...ui, cursor: selecting ? "default" : "pointer", border: "none", background: vehicle === v ? T.text : "transparent", color: vehicle === v ? T.bg : T.dim, fontWeight: 600 }}>{v}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: T.muted, ...ui, marginTop: 4 }}>
                    Each sleeve&apos;s fund is screened and scored on cost, risk-adjusted return, downside protection and more.
                  </div>
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

              {/* Matched funds - run automatically off this same client profile on every build */}
              <Card>
                <div style={{ padding: "18px 20px" }}>
                  <Label>Top Fund Matches for this Client</Label>
                  <p style={{ fontSize: 12, color: T.dim, marginTop: 4, ...ui }}>
                    Best-scoring {vehicle === "Both" ? "ETFs & mutual funds" : vehicle === "ETF" ? "ETFs" : "mutual funds"} across the whole universe for {draft.name?.trim() || "this client"}&apos;s
                    risk, horizon, income &amp; cost profile - a complement to the per-sleeve picks above.
                  </p>
                  <div style={{ marginTop: 12 }}>
                    <ProfileMode onAnalyze={onAnalyze} onAddToCompare={onFindSimilar} presetClient={draft} presetVehicle={vehicle} hideForm runToken={matchToken} />
                  </div>
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

      {/* ══════════════ PRESENT TO CLIENT (full-screen presentation) ══════════════ */}
      {present && built && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: T.bg, overflowY: "auto" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 40px 80px" }}>
            {/* Presentation header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 34 }}>
              <div style={{ ...ui, fontSize: 15, fontWeight: 700, letterSpacing: "0.16em", color: T.text, textTransform: "uppercase" }}>ALCA</div>
              <button onClick={() => setPresent(false)} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, ...ui, fontWeight: 500,
                color: T.dim, background: "transparent", border: `1px solid ${T.line2}`, borderRadius: R.md, padding: "7px 14px", cursor: "pointer" }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                Exit presentation
              </button>
            </div>

            {/* Headline */}
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: T.muted, ...ui, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Proposed portfolio</div>
              <h1 style={{ ...ui, fontSize: 38, fontWeight: 600, color: T.text, margin: 0, letterSpacing: "-0.02em" }}>{strategyName}</h1>
              {mix && <p style={{ fontSize: 15, color: T.dim, ...ui, marginTop: 8 }}>{Math.round(mix.equity * 100)}% equity · {Math.round((mix.fixed + mix.cash) * 100)}% bonds &amp; cash · {riskLabel(draft.risk)} risk</p>}
            </div>

            {/* Large pie + hover explanation */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 420px) 1fr", gap: 40, alignItems: "center", margin: "40px 0 48px" }}>
              <div style={{ height: 420, position: "relative" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" cx="50%" cy="50%" innerRadius={112} outerRadius={168}
                      onMouseEnter={(_: unknown, i: number) => setPresentHover(i)} paddingAngle={1.5} isAnimationActive={false} stroke="none">
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} opacity={presentHover === i ? 1 : 0.55}
                        style={{ transition: "opacity 0.15s", transformOrigin: "center", transform: presentHover === i ? "scale(1.04)" : "scale(1)" }} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {donutData[presentHover] && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div style={{ fontSize: 30, fontWeight: 700, color: T.text, ...mono }}>{donutData[presentHover].pct}%</div>
                    <div style={{ fontSize: 13, color: T.dim, ...ui, maxWidth: 150, textAlign: "center", lineHeight: 1.3, marginTop: 2 }}>{donutData[presentHover].label}</div>
                  </div>
                )}
              </div>
              <div>
                {(() => {
                  const sl = built.sleeves[presentHover];
                  const ex = sl ? ASSET_EXPLAIN[sl.key] : null;
                  return (
                    <div>
                      <div style={{ fontSize: 11.5, color: T.muted, ...ui, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>Hover a slice</div>
                      <h3 style={{ ...ui, fontSize: 24, fontWeight: 600, color: T.text, margin: 0, letterSpacing: "-0.01em" }}>{ex?.title ?? sl?.label}</h3>
                      <p style={{ fontSize: 15.5, color: T.dim, ...ui, marginTop: 12, lineHeight: 1.65 }}>{ex?.body ?? "A component of the recommended allocation."}</p>
                    </div>
                  );
                })()}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
                  {built.sleeves.map((s, i) => (
                    <button key={s.key} onMouseEnter={() => setPresentHover(i)} onClick={() => setPresentHover(i)}
                      style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 99, cursor: "pointer",
                        border: `1px solid ${presentHover === i ? T.text : T.line2}`, background: presentHover === i ? T.panel2 : "transparent", ...ui, fontSize: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: SLICE[i % SLICE.length] }} />
                      <span style={{ color: T.dim }}>{s.label}</span>
                      <span style={{ color: T.text, fontWeight: 600, ...mono }}>{Math.round(s.weight * 100)}%</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Metrics summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 48 }}>
              {([
                ["Expected Return", metricsLoading ? "…" : pctv(metrics?.return3y ?? null)],
                ["Expected Drawdown", metricsLoading ? "…" : pctv(metrics?.maxDrawdown3y ?? null)],
                ["Expense Ratio", metricsLoading ? "…" : pctv(metrics?.expenseRatio ?? null, 2)],
                ["Tax Efficiency", blendedTax == null ? "—" : `${blendedTax}/100`],
                ["Diversification", divScore == null ? "—" : `${divScore}/100`],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} style={{ textAlign: "center", padding: "16px 12px", background: T.panel3, borderRadius: R.lg }}>
                  <div style={{ fontSize: 10.5, color: T.muted, ...ui, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: T.text, ...mono, marginTop: 6 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Why this portfolio */}
            <div style={{ marginBottom: 44 }}>
              <h2 style={{ ...ui, fontSize: 22, fontWeight: 600, color: T.text, margin: "0 0 14px", letterSpacing: "-0.01em" }}>Why this portfolio?</h2>
              <p style={{ fontSize: 15.5, color: T.dim, ...ui, lineHeight: 1.7, maxWidth: 760 }}>
                This {riskLabel(draft.risk).toLowerCase()}-risk {strategyName.toLowerCase()} portfolio holds {mix ? Math.round(mix.equity * 100) : "—"}% in equities for long-term growth and {mix ? Math.round((mix.fixed + mix.cash) * 100) : "—"}% in bonds and cash to cushion volatility. The equity sleeve blends {usEquityPct}% US and {100 - usEquityPct}% international exposure so returns aren&apos;t tied to a single market, and the fixed-income sleeve is layered across core, short-term and inflation-protected bonds for stability. Fund selection favors {(PHILOSOPHIES.find((p) => p.key === philosophy)?.label ?? "a balanced").toLowerCase()} construction, and the {TAX_TIERS[taxTier].label.toLowerCase()} tax setting {taxTier >= 3 ? "steers taxable dollars into tax-efficient and municipal holdings" : "keeps things simple"}.
              </p>
            </div>

            {/* Fund breakdown with plain-English reasons */}
            <div>
              <h2 style={{ ...ui, fontSize: 22, fontWeight: 600, color: T.text, margin: "0 0 16px", letterSpacing: "-0.01em" }}>Recommended funds</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {built.sleeves.map((s, i) => (
                  <div key={s.key} style={{ display: "flex", gap: 16, alignItems: "flex-start", border: `1px solid ${T.line}`, borderRadius: R.lg, padding: "16px 18px", background: T.panel }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: SLICE[i % SLICE.length], marginTop: 6, flexShrink: 0 }} />
                    <div style={{ minWidth: 92 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: T.text, ...mono }}>{s.fund.ticker}</div>
                      <div style={{ fontSize: 12.5, color: T.data, ...mono, fontWeight: 600 }}>{Math.round(s.weight * 100)}%</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, ...ui }}>{s.label}</div>
                      <div style={{ fontSize: 13, color: T.dim, ...ui, marginTop: 4, lineHeight: 1.55 }}>{s.reason ?? ASSET_EXPLAIN[s.key]?.body ?? "Selected for this allocation sleeve."}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: T.muted, ...ui, marginTop: 24, textAlign: "center" }}>Research aid · verify before client use.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
