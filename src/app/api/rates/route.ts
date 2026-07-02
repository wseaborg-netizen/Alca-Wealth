/**
 * Macro rates endpoint - Fed Funds Rate, 10-year yield, 2-year yield, CPI inflation.
 * Sources: Yahoo Finance (^TNX, ^IRX, ^FVX) + FRED (Fed Funds, CPI).
 * Cached 4 hours.
 */
import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";

const CACHE_TTL = 4 * 3600;

export interface RatesData {
  fedFunds: number | null;       // Fed Funds Rate %
  yield10y: number | null;       // 10-year treasury %
  yield2y: number | null;        // 2-year treasury %
  cpiYoY: number | null;         // CPI inflation YoY %
  yieldCurve: number | null;     // 10y - 2y spread (bps)
  fetchedAt: number;
}

/** Fetch latest value from a Yahoo Finance index ticker */
async function fetchYFRate(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } };
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

/** Fetch a FRED time series CSV - returns last non-null value */
async function fetchFRED(seriesId: string): Promise<number | null> {
  try {
    const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/csv, text/plain",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split("\n");
    // Walk backwards to find last numeric value (some series have trailing ".")
    for (let i = lines.length - 1; i >= 1; i--) {
      const val = parseFloat(lines[i].split(",")[1]);
      if (!isNaN(val)) return val;
    }
    return null;
  } catch {
    return null;
  }
}

/** Compute CPI YoY from last 14 months of FRED CPIAUCSL */
async function fetchCPIYoY(): Promise<number | null> {
  try {
    const url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split("\n").slice(1); // skip header
    const vals = lines
      .map(l => ({ date: l.split(",")[0], v: parseFloat(l.split(",")[1]) }))
      .filter(x => !isNaN(x.v));
    if (vals.length < 13) return null;
    const latest = vals[vals.length - 1].v;
    const yearAgo = vals[vals.length - 13].v;
    return ((latest / yearAgo) - 1) * 100;
  } catch {
    return null;
  }
}

export async function GET() {
  const key = "rates:macro:v2";
  const cached = await cacheGet<RatesData>(key);
  if (cached) return NextResponse.json(cached);

  // Fetch all in parallel
  const [fedFunds, yield10y, yield2y, cpiYoY] = await Promise.all([
    fetchFRED("FEDFUNDS"),       // Federal Funds Rate (monthly, lags ~1mo)
    fetchYFRate("^TNX"),         // 10-year treasury yield
    fetchYFRate("^FVX"),         // 5-year (used as ~2y proxy - ^IRX is 3-mo)
    fetchCPIYoY(),               // CPI YoY inflation
  ]);

  // Also try 2-year yield directly
  const yield2yDirect = await fetchYFRate("%5ETWO"); // ^TWO
  const y2 = yield2yDirect ?? yield2y;

  const payload: RatesData = {
    fedFunds,
    yield10y,
    yield2y: y2,
    cpiYoY,
    yieldCurve: yield10y != null && y2 != null ? yield10y - y2 : null,
    fetchedAt: Date.now(),
  };

  await cacheSet(key, payload, CACHE_TTL);
  return NextResponse.json(payload);
}
