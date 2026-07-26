/**
 * Canonical Tiingo market-data provider — SERVER-SIDE ONLY.
 *
 * The single entry point for Tiingo. Every method returns ONLY ALCA-normalized
 * types (../types); raw Tiingo response objects never escape this adapter.
 *
 * Importing this module performs NO network I/O: a provider is created explicitly
 * via createTiingoProvider(), and a request happens only when a method is called.
 * There is NO FMP fallback here. Token access is confined to the token resolver
 * and the transport boundary.
 *
 * Endpoints (Tiingo daily): metadata `GET /tiingo/daily/{symbol}`; price/NAV,
 * distributions, and splits all derive from `GET /tiingo/daily/{symbol}/prices`
 * (Tiingo embeds `divCash` and `splitFactor` in each price row).
 */
import { resolveTiingoToken, isResolvedToken, type TokenContext, type ResolvedToken } from "../tokenResolver";
import { tiingoGet, type TransportDeps } from "./client";
import { providerError, type ProviderError, type Result } from "../errors";
import type {
  SecurityMetadata,
  PriceHistory,
  PriceSeriesKind,
  PriceSeries,
  DistributionHistory,
  SplitHistory,
  Provenance,
} from "../types";
import type { TiingoMetaRaw, TiingoPriceRaw } from "./types";
import { normalizeMetadata, normalizePriceHistory, normalizeDistributions, normalizeSplits } from "./normalize";

export interface HistoryOptions {
  /** Inclusive ISO start date "YYYY-MM-DD". */
  readonly startDate?: string;
  /** ETF price vs mutual-fund NAV (same Tiingo endpoint; labels the series). */
  readonly kind?: PriceSeriesKind;
}

/** The provider-neutral capability surface Stage 2 will implement against. */
export interface MarketDataProvider {
  getSecurityMetadata(symbol: string, ctx: TokenContext): Promise<Result<SecurityMetadata>>;
  getPriceHistory(symbol: string, ctx: TokenContext, opts?: HistoryOptions): Promise<Result<PriceHistory>>;
  getDistributions(symbol: string, ctx: TokenContext, opts?: HistoryOptions): Promise<Result<DistributionHistory>>;
  getSplits(symbol: string, ctx: TokenContext, opts?: HistoryOptions): Promise<Result<SplitHistory>>;
  /** Price/NAV history + distributions + splits from a SINGLE `/prices` fetch. */
  getPriceSeries(symbol: string, ctx: TokenContext, opts?: HistoryOptions): Promise<Result<PriceSeries>>;
}

export interface TiingoProviderDeps extends TransportDeps {
  /** Injectable token resolver + clock for tests. */
  readonly resolveToken?: (ctx: TokenContext) => ResolvedToken | ProviderError;
  readonly now?: () => Date;
  /** Max retries for RETRYABLE errors only (default 2). Never retries
      unauthorized / not_found / malformed / invalid_symbol / no_token. */
  readonly maxRetries?: number;
  readonly backoffBaseMs?: number;
  /** Injectable delay so tests exercise retries without real waits. */
  readonly sleep?: (ms: number) => Promise<void>;
}

interface BoundDeps extends TransportDeps {
  resolveToken: (ctx: TokenContext) => ResolvedToken | ProviderError;
  now: () => Date;
  maxRetries: number;
  backoffBaseMs: number;
  sleep: (ms: number) => Promise<void>;
}

/** Single-shot transport wrapped with bounded retries for retryable errors only. */
async function getWithRetry(path: string, token: string, deps: BoundDeps) {
  let attempt = 0;
  for (;;) {
    const res = await tiingoGet(path, token, deps);
    if (res.ok || !res.error.retryable || attempt >= deps.maxRetries) return res;
    attempt += 1;
    await deps.sleep(deps.backoffBaseMs * attempt);
  }
}

// Conservative symbol guard (letters, digits, dot, dash, caret for index proxies).
const SYMBOL_RE = /^[A-Za-z0-9.\-^]{1,15}$/;

function provenanceNow(now: () => Date): Provenance {
  return { source: "tiingo", fetchedAt: now().toISOString() };
}

function pricePath(symbol: string, startDate?: string): string {
  const from = startDate ? `&startDate=${encodeURIComponent(startDate)}` : "";
  return `/tiingo/daily/${encodeURIComponent(symbol)}/prices?format=json${from}`;
}

/** Shared price-row fetch used by price/NAV, distributions, and splits. */
async function fetchPriceRows(
  symbol: string,
  ctx: TokenContext,
  deps: BoundDeps,
  startDate?: string,
): Promise<Result<TiingoPriceRaw[]>> {
  const resolved = deps.resolveToken(ctx);
  if (!isResolvedToken(resolved)) return { ok: false, error: resolved };
  const res = await getWithRetry(pricePath(symbol, startDate), resolved.token, deps);
  if (!res.ok) return { ok: false, error: res.error };
  if (!Array.isArray(res.json)) return { ok: false, error: providerError("malformed") };
  return { ok: true, data: res.json as TiingoPriceRaw[] };
}

export function createTiingoProvider(deps: TiingoProviderDeps = {}): MarketDataProvider {
  const bound: BoundDeps = {
    ...deps,
    resolveToken: deps.resolveToken ?? resolveTiingoToken,
    now: deps.now ?? (() => new Date()),
    maxRetries: deps.maxRetries ?? 2,
    backoffBaseMs: deps.backoffBaseMs ?? 200,
    sleep: deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms))),
  };

  const guardSymbol = (symbol: string): ProviderError | null =>
    SYMBOL_RE.test(symbol) ? null : providerError("invalid_symbol");

  return {
    async getSecurityMetadata(symbol, ctx) {
      const bad = guardSymbol(symbol);
      if (bad) return { ok: false, error: bad };
      const resolved = bound.resolveToken(ctx);
      if (!isResolvedToken(resolved)) return { ok: false, error: resolved };
      const res = await getWithRetry(`/tiingo/daily/${encodeURIComponent(symbol)}`, resolved.token, bound);
      if (!res.ok) return { ok: false, error: res.error };
      if (typeof res.json !== "object" || res.json === null || Array.isArray(res.json)) {
        return { ok: false, error: providerError("malformed") };
      }
      return { ok: true, data: normalizeMetadata(symbol, res.json as TiingoMetaRaw, provenanceNow(bound.now)) };
    },

    async getPriceHistory(symbol, ctx, opts) {
      const bad = guardSymbol(symbol);
      if (bad) return { ok: false, error: bad };
      const rows = await fetchPriceRows(symbol, ctx, bound, opts?.startDate);
      if (!rows.ok) return { ok: false, error: rows.error };
      const observedAt = bound.now().toISOString();
      return {
        ok: true,
        data: normalizePriceHistory(symbol, opts?.kind ?? "price", rows.data, provenanceNow(bound.now), observedAt),
      };
    },

    async getDistributions(symbol, ctx, opts) {
      const bad = guardSymbol(symbol);
      if (bad) return { ok: false, error: bad };
      const rows = await fetchPriceRows(symbol, ctx, bound, opts?.startDate);
      if (!rows.ok) return { ok: false, error: rows.error };
      return { ok: true, data: normalizeDistributions(symbol, rows.data, provenanceNow(bound.now)) };
    },

    async getSplits(symbol, ctx, opts) {
      const bad = guardSymbol(symbol);
      if (bad) return { ok: false, error: bad };
      const rows = await fetchPriceRows(symbol, ctx, bound, opts?.startDate);
      if (!rows.ok) return { ok: false, error: rows.error };
      return { ok: true, data: normalizeSplits(symbol, rows.data, provenanceNow(bound.now)) };
    },

    async getPriceSeries(symbol, ctx, opts) {
      const bad = guardSymbol(symbol);
      if (bad) return { ok: false, error: bad };
      const rows = await fetchPriceRows(symbol, ctx, bound, opts?.startDate);
      if (!rows.ok) return { ok: false, error: rows.error };
      const prov = provenanceNow(bound.now);
      const observedAt = bound.now().toISOString();
      return {
        ok: true,
        data: {
          history: normalizePriceHistory(symbol, opts?.kind ?? "price", rows.data, prov, observedAt),
          distributions: normalizeDistributions(symbol, rows.data, prov),
          splits: normalizeSplits(symbol, rows.data, prov),
        },
      };
    },
  };
}
