"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { T, ui, mono, chartTooltip } from "./tokens";
import { Btn, Label, Card, Spinner, ErrBanner, KPI, PageHeader } from "./ui";
import type { FundRecord } from "../lib/market-data/fundService";
import { analyzeFund } from "../lib/analysis";
import { computeTaxEfficiency } from "../lib/tax";
import { PERIODS, blendOverall, type Period, type PeriodOrOverall } from "../lib/metrics/periods";
import { rankSentence, type CategoryRank } from "../lib/metrics/peers";
import { SaveToList } from "./SaveToList";
import FirmContextPanel from "./FirmContextPanel";
import {
  scoreFundForContext, overallReviewScore, getPeerAlternativesForContext, displayScore,
  SCORE_CONTEXTS, CONTEXT_LABELS,
  type ReviewScore, type ScoreInputs, type ScoreContext,
} from "../lib/metrics/score";
import type { PeriodStats } from "../lib/kpi";

/** /api/funds payload: FundRecord + raw score inputs for subject and peers.
    The unified score engine runs CLIENT-side so period + scoring-context
    switches are instant with a single fetch. */
interface ScoreInputsPayload {
  ticker: string; name: string;
  expenseRatio: number | null; ttmYield: number | null; taxScore: number | null;
  fundAge: number | null; battingAvg: number | null;
  periods: Record<Period, PeriodStats>;
}
interface PeerIntelPayload {
  peerGroup: string;
  peerCount: number;
  subject: ScoreInputsPayload;
  peers: ScoreInputsPayload[];
  warming: boolean;
  unavailableReasons: string[];
}
type AnalysisRecord = FundRecord & {
  categoryRanks?: Partial<Record<Period, CategoryRank>> | null;
  peerIntel?: PeerIntelPayload | null;
};

const pct = (v: number | null, d = 2) => (v == null ? "-" : `${v.toFixed(d)}%`);
const num = (v: number | null, d = 2) => (v == null ? "-" : v.toFixed(d));

function timeAgo(ts: number): string {
  if (!ts) return "";
  const mins = Math.floor((Date.now() / 1000 - ts) / 60);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

// Tax-efficiency grade colors (A–D heuristic from lib/tax — not a fund rating).
const taxGradeColors: Record<string, string> = { A: T.green, B: "#16A34A", C: T.amber, D: T.red };
const taxGradeBg: Record<string, string> = { A: "#DCFCE7", B: "#F0FDF4", C: "#FEF9C3", D: "#FEF2F2" };

function equityStyle(category: string): string | null {
  const m = category.match(/US Equity (Large|Mid|Small|Mid\/Small|Small\/Mid)\s+(Value|Blend|Growth)/i);
  return m ? `${m[1]} ${m[2]}` : null;
}

export default function AnalysisTab({
  ticker, setTicker, onCompare, onFindSimilar,
  firmOrigin, onBackToFirmFunds, onStartReview, onAddToFirmFunds,
}: {
  ticker: string;
  setTicker: (t: string) => void;
  onCompare?: (t: string) => void;
  onFindSimilar?: (t: string) => void;
  // Phase 2D contextual-workspace wiring (firm context lives in FirmContextPanel).
  firmOrigin?: boolean;
  onBackToFirmFunds?: () => void;
  onStartReview?: (firmFundId: string, ticker: string) => void;
  onAddToFirmFunds?: (ticker: string) => void;
}) {
  const [input, setInput] = useState(ticker);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState<AnalysisRecord | null>(null);
  // Global analysis period + scoring context — drive the score, metrics,
  // rank, breakdown, and similar-funds list together.
  const [period, setPeriod] = useState<PeriodOrOverall>("3Y");
  const [context, setContext] = useState<ScoreContext>("overall");

  const run = async (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    setLoading(true); setError(""); setRecord(null);
    setTicker(t);
    try {
      const res = await fetch(`/api/funds/${t}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `${t} not found`);
      setRecord(data);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  };

  // Auto-run when a ticker is pushed in from another tab (Analyze quick-action)
  useEffect(() => {
    if (ticker && ticker !== record?.ticker) {
      setInput(ticker);
      run(ticker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const a = record ? analyzeFund(record) : null;
  const tax = record ? computeTaxEfficiency(record) : null;
  const style = record ? equityStyle(record.category) : null;

  const k = record?.kpi;

  // Selected-period stat set. "Overall" = documented weighted blend of the
  // available 1Y/3Y/5Y/10Y values (never confident on 1Y-only history).
  const statFor = (key: keyof PeriodStats): number | null => {
    if (!k?.periods) return null;
    if (period !== "Overall") return k.periods[period]?.[key] ?? null;
    const blended = blendOverall({
      "1Y": k.periods["1Y"]?.[key], "3Y": k.periods["3Y"]?.[key],
      "5Y": k.periods["5Y"]?.[key], "10Y": k.periods["10Y"]?.[key],
    });
    return blended?.value ?? null;
  };
  const pl = period === "Overall" ? "Overall*" : period; // * = blended
  // PRIMARY performance = PRICE CHANGE (Nasdaq-style, dividends excluded). ETFs
  // are Market Price Change; mutual funds are NAV Change. Cumulative over the
  // whole period (no annualization). Price change uses the canonical visible
  // vocabulary (1Y/3Y/5Y here); the 10Y and Overall scoring toggles have no
  // corresponding visible price-return figure and show it as Unavailable.
  const priceBasisLabel = record?.vehicle === "Mutual Fund" || record?.vehicle === "MF" ? "NAV Change" : "Price Change";
  const priceChangeApplicable = period === "1Y" || period === "3Y" || period === "5Y";
  const priceChangeStat = (): number | null =>
    priceChangeApplicable ? (k?.priceChange?.[period as "1Y" | "3Y" | "5Y"] ?? null) : null;
  const rank = record?.categoryRanks && period !== "Overall" ? record.categoryRanks[period] ?? null : null;

  // ── Unified Advisor Review Score: computed client-side from shipped peer
  //    inputs, for the selected period + scoring context ──
  const intel = record?.peerIntel ?? null;
  const inputsOf = (f: ScoreInputsPayload, p: Period): ScoreInputs => ({
    stats: f.periods?.[p] ?? null, expenseRatio: f.expenseRatio, ttmYield: f.ttmYield,
    taxScore: f.taxScore, fundAge: f.fundAge, battingAvg: f.battingAvg,
  });
  const scoring = useMemo(() => {
    if (!intel || !intel.peers.length) return null;
    const byPeriod: Partial<Record<Period, ReviewScore | null>> = {};
    for (const p of PERIODS) {
      byPeriod[p] = scoreFundForContext(inputsOf(intel.subject, p), intel.peers.map((x) => inputsOf(x, p)), context);
    }
    return { byPeriod, overall: overallReviewScore(byPeriod) };
  }, [intel, context]);
  const periodScore = scoring && period !== "Overall" ? scoring.byPeriod[period] ?? null : null;
  const shownScore = period === "Overall"
    ? (scoring?.overall ? { score: scoring.overall.score, band: scoring.overall.band } : null)
    : (periodScore ? { score: periodScore.score, band: periodScore.band } : null);
  const scoreUnavailableReason = !record ? null
    : !intel ? "Unavailable — no reliable peer group."
    : shownScore ? null
    : period === "Overall" ? "Unavailable — Overall needs at least 3 years of scored history."
    : intel.unavailableReasons[0] ?? `Unavailable — insufficient ${period} peer data.`;

  const alternatives = useMemo(() => {
    if (!intel || !scoring) return [];
    const candScore = (p: Period, i: number): number | null => {
      const peers = [...intel.peers.filter((_, j) => j !== i).map((x) => inputsOf(x, p)), inputsOf(intel.subject, p)];
      return scoreFundForContext(inputsOf(intel.peers[i], p), peers, context)?.score ?? null;
    };
    const subjBase = { ticker: intel.subject.ticker, name: intel.subject.name, category: intel.peerGroup,
      expenseRatio: intel.subject.expenseRatio };
    if (period === "Overall") {
      if (!scoring.overall) return [];
      const cands = intel.peers.map((pr, i) => {
        const per: Partial<Record<Period, ReviewScore | null>> = {};
        for (const p of PERIODS) { const sc = candScore(p, i); per[p] = sc != null ? ({ score: sc } as ReviewScore) : null; }
        return { ticker: pr.ticker, name: pr.name, category: intel.peerGroup,
          score: overallReviewScore(per)?.score ?? null, stats: pr.periods?.["3Y"] ?? null, expenseRatio: pr.expenseRatio };
      });
      return getPeerAlternativesForContext(
        { ...subjBase, score: scoring.overall.score, stats: intel.subject.periods?.["3Y"] ?? null }, cands, "Overall", context);
    }
    const mine = scoring.byPeriod[period];
    if (!mine) return [];
    const cands = intel.peers.map((pr, i) => ({ ticker: pr.ticker, name: pr.name, category: intel.peerGroup,
      score: candScore(period, i), stats: pr.periods?.[period] ?? null, expenseRatio: pr.expenseRatio }));
    return getPeerAlternativesForContext(
      { ...subjBase, score: mine.score, stats: intel.subject.periods?.[period] ?? null }, cands, period, context);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intel, scoring, period, context]);

  const metrics = k && record ? [
    // Price change is shown only for periods that can produce the locked metric
    // (1Y/3Y/5Y). 10Y and Overall are scoring-only periods with no visible price
    // return, so no "Unavailable" price-change control is rendered for them.
    ...(priceChangeApplicable ? [{ label: `${pl} ${priceBasisLabel}`, value: pct(priceChangeStat()), good: priceChangeStat() != null ? priceChangeStat()! > 0 : null }] : []),
    { label: `Sharpe ${pl}`, value: num(statFor("sharpe")), good: statFor("sharpe") != null ? statFor("sharpe")! >= 1 : null },
    { label: `Sortino ${pl}`, value: num(statFor("sortino")), good: statFor("sortino") != null ? statFor("sortino")! >= 1 : null },
    { label: `Alpha ${pl} vs ${record.benchmark}`, value: pct(statFor("alpha")), good: statFor("alpha") != null ? statFor("alpha")! > 0 : null },
    { label: `Beta ${pl} vs ${record.benchmark}`, value: num(statFor("beta")), good: statFor("beta") != null ? statFor("beta")! <= 1.1 : null },
    { label: `Max DD ${pl}`, value: pct(statFor("maxDrawdown"), 1), good: statFor("maxDrawdown") != null ? statFor("maxDrawdown")! > -20 : null },
    { label: `Std Dev ${pl}`, value: pct(statFor("volatility"), 1), good: null },
    // Period-fixed stats keep their own explicit period labels — never mixed silently.
    { label: "Up Capture 3Y", value: num(k.upsideCapture3y, 1), good: k.upsideCapture3y != null ? k.upsideCapture3y >= 100 : null },
    { label: "Down Capture 3Y", value: num(k.downsideCapture3y, 1), good: k.downsideCapture3y != null ? k.downsideCapture3y < 100 : null },
    { label: "TTM Yield", value: pct(k.ttmYield), good: k.ttmYield != null ? k.ttmYield > 0 : null },
    { label: "Expense", value: record.expenseRatio != null ? pct(record.expenseRatio) : "-", good: record.expenseRatio != null ? record.expenseRatio <= 0.5 : null },
    { label: "AUM", value: record.aumFormatted, good: null },
    { label: "Fund Age", value: record.fundAge != null ? `${record.fundAge.toFixed(1)} yr` : "-", good: record.fundAge != null ? record.fundAge >= 5 : null },
    { label: "Batting Avg 3Y", value: pct(k.battingAvg3y, 0), good: k.battingAvg3y != null ? k.battingAvg3y >= 50 : null },
  ] : [];

  const rolling = (k?.rolling3y ?? []).map((p) => ({
    date: p.date, Fund: p.fundReturn, Benchmark: p.benchReturn,
  }));
  const stress = k?.stressTests ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title="Critical Analysis"
        subtitle="A full rundown of one fund - strengths, weaknesses, and the current numbers behind them." />

      <Card style={{ padding: "18px 22px" }}>
        <Label>Fund ticker</Label>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && run(input)}
            placeholder="Enter a ticker - e.g. SCHD, FXAIX, VTI"
            style={{ flex: 1, background: T.panel, color: T.text, border: `1px solid ${T.line2}`,
              borderRadius: 6, padding: "9px 12px", fontSize: 14, outline: "none", ...mono }} />
          <Btn accent onClick={() => run(input)} disabled={loading || !input.trim()}>
            {loading ? "Analyzing…" : "Run Analysis"}
          </Btn>
          <Btn onClick={() => { setInput(""); setRecord(null); setError(""); setTicker(""); }}
            disabled={loading || (!input && !record)}>Clear</Btn>
        </div>
      </Card>

      {loading && <Spinner label="Pulling the latest data…" />}
      <ErrBanner msg={error} />

      {record && a && (
        <>
          {/* Identity + actions */}
          <Card style={{ padding: "18px 22px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 24, fontWeight: 600, color: T.text, ...mono }}>{record.ticker}</span>
                  <span style={{ fontSize: 13, color: T.dim, ...ui }}>{record.name}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: T.muted, background: T.panel2, border: `1px solid ${T.line}`,
                    borderRadius: 3, padding: "2px 7px", ...ui }}>{record.vehicle}</span>
                  {style && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: T.data,
                      borderRadius: 3, padding: "2px 8px", ...ui }}>{style}</span>
                  )}
                  <span style={{ fontSize: 11, color: T.muted, ...ui }}>{record.category}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <SaveToList ticker={record.ticker} fundName={record.name} category={record.category} />
                {onCompare && <Btn small onClick={() => onCompare(record.ticker)}>Compare this</Btn>}
                {onFindSimilar && <Btn small onClick={() => onFindSimilar(record.ticker)}>Find similar</Btn>}
              </div>
            </div>

            {/* Advisor Review Score — the single fund score, period + context aware */}
            <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                borderRadius: 10, background: T.panel2, border: `1px solid ${T.line}`, flexShrink: 0 }}>
                <div style={{ position: "relative", width: 58, height: 58, flexShrink: 0 }}>
                  <svg width="58" height="58" viewBox="0 0 58 58">
                    <circle cx="29" cy="29" r="25" fill="none" stroke={T.line} strokeWidth="6" />
                    {shownScore && (
                      <circle cx="29" cy="29" r="25" fill="none"
                        stroke={shownScore.score >= 70 ? T.green : shownScore.score >= 50 ? T.amber : T.red}
                        strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={`${(displayScore(shownScore.score) / 100) * 157} 157`}
                        transform="rotate(-90 29 29)" />
                    )}
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 17, fontWeight: 600, ...mono,
                      color: shownScore ? (shownScore.score >= 70 ? T.green : shownScore.score >= 50 ? T.amber : T.red) : T.muted }}>
                      {shownScore ? displayScore(shownScore.score) : "—"}
                    </span>
                    <span style={{ fontSize: 8, color: T.muted, ...ui }}>/100</span>
                  </div>
                </div>
                <div style={{ maxWidth: 190 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: T.dim, textTransform: "uppercase",
                    letterSpacing: "0.1em", ...ui }}>Advisor Review Score</div>
                  <div style={{ fontSize: 12, fontWeight: 600, ...ui, marginTop: 3, lineHeight: 1.4,
                    color: shownScore ? (shownScore.score >= 70 ? T.green : shownScore.score >= 50 ? T.amber : T.red) : T.muted }}>
                    {shownScore ? shownScore.band : scoreUnavailableReason}
                  </div>
                  <div style={{ fontSize: 10, color: T.muted, ...ui, marginTop: 3 }}>
                    {pl} · {CONTEXT_LABELS[context]}{intel ? ` · vs ${intel.peerCount} ${intel.peerGroup} funds` : ""}
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 260, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div role="tablist" aria-label="Analysis period"
                    style={{ display: "inline-flex", gap: 2, background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 9, padding: 3 }}>
                    {([...PERIODS, "Overall"] as PeriodOrOverall[]).map((p) => (
                      <button key={p} role="tab" aria-selected={p === period} onClick={() => setPeriod(p)}
                        style={{ padding: "6px 11px", borderRadius: 7, border: "none", cursor: p === period ? "default" : "pointer",
                          background: p === period ? T.blue : "transparent", color: p === period ? "#fff" : T.dim,
                          fontSize: 11.5, fontWeight: 600, ...ui }}>{p}</button>
                    ))}
                  </div>
                  <select value={context} onChange={(e) => setContext(e.target.value as ScoreContext)}
                    aria-label="Scoring context"
                    style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.line}`,
                      background: T.panel, color: T.text, fontSize: 12, ...ui, outline: "none" }}>
                    {SCORE_CONTEXTS.map((c) => <option key={c} value={c}>{CONTEXT_LABELS[c]}</option>)}
                  </select>
                </div>
                {rank && (
                  <div style={{ fontSize: 12, color: T.dim, ...ui, fontWeight: 600 }}>{rankSentence(rank, period)}</div>
                )}
                {period === "Overall" && scoring?.overall?.note && (
                  <div style={{ fontSize: 11, color: T.amber, ...ui }}>{scoring.overall.note}</div>
                )}
                <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.55, ...ui }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: T.dim, textTransform: "uppercase",
                    letterSpacing: "0.1em", ...ui, display: "block", marginBottom: 3 }}>Review takeaway</span>
                  {a.bottomLine}
                </div>
                <div style={{ fontSize: 10, color: T.muted, ...ui }}>
                  Peer-relative review aid — confirm in your firm&apos;s system before acting.
                </div>
              </div>
            </div>
          </Card>

          {/* Firm context — status/role/rationale/reviews for this fund when it is
              in Firm Funds; Add to Firm Funds otherwise. Contextual only. */}
          <FirmContextPanel ticker={record.ticker} cameFromFirmFunds={firmOrigin}
            onBack={onBackToFirmFunds} onStartReview={onStartReview} onAddToFirmFunds={onAddToFirmFunds} />

          {/* ── Advisor Review — category-relative score + peer alternatives.
                Internal review aid: peer comparison only, never a recommendation. ── */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) 1fr", gap: 14, alignItems: "stretch" }}>
            <Card style={{ padding: "18px 20px" }}>
              <Label>Score Breakdown · {pl} · {CONTEXT_LABELS[context]}</Label>
              {shownScore ? (
                <>
                  {period === "Overall" && (
                    <p style={{ fontSize: 11, color: T.muted, ...ui, margin: "8px 0 0", lineHeight: 1.5 }}>
                      Overall blends the per-period scores (1Y 10% · 3Y 25% · 5Y 30% · 10Y 35%, renormalized).
                      Component detail is shown for individual periods.
                    </p>
                  )}
                  {period !== "Overall" && periodScore && (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
                      {periodScore.components.map((c) => (
                        <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: T.dim, ...ui, width: 118, flexShrink: 0 }}>{c.label}</span>
                          <span style={{ flex: 1, height: 5, background: T.panel3, borderRadius: 3, overflow: "hidden" }}>
                            {c.score != null && <span style={{ display: "block", width: `${c.score}%`, height: "100%",
                              background: c.score >= 70 ? T.green : c.score >= 40 ? T.amber : T.red, borderRadius: 3 }} />}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.text, ...mono, width: 30, textAlign: "right" }}>
                            {c.score != null ? c.score : "—"}
                          </span>
                        </div>
                      ))}
                      <p style={{ fontSize: 10.5, color: T.muted, ...ui, margin: "6px 0 0", lineHeight: 1.5 }}>
                        {periodScore.components.filter((c) => c.score != null).slice(0, 2)
                          .map((c) => `${c.label}: ${c.score}/100 — ${c.explanation}.`).join(" ")}
                      </p>
                      {periodScore.missing.length > 0 && (
                        <p style={{ fontSize: 10.5, color: T.muted, ...ui, margin: 0 }}>
                          Reweighted without: {periodScore.missing.join(", ")} (unavailable — not counted as zero).
                        </p>
                      )}
                    </div>
                  )}
                  <p style={{ fontSize: 10.5, color: T.muted, ...ui, margin: "10px 0 0", lineHeight: 1.5 }}>
                    Peer-percentile components vs {intel?.peerCount ?? "—"} {intel?.peerGroup} funds with data.
                    A review aid for advisors — not a rating of future performance.
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 12, color: T.muted, ...ui, margin: "10px 0 0", lineHeight: 1.55 }}>{scoreUnavailableReason}</p>
              )}
            </Card>

            <Card style={{ padding: "18px 20px" }}>
              <Label>Similar Funds to Review · {pl} · {CONTEXT_LABELS[context]}</Label>
              {alternatives.length ? (
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
                    <thead><tr>
                      {["Fund", "Score", `${pl} Return`, "Sharpe", "ER", "Max DD", "Why it surfaced", ""].map((h) => (
                        <th key={h} style={{ textAlign: "left", fontSize: 10, color: T.muted, ...ui, padding: "2px 12px 6px 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {alternatives.map((alt) => (
                        <tr key={alt.ticker} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td style={{ padding: "7px 12px 7px 0", whiteSpace: "nowrap" }}>
                            <button onClick={() => run(alt.ticker)} title={alt.name}
                              style={{ border: "none", background: "none", cursor: "pointer", padding: 0,
                                fontSize: 12.5, fontWeight: 700, color: T.blue, ...mono }}>{alt.ticker}</button>
                            <span style={{ display: "block", fontSize: 10.5, color: T.muted, ...ui, maxWidth: 170,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alt.name}</span>
                          </td>
                          <td style={{ padding: "7px 12px 7px 0", fontSize: 12.5, fontWeight: 600, color: T.text, ...mono }}>{alt.score != null ? displayScore(alt.score) : "—"}</td>
                          <td style={{ padding: "7px 12px 7px 0", fontSize: 12, color: T.dim, ...mono }}>{alt.stats?.return != null ? `${alt.stats.return.toFixed(1)}%` : "—"}</td>
                          <td style={{ padding: "7px 12px 7px 0", fontSize: 12, color: T.dim, ...mono }}>{alt.stats?.sharpe != null ? alt.stats.sharpe.toFixed(2) : "—"}</td>
                          <td style={{ padding: "7px 12px 7px 0", fontSize: 12, color: T.dim, ...mono }}>{alt.expenseRatio != null ? `${alt.expenseRatio.toFixed(2)}%` : "—"}</td>
                          <td style={{ padding: "7px 12px 7px 0", fontSize: 12, color: T.dim, ...mono }}>{alt.stats?.maxDrawdown != null ? `${alt.stats.maxDrawdown.toFixed(1)}%` : "—"}</td>
                          <td style={{ padding: "7px 12px 7px 0", fontSize: 11, color: T.dim, ...ui, maxWidth: 200 }}>{alt.rationale}</td>
                          <td style={{ padding: "7px 0" }}><SaveToList compact ticker={alt.ticker} fundName={alt.name} category={alt.category} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: 10.5, color: T.muted, ...ui, margin: "10px 0 0" }}>
                    Same-category review candidates only ({intel?.peerGroup}). Peer comparison for advisor review — not client advice.
                  </p>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: T.muted, ...ui, margin: "10px 0 0", lineHeight: 1.55 }}>
                  {!intel ? "Unavailable — no reliable peer group."
                    : shownScore ? "No same-category peers with a stronger reviewable profile for this period yet."
                    : "Unavailable — peer data for this period is still warming."}
                </p>
              )}
            </Card>
          </div>

          {/* Pros / Cons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.green, ...ui, marginBottom: 10,
                display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>▲</span> Strengths
              </div>
              {a.pros.length ? a.pros.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                  <span style={{ color: T.green, fontWeight: 600, flexShrink: 0 }}>+</span>
                  <span style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.55, ...ui }}>{p}</span>
                </div>
              )) : <div style={{ fontSize: 12, color: T.muted, ...ui }}>No standout strengths in the data.</div>}
            </Card>
            <Card style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.red, ...ui, marginBottom: 10,
                display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>▼</span> Watch-outs
              </div>
              {a.cons.length ? a.cons.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
                  <span style={{ color: T.red, fontWeight: 600, flexShrink: 0 }}>−</span>
                  <span style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.55, ...ui }}>{c}</span>
                </div>
              )) : <div style={{ fontSize: 12, color: T.muted, ...ui }}>No notable red flags in the data.</div>}
            </Card>
          </div>

          {/* Current data — global period toggle drives return/risk/factor stats */}
          <Card style={{ padding: "18px 22px" }}>
            <Label>Current data · {pl}</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "16px 12px", marginTop: 12 }}>
              {metrics.map((m) => (
                <KPI key={m.label} label={m.label} value={m.value} good={m.good} />
              ))}
            </div>
          </Card>

          {/* Tax efficiency + rolling chart */}
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, alignItems: "stretch" }}>
            {tax && (
              <Card style={{ padding: "18px 20px" }}>
                <Label>Tax efficiency</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
                  <div style={{ width: 54, height: 54, borderRadius: 12, flexShrink: 0,
                    background: taxGradeBg[tax.rating], border: `1px solid ${taxGradeColors[tax.rating]}44`,
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 28, fontWeight: 600, color: taxGradeColors[tax.rating], ...mono }}>{tax.rating}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text, ...ui }}>{tax.ratingLabel}</div>
                    <div style={{ fontSize: 11, color: T.dim, marginTop: 1, ...ui }}>Tax drag {tax.dragEstimate}</div>
                  </div>
                </div>
                <div style={{ marginTop: 12, padding: "9px 11px", background: T.panel2,
                  border: `1px solid ${T.line}`, borderRadius: 7 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, ...ui }}>{tax.accountRec}</div>
                  <div style={{ fontSize: 11, color: T.dim, marginTop: 3, lineHeight: 1.5, ...ui }}>{tax.accountDetail}</div>
                </div>
              </Card>
            )}

            <Card style={{ padding: "16px 20px" }}>
              <Label>Growth vs benchmark - 3 years</Label>
              {rolling.length > 1 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={rolling} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke={T.line} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: T.muted, fontSize: 9, fontFamily: "Geist" }}
                      axisLine={false} tickLine={false} minTickGap={40} />
                    <YAxis tick={{ fill: T.muted, fontSize: 9 }} axisLine={false} tickLine={false}
                      tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip {...chartTooltip} formatter={(v: unknown) => `${(v as number)?.toFixed?.(1) ?? v}%`} />
                    <Line type="monotone" dataKey="Fund" stroke={T.data} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="Benchmark" stroke={T.muted} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center",
                  color: T.muted, fontSize: 12, ...ui }}>No rolling-return history available.</div>
              )}
            </Card>
          </div>

          {/* Stress periods */}
          {stress.length > 0 && (
            <Card style={{ padding: "16px 20px" }}>
              <Label>How it held up in past stress periods</Label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 12 }}>
                {stress.map((s) => (
                  <div key={s.label} style={{ background: T.panel2, border: `1px solid ${T.line}`,
                    borderRadius: 7, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: T.dim, fontWeight: 600, letterSpacing: "0.06em",
                      ...ui, marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, ...mono,
                      color: s.fundReturn == null ? T.dim : s.fundReturn >= 0 ? T.green : T.red }}>
                      {s.fundReturn != null ? `${s.fundReturn > 0 ? "+" : ""}${s.fundReturn.toFixed(1)}%` : "-"}
                    </div>
                    {s.benchReturn != null && (
                      <div style={{ fontSize: 10, color: T.muted, marginTop: 2, ...mono }}>
                        bench {s.benchReturn > 0 ? "+" : ""}{s.benchReturn.toFixed(1)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}


          <p style={{ fontSize: 10, color: T.muted, ...ui, textAlign: "center" }}>
            Research aid · data delayed &amp; unofficial · verify in your firm&apos;s system before client use
          </p>
        </>
      )}
    </div>
  );
}
