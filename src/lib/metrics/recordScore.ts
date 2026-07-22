/**
 * FundRecord → unified Advisor Review Score adapters, shared by every server
 * route that ranks funds (screener, recommend, replace, portfolio-select).
 * One engine (score.ts) — this file only adapts records and maps legacy
 * priority/reason/sleeve vocabularies onto scoring contexts.
 */
import { computeTaxEfficiency } from "../tax";
import { rankFundsForContext, type ScoreContext, type ScoreInputs, type RankedFund } from "./score";
import type { Period } from "./periods";
import type { KpiResult } from "../kpi";

/** The slice of FundRecord the scorer needs (type-only — no server imports). */
export interface ScorableRecord {
  ticker: string;
  name: string;
  vehicle: string;
  category: string;
  expenseRatio: number | null;
  fundAge: number | null;
  kpi: KpiResult;
}

export function recordToScoreInputs(r: ScorableRecord, period: Period): ScoreInputs {
  return {
    stats: r.kpi.periods?.[period] ?? null,
    expenseRatio: r.expenseRatio,
    ttmYield: r.kpi.ttmYield,
    taxScore: (() => { try { return computeTaxEfficiency(r).score; } catch { return null; } })(),
    fundAge: r.fundAge,
    battingAvg: r.kpi.battingAvg3y,
  };
}

/** Rank records with the unified engine (peer-relative within the given set). */
export function rankRecords<T extends ScorableRecord>(
  records: T[], context: ScoreContext, period: Period = "3Y",
): RankedFund<T>[] {
  return rankFundsForContext(records.map((r) => ({ item: r, inputs: recordToScoreInputs(r, period) })), context);
}

// ── Legacy vocabulary → context maps ─────────────────────────────────────────

/** Screener/recommend priority labels → scoring context. */
export const CONTEXT_FROM_PRIORITY: Record<string, ScoreContext> = {
  "Downside protection": "downside",
  "Low cost": "lowCost",
  "Risk-adjusted return (Sharpe)": "riskAdjusted",
  "Alpha vs benchmark": "riskAdjusted",
  "Consistency vs category": "overall",
  "Income / yield": "income",
};

export function contextFromPriorities(priorities: string[] | undefined): ScoreContext {
  const mapped = (priorities ?? []).map((p) => CONTEXT_FROM_PRIORITY[p]).filter(Boolean);
  return mapped[0] ?? "overall";
}

/** Replace-tool reason → scoring context. */
export const REPLACE_REASON_CONTEXT: Record<string, ScoreContext> = {
  cost: "lowCost",
  alpha: "riskAdjusted",
  risk: "downside",
  yield: "income",
  overall: "overall",
};

/**
 * Portfolio Builder sleeve → scoring context.
 * Core/broad sleeves score by Low Cost / Core Index; growth sleeves by Growth;
 * bond sleeves act as income engines under an income goal and as risk
 * reducers otherwise; dividend/income equity by Income; anything unclear by
 * Overall Review.
 */
export function sleeveContext(category: string, goal?: string): ScoreContext {
  const c = category.toLowerCase();
  const bond = /bond|fixed income|treasury|municipal|tips|inflation-protected/.test(c);
  if (bond) return goal === "income" ? "income" : "downside";
  if (/dividend|income/.test(c)) return "income";
  if (/growth/.test(c)) return "growth";
  if (/blend|total|broad|core|international|foreign|emerging/.test(c)) return "lowCost";
  if (/value/.test(c)) return "overall";
  return "overall";
}
