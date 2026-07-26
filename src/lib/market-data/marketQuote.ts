/**
 * Provider-neutral market quote service — SERVER-SIDE ONLY.
 *
 * Computes a dashboard quote (latest value + 1D/1W/1M/YTD change + optional
 * sparkline) from the canonical Tiingo provider's ADJUSTED daily history. The
 * change-window math is the same as the prior provider path — only the data source
 * (Tiingo, adjusted values + normalized dates) changed.
 *
 * Contract matches the prior quote: returns a MarketQuote on success or `null`
 * when data is missing/insufficient or the provider errors (an explicit
 * unavailable state — the UI shows "—"). Nulls are NEVER cached, so an
 * unauthorized/rate-limited/transient failure retries next time. No
 * fallback, no synthetic data, no zeroed quote.
 *
 * Index note: Tiingo has no native `^`-index history. Dashboard index rows use
 * clearly-labeled ETF proxies (SPY/DIA/QQQ); this service quotes those ETF
 * symbols and the caller labels them as proxies (never as the native index).
 */
import { cacheGet, cacheSet, coalesce } from "@/lib/cache";
import { createTiingoProvider } from "@/lib/market-data";
import type { TokenContext, MarketDataProvider } from "@/lib/market-data";

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
  change1w: number;
  change1m: number;
  changeYtd: number;
  spark6m?: number[];
}

function yearsAgoISO(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/** Change windows + sparkline from an ascending adjusted-price series (unchanged math). */
function windowsFromSeries(asc: number[], dates: string[], includeSpark: boolean): MarketQuote | null {
  if (asc.length < 2) return null;
  const price = asc[asc.length - 1];
  const at = (backFromEnd: number) => asc[Math.max(0, asc.length - 1 - backFromEnd)] ?? price;
  const prev1d = at(1);
  const prev1w = at(5);
  const prev1m = at(21);
  const nowYear = new Date().getFullYear();
  const ytdIdx = dates.findIndex((d) => new Date(d).getFullYear() === nowYear);
  const prevYtd = ytdIdx >= 0 ? asc[ytdIdx] : asc[0];
  return {
    price,
    change1d: (price - prev1d) / prev1d,
    change1w: (price - prev1w) / prev1w,
    change1m: (price - prev1m) / prev1m,
    changeYtd: (price - prevYtd) / prevYtd,
    ...(includeSpark ? { spark6m: asc.slice(-132) } : {}),
  };
}

/**
 * Quote for a dashboard symbol (an ETF or ETF proxy). MarketQuote on success,
 * `null` on missing/insufficient/errored data. Cached 15m (successes only);
 * concurrent identical requests coalesce. Scope id is the credential context,
 * never a token.
 */
export async function getMarketQuote(symbol: string, includeSpark = false): Promise<MarketQuote | null> {
  const key = `td:quote:${SCOPE}:${symbol}:${includeSpark ? "s" : "n"}`;
  const cached = await cacheGet<MarketQuote>(key);
  if (cached) return cached;

  return coalesce(key, async () => {
    const again = await cacheGet<MarketQuote>(key);
    if (again) return again;

    const r = await tiingo().getPriceHistory(symbol, INTERNAL, { kind: "price", startDate: yearsAgoISO(1) });
    if (!r.ok) return null; // provider error → explicit null, NOT cached (retryable)

    // Adjusted close only — never mix in raw close (would distort change windows).
    const asc = r.data.bars
      .map((b) => ({ date: b.date, price: b.adjClose }))
      .filter((p): p is { date: string; price: number } => p.price != null && p.price > 0);
    const q = windowsFromSeries(asc.map((p) => p.price), asc.map((p) => p.date), includeSpark);
    if (!q) return null; // insufficient history → null, NOT cached

    await cacheSet(key, q, QUOTE_TTL); // only real, successful quotes are cached
    return q;
  });
}
