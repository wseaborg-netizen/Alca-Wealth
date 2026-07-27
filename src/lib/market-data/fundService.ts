/**
 * Tiingo-backed fund data service — SERVER-SIDE ONLY.
 *
 * The provider-neutral migration seam for the Research / Analysis / Screener /
 * Similar Funds / Comparison workflows. Canonical per-fund record surface
 * (getFund / getRecommendFund / getBenchmarkHistory) used by every research and
 * portfolio route.
 *
 * Data policy (final):
 *  - Price / NAV history + distributions: canonical Tiingo provider ONLY.
 *    No fallback, no fixtures, no synthetic values.
 *  - Security type / vehicle → price-vs-NAV `kind`: from the caller's CANONICAL
 *    universe classification (never guessed from Tiingo metadata or ticker shape).
 *  - Expense ratio: curated static src/data/fund-meta.json (a verified source the
 *    market-data provider does not expose) — carried through unchanged.
 *  - AUM: Unavailable (Tiingo has none; no provider-derived AUM is retained).
 *  - Inception date: Unavailable (no verified source). Tiingo `startDate` is a
 *    coverage start, never substituted for inception.
 *  - KPIs: computed by the UNCHANGED kpi engine from adjusted prices + dividends.
 *  - Provider failure ⇒ an explicit error record (never valid empty financials);
 *    error records are NOT cached, so a later request can retry.
 */
import { cacheGet, cacheSet, coalesce } from "@/lib/cache";
import { computeKpis, EMPTY_PERIOD, type KpiResult } from "@/lib/kpi";
import { NAME_BY_TICKER } from "@/lib/universe";
import { createTiingoProvider } from "@/lib/market-data";
import type { TokenContext, PriceSeriesKind, MarketDataProvider } from "@/lib/market-data";
import fundMetaRaw from "@/data/fund-meta.json";

export type { KpiResult };

/**
 * ALCA-owned per-fund record: identity + normalized KPIs. Provider-neutral —
 * no provider response fields. AUM is always Unavailable (`null`); inception is
 * Unavailable (`null`); `dataSource` is the provider that supplied history.
 */
export interface FundRecord {
  ticker: string;
  name: string;
  vehicle: string;
  category: string;
  benchmark: string;
  expenseRatio: number | null; // curated static source (not a provider field)
  aum: number | null;          // Unavailable (no verified source)
  aumFormatted: string;
  inceptionDate: string | null; // Unavailable (coverage start is never inception)
  fundAge: number | null;
  kpi: KpiResult;
  fetchedAt: number;
  dataSource?: string;
  error?: string;
}

const FUND_META = fundMetaRaw as unknown as Record<string, { er: number; aum: number } | undefined>;

// One internal-context provider for the whole app process (no BYOK yet), created
// lazily. A created provider performs no I/O until a method is called.
let _provider: MarketDataProvider | null = null;
const tiingo = (): MarketDataProvider => (_provider ??= createTiingoProvider());
/** TEST ONLY — inject a fake provider. Never used by production code paths. */
export function __setProviderForTests(p: MarketDataProvider | null): void { _provider = p; }
const INTERNAL: TokenContext = { kind: "internal" };
/** Safe credential-scope id for cache keys — the CONTEXT KIND, never the token. */
const SCOPE = "internal";
const HISTORY_TTL = 24 * 60 * 60; // 24h fund-record cache

export const BENCHMARKS = ["SPY", "AGG", "VXUS"] as const;

/**
 * Fallback vehicle guess for a ticker NOT in the canonical universe (US open-end
 * mutual funds use 5-char symbols ending in X). Callers pass the verified vehicle
 * for known funds; this only covers unknown tickers.
 */
export function inferVehicle(ticker: string): "ETF" | "Mutual Fund" {
  return /^[A-Z]{4}X$/.test(ticker.toUpperCase()) ? "Mutual Fund" : "ETF";
}

/** Canonical vehicle → provider series kind. Mutual funds use NAV history. */
function kindForVehicle(vehicle: string): PriceSeriesKind {
  return vehicle === "Mutual Fund" || vehicle === "MF" ? "nav" : "price";
}

function yearsAgoISO(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

const EMPTY_KPI: KpiResult = {
  return1y: null, return3y: null, return5y: null,
  stdDev3y: null, maxDrawdown5y: null, maxDrawdown3y: null,
  sharpe3y: null, sortino3y: null, calmar3y: null, infoRatio3y: null,
  beta3y: null, alpha3y: null,
  upsideCapture3y: null, downsideCapture3y: null,
  battingAvg3y: null, ttmYield: null, divGrowth3y: null,
  rolling3y: [], stressTests: [],
  cumReturn: { "1Y": null, "3Y": null, "5Y": null, "10Y": null },
  priceChange: { "1Y": null, "3Y": null, "5Y": null, "10Y": null },
  periods: { "1Y": { ...EMPTY_PERIOD }, "3Y": { ...EMPTY_PERIOD }, "5Y": { ...EMPTY_PERIOD }, "10Y": { ...EMPTY_PERIOD } },
};

function staticName(ticker: string): string {
  return NAME_BY_TICKER.get(ticker.toUpperCase()) ?? ticker.toUpperCase();
}

/** Build the AUM-unavailable, inception-unavailable base record fields. */
function baseRecord(ticker: string, vehicle: string, category: string, benchmark: string): Omit<FundRecord, "kpi" | "fetchedAt"> {
  return {
    ticker: ticker.toUpperCase(),
    name: staticName(ticker),
    vehicle,
    category,
    benchmark,
    expenseRatio: FUND_META[ticker.toUpperCase()]?.er ?? null, // verified static source
    aum: null,                 // Unavailable — Tiingo has no AUM; none retained
    aumFormatted: "Unavailable",
    inceptionDate: null,       // Unavailable — no verified inception source
    fundAge: null,             // derived from inception → unavailable
    dataSource: "tiingo",
  };
}

/** Benchmark price series (SPY/AGG/VXUS — all ETFs), cached; [] on failure. */
export async function getBenchmarkHistory(benchmark: string): Promise<{ date: string; price: number }[]> {
  const key = `td:bench:${SCOPE}:${benchmark}`;
  const cached = await cacheGet<{ date: string; price: number }[]>(key);
  if (cached) return cached;
  return coalesce(key, async () => {
    const again = await cacheGet<{ date: string; price: number }[]>(key);
    if (again) return again;
    const r = await tiingo().getPriceHistory(benchmark, INTERNAL, { kind: "price", startDate: yearsAgoISO(10) });
    if (!r.ok) return []; // failure → empty; NEVER cached, so it can retry
    // Total-return basis: ADJUSTED close only — never substitute raw close (would
    // mix adjusted + raw within one series and distort returns).
    const series = r.data.bars
      .map((b) => ({ date: b.date, price: b.adjClose }))
      .filter((p): p is { date: string; price: number } => p.price != null && p.price > 0);
    if (series.length > 0) await cacheSet(key, series, HISTORY_TTL);
    return series;
  });
}

async function getFundData(
  ticker: string, vehicle: string, category: string, benchmark: string, range: "3y" | "10y",
): Promise<FundRecord> {
  const norm = ticker.toUpperCase();
  const kind = kindForVehicle(vehicle);
  const key = `td:fund:${SCOPE}:${norm}:${range}:${kind}`;
  const cached = await cacheGet<FundRecord>(key);
  if (cached) return cached;

  return coalesce(key, async () => {
    const again = await cacheGet<FundRecord>(key);
    if (again) return again;

    const startDate = yearsAgoISO(range === "3y" ? 3 : 10);
    const [series, benchItems] = await Promise.all([
      tiingo().getPriceSeries(norm, INTERNAL, { kind, startDate }),
      getBenchmarkHistory(benchmark),
    ]);

    // Provider failure → explicit error record (NOT cached — allow retry).
    if (!series.ok) {
      return { ...baseRecord(norm, vehicle, category, benchmark), kpi: EMPTY_KPI, fetchedAt: Date.now(), error: series.error.category };
    }

    // Total-return basis: ADJUSTED close only (adjClose already incorporates
    // distributions + splits). Dividends below feed ONLY income metrics
    // (ttmYield / divGrowth) — never added to returns, so no double counting.
    const fundPrices = series.data.history.bars
      .map((b) => ({ date: b.date, price: b.adjClose }))
      .filter((p): p is { date: string; price: number } => p.price != null && p.price > 0);
    const dividends = series.data.distributions.distributions.map((d) => ({ date: d.exDate, amount: d.amount }));
    const currentPrice = fundPrices.at(-1)?.price ?? 0;

    // PRIMARY price-change metric uses RAW close + split factor (dividends excluded).
    const rawDaily = series.data.history.bars.map((b) => ({ date: b.date, close: b.close, splitFactor: b.splitFactor }));

    // Total-return/risk engine unchanged (adjusted history); priceChange added from raw closes.
    const kpi = computeKpis(fundPrices, benchItems, dividends, currentPrice, rawDaily);

    const record: FundRecord = { ...baseRecord(norm, vehicle, category, benchmark), kpi, fetchedAt: Date.now() };
    await cacheSet(key, record, HISTORY_TTL);
    return record;
  });
}

/** Full-depth (10y) fund record — Fund Analysis, Comparison, Screener candidates. */
export function getFund(ticker: string, vehicle: string, category: string, benchmark: string): Promise<FundRecord> {
  return getFundData(ticker, vehicle, category, benchmark, "10y");
}

/** Lighter (3y) fund record — Similar Funds / peer scans (faster, same shape). */
export function getRecommendFund(ticker: string, vehicle: string, category: string, benchmark: string): Promise<FundRecord> {
  return getFundData(ticker, vehicle, category, benchmark, "3y");
}
