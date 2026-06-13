"use client";
import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { T, mono, chartTooltip } from "./tokens";
import { Btn, Label, Select, Spinner, ErrBanner, KPI, PriorityChip, SectionHeader, Card, RankBadge, ScoreBadge, PercentileBar } from "./ui";
import { ui } from "./tokens";
import universeData from "@/../data/universe.json";

type UniverseEntry = { ticker: string; name: string; category: string; vehicle: string; benchmark: string };
const UNIVERSE = universeData as UniverseEntry[];

const ASSET = ["Any", "US Equity", "International Equity", "Fixed Income", "Allocation / Balanced", "Sector / Thematic", "Alternatives"];
const VEHICLE = ["Either", "Mutual Fund", "ETF"];
const ER_OPTIONS = [
  { label: "Any", value: null },
  { label: "≤ 0.10%", value: 0.10 },
  { label: "≤ 0.25%", value: 0.25 },
  { label: "≤ 0.50%", value: 0.50 },
  { label: "≤ 0.75%", value: 0.75 },
  { label: "≤ 1.00%", value: 1.00 },
];
const TENURE_OPTIONS = [
  { label: "Any", value: null },
  { label: "3+ yrs", value: 3 },
  { label: "5+ yrs", value: 5 },
  { label: "10+ yrs", value: 10 },
];
const YIELD_OPTIONS = [
  { label: "Any", value: null },
  { label: "≥ 1%", value: 1 },
  { label: "≥ 2%", value: 2 },
  { label: "≥ 3%", value: 3 },
  { label: "≥ 4%", value: 4 },
];
const ALPHA_OPTIONS = [
  { label: "Any", value: null },
  { label: "≥ 0% (beats bench)", value: 0 },
  { label: "≥ 1%", value: 1 },
  { label: "≥ 2%", value: 2 },
  { label: "≥ 3%", value: 3 },
];
const SHARPE_OPTIONS = [
  { label: "Any", value: null },
  { label: "≥ 0.5", value: 0.5 },
  { label: "≥ 0.75", value: 0.75 },
  { label: "≥ 1.0", value: 1.0 },
  { label: "≥ 1.25", value: 1.25 },
];
const RET3Y_OPTIONS = [
  { label: "Any", value: null },
  { label: "≥ 5%", value: 5 },
  { label: "≥ 8%", value: 8 },
  { label: "≥ 10%", value: 10 },
  { label: "≥ 15%", value: 15 },
];
const PRIORITIES = [
  "Downside protection",
  "Low cost",
  "Risk-adjusted return (Sharpe)",
  "Alpha vs benchmark",
  "Consistency vs category",
  "Income / yield",
];

// ── Style-box cell → category mappings ─────────────────────────────────────────

const EQUITY_COLS = ["Value", "Blend", "Growth"] as const;
const EQUITY_ROWS = ["Large", "Mid", "Small"] as const;
const EQUITY_CELLS: Record<string, string[]> = {
  "Large|Value":  ["US Equity Large Value"],
  "Large|Blend":  ["US Equity Large Blend"],
  "Large|Growth": ["US Equity Large Growth"],
  "Mid|Value":    ["US Equity Mid Value"],
  "Mid|Blend":    ["US Equity Mid Blend", "US Equity Mid/Small Blend"],
  "Mid|Growth":   ["US Equity Mid Growth"],
  "Small|Value":  ["US Equity Small Value"],
  "Small|Blend":  ["US Equity Small Blend", "US Equity Mid/Small Blend"],
  "Small|Growth": ["US Equity Small Growth", "US Equity Small/Mid Growth"],
};

const FI_COLS = ["Short", "Interm.", "Long"] as const;
const FI_ROWS = ["High", "Med", "Low"] as const;
// note: keys use the displayed labels
const FI_CELLS: Record<string, string[]> = {
  "High|Short":    ["Ultrashort Bond", "Short-Term Bond"],
  "High|Interm.":  ["Intermediate Government", "Intermediate Core Bond", "Inflation-Protected Bond", "Muni National Intermediate"],
  "High|Long":     ["Long Government"],
  "Med|Short":     ["Short-Term Bond"],
  "Med|Interm.":   ["Intermediate Core Plus Bond", "Corporate Bond", "Multisector Bond", "World Bond"],
  "Med|Long":      ["Corporate Bond", "Preferred Stock"],
  "Low|Short":     ["Bank Loan"],
  "Low|Interm.":   ["High Yield Bond", "Emerging Markets Bond", "High Yield Muni"],
  "Low|Long":      ["High Yield Bond"],
};

// Category counts from the live universe (for cell labels + disabling empties)
const CAT_COUNTS: Record<string, number> = {};
UNIVERSE.forEach((f) => {
  const k = f.category.toLowerCase();
  CAT_COUNTS[k] = (CAT_COUNTS[k] ?? 0) + 1;
});
function cellCount(cats: string[]): number {
  const seen = new Set<string>();
  let n = 0;
  for (const c of cats) {
    const k = c.toLowerCase();
    if (!seen.has(k)) { seen.add(k); n += CAT_COUNTS[k] ?? 0; }
  }
  return n;
}

// Parse equity style from a category string → { cap, style }
function equityStyle(category: string): { cap: string; style: "Value" | "Blend" | "Growth" } | null {
  const m = category.match(/US Equity (Large|Mid|Small|Mid\/Small|Small\/Mid)\s+(Value|Blend|Growth)/i);
  if (!m) return null;
  return { cap: m[1], style: m[2] as "Value" | "Blend" | "Growth" };
}
const STYLE_COLOR: Record<string, string> = { Value: T.data, Blend: T.dim, Growth: T.green };

interface FundResult {
  ticker: string;
  name: string;
  vehicle: string;
  category: string;
  expenseRatio: number | null;
  aumFormatted: string;
  fundAge: number | null;
  compositeScore: number;
  percentiles: { cost: number; riskAdj: number; downside: number; alpha: number; consistency: number; yield: number };
  kpi: {
    return1y: number | null; return3y: number | null; return5y: number | null;
    sharpe3y: number | null; sortino3y: number | null; calmar3y: number | null;
    infoRatio3y: number | null; alpha3y: number | null; beta3y: number | null;
    upsideCapture3y: number | null; downsideCapture3y: number | null;
    maxDrawdown5y: number | null; stdDev3y: number | null; battingAvg3y: number | null;
    ttmYield: number | null; divGrowth3y: number | null;
  };
  fetchedAt?: number;
  error?: string;
}

// ── Style box component ────────────────────────────────────────────────────────

function StyleGrid({
  title, accent, cols, rows, cells, selected, onToggle, xCaption, yCaption,
}: {
  title: string; accent: string;
  cols: readonly string[]; rows: readonly string[];
  cells: Record<string, string[]>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  xCaption: string; yCaption: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: accent }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text, ...ui }}>{title}</span>
        <span style={{ fontSize: 9, color: T.muted, marginLeft: "auto", textTransform: "uppercase",
          letterSpacing: "0.08em", ...ui }}>{xCaption} →</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {/* Y caption (vertical) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 14 }}>
          <span style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em",
            ...ui, writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap" }}>
            ← {yCaption}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 4 }}>
            {cols.map((c) => (
              <div key={c} style={{ fontSize: 9, fontWeight: 600, color: T.dim, textAlign: "center",
                textTransform: "uppercase", letterSpacing: "0.04em", ...ui }}>{c}</div>
            ))}
          </div>
          {/* Grid rows */}
          {rows.map((r) => (
            <div key={r} style={{ display: "grid", gridTemplateColumns: "24px repeat(3, 1fr)", gap: 4, marginBottom: 4 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: T.dim, display: "flex",
                alignItems: "center", justifyContent: "flex-end", paddingRight: 2, ...ui }}>{r}</div>
              {cols.map((c) => {
                const key = `${r}|${c}`;
                const cats = cells[key] ?? [];
                const count = cellCount(cats);
                const isSel = selected.has(key);
                const empty = count === 0;
                return (
                  <button
                    key={c}
                    disabled={empty}
                    onClick={() => onToggle(key)}
                    title={cats.join(", ")}
                    style={{
                      aspectRatio: "1.6 / 1", borderRadius: 6,
                      border: `1px solid ${isSel ? accent : T.line2}`,
                      background: isSel ? accent : empty ? T.panel2 : "#fff",
                      color: isSel ? "#fff" : empty ? T.muted : T.dim,
                      cursor: empty ? "default" : "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center",
                      justifyContent: "center", gap: 1, transition: "all 0.12s",
                      opacity: empty ? 0.5 : 1, padding: 0,
                    }}
                    onMouseEnter={(e) => { if (!isSel && !empty) e.currentTarget.style.borderColor = accent; }}
                    onMouseLeave={(e) => { if (!isSel && !empty) e.currentTarget.style.borderColor = T.line2; }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1, ...mono }}>{count}</span>
                    <span style={{ fontSize: 7.5, opacity: 0.7, lineHeight: 1, ...ui }}>funds</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────

export default function ScreenTab({ onAddToCompare, onAnalyze, onFindSimilar }: {
  onAddToCompare: (t: string) => void;
  onAnalyze?: (t: string) => void;
  onFindSimilar?: (t: string) => void;
}) {
  const [asset, setAsset] = useState("Any");
  const [vehicle, setVehicle] = useState("Either");
  const [erMax, setErMax] = useState("Any");
  const [minYield, setMinYield] = useState("Any");
  const [tenure, setTenure] = useState("Any");
  const [minAlpha, setMinAlpha] = useState("Any");
  const [minSharpe, setMinSharpe] = useState("Any");
  const [minRet3y, setMinRet3y] = useState("Any");
  const [search, setSearch] = useState("");
  const [prio, setPrio] = useState<string[]>(["Risk-adjusted return (Sharpe)"]);
  // Style-box selections (cell keys are "Row|Col")
  const [eqSel, setEqSel] = useState<Set<string>>(new Set());
  const [fiSel, setFiSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState<FundResult[] | null>(null);
  const [message, setMessage] = useState("");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const togglePrio = (p: string) =>
    setPrio((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (key: string) =>
    setter((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  // Resolve selected style-box cells → unique category list
  const selectedCategories = useMemo(() => {
    const cats = new Set<string>();
    eqSel.forEach((k) => (EQUITY_CELLS[k] ?? []).forEach((c) => cats.add(c)));
    fiSel.forEach((k) => (FI_CELLS[k] ?? []).forEach((c) => cats.add(c)));
    return [...cats];
  }, [eqSel, fiSel]);

  const totalBoxFunds = useMemo(() => {
    const cats = new Set(selectedCategories.map((c) => c.toLowerCase()));
    return UNIVERSE.filter((f) => cats.has(f.category.toLowerCase())).length;
  }, [selectedCategories]);

  // Live count for the universe indicator
  const displayCount = useMemo(() => {
    if (eqSel.size === 0 && fiSel.size === 0) return UNIVERSE.length;
    return totalBoxFunds;
  }, [eqSel.size, fiSel.size, totalBoxFunds]);
  const hasBoxSel = eqSel.size > 0 || fiSel.size > 0;

  const clearBoxes = () => { setEqSel(new Set()); setFiSel(new Set()); };

  const clearAll = () => {
    setAsset("Any"); setVehicle("Either"); setErMax("Any"); setMinYield("Any"); setTenure("Any");
    setMinAlpha("Any"); setMinSharpe("Any"); setMinRet3y("Any"); setSearch("");
    setPrio(["Risk-adjusted return (Sharpe)"]); setEqSel(new Set()); setFiSel(new Set());
    setResults(null); setErr(""); setMessage(""); setExpandedTicker(null);
  };

  const run = async () => {
    setLoading(true); setErr(""); setResults(null); setMessage(""); setExpandedTicker(null);
    try {
      const erOption = ER_OPTIONS.find((o) => o.label === erMax);
      const tenureOption = TENURE_OPTIONS.find((o) => o.label === tenure);
      const yieldOption = YIELD_OPTIONS.find((o) => o.label === minYield);
      const alphaOption = ALPHA_OPTIONS.find((o) => o.label === minAlpha);
      const sharpeOption = SHARPE_OPTIONS.find((o) => o.label === minSharpe);
      const ret3yOption = RET3Y_OPTIONS.find((o) => o.label === minRet3y);

      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetClass: asset === "Any" ? undefined : asset,
          vehicle: vehicle === "Either" ? undefined : vehicle,
          maxExpenseRatio: erOption?.value ?? undefined,
          minYield: yieldOption?.value ?? undefined,
          minTrackRecord: tenureOption?.value ?? undefined,
          minAlpha: alphaOption?.value ?? undefined,
          minSharpe: sharpeOption?.value ?? undefined,
          minReturn3y: ret3yOption?.value ?? undefined,
          search: search.trim() || undefined,
          categories: selectedCategories.length > 0 ? selectedCategories : undefined,
          priorities: prio,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Screen failed");
      setResults(data.funds ?? []);
      setMessage(data.message ?? "");
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  };

  const top = results?.slice(0, 20) ?? [];
  const scoreData = top.slice(0, 10).map((f) => ({ name: f.ticker, Score: f.compositeScore }));
  const captureData = top.slice(0, 10).map((f) => ({
    name: f.ticker,
    "Upside capture": f.kpi.upsideCapture3y,
    "Downside capture": f.kpi.downsideCapture3y,
  }));

  function fmt(v: number | null, dec = 2, suffix = ""): string {
    if (v == null) return "—";
    return v.toFixed(dec) + suffix;
  }

  return (
    <div>
      {/* Factor builder */}
      <Card className="mb-5" style={{ padding: "20px 24px" }}>
        {/* Header + live universe counter */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ color: T.text, fontSize: 14, fontWeight: 600, ...ui }}>Factor Builder</div>
            <div style={{ color: T.dim, fontSize: 12, marginTop: 2, ...ui }}>
              Pick style-box cells, set filters &amp; priorities, then run the screen
            </div>
          </div>
          {/* Live universe count badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 16,
            background: hasBoxSel ? T.dataL : T.panel2,
            border: `1px solid ${hasBoxSel ? T.data + "40" : T.line2}`,
            borderRadius: 24, padding: "6px 14px 6px 10px",
            transition: "all 0.2s",
          }}>
            {/* Status dot */}
            <span style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: hasBoxSel ? T.data : T.green,
              boxShadow: `0 0 0 3px ${hasBoxSel ? T.data + "25" : T.green + "30"}`,
            }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ fontSize: 22, fontWeight: 600, lineHeight: 1,
                color: hasBoxSel ? T.data : T.text, letterSpacing: "-0.02em", ...mono }}>
                {displayCount.toLocaleString()}
              </span>
              <span style={{ fontSize: 11, color: T.dim, fontWeight: 500, whiteSpace: "nowrap", ...ui }}>
                {hasBoxSel ? `/ ${UNIVERSE.length} funds` : "funds in database"}
              </span>
            </div>
          </div>
        </div>

        {/* Style boxes */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Label>Style Box — click one or more cells (selections combine)</Label>
            {selectedCategories.length > 0 && (
              <button onClick={clearBoxes} style={{ fontSize: 10, color: T.blue, background: "none",
                border: "none", cursor: "pointer", ...ui }}>
                Clear boxes ({totalBoxFunds} funds selected)
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 24, background: T.panel2, border: `1px solid ${T.line}`,
            borderRadius: 8, padding: "16px 18px" }}>
            <StyleGrid title="U.S. Equity" accent={T.data}
              cols={EQUITY_COLS} rows={EQUITY_ROWS} cells={EQUITY_CELLS}
              selected={eqSel} onToggle={toggleSet(setEqSel)}
              xCaption="Style" yCaption="Market cap" />
            <div style={{ width: 1, background: T.line, alignSelf: "stretch" }} />
            <StyleGrid title="Fixed Income" accent={T.cyan}
              cols={FI_COLS} rows={FI_ROWS} cells={FI_CELLS}
              selected={fiSel} onToggle={toggleSet(setFiSel)}
              xCaption="Duration" yCaption="Credit quality" />
          </div>
        </div>

        {/* Remaining filters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div><Label>Asset class (broad)</Label><Select value={asset} onChange={setAsset} options={ASSET} /></div>
          <div><Label>Vehicle</Label><Select value={vehicle} onChange={setVehicle} options={VEHICLE} /></div>
          <div>
            <Label>Max expense ratio</Label>
            <select value={erMax} onChange={(e) => setErMax(e.target.value)} className="w-full"
              style={{ background: T.panel, color: T.text, border: `1px solid ${T.line2}`, borderRadius: 6,
                outline: "none", padding: "7px 10px", fontSize: 13, appearance: "none", cursor: "pointer", ...ui }}>
              {ER_OPTIONS.map((o) => <option key={o.label}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Min dividend yield</Label>
            <select value={minYield} onChange={(e) => setMinYield(e.target.value)} className="w-full"
              style={{ background: T.panel, color: T.text, border: `1px solid ${T.line2}`, borderRadius: 6,
                outline: "none", padding: "7px 10px", fontSize: 13, appearance: "none", cursor: "pointer", ...ui }}>
              {YIELD_OPTIONS.map((o) => <option key={o.label}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Min track record</Label>
            <select value={tenure} onChange={(e) => setTenure(e.target.value)} className="w-full"
              style={{ background: T.panel, color: T.text, border: `1px solid ${T.line2}`, borderRadius: 6,
                outline: "none", padding: "7px 10px", fontSize: 13, appearance: "none", cursor: "pointer", ...ui }}>
              {TENURE_OPTIONS.map((o) => <option key={o.label}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Min alpha (3Y)</Label>
            <select value={minAlpha} onChange={(e) => setMinAlpha(e.target.value)} className="w-full"
              style={{ background: T.panel, color: T.text, border: `1px solid ${T.line2}`, borderRadius: 6,
                outline: "none", padding: "7px 10px", fontSize: 13, appearance: "none", cursor: "pointer", ...ui }}>
              {ALPHA_OPTIONS.map((o) => <option key={o.label}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Min Sharpe (3Y)</Label>
            <select value={minSharpe} onChange={(e) => setMinSharpe(e.target.value)} className="w-full"
              style={{ background: T.panel, color: T.text, border: `1px solid ${T.line2}`, borderRadius: 6,
                outline: "none", padding: "7px 10px", fontSize: 13, appearance: "none", cursor: "pointer", ...ui }}>
              {SHARPE_OPTIONS.map((o) => <option key={o.label}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Min 3Y return</Label>
            <select value={minRet3y} onChange={(e) => setMinRet3y(e.target.value)} className="w-full"
              style={{ background: T.panel, color: T.text, border: `1px solid ${T.line2}`, borderRadius: 6,
                outline: "none", padding: "7px 10px", fontSize: 13, appearance: "none", cursor: "pointer", ...ui }}>
              {RET3Y_OPTIONS.map((o) => <option key={o.label}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="mb-4">
          <Label>Search</Label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Ticker, fund name, or category — e.g. dividend growth, SCHD"
            className="w-full"
            style={{ background: T.panel, color: T.text, border: `1px solid ${T.line2}`, borderRadius: 6,
              outline: "none", padding: "7px 12px", fontSize: 13, ...ui }} />
        </div>
        <div className="mb-5">
          <Label>Scoring priorities — selected factors weight the composite score</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {PRIORITIES.map((p) => (
              <PriorityChip key={p} label={p} active={prio.includes(p)} onClick={() => togglePrio(p)} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn accent onClick={run} disabled={loading}>Run screen</Btn>
          <Btn onClick={clearAll} disabled={loading}>Clear</Btn>
        </div>
      </Card>

      {loading && <Spinner label="FETCHING AND SCORING FUNDS…" />}
      <ErrBanner msg={err} />
      {message && !loading && (
        <div className="text-sm px-4 py-3 my-4" style={{ color: T.dim, border: `1px solid ${T.line}`, borderRadius: 4, ...mono }}>
          {message}
        </div>
      )}

      {top.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <Card style={{ padding: 16 }}>
              <Label>Composite score — top 10</Label>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={scoreData} layout="vertical" margin={{ left: 4, right: 20, top: 4 }}>
                  <CartesianGrid stroke={T.line} horizontal={false} strokeDasharray="0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: T.dim, fontSize: 10, fontFamily: "Geist Mono" }} stroke={T.line} />
                  <YAxis type="category" dataKey="name" tick={{ fill: T.text, fontSize: 11, fontFamily: "Geist Mono", fontWeight: 600 }} stroke="none" width={50} />
                  <Tooltip {...chartTooltip} cursor={{ fill: "#00000008" }} />
                  <Bar dataKey="Score" fill={T.data} radius={[0, 4, 4, 0]} barSize={14} background={{ fill: T.panel2, radius: 4 }} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card style={{ padding: 16 }}>
              <Label>Capture ratios — up &gt;100 good, down &lt;100 good</Label>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={captureData} margin={{ right: 8, top: 4 }}>
                  <CartesianGrid stroke={T.line} vertical={false} strokeDasharray="0" />
                  <XAxis dataKey="name" tick={{ fill: T.text, fontSize: 11, fontFamily: "Geist Mono", fontWeight: 600 }} stroke="none" />
                  <YAxis tick={{ fill: T.dim, fontSize: 10 }} stroke={T.line} domain={[50, 140]} />
                  <Tooltip {...chartTooltip} cursor={{ fill: "#00000008" }} />
                  <Legend wrapperStyle={{ fontSize: 10, color: T.dim, fontFamily: "'Geist', sans-serif" }} />
                  <ReferenceLine y={100} stroke={T.dim} strokeDasharray="3 3" />
                  <Bar dataKey="Upside capture" fill={T.cyan} radius={[3, 3, 0, 0]} barSize={11} />
                  <Bar dataKey="Downside capture" fill={T.red} radius={[3, 3, 0, 0]} barSize={11} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {top.map((f, i) => {
            const isExpanded = expandedTicker === f.ticker;
            const eqs = equityStyle(f.category);
            const stressTests = (f.kpi as unknown as { stressTests?: { label: string; fundReturn: number | null; benchReturn: number | null }[] }).stressTests ?? [];
            return (
              <Card key={f.ticker} className="mb-3">
                {/* Card header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 20px", borderBottom: `1px solid ${T.line}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <RankBadge rank={i + 1} total={results?.length} />
                    <div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                        <span style={{ fontSize: 16, fontWeight: 600, color: T.text, letterSpacing: "0.05em", ...mono }}>
                          {f.ticker}
                        </span>
                        <span style={{ fontSize: 12, color: T.dim, ...ui }}>{f.name}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: T.muted, background: T.panel2,
                          border: `1px solid ${T.line}`, borderRadius: 3, padding: "1px 6px", ...ui }}>
                          {f.vehicle}
                        </span>
                        {/* Style chip — value / blend / growth */}
                        {eqs && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#fff",
                            background: STYLE_COLOR[eqs.style], borderRadius: 3, padding: "1px 7px", ...ui }}>
                            {eqs.cap} · {eqs.style}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: T.muted, ...ui }}>{f.category}</span>
                      </div>
                    </div>
                  </div>
                  <ScoreBadge score={f.compositeScore} />
                </div>

                {f.error && (
                  <div style={{ padding: "8px 20px", fontSize: 11, color: T.red, ...ui }}>
                    ⚠ {f.error}
                  </div>
                )}

                {/* KPI grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "16px 12px", padding: "16px 20px" }}>
                  <KPI label="Expense %" value={f.expenseRatio != null ? fmt(f.expenseRatio, 2, "%") : "—"} good={f.expenseRatio != null ? f.expenseRatio <= 0.5 : null} />
                  <KPI label="TTM Yield" value={fmt(f.kpi.ttmYield, 2, "%")} good={f.kpi.ttmYield != null ? f.kpi.ttmYield > 0 : null} />
                  <KPI label="Sharpe 3y" value={fmt(f.kpi.sharpe3y, 2)} good={f.kpi.sharpe3y != null ? f.kpi.sharpe3y >= 1 : null} />
                  <KPI label="Sortino 3y" value={fmt(f.kpi.sortino3y, 2)} good={f.kpi.sortino3y != null ? f.kpi.sortino3y >= 1 : null} />
                  <KPI label="Alpha 3y" value={fmt(f.kpi.alpha3y, 2, "%")} good={f.kpi.alpha3y != null ? f.kpi.alpha3y > 0 : null} />
                  <KPI label="Calmar 3y" value={fmt(f.kpi.calmar3y, 2)} good={f.kpi.calmar3y != null ? f.kpi.calmar3y > 0.5 : null} />
                  <KPI label="Up cap" value={fmt(f.kpi.upsideCapture3y, 1)} good={f.kpi.upsideCapture3y != null ? f.kpi.upsideCapture3y >= 100 : null} />
                  <KPI label="Down cap" value={fmt(f.kpi.downsideCapture3y, 1)} good={f.kpi.downsideCapture3y != null ? f.kpi.downsideCapture3y < 100 : null} />
                  <KPI label="Max DD 5y" value={fmt(f.kpi.maxDrawdown5y, 1, "%")} />
                  <KPI label="Batting avg" value={fmt(f.kpi.battingAvg3y, 1, "%")} good={f.kpi.battingAvg3y != null ? f.kpi.battingAvg3y >= 50 : null} />
                  <KPI label="1y return" value={fmt(f.kpi.return1y, 2, "%")} />
                  <KPI label="5y return" value={fmt(f.kpi.return5y, 2, "%")} />
                </div>

                {/* Percentile bars */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0 12px",
                  padding: "0 20px 16px", borderBottom: `1px solid ${T.line}` }}>
                  {[
                    { label: "Cost",        val: f.percentiles.cost },
                    { label: "Risk Adj",    val: f.percentiles.riskAdj },
                    { label: "Downside",    val: f.percentiles.downside },
                    { label: "Alpha",       val: f.percentiles.alpha },
                    { label: "Consistency", val: f.percentiles.consistency },
                    { label: "Yield",       val: f.percentiles.yield },
                  ].map(({ label, val }) => (
                    <PercentileBar key={label} label={label} value={val} />
                  ))}
                </div>

                {/* Footer actions */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 20px" }}>
                  <button onClick={() => setExpandedTicker(isExpanded ? null : f.ticker)}
                    style={{ fontSize: 11, color: T.blue, cursor: "pointer",
                      background: "none", border: "none", padding: 0, ...ui }}>
                    {isExpanded ? "▲ Hide detail" : "▼ More detail"}
                  </button>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {f.fetchedAt && (
                      <span style={{ fontSize: 10, color: T.muted, ...ui }}>
                        refreshed {new Date(f.fetchedAt).toLocaleDateString()}
                      </span>
                    )}
                    {onAnalyze && <Btn small onClick={() => onAnalyze(f.ticker)}>Analyze</Btn>}
                    {onFindSimilar && <Btn small onClick={() => onFindSimilar(f.ticker)}>Find similar</Btn>}
                    <Btn small onClick={() => onAddToCompare(f.ticker)}>+ Compare</Btn>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${T.line}`, padding: "16px 20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px 12px", marginBottom: 16 }}>
                      <KPI label="Beta 3y" value={fmt(f.kpi.beta3y, 2)} />
                      <KPI label="Info ratio" value={fmt(f.kpi.infoRatio3y, 2)} good={f.kpi.infoRatio3y != null ? f.kpi.infoRatio3y > 0.3 : null} />
                      <KPI label="Std dev 3y" value={fmt(f.kpi.stdDev3y, 2, "%")} />
                      <KPI label="Div growth 3y" value={fmt(f.kpi.divGrowth3y, 1, "%")} good={f.kpi.divGrowth3y != null ? f.kpi.divGrowth3y > 0 : null} />
                      <KPI label="3y return" value={fmt(f.kpi.return3y, 2, "%")} />
                      <KPI label="AUM" value={f.aumFormatted} />
                      <KPI label="Fund age" value={f.fundAge != null ? fmt(f.fundAge, 1, " yrs") : "—"} good={f.fundAge != null ? f.fundAge >= 5 : null} />
                    </div>
                    {stressTests.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.15em",
                          textTransform: "uppercase", color: T.dim, marginBottom: 8, ...ui }}>
                          Historical stress periods
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                          {stressTests.map((st) => (
                            <div key={st.label} style={{ background: T.panel2, border: `1px solid ${T.line}`,
                              borderRadius: 6, padding: "10px 12px" }}>
                              <div style={{ fontSize: 9, color: T.dim, marginBottom: 6, fontWeight: 600,
                                letterSpacing: "0.08em", ...ui }}>{st.label}</div>
                              <div style={{ fontSize: 15, fontWeight: 600, ...mono,
                                color: st.fundReturn == null ? T.dim : st.fundReturn >= 0 ? T.green : T.red }}>
                                {st.fundReturn != null ? `${st.fundReturn > 0 ? "+" : ""}${st.fundReturn.toFixed(1)}%` : "—"}
                              </div>
                              {st.benchReturn != null && (
                                <div style={{ fontSize: 10, color: T.muted, marginTop: 3, ...mono }}>
                                  bench {st.benchReturn > 0 ? "+" : ""}{st.benchReturn.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
