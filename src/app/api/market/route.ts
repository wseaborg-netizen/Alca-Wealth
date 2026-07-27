/**
 * Market dashboard API — live quotes + sparklines for key ETFs.
 * Provider: canonical price engine (raw close, split-adjusted, dividends excluded)
 * via getMarketQuote — the SAME date-selection every price-return surface uses.
 *
 * Tiingo has NO native `^`-index history, so the S&P 500 / Dow / Nasdaq rows use
 * clearly-labeled ETF PROXIES (SPY / DIA / QQQ). Each proxy row carries `proxy`
 * metadata (isProxy + the index it stands in for) so the UI can present it as a
 * proxy and NEVER as the native index. Cached 15 minutes; missing data → null
 * (explicit unavailable), never a fabricated value.
 */
import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { getMarketQuote } from "@/lib/market-data/marketQuote";

const CACHE_TTL = 15 * 60; // 15 min

interface Row {
  ticker: string;
  label: string;
  group: string;
  /** Present only for ETF-proxy rows so the UI can distinguish proxy from native index. */
  proxy?: { isProxy: true; of: string };
}

const WATCHLIST: Row[] = [
  { ticker: "SPY", label: "S&P 500 ETF Proxy — SPY", group: "Equity", proxy: { isProxy: true, of: "S&P 500" } },
  { ticker: "DIA", label: "Dow ETF Proxy — DIA",     group: "Equity", proxy: { isProxy: true, of: "Dow Jones Industrial Average" } },
  { ticker: "QQQ", label: "Nasdaq ETF Proxy — QQQ",  group: "Equity", proxy: { isProxy: true, of: "Nasdaq Composite" } },
  { ticker: "IWM",  label: "Russell 2000",   group: "Equity" },
  { ticker: "VT",   label: "World Stocks",   group: "Equity" },
  { ticker: "AGG",  label: "US Bonds",       group: "Fixed Income" },
  { ticker: "TLT",  label: "Long Treasury",  group: "Fixed Income" },
  { ticker: "HYG",  label: "High Yield",     group: "Fixed Income" },
  { ticker: "GLD",  label: "Gold",           group: "Alternatives" },
  { ticker: "DBC",  label: "Commodities",    group: "Alternatives" },
  { ticker: "VNQ",  label: "Real Estate",    group: "Alternatives" },
  { ticker: "VXUS", label: "Intl Stocks",    group: "Equity" },
  { ticker: "EEM",  label: "Emerg. Markets", group: "Equity" },
];

const SPARK_TICKERS = new Set(["SPY", "DIA", "QQQ"]);

export async function GET() {
  const cacheKey = "market:dashboard:v5"; // v5: canonical price engine (5D/6M periods, no fixed-session lookback)
  const cached = await cacheGet<unknown>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const results = await Promise.all(
    WATCHLIST.map(async (item) => {
      const q = await getMarketQuote(item.ticker, SPARK_TICKERS.has(item.ticker));
      // A missing/errored quote → explicit nulls (the UI shows "—"), never fabricated.
      return { ...item, ...(q ?? { price: null, change1d: null, change5d: null, change1m: null, changeYtd: null }) };
    }),
  );

  const payload = { items: results, fetchedAt: Date.now() };
  await cacheSet(cacheKey, payload, CACHE_TTL);
  return NextResponse.json(payload);
}
