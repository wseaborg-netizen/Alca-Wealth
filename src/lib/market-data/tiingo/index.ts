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
}

export interface TiingoProviderDeps extends TransportDeps {
  /** Injectable token resolver + clock for tests. */
  readonly resolveToken?: (ctx: TokenContext) => ResolvedToken | ProviderError;
  readonly now?: () => Date;
}

interface BoundDeps extends TransportDeps {
  resolveToken: (ctx: TokenContext) => ResolvedToken | ProviderError;
  now: () => Date;
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
  const res = await tiingoGet(pricePath(symbol, startDate), resolved.token, deps);
  if (!res.ok) return { ok: false, error: res.error };
  if (!Array.isArray(res.json)) return { ok: false, error: providerError("malformed") };
  return { ok: true, data: res.json as TiingoPriceRaw[] };
}

export function createTiingoProvider(deps: TiingoProviderDeps = {}): MarketDataProvider {
  const bound: BoundDeps = {
    ...deps,
    resolveToken: deps.resolveToken ?? resolveTiingoToken,
    now: deps.now ?? (() => new Date()),
  };

  const guardSymbol = (symbol: string): ProviderError | null =>
    SYMBOL_RE.test(symbol) ? null : providerError("invalid_symbol");

  return {
    async getSecurityMetadata(symbol, ctx) {
      const bad = guardSymbol(symbol);
      if (bad) return { ok: false, error: bad };
      const resolved = bound.resolveToken(ctx);
      if (!isResolvedToken(resolved)) return { ok: false, error: resolved };
      const res = await tiingoGet(`/tiingo/daily/${encodeURIComponent(symbol)}`, resolved.token, bound);
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
  };
}
