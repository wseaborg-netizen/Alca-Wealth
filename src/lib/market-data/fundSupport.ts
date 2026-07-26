/**
 * Tiingo-backed fund-support check for Expansion / fund-request validation —
 * SERVER-SIDE ONLY. Drop-in for the FMP `fetchFundSupport` (same FundSupport
 * shape), so the intake evaluator is unchanged.
 *
 * Evidence policy:
 *  - `supported` ⇒ Tiingo has metadata for the symbol (provider coverage).
 *  - `assetType` is ALWAYS "Unknown": Tiingo does NOT establish ETF vs mutual
 *    fund, and asset type must never be guessed. Downstream, an unknown vehicle
 *    on a NOT-yet-canonical ticker routes to review, never auto-approval.
 *  - Provider errors are NOT turned into unsupported decisions: only a definitive
 *    not-found / invalid-symbol is "unsupported"; every other error is
 *    inconclusive (retryable), so a config/outage issue never rejects a symbol.
 */
import { createTiingoProvider } from "@/lib/market-data";
import type { TokenContext, MarketDataProvider } from "@/lib/market-data";
import type { FundSupport } from "@/lib/fmp";

let _provider: MarketDataProvider | null = null;
const tiingo = (): MarketDataProvider => (_provider ??= createTiingoProvider());
/** TEST ONLY — inject a fake provider. Never used by production code paths. */
export function __setProviderForTests(p: MarketDataProvider | null): void { _provider = p; }
const INTERNAL: TokenContext = { kind: "internal" };

export async function checkFundSupport(ticker: string): Promise<FundSupport> {
  const r = await tiingo().getSecurityMetadata(ticker, INTERNAL);
  if (r.ok) {
    return {
      supported: true,
      inconclusive: false,
      name: r.data.displayName,
      assetType: "Unknown", // Tiingo cannot establish ETF vs mutual fund — never guessed
      reason: null,
    };
  }
  const c = r.error.category;
  if (c === "not_found" || c === "invalid_symbol") {
    return { supported: false, inconclusive: false, name: null, assetType: null, reason: "Not found by the data provider." };
  }
  // no_token / unauthorized / rate_limited / timeout / network / server_error / malformed
  // → provider unavailable, a retryable condition, NEVER an "unsupported" verdict.
  return { supported: false, inconclusive: true, name: null, assetType: null, reason: "Provider check could not complete — try again shortly." };
}
