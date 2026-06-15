/**
 * Market data provider — Financial Modeling Prep (keyed API).
 *
 * Why keyed instead of scraping Yahoo: a real API with a key isn't IP-blocked
 * from Vercel the way Yahoo's unofficial endpoints are (which 429'd every
 * request and left the whole app showing "—"). Set FMP_API_KEY in the env.
 *
 * Interface is identical to the previous module — same exported functions and
 * return shapes — so no other file changes when swapping providers.
 *
 * Free-tier notes: ETFs and stocks are well covered; some mutual funds and
 * expense-ratio/AUM fields may be premium-only and will gracefully return null
 * (those cells show "—", but prices/returns/charts populate). Results are cached
 * in Redis for 24h, so each ticker hits FMP at most once a day.
 */
import { cacheGet, cacheSet } from "./cache";

const HISTORY_TTL = 24 * 60 * 60; // 24 hours
const INFO_TTL    = 24 * 60 * 60;

const FMP_KEY  = process.env.FMP_API_KEY ?? "";
const FMP_BASE = "https://financialmodelingprep.com/api/v3";

let warnedNoKey = false;
function ensureKey(): boolean {
  if (!FMP_KEY) {
    if (!warnedNoKey) {
      console.warn("[fmp] FMP_API_KEY is not set — market data will be empty.");
      warnedNoKey = true;
    }
    return false;
  }
  return true;
}

// ── Throttle (stay polite to the free tier) ───────────────────────────────────
let lastCall = 0;
const MIN_GAP_MS = 120;
async function throttle() {
  const wait = MIN_GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

/** GET helper for the legacy v3 base — returns parsed JSON or null (never throws). */
async function fmpGet<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const url = new URL(`${FMP_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return fmpFetchJson(url.toString()) as Promise<T | null>;
}

/** Fetch any FMP URL (appends apikey). Returns parsed JSON or null on any failure. */
async function fmpFetchJson(url: string): Promise<unknown | null> {
  if (!ensureKey()) return null;
  const label = url.replace(/https:\/\/[^/]+\//, "").split("?")[0];
  try {
    await throttle();
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}apikey=${FMP_KEY}`, { next: { revalidate: 0 } });
    if (!res.ok) {
      console.warn(`[fmp] ${label} → HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    // FMP returns { "Error Message": "..." } on plan/limit errors
    if (json && typeof json === "object" && !Array.isArray(json) && "Error Message" in json) {
      console.warn(`[fmp] ${label} → ${(json as Record<string, string>)["Error Message"]}`);
      return null;
    }
    return json;
  } catch (err) {
    console.warn(`[fmp] ${label} → ${err instanceof Error ? err.message : "error"}`);
    return null;
  }
}

/** Normalize FMP responses that come either as a flat array or { historical: [...] }. */
function asArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  const h = (data as { historical?: unknown } | null)?.historical;
  return Array.isArray(h) ? (h as Record<string, unknown>[]) : [];
}

// ── Types (unchanged) ─────────────────────────────────────────────────────────

export interface FmpHistoricalItem {
  date: string;    // YYYY-MM-DD
  adjClose: number;
}

export interface FmpDividendItem {
  date: string;
  amount: number;
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function fetchProfile(
  ticker: string,
): Promise<{ name: string; mktCap: number; ipoDate: string } | null> {
  const rows = await fmpGet<Array<{ companyName?: string; mktCap?: number; ipoDate?: string }>>(
    `profile/${encodeURIComponent(ticker)}`,
  );
  const p = rows?.[0];
  if (!p) return null;
  return {
    name: p.companyName ?? ticker,
    mktCap: p.mktCap ?? 0,
    ipoDate: p.ipoDate ?? "",
  };
}

// ── ETF info ──────────────────────────────────────────────────────────────────

export async function fetchEtfInfo(ticker: string): Promise<{
  expenseRatio: number | null;
  aum: number | null;
  inceptionDate: string | null;
  name: string | null;
} | null> {
  const cacheKey = `etfinfo:${ticker}`;
  const cached = await cacheGet<{ expenseRatio: number | null; aum: number | null; inceptionDate: string | null; name: string | null }>(cacheKey);
  if (cached) return cached;

  // etf-info carries expenseRatio/AUM (may be premium → null); profile is the fallback for name.
  const info = await fmpGet<Array<{ expenseRatio?: number; assetsUnderManagement?: number; aum?: number; inceptionDate?: string; name?: string }>>(
    `etf-info`, { symbol: ticker },
  );
  const row = info?.[0];

  let result: { expenseRatio: number | null; aum: number | null; inceptionDate: string | null; name: string | null } | null = null;
  if (row) {
    result = {
      // FMP reports expense ratio as a percent (e.g. 0.03 == 0.03%); the app expects a fraction
      expenseRatio: row.expenseRatio != null ? row.expenseRatio : null,
      aum: row.assetsUnderManagement ?? row.aum ?? null,
      inceptionDate: row.inceptionDate ?? null,
      name: row.name ?? null,
    };
  }

  if (result) await cacheSet(cacheKey, result, INFO_TTL);
  return result;
}

// ── Mutual fund info ───────────────────────────────────────────────────────────

export async function fetchMutualFundInfo(ticker: string): Promise<{
  expenseRatio: number | null;
  aum: number | null;
  inceptionDate: string | null;
} | null> {
  // FMP exposes fund metadata through the same etf-info endpoint for many funds.
  const info = await fetchEtfInfo(ticker);
  if (!info) return null;
  return { expenseRatio: info.expenseRatio, aum: info.aum, inceptionDate: info.inceptionDate };
}

// ── Price history + dividends ─────────────────────────────────────────────────

const EMPTY_HISTORY = { prices: [] as FmpHistoricalItem[], dividends: [] as FmpDividendItem[], currentPrice: 0, chartName: null };

type HistoryResult = {
  prices: FmpHistoricalItem[];
  dividends: FmpDividendItem[];
  currentPrice: number;
  chartName: string | null;
};

function yearsAgoISO(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export async function fetchHistory(ticker: string, range = "10y"): Promise<HistoryResult> {
  const cacheKey = `hist:${ticker}:${range}`;

  // 1. Cache first — skip the API entirely on a hit
  const cached = await cacheGet<HistoryResult>(cacheKey);
  if (cached && cached.prices && cached.prices.length > 0) return cached;

  // 2. Resolve the "from" date from the requested range (e.g. "10y", "5y", "1y")
  const yrs = parseInt(range) || 10;
  const from = yearsAgoISO(yrs);

  const T = encodeURIComponent(ticker);

  // 3. Prices — try FMP's current ("stable") endpoint first, then the legacy v3 one.
  //    Free keys were migrated to /stable, which is why /api/v3/historical-price-full
  //    returns nothing for newer accounts. Both shapes are normalized by asArray().
  const priceUrls = [
    `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${T}&from=${from}`,
    `https://financialmodelingprep.com/api/v3/historical-price-full/${T}?from=${from}`,
  ];
  let rawPrices: Record<string, unknown>[] = [];
  for (const url of priceUrls) {
    rawPrices = asArray(await fmpFetchJson(url));
    if (rawPrices.length > 0) break;
  }
  if (rawPrices.length === 0) return EMPTY_HISTORY;

  const prices: FmpHistoricalItem[] = rawPrices
    .map((p) => ({
      date: String(p.date).slice(0, 10),
      adjClose: Number(p.adjClose ?? p.close ?? p.price ?? 0),
    }))
    .filter((p) => p.adjClose > 0 && p.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (prices.length === 0) return EMPTY_HISTORY;

  // 4. Dividends — current endpoint then legacy (best-effort; powers TTM yield).
  const divUrls = [
    `https://financialmodelingprep.com/stable/dividends?symbol=${T}`,
    `https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/${T}`,
  ];
  let rawDivs: Record<string, unknown>[] = [];
  for (const url of divUrls) {
    rawDivs = asArray(await fmpFetchJson(url));
    if (rawDivs.length > 0) break;
  }
  const dividends: FmpDividendItem[] = rawDivs
    .map((d) => ({ date: String(d.date).slice(0, 10), amount: Number(d.adjDividend ?? d.dividend ?? 0) }))
    .filter((d) => d.amount > 0 && d.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentPrice = prices.at(-1)?.adjClose ?? 0;

  const histResult: HistoryResult = { prices, dividends, currentPrice, chartName: null };

  // 5. Cache (24h) so each ticker hits FMP at most once a day
  if (prices.length > 0) await cacheSet(cacheKey, histResult, HISTORY_TTL);

  return histResult;
}
