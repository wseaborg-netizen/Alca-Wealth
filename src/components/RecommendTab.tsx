"use client";
import React, { useState, useEffect } from "react";
import { T, ui, mono } from "./tokens";
import { Label, Card, Btn, Select, ScoreBadge, PercentileBar, PriorityChip, Spinner, ErrBanner } from "./ui";
import { loadClients, RISK_LABELS, type Client } from "../lib/client";

// ────────────────────────────────────────────────────────────────────────────────
// Shared types
// ────────────────────────────────────────────────────────────────────────────────

interface Kpi {
  return1y: number | null; return3y: number | null; return5y: number | null;
  sharpe3y: number | null; maxDrawdown3y: number | null; alpha3y: number | null;
  ttmYield: number | null; [k: string]: number | null | undefined;
}

const fmtPct = (v: number | null | undefined, d = 2) => (v == null ? "-" : `${v.toFixed(d)}%`);
const fmtNum = (v: number | null | undefined, d = 2) => (v == null ? "-" : v.toFixed(d));

// ────────────────────────────────────────────────────────────────────────────────
// Mode 1 - From a fund you hold
// ────────────────────────────────────────────────────────────────────────────────

interface FFFactor {
  key: string; label: string; metricLabel: string;
  curValue: number | null; altValue: number | null;
  higherIsBetter: boolean; improvement: boolean;
  blurb: string; ticker: string; name: string; category: string; vehicle: string;
}
interface TopPick {
  ticker: string; name: string; category: string; vehicle: string;
  expenseRatio: number | null; matchScore: number; sameCategory: boolean;
  kpi: { sharpe3y: number | null; return3y: number | null; alpha3y: number | null; ttmYield: number | null; maxDrawdown3y: number | null };
  reason: string;
}
interface FFResult {
  current: {
    ticker: string; name: string; category: string; vehicle: string;
    expenseRatio: number | null; matchScore?: number;
    kpi: { sharpe3y: number | null; maxDrawdown3y: number | null; ttmYield: number | null; alpha3y: number | null; return3y: number | null };
  };
  topPicks: TopPick[];
  factors: FFFactor[];
  investAmount: number;
  poolSize: number;
}

const FI = (paths: React.ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: "block" }}>{paths}</svg>
);
const FACTOR_ICON: Record<string, React.ReactNode> = {
  cost: FI(<><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M8 4.7v6.6M6.4 6.2c0-.8.7-1.3 1.6-1.3s1.6.5 1.6 1.2c0 .8-.7 1-1.6 1.2s-1.6.5-1.6 1.3.7 1.3 1.6 1.3 1.6-.5 1.6-1.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></>),
  riskAdj: FI(<><path d="M2 11.5l3.6-3.6 2.4 2 5.6-6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M10.6 3.9h3.5v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></>),
  downside: FI(<path d="M8 2l5 1.8v3.6c0 3-2 5-5 6-3-1-5-3-5-6V3.8L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>),
  yield: FI(<><rect x="2" y="4.8" width="12" height="6.4" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="8" r="1.7" stroke="currentColor" strokeWidth="1.2"/></>),
  alpha: FI(<><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="8" r="2.7" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="8" r="0.7" fill="currentColor"/></>),
};
const fmtFactorVal = (key: string, v: number | null): string =>
  v == null ? "-" : key === "riskAdj" ? v.toFixed(2) : `${v.toFixed(2)}%`;

function TopPickCard({ p, rank, onCompare, onAnalyze }: {
  p: TopPick; rank: number; onCompare?: (t: string) => void; onAnalyze?: (t: string) => void;
}) {
  const medal = ["#B45309", "#64748B", "#A16207"][rank - 1] ?? T.dim;
  const scoreColor = p.matchScore >= 70 ? T.green : p.matchScore >= 45 ? T.amber : T.dim;
  return (
    <div style={{ background: T.panel, border: `1px solid ${rank === 1 ? T.blue + "66" : T.line}`,
      borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12,
      boxShadow: rank === 1 ? `0 4px 16px ${T.blue}1a` : "0 1px 2px rgba(16,24,40,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
            background: medal, color: "#fff", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 12, fontWeight: 600, ...mono }}>{rank}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text, ...mono }}>{p.ticker}</div>
            <div style={{ fontSize: 10, color: T.muted, ...ui }}>{p.vehicle}{p.sameCategory ? " · same category" : ""}</div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: scoreColor, lineHeight: 1, ...mono }}>{p.matchScore}</div>
          <div style={{ fontSize: 8, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", ...ui }}>fit score</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.dim, ...ui, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
        {([
          ["Expense", p.expenseRatio != null ? `${p.expenseRatio.toFixed(2)}%` : "-"],
          ["3Y Ret", p.kpi.return3y != null ? `${p.kpi.return3y.toFixed(1)}%` : "-"],
          ["Sharpe", p.kpi.sharpe3y != null ? p.kpi.sharpe3y.toFixed(2) : "-"],
          ["Alpha", p.kpi.alpha3y != null ? `${p.kpi.alpha3y.toFixed(1)}%` : "-"],
          ["Yield", p.kpi.ttmYield != null ? `${p.kpi.ttmYield.toFixed(1)}%` : "-"],
        ] as [string, string][]).map(([l, v]) => (
          <div key={l}>
            <div style={{ fontSize: 8.5, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", ...ui }}>{l}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, ...mono, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.5, ...ui, background: T.panel2,
        border: `1px solid ${T.line}`, borderLeft: `2px solid ${T.data}`, borderRadius: 6, padding: "8px 11px" }}>{p.reason}</div>
      <div style={{ display: "flex", gap: 12 }}>
        {onAnalyze && <button onClick={() => onAnalyze(p.ticker)} style={{ fontSize: 11, color: T.blue, background: "none", border: "none", cursor: "pointer", padding: 0, ...ui }}>Analyze {p.ticker}</button>}
        {onCompare && <button onClick={() => onCompare(p.ticker)} style={{ fontSize: 11, color: T.blue, background: "none", border: "none", cursor: "pointer", padding: 0, ...ui }}>+ Compare</button>}
      </div>
    </div>
  );
}

function FactorCard({ f, onCompare, onAnalyze }: {
  f: FFFactor; onCompare?: (t: string) => void; onAnalyze?: (t: string) => void;
}) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${f.improvement ? T.blue + "55" : T.line}`,
      borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10,
      boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-flex", width: 28, height: 28, borderRadius: 7, background: T.panel3, border: `1px solid ${T.line}`, alignItems: "center", justifyContent: "center", color: T.text, flexShrink: 0 }}>{FACTOR_ICON[f.key]}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, ...ui }}>{f.label}</div>
            <div style={{ fontSize: 10, color: T.muted, ...ui }}>{f.metricLabel}</div>
          </div>
        </div>
        {f.improvement
          ? <span style={{ fontSize: 9, fontWeight: 600, color: T.green, background: "#DCFCE7", borderRadius: 4, padding: "2px 7px", ...ui }}>BETTER OPTION</span>
          : <span style={{ fontSize: 9, fontWeight: 600, color: T.dim, background: T.panel3, borderRadius: 4, padding: "2px 7px", ...ui }}>ALREADY STRONG</span>}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: f.improvement ? T.data : T.dim, ...mono }}>{f.ticker}</span>
        <span style={{ fontSize: 11, color: T.dim, ...ui, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.panel2,
        border: `1px solid ${T.line}`, borderRadius: 6, padding: "8px 12px" }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 9, color: T.muted, ...ui }}>YOUR FUND</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.dim, ...mono }}>{fmtFactorVal(f.key, f.curValue)}</div>
        </div>
        <span style={{ color: f.improvement ? T.green : T.muted, fontSize: 14 }}>→</span>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 9, color: T.muted, ...ui }}>{f.ticker}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: f.improvement ? T.green : T.dim, ...mono }}>{fmtFactorVal(f.key, f.altValue)}</div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: T.dim, lineHeight: 1.55, ...ui }}>{f.blurb}</div>

      <div style={{ display: "flex", gap: 12 }}>
        {onAnalyze && (
          <button onClick={() => onAnalyze(f.ticker)} style={{ fontSize: 11, color: T.blue, background: "none",
            border: "none", cursor: "pointer", padding: 0, ...ui }}>Analyze {f.ticker}</button>
        )}
        {onCompare && (
          <button onClick={() => onCompare(f.ticker)} style={{ fontSize: 11, color: T.blue, background: "none",
            border: "none", cursor: "pointer", padding: 0, ...ui }}>+ Compare</button>
        )}
      </div>
    </div>
  );
}

export function FromFundMode({ seedTicker, onAddToCompare, onAnalyze }: {
  seedTicker?: string; onAddToCompare?: (t: string) => void; onAnalyze?: (t: string) => void;
}) {
  const [ticker, setTicker] = useState(seedTicker ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FFResult | null>(null);

  const run = async (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/recommend/from-fund", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentTicker: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data);
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  };

  // seed from another tab ("Find similar")
  useEffect(() => {
    if (seedTicker) { setTicker(seedTicker); run(seedTicker); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedTicker]);

  const cur = result?.current;
  const improvements = result?.factors.filter((f) => f.improvement).length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ padding: "20px 24px" }}>
          <Label>The fund your client holds now</Label>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && run(ticker)}
                placeholder="Enter a ticker - e.g. AGTHX, ABALX, SPY"
                style={{ width: "100%", background: T.panel, color: T.text, border: `1px solid ${T.line2}`,
                  borderRadius: 6, padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box", ...mono }} />
            </div>
            <Btn accent onClick={() => run(ticker)} disabled={loading || !ticker.trim()}>
              {loading ? "Analyzing…" : "Recommend"}
            </Btn>
            <Btn onClick={() => { setTicker(""); setResult(null); setError(""); }}
              disabled={loading || (!ticker && !result)}>Clear</Btn>
          </div>
          {error && <p style={{ fontSize: 12, color: T.red, marginTop: 10, ...ui }}>{error}</p>}
        </div>
      </Card>

      {loading && <Spinner label="Scanning comparable funds across every factor…" />}

      {cur && result && (
        <>
          <div style={{ background: T.panel3, border: `1px solid ${T.line2}`, borderRadius: 10, padding: "16px 20px" }}>
            <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", ...ui, marginBottom: 8 }}>
              Currently Holding
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <span style={{ fontSize: 18, fontWeight: 600, color: T.text, ...mono }}>{cur.ticker}</span>
                <span style={{ fontSize: 12, color: T.dim, marginLeft: 10, ...ui }}>{cur.name}</span>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 2, ...ui }}>{cur.category} · {cur.vehicle}</div>
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                {([
                  ["Expense", cur.expenseRatio != null ? `${cur.expenseRatio.toFixed(2)}%` : "-"],
                  ["Sharpe 3y", cur.kpi.sharpe3y?.toFixed(2) ?? "-"],
                  ["TTM Yield", cur.kpi.ttmYield != null ? `${cur.kpi.ttmYield.toFixed(2)}%` : "-"],
                  ["Max DD 3y", cur.kpi.maxDrawdown3y != null ? `${cur.kpi.maxDrawdown3y.toFixed(1)}%` : "-"],
                  ["Alpha 3y", cur.kpi.alpha3y != null ? `${cur.kpi.alpha3y.toFixed(2)}%` : "-"],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", ...ui }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...mono, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top 3 best-fit picks - overall best alternatives */}
          {result.topPicks && result.topPicks.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...ui }}>Top 3 picks - best overall fit</div>
              <div style={{ fontSize: 11, color: T.dim, ...ui, marginTop: 2, marginBottom: 12 }}>
                The strongest all-around alternatives to {cur.ticker}, ranked by a blended fit score across cost, risk, downside, alpha &amp; income.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {result.topPicks.map((p, i) => (
                  <TopPickCard key={p.ticker} p={p} rank={i + 1} onCompare={onAddToCompare} onAnalyze={onAnalyze} />
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...ui }}>Best for each goal</div>
            <div style={{ fontSize: 11, color: T.dim, ...ui, marginTop: 2 }}>
              If a client cares about one factor above all, here&apos;s the single best same-category alternative for it - from {result.poolSize} comparable funds.
              {improvements > 0
                ? ` ${improvements} factor${improvements > 1 ? "s" : ""} where a switch could help.`
                : " Your fund already leads its peers on every factor."}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {result.factors.map((f) => <FactorCard key={f.key} f={f} onCompare={onAddToCompare} onAnalyze={onAnalyze} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Mode 2 - By factors & metrics
// ────────────────────────────────────────────────────────────────────────────────

const ASSET = ["Any", "US Equity", "International Equity", "Fixed Income", "Allocation / Balanced", "Sector / Thematic", "Alternatives"];
const VEHICLE = ["Either", "Mutual Fund", "ETF"];
const FACTORS = [
  { label: "Low cost",                      key: "cost" },
  { label: "Risk-adjusted return (Sharpe)", key: "riskAdj" },
  { label: "Downside protection",           key: "downside" },
  { label: "Alpha vs benchmark",            key: "alpha" },
  { label: "Consistency vs category",       key: "consistency" },
  { label: "Income / yield",                key: "yield" },
] as const;
const ER_OPTIONS = [
  { label: "Any", value: null }, { label: "≤ 0.25%", value: 0.25 },
  { label: "≤ 0.50%", value: 0.50 }, { label: "≤ 1.00%", value: 1.00 },
];
const YIELD_OPTIONS = [
  { label: "Any", value: null }, { label: "≥ 1%", value: 1 },
  { label: "≥ 2%", value: 2 }, { label: "≥ 3%", value: 3 },
];

interface ScreenFund {
  ticker: string; name: string; vehicle: string; category: string;
  expenseRatio: number | null; compositeScore: number;
  percentiles: { cost: number; riskAdj: number; downside: number; alpha: number; consistency: number; yield: number };
  kpi: Kpi;
}

function ByFactorsMode({ onAddToCompare, onAnalyze }: {
  onAddToCompare?: (t: string) => void; onAnalyze?: (t: string) => void;
}) {
  const [asset, setAsset] = useState("US Equity");
  const [vehicle, setVehicle] = useState("Either");
  const [erMax, setErMax] = useState("Any");
  const [minYield, setMinYield] = useState("Any");
  const [factors, setFactors] = useState<string[]>(["Risk-adjusted return (Sharpe)", "Low cost"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [funds, setFunds] = useState<ScreenFund[] | null>(null);

  const toggle = (label: string) =>
    setFactors((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));

  const run = async () => {
    if (factors.length === 0) { setError("Pick at least one factor to rank by."); return; }
    setLoading(true); setError(""); setFunds(null);
    try {
      const er = ER_OPTIONS.find((o) => o.label === erMax)?.value ?? undefined;
      const my = YIELD_OPTIONS.find((o) => o.label === minYield)?.value ?? undefined;
      const res = await fetch("/api/screen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetClass: asset === "Any" ? undefined : asset,
          vehicle: vehicle === "Either" ? undefined : vehicle,
          maxExpenseRatio: er, minYield: my, priorities: factors,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setFunds((data.funds ?? []).slice(0, 8));
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  };

  const clear = () => {
    setAsset("US Equity"); setVehicle("Either"); setErMax("Any"); setMinYield("Any");
    setFactors(["Risk-adjusted return (Sharpe)", "Low cost"]); setFunds(null); setError("");
  };

  const selKeys = factors.map((l) => FACTORS.find((f) => f.label === l)?.key).filter(Boolean) as string[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Label>Which factors matter most? (selected factors drive the ranking)</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {FACTORS.map((f) => (
                <PriorityChip key={f.key} label={f.label} active={factors.includes(f.label)} onClick={() => toggle(f.label)} />
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div><Label>Asset class</Label><Select value={asset} onChange={setAsset} options={ASSET} /></div>
            <div><Label>Vehicle</Label><Select value={vehicle} onChange={setVehicle} options={VEHICLE} /></div>
            <div>
              <Label>Max expense</Label>
              <select value={erMax} onChange={(e) => setErMax(e.target.value)} className="w-full"
                style={{ background: T.panel, color: T.text, border: `1px solid ${T.line2}`, borderRadius: 6,
                  outline: "none", padding: "7px 10px", fontSize: 13, appearance: "none", cursor: "pointer", ...ui }}>
                {ER_OPTIONS.map((o) => <option key={o.label}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <Label>Min yield</Label>
              <select value={minYield} onChange={(e) => setMinYield(e.target.value)} className="w-full"
                style={{ background: T.panel, color: T.text, border: `1px solid ${T.line2}`, borderRadius: 6,
                  outline: "none", padding: "7px 10px", fontSize: 13, appearance: "none", cursor: "pointer", ...ui }}>
                {YIELD_OPTIONS.map((o) => <option key={o.label}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn accent onClick={run} disabled={loading}>{loading ? "Ranking funds…" : "Recommend best funds"}</Btn>
            <Btn onClick={clear} disabled={loading}>Clear</Btn>
          </div>
        </div>
      </Card>

      {loading && <Spinner label="Scoring funds on your factors…" />}
      <ErrBanner msg={error} />

      {funds && funds.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "28px 0", color: T.muted, fontSize: 13, ...ui }}>
          No funds matched - loosen the filters.
        </div>
      )}

      {funds && funds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Label>Top {funds.length} funds for your factors</Label>
          {funds.map((f, i) => (
            <Card key={f.ticker} style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                    background: i === 0 ? T.blue : T.panel3, color: i === 0 ? "#fff" : T.dim,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, ...mono }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: T.text, ...mono }}>{f.ticker}</span>
                      <span style={{ fontSize: 11, color: T.dim, ...ui }}>{f.name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 1, ...ui }}>{f.category} · {f.vehicle}</div>
                  </div>
                </div>
                <ScoreBadge score={f.compositeScore} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 12 }}>
                {[
                  ["Expense", f.expenseRatio != null ? `${f.expenseRatio.toFixed(2)}%` : "-"],
                  ["3Y Return", fmtPct(f.kpi.return3y)],
                  ["Sharpe", fmtNum(f.kpi.sharpe3y)],
                  ["Alpha", fmtPct(f.kpi.alpha3y)],
                  ["Yield", fmtPct(f.kpi.ttmYield)],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", ...ui }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...mono, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* percentile bars for the chosen factors */}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(selKeys.length, 6)}, 1fr)`,
                gap: "0 12px", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
                {selKeys.map((key) => {
                  const labelMap: Record<string, string> = { cost: "Cost", riskAdj: "Risk-Adj", downside: "Downside", alpha: "Alpha", consistency: "Consistency", yield: "Yield" };
                  const val = (f.percentiles as Record<string, number>)[key] ?? 0;
                  return <PercentileBar key={key} label={labelMap[key]} value={val} />;
                })}
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                {onAnalyze && (
                  <button onClick={() => onAnalyze(f.ticker)} style={{ fontSize: 11, color: T.blue, background: "none",
                    border: "none", cursor: "pointer", padding: 0, ...ui }}>Analyze {f.ticker}</button>
                )}
                {onAddToCompare && (
                  <button onClick={() => onAddToCompare(f.ticker)} style={{ fontSize: 11, color: T.blue, background: "none",
                    border: "none", cursor: "pointer", padding: 0, ...ui }}>+ Compare</button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Mode 3 - By client profile
// ────────────────────────────────────────────────────────────────────────────────

const RISK    = [["conservative", "Conservative"], ["moderate", "Moderate"], ["aggressive", "Aggressive"]] as const;
const HORIZON = [["short", "Short · <3y"], ["medium", "Medium · 3–10y"], ["long", "Long · 10y+"]] as const;
const INCOME  = [["none", "No income"], ["some", "Some · ≥1%"], ["high", "High · ≥2%"]] as const;
const COST    = [["low", "Not sensitive"], ["medium", "Somewhat"], ["high", "Very · ≤0.3%"]] as const;
const PROFILE_VEHICLE = ["Either", "ETF", "Mutual Fund"];

interface ProfileFund {
  ticker: string; name: string; vehicle: string; category: string;
  expenseRatio: number | null; compositeScore: number; reason: string; kpi: Kpi;
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: "7px 14px", borderRadius: 6, cursor: "pointer",
      fontSize: 12, fontWeight: active ? 600 : 400, background: active ? T.blueL : "#fff",
      border: `1px solid ${active ? T.blue : T.line2}`, color: active ? T.blueD : T.dim, ...ui }}>{label}</button>
  );
}

function ProfileField({ label, opts, value, onChange }: {
  label: string; opts: readonly (readonly [string, string])[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        {opts.map(([id, lbl]) => <Chip key={id} active={value === id} label={lbl} onClick={() => onChange(id)} />)}
      </div>
    </div>
  );
}

export function ProfileMode({ onAddToCompare, onAnalyze }: {
  onAddToCompare?: (t: string) => void; onAnalyze?: (t: string) => void;
}) {
  const [risk, setRisk] = useState("moderate");
  const [horizon, setHorizon] = useState("medium");
  const [income, setIncome] = useState("none");
  const [cost, setCost] = useState("medium");
  const [assetC, setAssetC] = useState("Any");
  const [vehicle, setVehicle] = useState("Either");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [funds, setFunds] = useState<ProfileFund[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");

  useEffect(() => { setClients(loadClients()); }, []);

  // Prefill the profile fields from a saved client.
  const loadFromClient = (id: string) => {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (!c) return;
    setRisk(c.risk <= 2 ? "conservative" : c.risk === 3 ? "moderate" : "aggressive");
    const h = c.horizonYears;
    if (h != null) setHorizon(h < 3 ? "short" : h <= 10 ? "medium" : "long");
    setIncome(c.goal === "income" ? "high" : c.goal === "balanced" ? "some" : "none");
  };

  const run = async () => {
    setLoading(true); setError(""); setFunds(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskTolerance: risk, timeHorizon: horizon, incomeNeed: income,
          costSensitivity: cost, assetClass: assetC, vehicle, notes: "" }),
      });
      const data = await res.json();
      if (data.message && !data.funds?.length) throw new Error(data.message);
      if (!res.ok) throw new Error(data.error || "Request failed");
      setFunds(data.funds ?? []);
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  };
  const clear = () => { setRisk("moderate"); setHorizon("medium"); setIncome("none"); setCost("medium");
    setAssetC("Any"); setVehicle("Either"); setFunds(null); setError(""); setClientId(""); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {clients.length > 0 && (
            <div>
              <Label>Load from saved client</Label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                <select value={clientId} onChange={(e) => loadFromClient(e.target.value)}
                  style={{ background: T.panel3, border: `1px solid ${T.line2}`, borderRadius: 7,
                    padding: "8px 11px", color: T.text, fontSize: 13, ...ui, minWidth: 200 }}>
                  <option value="">Pick a client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name || "Untitled"} · {RISK_LABELS[c.risk]}</option>
                  ))}
                </select>
                <span style={{ fontSize: 11, color: T.muted, ...ui }}>Prefills risk, horizon &amp; income from the client profile.</span>
              </div>
            </div>
          )}
          <ProfileField label="Risk tolerance" opts={RISK} value={risk} onChange={setRisk} />
          <ProfileField label="Time horizon" opts={HORIZON} value={horizon} onChange={setHorizon} />
          <ProfileField label="Income need" opts={INCOME} value={income} onChange={setIncome} />
          <ProfileField label="Cost sensitivity" opts={COST} value={cost} onChange={setCost} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><Label>Asset class</Label><Select value={assetC} onChange={setAssetC} options={ASSET} /></div>
            <div><Label>Vehicle</Label><Select value={vehicle} onChange={setVehicle} options={PROFILE_VEHICLE} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn accent onClick={run} disabled={loading}>{loading ? "Finding best matches…" : "Get recommendations"}</Btn>
            <Btn onClick={clear} disabled={loading}>Clear</Btn>
          </div>
        </div>
      </Card>

      {loading && <Spinner label="Matching funds to the client profile…" />}
      <ErrBanner msg={error} />

      {funds && funds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Label>Top {funds.length} matches for this profile</Label>
          {funds.map((f, i) => (
            <Card key={f.ticker} style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                    background: i === 0 ? T.blue : T.panel3, color: i === 0 ? "#fff" : T.dim,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, ...mono }}>{i + 1}</div>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: T.text, ...mono }}>{f.ticker}</span>
                      <span style={{ fontSize: 11, color: T.dim, ...ui }}>{f.name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 1, ...ui }}>{f.category} · {f.vehicle}</div>
                  </div>
                </div>
                <ScoreBadge score={f.compositeScore} />
              </div>
              {f.reason && (
                <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: T.panel2,
                  border: `1px solid ${T.line}`, borderLeft: `2px solid ${T.data}`, fontSize: 11.5, color: T.dim, lineHeight: 1.55, ...ui }}>{f.reason}</div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 12 }}>
                {[
                  ["Expense", f.expenseRatio != null ? `${f.expenseRatio.toFixed(2)}%` : "-"],
                  ["3Y Return", fmtPct(f.kpi.return3y)],
                  ["Sharpe", fmtNum(f.kpi.sharpe3y)],
                  ["Alpha", fmtPct(f.kpi.alpha3y)],
                  ["Yield", fmtPct(f.kpi.ttmYield)],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", ...ui }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, ...mono, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                {onAnalyze && <button onClick={() => onAnalyze(f.ticker)} style={{ fontSize: 11, color: T.blue, background: "none", border: "none", cursor: "pointer", padding: 0, ...ui }}>Analyze {f.ticker}</button>}
                {onAddToCompare && <button onClick={() => onAddToCompare(f.ticker)} style={{ fontSize: 11, color: T.blue, background: "none", border: "none", cursor: "pointer", padding: 0, ...ui }}>+ Compare</button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────────

type RecMode = "fund" | "factors" | "profile";

export default function RecommendTab({ seedTicker, onAddToCompare, onAnalyze, embedded }: {
  seedTicker?: string;
  onAddToCompare?: (t: string) => void;
  onAnalyze?: (t: string) => void;
  embedded?: boolean;
}) {
  const [mode, setMode] = useState<RecMode>("fund");

  useEffect(() => { if (seedTicker) setMode("fund"); }, [seedTicker]);

  const subtitle = mode === "fund"
    ? "Start from a fund a client holds - get the best alternative for each goal."
    : mode === "factors"
    ? "Pick the factors that matter and get the funds that score best on them."
    : "Describe the client - risk, horizon, income, cost - and get ranked matches.";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {!embedded && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: T.text, ...ui, margin: 0 }}>Recommendations</h2>
          <p style={{ fontSize: 12, color: T.dim, marginTop: 4, ...ui }}>{subtitle}</p>
        </div>
      )}

      <div>
        {embedded && (
          <Label>How do you want to source the recommendation?</Label>
        )}
        <div style={{ display: "inline-flex", gap: 2, background: T.panel2, border: `1px solid ${T.line}`,
          borderRadius: 8, padding: 3, alignSelf: "flex-start", flexWrap: "wrap", marginTop: embedded ? 6 : 0 }}>
          {([["fund", "From a fund you hold"], ["factors", "By factors & metrics"], ["profile", "By client profile"]] as [RecMode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: mode === m ? 600 : 400, cursor: "pointer",
              color: mode === m ? T.blueD : T.dim, background: mode === m ? "#fff" : "transparent",
              border: `1px solid ${mode === m ? T.line2 : "transparent"}`, ...ui,
            }}>{label}</button>
          ))}
        </div>
        {embedded && <p style={{ fontSize: 12, color: T.dim, marginTop: 8, ...ui }}>{subtitle}</p>}
      </div>

      {mode === "fund" && <FromFundMode seedTicker={seedTicker} onAddToCompare={onAddToCompare} onAnalyze={onAnalyze} />}
      {mode === "factors" && <ByFactorsMode onAddToCompare={onAddToCompare} onAnalyze={onAnalyze} />}
      {mode === "profile" && <ProfileMode onAddToCompare={onAddToCompare} onAnalyze={onAnalyze} />}
    </div>
  );
}
