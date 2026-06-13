/**
 * Market data provider — Yahoo Finance (no API key required).
 * Covers ETFs, mutual funds, and stocks with full 5-year history.
 *
 * Interface is identical to the original FMP module — swap this file
 * to switch providers without touching any other code.
 */
import { cacheGet, cacheSet } from "./cache";

const HISTORY_TTL = 24 * 60 * 60; // 24 hours in seconds

// ── Crumb management ──────────────────────────────────────────────────────────
// Yahoo Finance requires a session crumb for quoteSummary endpoints.
// Crumb lasts multiple hours — cache it in memory, refresh on 401/403.
// On 429 (rate-limit) or other failure, quoteSummary callers return null
// and the app falls back to static data — no crash, no hang.

let _crumb: string | null = null;
let _cookies = "";
let _crumbFetchedAt = 0;
const CRUMB_TTL_MS = 4 * 3600 * 1000; // 4 hours

const YF_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchCrumb(): Promise<string> {
  // Try multiple cookie sources — finance.yahoo.com sometimes returns 0 cookies
  // in server environments, so we also try the consent page.
  const sources = [
    "https://finance.yahoo.com/",
    "https://finance.yahoo.com/markets/",
  ];

  for (const src of sources) {
    try {
      const pageRes = await fetch(src, {
        headers: {
          "User-Agent": YF_UA,
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        next: { revalidate: 0 },
        redirect: "follow",
      });
      const rawCookies = pageRes.headers.getSetCookie?.() ?? [];
      if (rawCookies.length > 0) {
        _cookies = rawCookies.map((c) => c.split(";")[0]).join("; ");
        break;
      }
    } catch {
      // try next source
    }
  }

  // Fetch crumb — if 429, throw so caller can fall back gracefully
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": YF_UA, Cookie: _cookies },
    next: { revalidate: 0 },
  });

  if (crumbRes.status === 429) throw new Error("Yahoo rate-limited (429) — skipping quoteSummary");
  if (!crumbRes.ok) throw new Error(`Crumb fetch failed: HTTP ${crumbRes.status}`);

  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.length < 3 || crumb.includes("{")) {
    throw new Error("Invalid crumb received");
  }
  _crumbFetchedAt = Date.now();
  return crumb;
}

async function getCrumb(): Promise<string> {
  const stale = Date.now() - _crumbFetchedAt > CRUMB_TTL_MS;
  if (!_crumb || stale) _crumb = await fetchCrumb();
  return _crumb;
}

// ── Throttle ──────────────────────────────────────────────────────────────────

let lastCall = 0;
const MIN_GAP_MS = 200;

async function throttle() {
  const wait = MIN_GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

// ── Low-level fetchers ────────────────────────────────────────────────────────

async function yfChart(ticker: string, params: Record<string, string>): Promise<Response> {
  await throttle();
  // Try query1 first, fall back to query2 on 429
  for (const host of ["query1", "query2"]) {
    const url = new URL(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": YF_UA },
      next: { revalidate: 0 },
    });
    if (res.status === 429 && host === "query1") continue; // retry on query2
    if (!res.ok) throw new Error(`Yahoo chart/${ticker} → HTTP ${res.status}`);
    return res;
  }
  throw new Error(`Yahoo chart/${ticker} → rate limited on both endpoints`);
}

async function yfSummary(ticker: string, modules: string): Promise<Record<string, unknown> | null> {
  await throttle();
  try {
    const crumb = await getCrumb();
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": YF_UA, Cookie: _cookies },
      next: { revalidate: 0 },
    });

    if (res.status === 429) return null; // rate-limited — caller falls back to static
    if (res.status === 401 || res.status === 403) {
      // Stale crumb — refresh and retry once
      _crumb = null;
      _crumbFetchedAt = 0;
      try {
        _crumb = await fetchCrumb();
        const url2 = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(_crumb)}`;
        const res2 = await fetch(url2, {
          headers: { "User-Agent": YF_UA, Cookie: _cookies },
          next: { revalidate: 0 },
        });
        if (!res2.ok) return null;
        const data2 = await res2.json() as { quoteSummary?: { result?: Record<string, unknown>[] } };
        return data2?.quoteSummary?.result?.[0] ?? null;
      } catch {
        return null;
      }
    }

    if (!res.ok) return null;
    const data = await res.json() as { quoteSummary?: { result?: Record<string, unknown>[] } };
    return data?.quoteSummary?.result?.[0] ?? null;
  } catch {
    return null; // any error (rate-limit, network, bad JSON) → fall back to static
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FmpHistoricalItem {
  date: string;    // YYYY-MM-DD
  adjClose: number;
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function fetchProfile(
  ticker: string
): Promise<{ name: string; mktCap: number; ipoDate: string } | null> {
  try {
    const res = await yfChart(ticker, { interval: "1d", range: "1d" });
    const data = await res.json() as { chart?: { result?: { meta?: { longName?: string; shortName?: string; firstTradeDate?: number } }[] } };
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const ipoDate = meta.firstTradeDate
      ? new Date(meta.firstTradeDate * 1000).toISOString().slice(0, 10)
      : "";
    return {
      name: meta.longName ?? meta.shortName ?? ticker,
      mktCap: 0,
      ipoDate,
    };
  } catch {
    return null;
  }
}

// ── ETF info ──────────────────────────────────────────────────────────────────

export async function fetchEtfInfo(ticker: string): Promise<{
  expenseRatio: number | null;
  aum: number | null;
  inceptionDate: string | null;
  name: string | null;
} | null> {
  const result = await yfSummary(ticker, "defaultKeyStatistics,price");
  if (!result) return null;

  const stats = result.defaultKeyStatistics as Record<string, { raw?: number }> ?? {};
  const price = result.price as Record<string, { raw?: number } | string> ?? {};

  const er = (stats.annualReportExpenseRatio as { raw?: number })?.raw ?? null;
  const aum =
    (price.marketCap as { raw?: number })?.raw ??
    (stats.totalAssets as { raw?: number })?.raw ??
    null;
  const inceptionTs = (stats.fundInceptionDate as { raw?: number })?.raw;
  const inceptionDate = inceptionTs
    ? new Date(inceptionTs * 1000).toISOString().slice(0, 10)
    : null;
  const name =
    (price as Record<string, string>).longName ??
    (price as Record<string, string>).shortName ??
    null;

  return { expenseRatio: er, aum, inceptionDate, name };
}

// ── Mutual fund info ───────────────────────────────────────────────────────────

export async function fetchMutualFundInfo(ticker: string): Promise<{
  expenseRatio: number | null;
  aum: number | null;
  inceptionDate: string | null;
} | null> {
  const result = await yfSummary(ticker, "defaultKeyStatistics,fundProfile,price");
  if (!result) return null;

  const stats = result.defaultKeyStatistics as Record<string, { raw?: number }> ?? {};
  const fund = result.fundProfile as Record<string, { raw?: number }> ?? {};
  const price = result.price as Record<string, { raw?: number }> ?? {};

  const er =
    fund.annualReportExpenseRatio?.raw ??
    stats.annualReportExpenseRatio?.raw ??
    null;
  const aum =
    price.marketCap?.raw ??
    (price as Record<string, { raw?: number }>).totalAssets?.raw ??
    stats.totalAssets?.raw ??
    null;
  const inceptionTs = stats.fundInceptionDate?.raw;
  const inceptionDate = inceptionTs
    ? new Date(inceptionTs * 1000).toISOString().slice(0, 10)
    : null;

  return { expenseRatio: er, aum, inceptionDate };
}

// ── Price history + dividends ─────────────────────────────────────────────────

export interface FmpDividendItem {
  date: string;
  amount: number;
}

const EMPTY_HISTORY = { prices: [] as FmpHistoricalItem[], dividends: [] as FmpDividendItem[], currentPrice: 0, chartName: null };

type HistoryResult = {
  prices: FmpHistoricalItem[];
  dividends: FmpDividendItem[];
  currentPrice: number;
  chartName: string | null;
};

export async function fetchHistory(ticker: string, range = "10y"): Promise<HistoryResult> {
  const cacheKey = `hist:${ticker}:${range}`;

  // 1. Check Redis / in-memory cache first — skip Yahoo entirely if hit
  const cached = await cacheGet<HistoryResult>(cacheKey);
  if (cached && cached.prices && cached.prices.length > 0) return cached;

  // 2. Try Yahoo Finance
  let res: Response;
  try {
    res = await yfChart(ticker, { interval: "1d", range, events: "dividends" });
  } catch {
    // Rate-limited or network error — return empty so metrics show "—" but app doesn't crash
    return EMPTY_HISTORY;
  }

  const data = await res.json() as {
    chart?: {
      result?: {
        timestamp?: number[];
        indicators?: { adjclose?: { adjclose?: (number | null)[] }[] };
        events?: { dividends?: Record<string, { amount: number; date: number }> };
        meta?: {
          regularMarketPrice?: number;
          longName?: string;
          shortName?: string;
          firstTradeDate?: number;
        };
      }[];
    };
  };

  const result = data?.chart?.result?.[0];
  if (!result) return EMPTY_HISTORY;

  const timestamps = result.timestamp ?? [];
  const adjCloses = result.indicators?.adjclose?.[0]?.adjclose ?? [];

  const prices: FmpHistoricalItem[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const price = adjCloses[i];
    if (!price || price <= 0) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    prices.push({ date, adjClose: price });
  }
  prices.sort((a, b) => a.date.localeCompare(b.date));

  const rawDivs = result.events?.dividends ?? {};
  const dividends: FmpDividendItem[] = Object.values(rawDivs)
    .filter((d) => d.amount > 0)
    .map((d) => ({
      date: new Date(d.date * 1000).toISOString().slice(0, 10),
      amount: d.amount,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentPrice = result.meta?.regularMarketPrice ?? prices.at(-1)?.adjClose ?? 0;
  const chartName = result.meta?.longName ?? result.meta?.shortName ?? null;

  const histResult: HistoryResult = { prices, dividends, currentPrice, chartName };

  // 3. Store in Redis (24h TTL) — future requests skip Yahoo entirely
  if (prices.length > 0) {
    await cacheSet(cacheKey, histResult, HISTORY_TTL);
  }

  return histResult;
}
