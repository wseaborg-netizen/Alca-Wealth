/**
 * Client-side portfolio blending math.
 * Takes an array of {fund, weight} holdings and returns blended KPIs + chart data.
 */

import type { FundRecord } from "./market-data/fundService";
import type { KpiResult } from "./kpi";

export interface Holding {
  ticker: string;
  weight: number; // 0–100, must sum to 100
  fund: FundRecord;
}

export interface BlendedKpis {
  return1y: number | null;
  return3y: number | null;
  return5y: number | null;
  stdDev3y: number | null;
  sharpe3y: number | null;
  sortino3y: number | null;
  maxDrawdown3y: number | null;
  calmar3y: number | null;
  beta3y: number | null;
  alpha3y: number | null;
  upsideCapture3y: number | null;
  downsideCapture3y: number | null;
  ttmYield: number | null;
  expenseRatio: number | null; // weighted avg expense ratio
}

export interface BlendedChartPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}

export interface StressBlend {
  label: string;
  portfolioReturn: number;
  benchReturn: number;
}

/** Weighted average of a nullable KPI across holdings */
function wavg(holdings: Holding[], key: keyof KpiResult): number | null {
  const valid = holdings.filter(h => {
    const v = h.fund.kpi[key];
    return v != null && typeof v === "number";
  });
  if (!valid.length) return null;
  const totalW = valid.reduce((s, h) => s + h.weight, 0);
  if (totalW === 0) return null;
  return valid.reduce((s, h) => s + (h.fund.kpi[key] as number) * h.weight / totalW, 0);
}

export function blendKpis(holdings: Holding[]): BlendedKpis {
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  if (!holdings.length || totalWeight === 0) {
    return {
      return1y: null, return3y: null, return5y: null,
      stdDev3y: null, sharpe3y: null, sortino3y: null,
      maxDrawdown3y: null, calmar3y: null,
      beta3y: null, alpha3y: null,
      upsideCapture3y: null, downsideCapture3y: null,
      ttmYield: null, expenseRatio: null,
    };
  }

  // Expense ratio uses fund.expenseRatio, not kpi
  const erValid = holdings.filter(h => h.fund.expenseRatio != null);
  const erTotalW = erValid.reduce((s, h) => s + h.weight, 0);
  const expenseRatio = erTotalW > 0
    ? erValid.reduce((s, h) => s + h.fund.expenseRatio! * h.weight / erTotalW, 0)
    : null;

  return {
    return1y: wavg(holdings, "return1y"),
    return3y: wavg(holdings, "return3y"),
    return5y: wavg(holdings, "return5y"),
    stdDev3y: wavg(holdings, "stdDev3y"),
    sharpe3y: wavg(holdings, "sharpe3y"),
    sortino3y: wavg(holdings, "sortino3y"),
    maxDrawdown3y: wavg(holdings, "maxDrawdown3y"),
    calmar3y: wavg(holdings, "calmar3y"),
    beta3y: wavg(holdings, "beta3y"),
    alpha3y: wavg(holdings, "alpha3y"),
    upsideCapture3y: wavg(holdings, "upsideCapture3y"),
    downsideCapture3y: wavg(holdings, "downsideCapture3y"),
    ttmYield: wavg(holdings, "ttmYield"),
    expenseRatio,
  };
}

export function blendReturns(holdings: Holding[]): BlendedChartPoint[] {
  if (!holdings.length) return [];
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  if (totalWeight === 0) return [];

  // Find common dates across all holdings with rolling3y data
  const validHoldings = holdings.filter(h => h.fund.kpi.rolling3y.length > 0);
  if (!validHoldings.length) return [];

  const dateSets = validHoldings.map(h => new Set(h.fund.kpi.rolling3y.map(p => p.date)));
  const commonDates = [...dateSets[0]]
    .filter(d => dateSets.every(s => s.has(d)))
    .sort();

  if (commonDates.length < 2) return [];

  // Build lookup maps
  const lookups = validHoldings.map(h => {
    const map = new Map<string, { fundReturn: number; benchReturn: number }>();
    h.fund.kpi.rolling3y.forEach(p => map.set(p.date, p));
    return { holding: h, map };
  });

  return commonDates.map(date => {
    let portfolio = 0;
    let benchmark = 0;
    let usedWeight = 0;
    for (const { holding, map } of lookups) {
      const p = map.get(date);
      if (p) {
        portfolio += p.fundReturn * holding.weight;
        benchmark += p.benchReturn * holding.weight;
        usedWeight += holding.weight;
      }
    }
    return {
      date,
      portfolio: usedWeight > 0 ? portfolio / usedWeight : 0,
      benchmark: usedWeight > 0 ? benchmark / usedWeight : 0,
    };
  });
}

export function blendStressTests(holdings: Holding[]): StressBlend[] {
  if (!holdings.length) return [];
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  if (totalWeight === 0) return [];

  // Collect all stress test labels
  const allLabels = new Set<string>();
  holdings.forEach(h => h.fund.kpi.stressTests.forEach(s => allLabels.add(s.label)));

  return [...allLabels].map(label => {
    let portReturn = 0;
    let benchReturn = 0;
    let usedW = 0;
    for (const h of holdings) {
      const st = h.fund.kpi.stressTests.find(s => s.label === label);
      if (st && st.fundReturn != null && st.benchReturn != null) {
        portReturn += st.fundReturn * h.weight;
        benchReturn += st.benchReturn * h.weight;
        usedW += h.weight;
      }
    }
    return {
      label,
      portfolioReturn: usedW > 0 ? portReturn / usedW : 0,
      benchReturn: usedW > 0 ? benchReturn / usedW : 0,
    };
  });
}
