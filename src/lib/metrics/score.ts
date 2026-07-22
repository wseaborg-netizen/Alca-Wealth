/**
 * Advisor Review Score — THE single fund-quality score across ALCA
 * (Fund Analysis, Screener, Similar Funds, and — via the exported helpers —
 * the future Portfolio Builder sleeve selection). Category-relative,
 * period-aware, and CONTEXT-aware: the score answers "strong for what?",
 * never "one fixed number forever".
 *
 * Extends the 2A foundation (peers.ts groups, periods.ts blending, kpi.ts
 * per-period stats). A fund is only ever measured against same-category
 * verified peers — no full-universe fallback exists anywhere.
 *
 * Language rules: internal advisor review aid. "advisor review score",
 * "peer alternatives", "similar funds to review" — never recommendation /
 * best / buy / sell language (a test enforces this).
 *
 * Display rule: scores are capped at 99 in UI (displayScore) — a "100"
 * presents false perfection. Internal ordering is never affected.
 */
import { blendOverall, PERIODS, type Period } from "./periods";
import { MIN_PEERS } from "./peers";
import type { PeriodStats } from "../kpi";

// ── Percentile rank ───────────────────────────────────────────────────────────

/**
 * Percentile of `value` among peers (0–100, higher = better profile).
 * Direction-aware; deterministic tie handling (ties count half).
 * Null when value missing or fewer than MIN_PEERS values exist in total.
 */
export function percentileAmong(
  value: number | null | undefined,
  peerValues: (number | null | undefined)[],
  higherIsBetter: boolean,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const peers = peerValues.filter((v): v is number => v != null && Number.isFinite(v));
  if (peers.length + 1 < MIN_PEERS) return null;
  let worse = 0, ties = 0;
  for (const v of peers) {
    if (v === value) ties++;
    else if (higherIsBetter ? v < value : v > value) worse++;
  }
  return Math.round(((worse + ties / 2) / peers.length) * 100);
}

/** UI display cap: never present a fund as a perfect 100. */
export function displayScore(score: number): number {
  return Math.min(score, 99);
}

// ── Score inputs ──────────────────────────────────────────────────────────────

/** Everything the engine may score a fund on, for one period.
    Period-independent inputs (expense ratio, yield, tax score, fund age,
    batting average) ride along; missing ones are never zeroed. */
export interface ScoreInputs {
  stats: PeriodStats | null;      // selected-period return/risk stats
  expenseRatio: number | null;    // % — fact
  ttmYield: number | null;        // % — winsorized TTM distribution yield
  taxScore: number | null;        // 0–100 ALCA tax-efficiency heuristic
  fundAge: number | null;         // years since inception
  battingAvg: number | null;      // % months beating benchmark (3Y) — consistency proxy
}

export const EMPTY_INPUTS: Omit<ScoreInputs, "stats"> = {
  expenseRatio: null, ttmYield: null, taxScore: null, fundAge: null, battingAvg: null,
};

// ── Components ────────────────────────────────────────────────────────────────

export type ComponentKey =
  | "performance" | "riskAdjusted" | "downside" | "volatility" | "cost"
  | "yield" | "taxEfficiency" | "trackRecord" | "consistency";

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  performance: "Performance",
  riskAdjusted: "Risk-adjusted return",
  downside: "Downside risk",
  volatility: "Volatility",
  cost: "Cost",
  yield: "Income / yield",
  taxEfficiency: "Tax efficiency",
  trackRecord: "Track record",
  consistency: "Consistency (3Y)",
};

type InputPick = (s: ScoreInputs) => number | null;
const COMPONENT_VALUE: Record<ComponentKey, { pick: InputPick; higherIsBetter: boolean }> = {
  performance: { pick: (s) => s.stats?.return ?? null, higherIsBetter: true },
  riskAdjusted: { pick: (s) => s.stats?.sharpe ?? null, higherIsBetter: true },
  downside: { pick: (s) => s.stats?.maxDrawdown ?? null, higherIsBetter: true }, // negative: closer to 0 = better
  volatility: { pick: (s) => s.stats?.volatility ?? null, higherIsBetter: false },
  cost: { pick: (s) => s.expenseRatio, higherIsBetter: false },
  yield: { pick: (s) => s.ttmYield, higherIsBetter: true },
  taxEfficiency: { pick: (s) => s.taxScore, higherIsBetter: true },
  trackRecord: { pick: (s) => s.fundAge, higherIsBetter: true },
  consistency: { pick: (s) => s.battingAvg, higherIsBetter: true },
};

// ── Scoring contexts ──────────────────────────────────────────────────────────

export type ScoreContext =
  | "overall" | "growth" | "income" | "lowCost"
  | "riskAdjusted" | "downside" | "tax" | "longTerm";

export const CONTEXT_LABELS: Record<ScoreContext, string> = {
  overall: "Overall Review",
  growth: "Growth",
  income: "Income",
  lowCost: "Low Cost / Core Index",
  riskAdjusted: "Risk-Adjusted Performance",
  downside: "Downside Protection",
  tax: "Tax Efficiency",
  longTerm: "Long-Term Track Record",
};

export const SCORE_CONTEXTS = Object.keys(CONTEXT_LABELS) as ScoreContext[];

/** Component weights per context (each row sums to 1). These ARE the scoring
    system — the old management-style profiles and screener composite are
    retired; Low Cost / Core Index covers the passive/index case. */
export const CONTEXT_WEIGHTS: Record<ScoreContext, Partial<Record<ComponentKey, number>>> = {
  overall:      { performance: 0.20, riskAdjusted: 0.25, downside: 0.20, volatility: 0.10, cost: 0.15, consistency: 0.10 },
  growth:       { performance: 0.35, riskAdjusted: 0.30, downside: 0.10, volatility: 0.05, cost: 0.10, consistency: 0.10 },
  income:       { yield: 0.30, downside: 0.20, volatility: 0.15, cost: 0.15, consistency: 0.10, riskAdjusted: 0.10 },
  lowCost:      { cost: 0.35, volatility: 0.15, downside: 0.15, trackRecord: 0.15, riskAdjusted: 0.10, performance: 0.10 },
  riskAdjusted: { riskAdjusted: 0.35, downside: 0.20, volatility: 0.15, performance: 0.10, cost: 0.10, consistency: 0.10 },
  downside:     { downside: 0.35, volatility: 0.20, riskAdjusted: 0.20, consistency: 0.10, cost: 0.10, performance: 0.05 },
  tax:          { taxEfficiency: 0.35, cost: 0.25, volatility: 0.10, downside: 0.10, riskAdjusted: 0.10, performance: 0.10 },
  longTerm:     { trackRecord: 0.20, consistency: 0.15, riskAdjusted: 0.25, downside: 0.20, performance: 0.10, cost: 0.10 },
};

/** Minimum valid components for a score (missing ones are reweighted, never
    treated as zero — below this the score is Unavailable). */
export const MIN_COMPONENTS = 3;

// ── Score result ──────────────────────────────────────────────────────────────

export interface ComponentScore {
  key: ComponentKey;
  label: string;
  score: number | null;      // 0–100 peer percentile, null = unavailable
  weight: number;            // context weight (pre-reweighting)
  explanation: string;       // peer-relative interpretation
}

export interface ReviewScore {
  score: number;             // 0–100 internal (cap at display time)
  band: string;
  components: ComponentScore[];
  missing: ComponentKey[];   // components without data (excluded, not zeroed)
  context: ScoreContext;
  peerCount: number;
}

export function scoreBand(score: number): string {
  if (score >= 85) return "Strong peer-relative profile";
  if (score >= 70) return "Above-average peer-relative profile";
  if (score >= 50) return "Mixed / average peer-relative profile";
  if (score >= 30) return "Weak peer-relative profile";
  return "Very weak peer-relative profile";
}

function explain(key: ComponentKey, score: number): string {
  const strong = score >= 70, weak = score < 40;
  const mid = (s: string) => `${s} near the peer middle`;
  switch (key) {
    case "performance": return strong ? "higher period return than most peers" : weak ? "lower period return than most peers" : mid("period return");
    case "riskAdjusted": return strong ? "stronger Sharpe than most peers" : weak ? "weaker Sharpe than most peers" : mid("risk-adjusted return");
    case "downside": return strong ? "shallower drawdown than most peers" : weak ? "larger drawdown than category peers" : mid("drawdown");
    case "volatility": return strong ? "steadier than most peers" : weak ? "more volatile than most peers" : mid("volatility");
    case "cost": return strong ? "lower expense ratio than most peers" : weak ? "higher expense ratio than most peers" : mid("expenses");
    case "yield": return strong ? "higher distribution yield than most peers" : weak ? "lower distribution yield than most peers" : mid("yield");
    case "taxEfficiency": return strong ? "more tax-efficient profile than most peers" : weak ? "less tax-efficient profile than most peers" : mid("tax profile");
    case "trackRecord": return strong ? "longer track record than most peers" : weak ? "shorter track record than most peers" : mid("track record");
    case "consistency": return strong ? "beats its benchmark more often than most peers" : weak ? "beats its benchmark less often than most peers" : mid("consistency");
  }
}

// ── The engine ────────────────────────────────────────────────────────────────

/**
 * Category-relative advisor review score for one period + context.
 * `peers` = same-category peers only (grouping guaranteed by peers.ts —
 * there is no universe fallback anywhere).
 *
 * This is the single scoring entry point for Fund Analysis, the Screener,
 * Similar Funds, and future Portfolio Builder sleeve selection.
 */
export function scoreFundForContext(
  subject: ScoreInputs, peers: ScoreInputs[], context: ScoreContext,
): ReviewScore | null {
  const weights = CONTEXT_WEIGHTS[context];
  const components: ComponentScore[] = [];
  const missing: ComponentKey[] = [];
  let peerCount = 0;

  for (const key of Object.keys(weights) as ComponentKey[]) {
    const { pick, higherIsBetter } = COMPONENT_VALUE[key];
    const mine = pick(subject);
    const theirs = peers.map(pick);
    const pct = percentileAmong(mine, theirs, higherIsBetter);
    peerCount = Math.max(peerCount, theirs.filter((v) => v != null).length);
    if (pct == null) { missing.push(key); continue; }
    components.push({ key, label: COMPONENT_LABELS[key], score: pct, weight: weights[key]!, explanation: explain(key, pct) });
  }

  if (components.length < MIN_COMPONENTS) return null;

  // Reweight across the valid components only — missing ≠ zero.
  const wSum = components.reduce((s, c) => s + c.weight, 0);
  const score = Math.round(components.reduce((s, c) => s + (c.score! * c.weight), 0) / wSum);
  for (const key of missing) {
    components.push({ key, label: COMPONENT_LABELS[key], score: null, weight: weights[key]!,
      explanation: "unavailable — insufficient peer or fund data" });
  }
  return { score, band: scoreBand(score), components, missing, context, peerCount: peerCount + 1 };
}

/** Back-compat alias (2B name). */
export const reviewScore = (subject: ScoreInputs, peers: ScoreInputs[], context: ScoreContext = "overall") =>
  scoreFundForContext(subject, peers, context);

/** Overall-period score: blend of the per-period scores with the documented 2A
    weights; refuses to be confident on 1Y-only history. */
export function overallReviewScore(byPeriod: Partial<Record<Period, ReviewScore | null>>):
  { score: number; band: string; used: Period[]; note: string | null } | null {
  const blended = blendOverall({
    "1Y": byPeriod["1Y"]?.score ?? null, "3Y": byPeriod["3Y"]?.score ?? null,
    "5Y": byPeriod["5Y"]?.score ?? null, "10Y": byPeriod["10Y"]?.score ?? null,
  });
  if (!blended) return null;
  const score = Math.round(blended.value);
  const missing = PERIODS.filter((p) => !blended.used.includes(p));
  return {
    score, band: scoreBand(score), used: blended.used,
    note: missing.length ? `Limited history — Overall score based on ${blended.used.join(" and ")} only.` : null,
  };
}

// ── Ranking (screener / portfolio-builder entry point) ────────────────────────

export interface RankedFund<T> {
  item: T;
  score: number | null;       // internal (uncapped) — cap at display time
  band: string | null;
  reason: string | null;      // why it ranks where it does
}

/**
 * Rank a set of same-category funds for a context. Each fund is scored
 * against the OTHERS in the set (peer-relative within the provided group).
 * Funds without a score sort last with reason null — never invented.
 * Future Portfolio Builder sleeve selection calls exactly this.
 */
export function rankFundsForContext<T>(
  funds: { item: T; inputs: ScoreInputs }[], context: ScoreContext,
): RankedFund<T>[] {
  const scored = funds.map((f, i) => {
    const peers = funds.filter((_, j) => j !== i).map((x) => x.inputs);
    const r = scoreFundForContext(f.inputs, peers, context);
    let reason: string | null = null;
    if (r) {
      const top = [...r.components].filter((c) => c.score != null).sort((a, b) => b.score! - a.score!)[0];
      reason = top ? `${top.label}: ${top.explanation}` : null;
    }
    return { item: f.item, score: r?.score ?? null, band: r ? r.band : null, reason };
  });
  scored.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return scored;
}

// ── Peer alternatives ─────────────────────────────────────────────────────────

export interface AlternativeCandidate {
  ticker: string;
  name: string;
  category: string;
  score: number | null;       // context score for the period (or Overall)
  stats: PeriodStats | null;
  expenseRatio: number | null;
}

export interface PeerAlternative extends AlternativeCandidate {
  rationale: string;          // required — nothing surfaces without a reason
}

/**
 * Similar funds to review for the selected period + context — same-category
 * candidates only. Excluded: the subject fund, funds without period data,
 * funds with no articulable advantage. Sorted by context score (ties → lower
 * expense ratio). Context shapes the rationale emphasis.
 */
export function getPeerAlternativesForContext(
  subject: AlternativeCandidate,
  candidates: AlternativeCandidate[],
  period: string,
  context: ScoreContext,
  max = 5,
): PeerAlternative[] {
  const eligible = candidates.filter((c) =>
    c.ticker !== subject.ticker && c.score != null && c.stats?.return != null);
  eligible.sort((x, y) => (y.score! - x.score!) || ((x.expenseRatio ?? 99) - (y.expenseRatio ?? 99)));

  const ctxLabel = CONTEXT_LABELS[context];
  const out: PeerAlternative[] = [];
  for (const c of eligible) {
    const reasons: string[] = [];
    const s = subject.stats;
    if (subject.score != null && c.score! > subject.score)
      reasons.push(`stronger peer-relative score for ${ctxLabel} over ${period}`);
    if (c.stats?.sharpe != null && s?.sharpe != null && c.stats.sharpe > s.sharpe) reasons.push(`higher ${period} Sharpe`);
    if (c.expenseRatio != null && subject.expenseRatio != null && c.expenseRatio < subject.expenseRatio) reasons.push("lower expense ratio");
    if (c.stats?.maxDrawdown != null && s?.maxDrawdown != null && c.stats.maxDrawdown > s.maxDrawdown) reasons.push(`shallower ${period} drawdown`);
    if (!reasons.length) continue; // no reason → not surfaced
    // Context-relevant reason first.
    const order = context === "lowCost" || context === "tax" ? ["lower expense ratio"]
      : context === "downside" ? [`shallower ${period} drawdown`]
      : context === "riskAdjusted" ? [`higher ${period} Sharpe`] : [];
    reasons.sort((a, b) => (order.includes(b) ? 1 : 0) - (order.includes(a) ? 1 : 0));
    out.push({ ...c, rationale: reasons.slice(0, 2).join(" · ") });
    if (out.length >= max) break;
  }
  return out;
}

/** Back-compat alias (2B name) — overall context. */
export const pickAlternatives = (subject: AlternativeCandidate, candidates: AlternativeCandidate[], period: string, max = 5) =>
  getPeerAlternativesForContext(subject, candidates, period, "overall", max);
