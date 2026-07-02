"use client";
import React, { useState } from "react";
import { T, ui, mono } from "./tokens";
import { Btn, Label, Card, Spinner, ErrBanner, KPI } from "./ui";
import type { FundRecord } from "../lib/funds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScoredFund extends FundRecord {
  compositeScore: number;
  percentiles: Record<string, number>;
  annualSavings?: number | null;
}

interface ReplaceResult {
  current: ScoredFund;
  alternatives: ScoredFund[];
  priorities: string[];
  investAmount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// expenseRatio + kpi values are already in PERCENT units - do NOT multiply by 100
const fmtPct = (v: number | null) => v == null ? "-" : v.toFixed(2) + "%";
const fmtNum = (v: number | null, d = 2) => v == null ? "-" : v.toFixed(d);
const fmtDollar = (v: number) => {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${Math.abs(v).toFixed(0)}`;
};

function colFor(v: number | null, positiveGood = true): string {
  if (v == null) return T.dim;
  if (positiveGood) return v > 0 ? T.green : v < 0 ? T.red : T.dim;
  return v < 0 ? T.green : v > 0 ? T.red : T.dim;
}

// ── Tax efficiency heuristic ──────────────────────────────────────────────────

interface TaxResult {
  score: number;          // 0–100
  rating: "A" | "B" | "C" | "D";
  ratingLabel: string;
  dragEstimate: string;   // "~0.2% / yr"
  accountRec: string;
  accountDetail: string;
  reasons: string[];
}

function computeTaxEfficiency(fund: FundRecord): TaxResult {
  const cat = (fund.category ?? "").toLowerCase();
  const name = (fund.name ?? "").toLowerCase();
  const isETF = fund.vehicle === "ETF";
  const er = fund.expenseRatio ?? 0;
  const yield_ = fund.kpi.ttmYield ?? 0;

  let score = 50;
  const reasons: string[] = [];

  // Category base
  if (cat.includes("muni")) {
    score = 90;
    reasons.push("Municipal bonds produce federally tax-exempt income - highly efficient for taxable accounts.");
  } else if (cat.includes("bond") || cat.includes("fixed") || cat.includes("income") || cat.includes("treasury") || cat.includes("credit")) {
    score -= 25;
    reasons.push("Fixed income generates ordinary income taxed at full marginal rates.");
  } else if (cat.includes("high yield")) {
    score -= 30;
    reasons.push("High-yield bonds produce ordinary income with high distribution frequency.");
  } else if (cat.includes("real estate") || cat.includes("reit")) {
    score -= 20;
    reasons.push("REITs distribute most income as ordinary dividends, limiting tax efficiency.");
  } else if (cat.includes("commodity") || cat.includes("alternative")) {
    score -= 10;
    reasons.push("Alternatives/commodities may generate short-term gains and complex tax treatment.");
  }

  // Vehicle
  if (isETF) {
    score += 15;
    reasons.push("ETF structure allows in-kind creations/redemptions, minimizing capital gain distributions.");
  } else {
    score -= 5;
    reasons.push("Mutual fund structure may trigger taxable capital gain distributions to all shareholders.");
  }

  // Activity level (ER as proxy)
  if (er <= 0.1) {
    score += 10;
    reasons.push("Very low expense ratio indicates passive management and low portfolio turnover.");
  } else if (er > 0.6) {
    score -= 12;
    reasons.push("Higher expense ratio suggests active management with potentially higher turnover.");
  }

  // Yield (high distributions = more taxable events) - ttmYield is in percent units
  if (yield_ > 5) {
    score -= 15;
    reasons.push(`High yield (${yield_.toFixed(1)}%) means frequent large distributions that are taxable in the year received.`);
  } else if (yield_ > 3) {
    score -= 8;
    reasons.push(`Moderate yield (${yield_.toFixed(1)}%) creates regular taxable distributions.`);
  } else if (yield_ < 1 && yield_ >= 0) {
    score += 8;
    reasons.push("Low yield means fewer taxable distributions - gains deferred until sale.");
  }

  // Special name signals
  if (name.includes("tax-managed") || name.includes("tax managed")) {
    score += 15;
    reasons.push("Explicitly tax-managed strategy - designed to minimize shareholder tax burden.");
  }
  if (name.includes("growth") && isETF && er < 0.2) {
    score += 5;
    reasons.push("Growth-oriented ETF typically has lower yield and defers return as capital gains.");
  }
  if (cat.includes("covered call") || name.includes("premium income") || name.includes("equity premium")) {
    score -= 20;
    reasons.push("Options premium income from covered-call strategies is taxed as short-term capital gains or ordinary income.");
  }

  score = Math.max(0, Math.min(100, score));
  const rating: TaxResult["rating"] = score >= 75 ? "A" : score >= 55 ? "B" : score >= 35 ? "C" : "D";

  const labels = { A: "High Efficiency", B: "Moderate Efficiency", C: "Low Efficiency", D: "Tax-Inefficient" };
  const drags = { A: "~0.1–0.3%/yr", B: "~0.3–0.6%/yr", C: "~0.6–1.0%/yr", D: ">1.0%/yr" };
  const recs = {
    A: "Taxable Account OK",
    B: "Either - slight preference for tax-advantaged",
    C: "Prefer Tax-Advantaged (IRA/401k)",
    D: "Tax-Advantaged Account (IRA/401k/529)",
  };
  const details = {
    A: "Suitable for taxable brokerage accounts. Tax drag is minimal.",
    B: "Can be held in taxable accounts but benefits from tax-sheltered placement.",
    C: "Best placed in an IRA or 401k to defer or eliminate taxes on distributions.",
    D: "Should be in a tax-sheltered account. High distributions or turnover significantly erode after-tax returns.",
  };

  return {
    score, rating,
    ratingLabel: labels[rating],
    dragEstimate: drags[rating],
    accountRec: recs[rating],
    accountDetail: details[rating],
    reasons: reasons.filter(Boolean).slice(0, 3),
  };
}

// ── Page header (shared by sub-pages) ─────────────────────────────────────────

function ToolHeader({ icon, title, subtitle, onBack }: {
  icon: React.ReactNode; title: string; subtitle: string; onBack?: () => void;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      {onBack && (
        <button onClick={onBack} style={{ fontSize: 11, color: T.blue, background: "none",
          border: "none", cursor: "pointer", padding: 0, marginBottom: 10, ...ui }}>
          ← All advisor tools
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 9, background: T.blueL,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: T.blue, fontSize: 20, flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text, ...ui }}>{title}</div>
          <div style={{ fontSize: 12, color: T.dim, marginTop: 1, ...ui }}>{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

// ── Fund Replacement Tool ─────────────────────────────────────────────────────

const REASONS = [
  { id: "cost",    label: "Too Expensive",    desc: "High fees vs peers" },
  { id: "alpha",   label: "Poor Alpha",        desc: "Underperforms benchmark" },
  { id: "risk",    label: "Too Volatile",      desc: "High drawdown / std dev" },
  { id: "yield",   label: "Low Income",        desc: "Client needs more yield" },
  { id: "overall", label: "Full Review",       desc: "Best overall alternative" },
] as const;

type Reason = typeof REASONS[number]["id"];

function DeltaBadge({ current, alt, key_, positiveGood = true }: {
  current: ScoredFund; alt: ScoredFund;
  key_: "expenseRatio" | "sharpe3y" | "alpha3y" | "maxDrawdown3y" | "ttmYield";
  positiveGood?: boolean;
}) {
  const cv = key_ === "expenseRatio" ? current.expenseRatio : current.kpi[key_ as keyof typeof current.kpi] as number | null;
  const av = key_ === "expenseRatio" ? alt.expenseRatio : alt.kpi[key_ as keyof typeof alt.kpi] as number | null;
  if (cv == null || av == null) return <span style={{ color: T.muted, fontSize: 11, ...mono }}>-</span>;
  const diff = av - cv;
  const better = positiveGood ? diff > 0 : diff < 0;
  const neutral = Math.abs(diff) < 0.001;
  const color = neutral ? T.dim : better ? T.green : T.red;
  const arrow = neutral ? "" : better ? "▲" : "▼";
  // sharpe is a unitless ratio; the rest are percent values
  const display = key_ === "sharpe3y" ? diff.toFixed(2) : diff.toFixed(2) + "%";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, ...mono }}>
      {arrow} {diff > 0 ? "+" : ""}{display}
    </span>
  );
}

function ReplacementTool() {
  const [ticker, setTicker] = useState("");
  const [reason, setReason] = useState<Reason>("overall");
  const [amount, setAmount] = useState("100000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReplaceResult | null>(null);

  const run = async () => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentTicker: t, reason, amount: Number(amount) || 100000 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  };

  const cur = result?.current;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 10, alignItems: "end" }}>
        <div>
          <Label>Current Fund Ticker</Label>
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && run()}
            placeholder="e.g. AKTIX, ABALX"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6,
              border: `1px solid ${T.line2}`, background: "#fff", fontSize: 13,
              color: T.text, outline: "none", boxSizing: "border-box", ...mono }} />
        </div>
        <div>
          <Label>Investment Amount</Label>
          <div style={{ display: "flex", alignItems: "center", gap: 0,
            border: `1px solid ${T.line2}`, borderRadius: 6, overflow: "hidden", background: "#fff" }}>
            <span style={{ padding: "8px 10px", background: T.panel2, fontSize: 12,
              color: T.dim, borderRight: `1px solid ${T.line2}`, ...mono }}>$</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              style={{ width: 110, padding: "8px 10px", border: "none", background: "#fff",
                fontSize: 13, color: T.text, outline: "none", ...mono }} />
          </div>
        </div>
        <div />
        <Btn accent onClick={run} disabled={loading || !ticker.trim()}>
          {loading ? "Searching…" : "Find Alternatives"}
        </Btn>
      </div>

      {/* Reason chips */}
      <div>
        <Label>Reason for Switching</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {REASONS.map(r => (
            <button key={r.id} onClick={() => setReason(r.id)}
              style={{ padding: "7px 14px", borderRadius: 6, cursor: "pointer",
                background: reason === r.id ? T.blueL : "#fff",
                border: `1px solid ${reason === r.id ? T.blue : T.line2}`,
                textAlign: "left", transition: "all 0.15s" }}>
              <div style={{ fontSize: 12, fontWeight: 600,
                color: reason === r.id ? T.blueD : T.text, ...ui }}>{r.label}</div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 1, ...ui }}>{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {loading && <Spinner label="Analyzing fund universe…" />}
      <ErrBanner msg={error} />

      {result && cur && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Current fund summary */}
          <div style={{ padding: "14px 18px", background: T.panel3,
            border: `1px solid ${T.line2}`, borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase",
              letterSpacing: "0.1em", ...ui, marginBottom: 8 }}>
              Current Holding
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 16, fontWeight: 700, color: T.text, ...mono }}>{cur.ticker}</span>
                <span style={{ fontSize: 12, color: T.dim, marginLeft: 10, ...ui }}>{cur.name}</span>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 3, ...ui }}>{cur.category}</div>
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                {[
                  ["Expense", cur.expenseRatio != null ? fmtPct(cur.expenseRatio) : "-"],
                  ["Sharpe 3Y", fmtNum(cur.kpi.sharpe3y)],
                  ["TTM Yield", fmtPct(cur.kpi.ttmYield)],
                  ["Score", String(cur.compositeScore)],
                ].map(([l, v]) => <KPI key={l} label={l} value={v} />)}
              </div>
            </div>
          </div>

          {/* Alternatives */}
          <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase",
            letterSpacing: "0.1em", ...ui, marginTop: 4 }}>
            {result.alternatives.length} Ranked Alternatives - scored by {result.priorities.join(", ")}
          </div>

          {result.alternatives.map((alt, i) => {
            const savings = alt.annualSavings;
            const savingsGood = savings != null && savings > 0;
            return (
              <div key={alt.ticker} style={{
                background: "#fff",
                border: `1px solid ${i === 0 ? T.blue : T.line}`,
                borderLeft: `3px solid ${i === 0 ? T.blue : T.line2}`,
                borderRadius: 8, padding: "16px 18px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                      background: i === 0 ? T.blue : T.panel3,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700,
                      color: i === 0 ? "#fff" : T.dim, ...mono }}>
                      {i + 1}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: T.text, ...mono }}>
                          {alt.ticker}
                        </span>
                        <span style={{ fontSize: 11, color: T.dim, ...ui }}>{alt.name}</span>
                      </div>
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 2, ...ui }}>
                        {alt.category} · {alt.vehicle}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    {/* Annual savings */}
                    {savings != null && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase",
                          letterSpacing: "0.08em", ...ui, marginBottom: 2 }}>
                          Annual Fee {savingsGood ? "Savings" : "Cost"}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700,
                          color: savingsGood ? T.green : T.red, ...mono }}>
                          {savingsGood ? "+" : "-"}{fmtDollar(Math.abs(savings))}
                        </div>
                        <div style={{ fontSize: 9, color: T.muted, ...ui }}>
                          on ${(result.investAmount / 1000).toFixed(0)}k
                        </div>
                      </div>
                    )}
                    {/* Score */}
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase",
                        letterSpacing: "0.08em", ...ui, marginBottom: 2 }}>Score</div>
                      <div style={{ fontSize: 18, fontWeight: 700, ...mono,
                        color: alt.compositeScore > cur.compositeScore ? T.green : T.red }}>
                        {alt.compositeScore}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delta comparison */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
                  gap: 0, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
                  {[
                    { label: "Expense Ratio", cur_v: fmtPct(cur.expenseRatio), key_: "expenseRatio" as const, positiveGood: false },
                    { label: "Sharpe 3Y", cur_v: fmtNum(cur.kpi.sharpe3y), key_: "sharpe3y" as const, positiveGood: true },
                    { label: "Alpha 3Y", cur_v: fmtPct(cur.kpi.alpha3y), key_: "alpha3y" as const, positiveGood: true },
                    { label: "Max DD 3Y", cur_v: fmtPct(cur.kpi.maxDrawdown3y), key_: "maxDrawdown3y" as const, positiveGood: false },
                    { label: "TTM Yield", cur_v: fmtPct(cur.kpi.ttmYield), key_: "ttmYield" as const, positiveGood: true },
                  ].map(({ label, cur_v, key_, positiveGood }) => (
                    <div key={label} style={{ padding: "0 8px", borderRight: `1px solid ${T.line}`,
                      "&:last-child": { borderRight: "none" } } as React.CSSProperties}>
                      <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase",
                        letterSpacing: "0.08em", ...ui, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.dim, ...mono,
                        marginBottom: 2 }}>{cur_v}</div>
                      <DeltaBadge current={cur} alt={alt} key_={key_} positiveGood={positiveGood} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tax Efficiency Analyzer ───────────────────────────────────────────────────

function TaxEfficiencyTool() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fund, setFund] = useState<FundRecord | null>(null);
  const [result, setResult] = useState<TaxResult | null>(null);

  const run = async () => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setLoading(true); setError(""); setFund(null); setResult(null);
    try {
      const res = await fetch(`/api/funds/${t}`);
      if (!res.ok) throw new Error(`${t} not found`);
      const data: FundRecord = await res.json();
      if (data.error) throw new Error(data.error);
      setFund(data);
      setResult(computeTaxEfficiency(data));
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  };

  const ratingColors: Record<string, string> = {
    A: T.green, B: "#16A34A88", C: T.amber, D: T.red,
  };
  const ratingBg: Record<string, string> = {
    A: "#DCFCE7", B: "#F0FDF4", C: "#FEF9C3", D: "#FEF2F2",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Label>Fund Ticker</Label>
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && run()}
            placeholder="e.g. JEPI, VTSAX, PIMIX"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6,
              border: `1px solid ${T.line2}`, background: "#fff", fontSize: 13,
              color: T.text, outline: "none", boxSizing: "border-box", ...mono }} />
        </div>
        <Btn accent onClick={run} disabled={loading || !ticker.trim()}>
          {loading ? "Analyzing…" : "Analyze Tax Efficiency"}
        </Btn>
      </div>

      {loading && <Spinner label="Fetching fund data…" />}
      <ErrBanner msg={error} />

      {fund && result && (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "start" }}>
          {/* Rating block */}
          <div style={{ background: ratingBg[result.rating],
            border: `1px solid ${ratingColors[result.rating]}44`,
            borderRadius: 12, padding: "24px 28px", textAlign: "center", minWidth: 160 }}>
            <div style={{ fontSize: 64, fontWeight: 700, color: ratingColors[result.rating],
              lineHeight: 1, ...mono }}>{result.rating}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: ratingColors[result.rating],
              marginTop: 6, ...ui }}>{result.ratingLabel}</div>
            <div style={{ marginTop: 16, padding: "8px 0", borderTop: `1px solid ${ratingColors[result.rating]}33` }}>
              <div style={{ fontSize: 9, color: T.muted, textTransform: "uppercase",
                letterSpacing: "0.1em", ...ui, marginBottom: 4 }}>Est. Tax Drag</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, ...mono }}>
                {result.dragEstimate}
              </div>
            </div>
          </div>

          {/* Detail */}
          <div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, ...ui }}>{fund.ticker}
                <span style={{ fontSize: 12, fontWeight: 400, color: T.dim, marginLeft: 8 }}>
                  {fund.name}
                </span>
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2, ...ui }}>
                {fund.category} · {fund.vehicle}
              </div>
            </div>

            {/* Account recommendation */}
            <div style={{ padding: "12px 14px", background: T.panel2,
              border: `1px solid ${T.line2}`, borderRadius: 8, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 18 }}>
                  {result.rating === "A" ? "✅" : result.rating === "B" ? "🔵" : result.rating === "C" ? "⚠️" : "🚫"}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, ...ui }}>
                    {result.accountRec}
                  </div>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 2, ...ui }}>
                    {result.accountDetail}
                  </div>
                </div>
              </div>
            </div>

            {/* Key factors */}
            <div>
              <div style={{ fontSize: 10, color: T.muted, textTransform: "uppercase",
                letterSpacing: "0.1em", ...ui, marginBottom: 8 }}>Key Factors</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.reasons.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ color: T.blue, fontWeight: 700, marginTop: 1, flexShrink: 0 }}>·</span>
                    <span style={{ fontSize: 12, color: T.dim, lineHeight: 1.5, ...ui }}>{r}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick stats */}
            <div style={{ display: "flex", gap: 20, marginTop: 16,
              paddingTop: 14, borderTop: `1px solid ${T.line}` }}>
              <KPI label="Vehicle" value={fund.vehicle} />
              <KPI label="Expense %" value={fund.expenseRatio != null ? fmtPct(fund.expenseRatio) : "-"} />
              <KPI label="TTM Yield" value={fmtPct(fund.kpi.ttmYield)} />
              <KPI label="Category" value={fund.category} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-page wrappers ─────────────────────────────────────────────────────────

export function AdvisorReplacePage({ onBack }: { onBack?: () => void }) {
  return (
    <div>
      <ToolHeader icon="↔" title="Fund Replacement Finder"
        subtitle="Find better alternatives to a fund your client currently holds"
        onBack={onBack} />
      <Card style={{ padding: "22px 24px" }}>
        <ReplacementTool />
      </Card>
    </div>
  );
}

export function AdvisorTaxPage({ onBack }: { onBack?: () => void }) {
  return (
    <div>
      <ToolHeader icon="◎" title="Tax Efficiency Analyzer"
        subtitle="Assess a fund's suitability for taxable vs. tax-advantaged accounts"
        onBack={onBack} />
      <Card style={{ padding: "22px 24px" }}>
        <TaxEfficiencyTool />
      </Card>
    </div>
  );
}

// ── Overview - grid of tool cards ─────────────────────────────────────────────

const TOOL_CARDS = [
  {
    id: "advisor-replace" as const,
    icon: "↔",
    title: "Fund Replacement Finder",
    desc: "Enter a fund your client holds and a reason to switch. Get ranked, same-category alternatives with side-by-side metric deltas and annual fee savings in dollars.",
    tag: "Due Diligence",
  },
  {
    id: "advisor-tax" as const,
    icon: "◎",
    title: "Tax Efficiency Analyzer",
    desc: "Score any fund's tax efficiency (A–D) based on structure, turnover, and distributions. Get a recommended account location - taxable vs. IRA/401k.",
    tag: "Tax Planning",
  },
];

export function AdvisorOverview({ onNavigate }: { onNavigate: (id: "advisor-tax" | "advisor-replace") => void }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: 0, ...ui }}>
          Advisor Tools
        </h2>
        <p style={{ fontSize: 12, color: T.dim, marginTop: 4, ...ui }}>
          Professional-grade tools for fund due diligence and client conversations. Choose a tool to begin.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {TOOL_CARDS.map((c) => (
          <button key={c.id} onClick={() => onNavigate(c.id)}
            style={{ textAlign: "left", background: "#fff", border: `1px solid ${T.line}`,
              borderRadius: 10, padding: "22px 24px", cursor: "pointer",
              display: "flex", flexDirection: "column", gap: 12, transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.blue;
              e.currentTarget.style.boxShadow = "0 4px 16px rgba(59,130,246,0.10)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line;
              e.currentTarget.style.boxShadow = "none"; }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: T.blueL,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: T.blue, fontSize: 22 }}>
                {c.icon}
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: T.dim, background: T.panel3,
                borderRadius: 4, padding: "3px 8px", textTransform: "uppercase",
                letterSpacing: "0.06em", ...ui }}>{c.tag}</span>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, ...ui, marginBottom: 6 }}>
                {c.title}
              </div>
              <div style={{ fontSize: 12, color: T.dim, lineHeight: 1.6, ...ui }}>
                {c.desc}
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.blue, marginTop: 2, ...ui }}>
              Open tool →
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default AdvisorOverview;
