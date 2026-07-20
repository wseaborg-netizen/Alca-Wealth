/**
 * Market & fund data provider layer — FMP-first, with narrow fallbacks.
 *
 * ── Provider priority (see each function for specifics) ──────────────────────
 *   Market index quotes + sparklines … FMP (quote + light EOD)
 *   Fund / ETF profile (name/AUM/inception) … FMP (/profile)     → static meta
 *   Price + dividend history … FMP (/historical + /dividends)    → Tiingo fallback
 *   Expense ratio … NOT provided by FMP Starter (etf-info empty) → static meta only
 *
 * ── Environment variables ────────────────────────────────────────────────────
 *   FMP_API_KEY      REQUIRED. Primary provider for everything above.
 *   TIINGO_API_KEY   OPTIONAL. History fallback only — used when FMP returns no
 *                    rows (e.g. smaller non-Vanguard/Fidelity mutual funds like
 *                    ACBAX that FMP Starter does not cover). Absent locally by
 *                    design; present in production.
 *
 * Results are cached (see cache TTLs at each call site) and concurrent identical
 * requests are coalesced, so each ticker hits a provider at most once per window.
 */
import { cacheGet, cacheSet, coalesce } from "./cache";

const HISTORY_TTL = 24 * 60 * 60; // 24 hours
const INFO_TTL    = 24 * 60 * 60; // 24 hours
const QUOTE_TTL   = 15 * 60;      // 15 minutes (market data)

const FMP_KEY    = process.env.FMP_API_KEY ?? "";
const STABLE     = "https://financialmodelingprep.com/stable";
const TIINGO_KEY = process.env.TIINGO_API_KEY ?? "";

let warnedNoKey = false;
function ensureKey(): boolean {
  if (!FMP_KEY) {
    if (!warnedNoKey) {
      console.warn("[fmp] FMP_API_KEY is not set — market and fund data will be empty.");
      warnedNoKey = true;
    }
    return false;
  }
  return true;
}

// ── Throttle (stay polite to the API) ─────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FmpHistoricalItem {
  date: string;    // YYYY-MM-DD
  adjClose: number;
}

export interface FmpDividendItem {
  date: string;
  amount: number;
}

// ════════════════════════════════════════════════════════════════════════════
//  MARKET DATA (dashboard) — FMP is the sole provider.
// ════════════════════════════════════════════════════════════════════════════

export interface MarketQuote {
  price: number;
  change1d: number;
  change1w: number;
  change1m: number;
  changeYtd: number;
  spark6m?: number[];
}

/** Compute the standard change windows + sparkline from an ascending price series. */
function windowsFromSeries(asc: number[], dates: string[], includeSpark: boolean): MarketQuote | null {
  if (asc.length < 2) return null;
  const price = asc[asc.length - 1];
  const at = (backFromEnd: number) => asc[Math.max(0, asc.length - 1 - backFromEnd)] ?? price;
  const prev1d = at(1);
  const prev1w = at(5);   // ~5 trading days
  const prev1m = at(21);  // ~21 trading days
  // YTD: first close of the current calendar year
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
 * FMP market quote for a dashboard ticker (index or ETF). Uses light EOD history
 * (one call, ~1y) so we can compute 1d/1w/1m/YTD changes and — when requested —
 * a ~6-month sparkline. Returns null on any miss.
 */
export async function fetchMarketQuoteFmp(ticker: string, includeSpark = false): Promise<MarketQuote | null> {
  const from = yearsAgoISO(1);
  const T = encodeURIComponent(ticker);
  const rows = asArray(await fmpFetchJson(`${STABLE}/historical-price-eod/light?symbol=${T}&from=${from}`));
  if (rows.length < 2) return null;
  // FMP returns newest-first; sort ascending for window math.
  const sorted = rows
    .map((r) => ({ date: String(r.date).slice(0, 10), price: Number(r.price ?? r.close ?? r.adjClose ?? 0) }))
    .filter((r) => r.price > 0 && r.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  return windowsFromSeries(sorted.map((r) => r.price), sorted.map((r) => r.date), includeSpark);
}

// ── Profile / metadata (FMP primary) ───────────────────────────────────────────
// FMP Starter's /profile covers name, AUM (marketCap), and inception (ipoDate)
// for ETFs and major mutual funds. Expense ratio is NOT exposed on Starter
// (etf-info returns empty), so callers fill it from the static curated meta.

export async function fetchEtfInfo(ticker: string): Promise<{
  expenseRatio: number | null;
  aum: number | null;
  inceptionDate: string | null;
  name: string | null;
} | null> {
  const cacheKey = `etfinfo:${ticker}`;
  return coalesce(cacheKey, async () => {
    const cached = await cacheGet<{ expenseRatio: number | null; aum: number | null; inceptionDate: string | null; name: string | null }>(cacheKey);
    if (cached) return cached;

    const rows = await fmpFetchJson(`${STABLE}/profile?symbol=${encodeURIComponent(ticker)}`);
    const p = Array.isArray(rows) ? (rows[0] as Record<string, unknown>) : null;
    if (!p) return null;

    const result = {
      expenseRatio: null,                              // not exposed on Starter → static fallback fills it
      aum: (p.marketCap as number) ?? null,
      inceptionDate: (p.ipoDate as string) ?? null,
      name: (p.companyName as string) ?? null,
    };

    await cacheSet(cacheKey, result, INFO_TTL);
    return result;
  });
}

export async function fetchMutualFundInfo(ticker: string): Promise<{
  expenseRatio: number | null;
  aum: number | null;
  inceptionDate: string | null;
} | null> {
  // FMP exposes fund metadata through the same /profile endpoint for covered funds.
  const info = await fetchEtfInfo(ticker);
  if (!info) return null;
  return { expenseRatio: info.expenseRatio, aum: info.aum, inceptionDate: info.inceptionDate };
}

// ── Support check (Add Missing Fund) ──────────────────────────────────────────
// Answers a single question for the fund-request workflow: can FMP return
// usable identity for this ticker? Returns SAFE fields only — never the API key
// or the raw provider payload. `inconclusive` distinguishes "provider didn't
// respond / no key" (retryable) from a definitive "unsupported".

export interface FundSupport {
  supported: boolean;
  inconclusive: boolean;      // provider unavailable / no key — not a real "no"
  name: string | null;
  assetType: string | null;   // "ETF" | "Mutual Fund" | "Unknown"
  reason: string | null;
}

export async function fetchFundSupport(ticker: string): Promise<FundSupport> {
  if (!FMP_KEY) {
    return { supported: false, inconclusive: true, name: null, assetType: null,
      reason: "Provider not configured — could not check." };
  }
  const rows = await fmpFetchJson(`${STABLE}/profile?symbol=${encodeURIComponent(ticker)}`);
  if (rows == null) {
    // Network error, plan limit, or FMP "Error Message" — retryable, not a "no".
    return { supported: false, inconclusive: true, name: null, assetType: null,
      reason: "Provider did not respond — try again shortly." };
  }
  const p = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : null;
  if (!p || !p.companyName) {
    return { supported: false, inconclusive: false, name: null, assetType: null,
      reason: "Not found or not supported by the data provider." };
  }
  const assetType = p.isEtf ? "ETF" : p.isFund ? "Mutual Fund" : "Unknown";
  return { supported: true, inconclusive: false, name: String(p.companyName), assetType, reason: null };
}

// ════════════════════════════════════════════════════════════════════════════
//  PRICE + DIVIDEND HISTORY — FMP primary, Tiingo fallback.
// ════════════════════════════════════════════════════════════════════════════

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

/**
 * FMP — adjusted price history (/historical-price-eod/full) plus dividends
 * (/dividends). Starter returns a ~20-year window (5000-row cap), enough for all
 * KPIs. Primary source. Covers ETFs, indices, and major mutual funds.
 */
async function fetchHistoryFmp(ticker: string, from: string): Promise<HistoryResult> {
  const T = encodeURIComponent(ticker);

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

  const rawDivs = asArray(await fmpFetchJson(`${STABLE}/dividends?symbol=${T}`));
  const dividends: FmpDividendItem[] = rawDivs
    .map((d) => ({ date: String(d.date).slice(0, 10), amount: Number(d.adjDividend ?? d.dividend ?? 0) }))
    .filter((d) => d.amount > 0 && d.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentPrice = prices.at(-1)?.adjClose ?? 0;
  return { prices, dividends, currentPrice, chartName: null };
}

/**
 * Tiingo — one EOD endpoint returns adjusted prices AND dividends (divCash) and
 * covers mutual-fund NAVs that FMP Starter misses. Used ONLY as a fallback when
 * FMP returns no rows and TIINGO_API_KEY is configured.
 */
async function fetchHistoryTiingo(ticker: string, from: string): Promise<HistoryResult> {
  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(ticker)}/prices?startDate=${from}&format=json&token=${TIINGO_KEY}`;
  let rows: Record<string, unknown>[] = [];
  try {
    await throttle();
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, next: { revalidate: 0 } });
    if (!res.ok) { console.warn(`[tiingo] ${ticker} → HTTP ${res.status}`); return EMPTY_HISTORY; }
    const data = await res.json();
    rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  } catch (e) {
    console.warn(`[tiingo] ${ticker} → ${e instanceof Error ? e.message : "error"}`);
    return EMPTY_HISTORY;
  }
  if (rows.length === 0) return EMPTY_HISTORY;

  const prices: FmpHistoricalItem[] = rows
    .map((r) => ({ date: String(r.date).slice(0, 10), adjClose: Number(r.adjClose ?? r.close ?? 0) }))
    .filter((p) => p.adjClose > 0 && p.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  const dividends: FmpDividendItem[] = rows
    .map((r) => ({ date: String(r.date).slice(0, 10), amount: Number(r.divCash ?? 0) }))
    .filter((d) => d.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentPrice = prices.at(-1)?.adjClose ?? 0;
  return { prices, dividends, currentPrice, chartName: null };
}

export async function fetchHistory(ticker: string, range = "10y"): Promise<HistoryResult> {
  const cacheKey = `hist:${ticker}:${range}`;

  return coalesce(cacheKey, async () => {
    // 1. Cache first — skip the API entirely on a hit
    const cached = await cacheGet<HistoryResult>(cacheKey);
    if (cached && cached.prices && cached.prices.length > 0) return cached;

    // 2. Resolve the "from" date from the requested range (e.g. "10y", "5y", "1y")
    const yrs = parseInt(range) || 10;
    const from = yearsAgoISO(yrs);

    // 3. FMP primary — ~20y depth, covers ETFs/indices/major MFs.
    const fmp = await fetchHistoryFmp(ticker, from);
    if (fmp.prices.length > 0) {
      await cacheSet(cacheKey, fmp, HISTORY_TTL);
      return fmp;
    }

    // 4. Tiingo fallback — only when FMP returned nothing AND a key is configured
    //    (catches non-major mutual funds like ACBAX that FMP Starter doesn't cover).
    if (TIINGO_KEY) {
      const t = await fetchHistoryTiingo(ticker, from);
      if (t.prices.length > 0) {
        await cacheSet(cacheKey, t, HISTORY_TTL);
        return t;
      }
    }

    return EMPTY_HISTORY;
  });
}

// Re-exported TTL so market route and provider stay in sync on the 15-min window.
export { QUOTE_TTL };
