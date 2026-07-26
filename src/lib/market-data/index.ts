/**
 * ALCA canonical market-data foundation — SERVER-SIDE ONLY. Public surface for
 * Stage 2+.
 *
 * Exposes ONLY normalized ALCA types, the provider factory, the token context,
 * and normalized errors. Raw Tiingo response shapes (tiingo/types.ts) are
 * intentionally NOT re-exported, so no consumer can depend on a provider shape.
 * Do not import this barrel from a "use client" module.
 *
 * This is the foundation only.
 */
export * from "./types";
export * from "./errors";
export { resolveTiingoToken, isResolvedToken, type TokenContext, type ResolvedToken } from "./tokenResolver";
export {
  createTiingoProvider,
  type MarketDataProvider,
  type TiingoProviderDeps,
  type HistoryOptions,
} from "./tiingo/index";
