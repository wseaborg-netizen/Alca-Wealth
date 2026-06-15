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

const FMP_KEY = process.env.FMP_API_KEY ?? "";
const STABLE  = "https://financialmodelingprep.com/stable";

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
  const rows = await fmpFetchJson(`${STABLE}/profile?symbol=${encodeURIComponent(ticker)}`);
  const p = Array.isArray(rows) ? (rows[0] as Record<string, unknown>) : null;
  if (!p) return null;
  return {
    name: (p.companyName as string) ?? ticker,
    mktCap: (p.marketCap as number) ?? 0,
    ipoDate: (p.ipoDate as string) ?? "",
  };
}

// ── ETF info ──────────────────────────────────────────────────────────────────
// Note: this plan's etf-info endpoint is empty, so the live expense ratio isn't
// available — it comes back null and the curated static value (FUND_META) is used
// in fetchLiveProfile. We still pull live name + AUM (market cap) from /profile.

export async function fetchEtfInfo(ticker: string): Promise<{
  expenseRatio: number | null;
  aum: number | null;
  inceptionDate: string | null;
  name: string | null;
} | null> {
  const cacheKey = `etfinfo:${ticker}`;
  const cached = await cacheGet<{ expenseRatio: number | null; aum: number | null; inceptionDate: string | null; name: string | null }>(cacheKey);
  if (cached) return cached;

  const rows = await fmpFetchJson(`${STABLE}/profile?symbol=${encodeURIComponent(ticker)}`);
  const p = Array.isArray(rows) ? (rows[0] as Record<string, unknown>) : null;
  if (!p) return null;

  const result = {
    expenseRatio: null,                              // not exposed on this plan → static fallback fills it
    aum: (p.marketCap as number) ?? null,
    inceptionDate: (p.ipoDate as string) ?? null,
    name: (p.companyName as string) ?? null,
  };

  await cacheSet(cacheKey, result, INFO_TTL);
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

  // 3. Prices — FMP "stable" EOD endpoint (returns OHLCV; we use close).
  const rawPrices = asArray(
    await fmpFetchJson(`${STABLE}/historical-price-eod/full?symbol=${T}&from=${from}`),
  );
  if (rawPrices.length === 0) return EMPTY_HISTORY;

  const prices: FmpHistoricalItem[] = rawPrices
    .map((p) => ({
      date: String(p.date).slice(0, 10),
      adjClose: Number(p.adjClose ?? p.close ?? p.price ?? 0),
    }))
    .filter((p) => p.adjClose > 0 && p.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (prices.length === 0) return EMPTY_HISTORY;

  // 4. Dividends (best-effort; powers TTM yield).
  const rawDivs = asArray(await fmpFetchJson(`${STABLE}/dividends?symbol=${T}`));
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
