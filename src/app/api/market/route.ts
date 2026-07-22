/**
 * Market dashboard API - live quotes + sparklines for key indices/ETFs.
 * Provider: Financial Modeling Prep (quote + light EOD history) — verified to
 * cover ^GSPC / ^DJI / ^IXIC directly, so no fallback provider is needed.
 * Cached 15 minutes (short TTL for market data), shared with the provider layer.
 */
import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { fetchMarketQuoteFmp, QUOTE_TTL } from "@/lib/fmp";

const CACHE_TTL = QUOTE_TTL; // 15 min

const WATCHLIST = [
  { ticker: "^GSPC", label: "S&P 500",        group: "Equity" },
  { ticker: "^DJI",  label: "Dow Jones",       group: "Equity" },
  { ticker: "^IXIC", label: "Nasdaq",          group: "Equity" },
  { ticker: "IWM",  label: "Russell 2000",    group: "Equity" },
  { ticker: "VT",   label: "World Stocks",    group: "Equity" },
  { ticker: "AGG",  label: "US Bonds",        group: "Fixed Income" },
  { ticker: "TLT",  label: "Long Treasury",   group: "Fixed Income" },
  { ticker: "HYG",  label: "High Yield",      group: "Fixed Income" },
  { ticker: "GLD",  label: "Gold",            group: "Alternatives" },
  { ticker: "DBC",  label: "Commodities",     group: "Alternatives" },
  { ticker: "VNQ",  label: "Real Estate",     group: "Alternatives" },
  { ticker: "VXUS", label: "Intl Stocks",     group: "Equity" },
  { ticker: "EEM",  label: "Emerg. Markets",  group: "Equity" },
];

interface QuoteResult {
  price: number; change1d: number; change1w: number; change1m: number; changeYtd: number;
  spark30d?: number[]; // last 30 closing prices (for SPY sparkline)
}


export async function GET() {
  const cacheKey = "market:dashboard:v3"; // v3: FMP-first provider
  const cached = await cacheGet<unknown>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const results = await Promise.all(
    WATCHLIST.map(async (item) => {
      const includeSpark = ["^GSPC", "^DJI", "^IXIC"].includes(item.ticker);
      const q = await fetchMarketQuoteFmp(item.ticker, includeSpark);
      return { ...item, ...(q ?? { price: null, change1d: null, change1w: null, change1m: null, changeYtd: null }) };
    })
  );

  const payload = {
    items: results,
    fetchedAt: Date.now(),
  };

  await cacheSet(cacheKey, payload, CACHE_TTL);
  return NextResponse.json(payload);
}
