/**
 * Tiingo token resolution — SERVER-SIDE ONLY. Never import into a "use client"
 * module. Resolves the correct token for a request context without ever
 * returning, logging, or serializing the token value.
 *
 *  - internal  → ALCA's own server env token (TIINGO_API_KEY). Development /
 *                internal use only (Will's Commercial token).
 *  - external  → a firm-owned token that MUST be supplied explicitly. There is
 *                NO fallback to the internal token; a missing firm token fails
 *                closed so an external firm can never be served on Will's token.
 *
 * BYOK readiness: Stage 1 models the external context so a firm token can be
 * injected later. It does NOT read, store, or persist firm credentials — no
 * database, no Supabase. Where the firm token comes from (encrypted store, per
 * request, etc.) is a later stage's concern; this seam just accepts it.
 */
import { providerError, type ProviderError } from "./errors";

export type TokenContext =
  | { readonly kind: "internal" }
  | { readonly kind: "external"; readonly firmToken: string | null };

export interface ResolvedToken {
  readonly token: string;
  readonly contextKind: "internal" | "external";
}

type EnvLike = { TIINGO_API_KEY?: string | undefined };

/**
 * Resolve the Tiingo token for a context. Returns a ResolvedToken on success or
 * a fail-closed ProviderError. `env` is injectable for tests and defaults to
 * process.env, which is only read on the server.
 */
export function resolveTiingoToken(
  ctx: TokenContext,
  env: EnvLike = process.env as EnvLike,
): ResolvedToken | ProviderError {
  if (ctx.kind === "internal") {
    const token = env.TIINGO_API_KEY?.trim();
    if (!token) return providerError("no_token", { message: "Internal Tiingo token is not configured." });
    return { token, contextKind: "internal" };
  }
  // external: never borrow the internal token.
  const firmToken = ctx.firmToken?.trim();
  if (!firmToken) {
    return providerError("no_token", {
      message: "External-firm context requires a firm-supplied token; refusing to use the internal token.",
    });
  }
  return { token: firmToken, contextKind: "external" };
}

/** Narrow a resolution outcome to a successful ResolvedToken. */
export function isResolvedToken(x: ResolvedToken | ProviderError): x is ResolvedToken {
  return (x as ProviderError).kind !== "provider_error";
}
