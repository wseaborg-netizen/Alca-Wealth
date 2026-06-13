/**
 * Market dashboard API — fetches live quotes for key indices/ETFs from Yahoo Finance.
 * Cached 15 minutes (short TTL for market data).
 */
import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";

const CACHE_TTL = 15 * 60; // 15 min

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

async function fetchQuote(ticker: string, includeSpark = false): Promise<QuoteResult | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
    const timestamps: number[] = result.timestamp ?? [];
    const validPairs = closes.map((c, i) => [timestamps[i], c] as [number, number])
      .filter(([, c]) => c != null && c > 0);
    if (validPairs.length < 2) return null;

    const price = validPairs[validPairs.length - 1][1];
    const prev1d = validPairs[validPairs.length - 2]?.[1] ?? price;

    // 1 week ago (~5 trading days)
    const prev1w = validPairs[Math.max(0, validPairs.length - 6)]?.[1] ?? price;
    // 1 month ago (~21 trading days)
    const prev1m = validPairs[Math.max(0, validPairs.length - 22)]?.[1] ?? price;
    // YTD — find first close of the year
    const nowYear = new Date().getFullYear();
    const ytdPair = validPairs.find(([ts]) => new Date(ts * 1000).getFullYear() === nowYear);
    const prevYtd = ytdPair?.[1] ?? validPairs[0][1];

    // Last ~130 trading days (~6 months) for sparkline
    const spark6m = includeSpark
      ? validPairs.slice(-132).map(([, v]) => v)
      : undefined;

    return {
      price,
      change1d: (price - prev1d) / prev1d,
      change1w: (price - prev1w) / prev1w,
      change1m: (price - prev1m) / prev1m,
      changeYtd: (price - prevYtd) / prevYtd,
      ...(spark6m ? { spark6m } : {}),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const cacheKey = "market:dashboard:v2";
  const cached = await cacheGet<unknown>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const results = await Promise.all(
    WATCHLIST.map(async (item) => {
      const q = await fetchQuote(item.ticker, ["^GSPC", "^DJI", "^IXIC"].includes(item.ticker));
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
