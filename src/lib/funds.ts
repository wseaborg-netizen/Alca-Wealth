/**
 * Fund data service - fetches from Yahoo Finance with async cache.
 * Returns a normalized FundRecord with profile + KPIs.
 * Server-side only.
 *
 * Data priority:
 *   1. Live Yahoo Finance (ER, AUM, inception, name)
 *   2. Static fund-meta.json fallback (for funds Yahoo doesn't cover well)
 */

import { cacheGet, cacheSet } from "./cache";
import { fetchHistory, fetchEtfInfo, fetchMutualFundInfo } from "./fmp";
import { computeKpis, type KpiResult } from "./kpi";
export type { KpiResult };
import fundMetaRaw from "../data/fund-meta.json";

// Static fallback - used only when Yahoo returns nothing
const FUND_META = fundMetaRaw as unknown as Record<string, { er: number; aum: number } | undefined>;

export interface FundRecord {
  ticker: string;
  name: string;
  vehicle: string;
  category: string;
  benchmark: string;
  expenseRatio: number | null;
  aum: number | null;
  aumFormatted: string;
  inceptionDate: string | null;
  fundAge: number | null; // years
  kpi: KpiResult;
  fetchedAt: number;
  dataSource?: string; // "live" | "fallback" - for debugging
  error?: string;
}

export const BENCHMARKS = ["SPY", "AGG", "VXUS"] as const;

function formatAum(aum: number | null): string {
  if (!aum) return "-";
  if (aum >= 1e12) return `$${(aum / 1e12).toFixed(1)}T`;
  if (aum >= 1e9)  return `$${(aum / 1e9).toFixed(1)}B`;
  if (aum >= 1e6)  return `$${(aum / 1e6).toFixed(0)}M`;
  return `$${aum.toLocaleString()}`;
}

function calcFundAge(inceptionDate: string | null): number | null {
  if (!inceptionDate) return null;
  const inc = new Date(inceptionDate);
  if (isNaN(inc.getTime())) return null;
  return Number(((Date.now() - inc.getTime()) / (365.25 * 24 * 3600 * 1000)).toFixed(1));
}

const EMPTY_KPI: KpiResult = {
  return1y: null, return3y: null, return5y: null,
  stdDev3y: null, maxDrawdown5y: null, maxDrawdown3y: null,
  sharpe3y: null, sortino3y: null, calmar3y: null, infoRatio3y: null,
  beta3y: null, alpha3y: null,
  upsideCapture3y: null, downsideCapture3y: null,
  battingAvg3y: null, ttmYield: null, divGrowth3y: null,
  rolling3y: [], stressTests: [],
};

/**
 * Fetch live fund profile (ER, AUM, inception, name) from Yahoo Finance.
 * Mutual funds use the fundProfile module; ETFs use defaultKeyStatistics.
 * Falls back to static JSON if Yahoo returns nothing useful.
 */
async function fetchLiveProfile(ticker: string, vehicle: string): Promise<{
  name: string | null;
  expenseRatio: number | null;
  aum: number | null;
  inceptionDate: string | null;
  source: string;
}> {
  const meta = FUND_META[ticker];

  try {
    const isMF = vehicle === "Mutual Fund" || vehicle === "MF";
    const live = isMF
      ? await fetchMutualFundInfo(ticker)
      : await fetchEtfInfo(ticker);

    if (live) {
      const liveName = (live as { name?: string | null }).name ?? null;
      const hasLive = liveName != null || live.aum != null || live.inceptionDate != null || live.expenseRatio != null;
      if (hasLive) {
        // Live wins for name/AUM/inception; expense ratio isn't on this plan,
        // so fall back to the curated static value.
        return {
          name: liveName,
          expenseRatio: live.expenseRatio ?? meta?.er ?? null,
          aum: live.aum ?? (meta ? meta.aum * 1e9 : null),
          inceptionDate: live.inceptionDate,
          source: "live",
        };
      }
    }
  } catch {
    // fall through to static
  }

  // Static fallback
  return {
    name: null,
    expenseRatio: meta?.er ?? null,
    aum: meta ? meta.aum * 1e9 : null,
    inceptionDate: null,
    source: meta ? "fallback" : "none",
  };
}

/** Load benchmark price history (cached). */
export async function getBenchmarkHistory(
  benchmark: string
): Promise<{ date: string; price: number }[]> {
  const cacheKey = `bench:${benchmark}`;
  const cached = await cacheGet<{ date: string; price: number }[]>(cacheKey);
  if (cached) return cached;

  const { prices } = await fetchHistory(benchmark);
  const result = prices.map((i) => ({ date: i.date, price: i.adjClose }));
  if (result.length > 0) await cacheSet(cacheKey, result);
  return result;
}

/**
 * Lightweight fund fetch for the recommend engine - 3y history only (~4× faster).
 */
export async function getRecommendFund(
  ticker: string,
  vehicle: string,
  category: string,
  benchmark: string
): Promise<FundRecord> {
  const cacheKey = `fund:rec:${ticker}`;
  const cached = await cacheGet<FundRecord>(cacheKey);
  if (cached) return cached;

  let name = ticker;

  try {
    // Fetch profile + history + benchmark in parallel
    const [profile, histResult, benchItems] = await Promise.all([
      fetchLiveProfile(ticker, vehicle),
      fetchHistory(ticker, "3y"),
      getBenchmarkHistory(benchmark),
    ]);

    if (profile.name) name = profile.name;
    else if (histResult.chartName) name = histResult.chartName;

    const fundPrices = histResult.prices.map((i) => ({ date: i.date, price: i.adjClose }));
    const kpi = computeKpis(fundPrices, benchItems, histResult.dividends, histResult.currentPrice);

    const record: FundRecord = {
      ticker, name, vehicle, category, benchmark,
      expenseRatio: profile.expenseRatio,
      aum: profile.aum,
      aumFormatted: formatAum(profile.aum),
      inceptionDate: profile.inceptionDate,
      fundAge: calcFundAge(profile.inceptionDate),
      kpi,
      fetchedAt: Date.now(),
      dataSource: profile.source,
    };

    await cacheSet(cacheKey, record, 6 * 3600);
    return record;
  } catch (err) {
    return {
      ticker, name, vehicle, category, benchmark,
      expenseRatio: null, aum: null, aumFormatted: "-",
      inceptionDate: null, fundAge: null,
      kpi: EMPTY_KPI,
      fetchedAt: Date.now(),
      error: (err as Error).message,
    };
  }
}

/** Fetch and cache a single fund with full KPIs + live metadata. */
export async function getFund(
  ticker: string,
  vehicle: string,
  category: string,
  benchmark: string
): Promise<FundRecord> {
  const cacheKey = `fund:${ticker}`;
  const cached = await cacheGet<FundRecord>(cacheKey);
  if (cached) return cached;

  let name = ticker;

  try {
    // Fetch live profile, price history, and benchmark - all parallel
    const [profile, histResult, benchItems] = await Promise.all([
      fetchLiveProfile(ticker, vehicle),
      fetchHistory(ticker),
      getBenchmarkHistory(benchmark),
    ]);

    if (profile.name) name = profile.name;
    else if (histResult.chartName) name = histResult.chartName;

    const fundPrices = histResult.prices.map((i) => ({ date: i.date, price: i.adjClose }));
    const kpi = computeKpis(fundPrices, benchItems, histResult.dividends, histResult.currentPrice);

    const record: FundRecord = {
      ticker,
      name,
      vehicle,
      category,
      benchmark,
      expenseRatio: profile.expenseRatio,
      aum: profile.aum,
      aumFormatted: formatAum(profile.aum),
      inceptionDate: profile.inceptionDate,
      fundAge: calcFundAge(profile.inceptionDate),
      kpi,
      fetchedAt: Date.now(),
      dataSource: profile.source,
    };

    await cacheSet(cacheKey, record);
    return record;
  } catch (err) {
    const record: FundRecord = {
      ticker, name, vehicle, category, benchmark,
      expenseRatio: null, aum: null, aumFormatted: "-",
      inceptionDate: null, fundAge: null,
      kpi: EMPTY_KPI,
      fetchedAt: Date.now(),
      error: (err as Error).message,
    };
    await cacheSet(cacheKey, { ...record, _ttlOverride: 3600000 });
    return record;
  }
}
