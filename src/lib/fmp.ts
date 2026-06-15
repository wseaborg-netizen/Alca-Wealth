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

/** GET helper — returns parsed JSON or null on any failure (never throws). */
async function fmpGet<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  if (!ensureKey()) return null;
  try {
    await throttle();
    const url = new URL(`${FMP_BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("apikey", FMP_KEY);
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
      console.warn(`[fmp] ${path} → HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    // FMP returns { "Error Message": "..." } on plan/limit errors
    if (json && typeof json === "object" && "Error Message" in json) {
      console.warn(`[fmp] ${path} → ${(json as Record<string, string>)["Error Message"]}`);
      return null;
    }
    return json as T;
  } catch (err) {
    console.warn(`[fmp] ${path} → ${err instanceof Error ? err.message : "error"}`);
    return null;
  }
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

  // 3. Prices (adjusted close)
  const hist = await fmpGet<{ historical?: Array<{ date: string; adjClose?: number; close?: number }> }>(
    `historical-price-full/${encodeURIComponent(ticker)}`, { from },
  );
  const rawPrices = hist?.historical ?? [];
  if (rawPrices.length === 0) return EMPTY_HISTORY;

  const prices: FmpHistoricalItem[] = rawPrices
    .map((p) => ({ date: p.date, adjClose: p.adjClose ?? p.close ?? 0 }))
    .filter((p) => p.adjClose > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (prices.length === 0) return EMPTY_HISTORY;

  // 4. Dividends (separate endpoint; best-effort)
  const divData = await fmpGet<{ historical?: Array<{ date: string; dividend?: number; adjDividend?: number }> }>(
    `historical-price-full/stock_dividend/${encodeURIComponent(ticker)}`,
  );
  const dividends: FmpDividendItem[] = (divData?.historical ?? [])
    .map((d) => ({ date: d.date, amount: d.adjDividend ?? d.dividend ?? 0 }))
    .filter((d) => d.amount > 0 && d.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentPrice = prices.at(-1)?.adjClose ?? 0;

  const histResult: HistoryResult = { prices, dividends, currentPrice, chartName: null };

  // 5. Cache (24h) so each ticker hits FMP at most once a day
  if (prices.length > 0) await cacheSet(cacheKey, histResult, HISTORY_TTL);

  return histResult;
}
