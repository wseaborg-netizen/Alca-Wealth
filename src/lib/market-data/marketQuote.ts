/**
 * Provider-neutral market quote service — SERVER-SIDE ONLY.
 *
 * Computes a dashboard/desk quote (latest value + 1D/5D/1M/YTD price change +
 * optional 6-month sparkline) from the canonical Tiingo provider's RAW history.
 *
 * There is NO separate change-window math here: the periods come straight from
 * the ONE canonical price engine (src/lib/perf/canonicalPricePerformance.ts), the
 * exact same date-selection Firm Funds uses. A 1M quote from this service and a 1M
 * Firm-Funds figure for the same ticker/as-of are therefore identical (Nasdaq-style
 * PRICE change, dividends excluded — never total return, never a fixed 21-session
 * lookback).
 *
 * Instrument type drives the series: ETFs quote RAW market price; mutual funds
 * quote RAW NAV (the caller passes the vehicle-derived kind — never forced to
 * "price"). Contract returns a MarketQuote on success or `null` when data is
 * missing/insufficient or the provider errors. Nulls are NEVER cached, so a
 * transient failure retries next time. No fallback, no synthetic data.
 *
 * Index note: Tiingo has no native `^`-index history. Dashboard index rows use
 * clearly-labeled ETF proxies (SPY/DIA/QQQ); this service quotes those ETF
 * symbols and the caller labels them as proxies (never as the native index).
 */
import { cacheGet, cacheSet, coalesce } from "@/lib/cache";
import { createTiingoProvider } from "@/lib/market-data";
import type { TokenContext, MarketDataProvider, PriceSeriesKind } from "@/lib/market-data";
import { canonicalPricePerformance, type SeriesBasis } from "@/lib/perf/canonicalPricePerformance";

let _provider: MarketDataProvider | null = null;
const tiingo = (): MarketDataProvider => (_provider ??= createTiingoProvider());
/** TEST ONLY — inject a fake provider. Never used by production code paths. */
export function __setProviderForTests(p: MarketDataProvider | null): void { _provider = p; }
const INTERNAL: TokenContext = { kind: "internal" };
const SCOPE = "internal";
const QUOTE_TTL = 15 * 60; // 15 minutes (market data)

/** Same shape the prior market quote produced (drop-in for the callers). */
export interface MarketQuote {
  price: number;
  change1d: number;
  change5d: number;   // five completed trading sessions (canonical 5D)
  change1m: number;   // one calendar month (canonical 1M — NOT a fixed 21-session lookback)
  changeYtd: number;
  spark6m?: number[];
}

export interface QuoteOptions {
  includeSpark?: boolean;
  /** Instrument series kind from the canonical universe. Mutual funds → "nav". */
  kind?: PriceSeriesKind;
}

const basisForKind = (kind: PriceSeriesKind): SeriesBasis => (kind === "nav" ? "nav" : "market_price");

function yearsAgoISO(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/**
 * Quote for a dashboard/desk symbol. MarketQuote on success, `null` on
 * missing/insufficient/errored data. Cached 15m (successes only); concurrent
 * identical requests coalesce. Scope id is the credential context, never a token.
 * Cache identity includes the methodology version (cpp = canonical price perf) and
 * the series kind, so a pre-change (21-session / adjusted) value can never serve.
 */
export async function getMarketQuote(symbol: string, options: QuoteOptions | boolean = {}): Promise<MarketQuote | null> {
  // Back-compat: a boolean second arg is the old `includeSpark` flag.
  const opts: QuoteOptions = typeof options === "boolean" ? { includeSpark: options } : options;
  const includeSpark = opts.includeSpark ?? false;
  const kind: PriceSeriesKind = opts.kind ?? "price";
  const key = `td:quote:cpp:${SCOPE}:${symbol}:${kind}:${includeSpark ? "s" : "n"}`;
  const cached = await cacheGet<MarketQuote>(key);
  if (cached) return cached;

  return coalesce(key, async () => {
    const again = await cacheGet<MarketQuote>(key);
    if (again) return again;

    const r = await tiingo().getPriceHistory(symbol, INTERNAL, { kind, startDate: yearsAgoISO(1) });
    if (!r.ok) return null; // provider error → explicit null, NOT cached (retryable)

    // RAW close/NAV only → the ONE canonical price engine. The visible price +
    // change windows are Nasdaq-style PRICE change (dividends excluded), identical
    // to every other price-return surface.
    const obs = r.data.bars
      .filter((b) => b.close != null && (b.close as number) > 0)
      .map((b) => ({ date: b.date, rawClose: b.close as number, splitFactor: b.splitFactor }));
    const px = canonicalPricePerformance(obs, basisForKind(kind));

    const c1d = px.periods["1D"].priceChange;
    const c5d = px.periods["5D"].priceChange;
    const c1m = px.periods["1M"].priceChange;
    const cYtd = px.periods["YTD"].priceChange;
    // A quote needs at least the daily window; other windows may be Unavailable on
    // short history and surface as 0 only when the engine genuinely has no start.
    if (px.latestPrice == null || c1d == null) return null; // insufficient → null, NOT cached

    const q: MarketQuote = {
      price: px.latestPrice,
      change1d: c1d,
      change5d: c5d ?? c1d,
      change1m: c1m ?? c1d,
      changeYtd: cYtd ?? c1d,
      ...(includeSpark ? { spark6m: px.periods["6M"].spark ?? undefined } : {}),
    };
    await cacheSet(key, q, QUOTE_TTL); // only real, successful quotes are cached
    return q;
  });
}
