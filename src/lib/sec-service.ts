/**
 * SEC data service — cache-first, stale-while-revalidate orchestration.
 * Runs entirely as deterministic server code (no AI, no manual steps):
 *
 *   validate → shared cache → database → (if stale) locked refresh → SEC
 *
 * A distributed lock guarantees that concurrent cache misses for the same
 * ticker produce exactly one SEC refresh; everyone else gets stored data.
 * A valid stored result is never erased by a later SEC failure.
 */
import { cacheGet, cacheSet } from "./cache";
import {
  getFundFilings, isValidTicker, acquireLock, releaseLock, computeFreshness,
  type SecFiling, type SecIdentifiers,
} from "./sec";
import {
  getMapping, saveMapping, getFilings, saveFilings, getSyncStatus, recordSync,
} from "./sec-store";

const FRESH_MS = 6 * 60 * 60 * 1000;   // matches the scheduled 6h refresh
const CACHE_TTL = 6 * 60 * 60;         // shared-cache freshness window (s)

export interface SecFundResponse {
  status: "resolved" | "not_found" | "unavailable";
  ticker: string;
  identifiers: SecIdentifiers | null;
  filings: SecFiling[];
  stale: boolean;
  lastSuccessfulSync: number | null;
  coverageWarning: string | null;
}

interface CachedPayload {
  identifiers: SecIdentifiers | null;
  filings: SecFiling[];
  warning: string | null;
  at: number;
  notFound?: boolean;
}

const cacheKey = (t: string) => `sec:fund:v2:${t}`;

/** Refresh one ticker from SEC under a distributed lock. Returns the fresh
    payload, or null when the lock is held elsewhere / SEC is unavailable. */
export async function refreshTicker(ticker: string): Promise<CachedPayload | null> {
  const lockKey = `sec:lock:fund:${ticker}`;
  if (!(await acquireLock(lockKey, 30))) return null; // someone else is refreshing
  try {
    const live = await getFundFilings(ticker);
    if (live.status === "not_found") {
      const payload: CachedPayload = { identifiers: null, filings: [], warning: null, at: Date.now(), notFound: true };
      await cacheSet(cacheKey(ticker), payload, CACHE_TTL);
      return payload;
    }
    if (live.status === "sec_unavailable" || !live.identifiers) {
      await recordSync(ticker, false, "network");
      return null; // preserve whatever is stored
    }
    const payload: CachedPayload = {
      identifiers: live.identifiers, filings: live.filings,
      warning: live.warning ?? null, at: Date.now(),
    };
    await cacheSet(cacheKey(ticker), payload, CACHE_TTL);
    await saveMapping(live.identifiers);
    await saveFilings(ticker, live.filings);
    await recordSync(ticker, true);
    return payload;
  } finally {
    await releaseLock(lockKey);
  }
}

/** Cache-first read used by the public API route. */
export async function getFundDataCached(rawTicker: string): Promise<SecFundResponse> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!isValidTicker(ticker)) {
    return { status: "not_found", ticker, identifiers: null, filings: [], stale: false, lastSuccessfulSync: null, coverageWarning: null };
  }

  // 1 · shared cache (fresh window)
  const cached = await cacheGet<CachedPayload>(cacheKey(ticker));
  const sync = await getSyncStatus(ticker);
  if (cached) {
    if (cached.notFound) {
      return { status: "not_found", ticker, identifiers: null, filings: [], stale: false, lastSuccessfulSync: null, coverageWarning: null };
    }
    return {
      status: "resolved", ticker, identifiers: cached.identifiers, filings: cached.filings,
      stale: false, lastSuccessfulSync: sync?.lastSuccessful ?? cached.at,
      coverageWarning: cached.warning,
    };
  }

  // 2 · database (may be stale — return immediately, refresh behind the lock)
  const [dbIds, dbFilings] = await Promise.all([getMapping(ticker), getFilings(ticker)]);
  if (dbIds && dbFilings) {
    const freshness = computeFreshness(sync?.lastSuccessful ?? null, Date.now(), FRESH_MS);
    if (freshness === "fresh") {
      return { status: "resolved", ticker, identifiers: dbIds, filings: dbFilings, stale: false,
        lastSuccessfulSync: sync?.lastSuccessful ?? null, coverageWarning: null };
    }
    // stale-while-revalidate: kick a locked refresh but don't block the caller
    void refreshTicker(ticker).catch(() => undefined);
    return { status: "resolved", ticker, identifiers: dbIds, filings: dbFilings, stale: true,
      lastSuccessfulSync: sync?.lastSuccessful ?? null,
      coverageWarning: "Data is being refreshed in the background." };
  }

  // 3 · nothing stored — one controlled live fetch (deduped by the lock)
  const fresh = await refreshTicker(ticker);
  if (fresh) {
    if (fresh.notFound) {
      return { status: "not_found", ticker, identifiers: null, filings: [], stale: false, lastSuccessfulSync: null, coverageWarning: null };
    }
    return { status: "resolved", ticker, identifiers: fresh.identifiers, filings: fresh.filings,
      stale: false, lastSuccessfulSync: fresh.at, coverageWarning: fresh.warning };
  }

  // Lock held elsewhere or SEC down: retry the stores once, then degrade.
  const again = await cacheGet<CachedPayload>(cacheKey(ticker));
  if (again && !again.notFound) {
    return { status: "resolved", ticker, identifiers: again.identifiers, filings: again.filings,
      stale: false, lastSuccessfulSync: again.at, coverageWarning: again.warning };
  }
  return {
    status: "unavailable", ticker, identifiers: null, filings: [], stale: false,
    lastSuccessfulSync: sync?.lastSuccessful ?? null,
    coverageWarning: "SEC EDGAR is unreachable and no stored data exists for this ticker yet.",
  };
}
