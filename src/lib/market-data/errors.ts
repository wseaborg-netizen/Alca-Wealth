/**
 * Normalized, provider-neutral market-data errors. SERVER-SIDE ONLY.
 *
 * Messages are safe and generic — they NEVER contain a token, an Authorization
 * header, or a request URL. Every provider/transport failure is mapped onto one
 * of these categories with an explicit retryability classification, so consumers
 * never have to interpret a raw HTTP status or a silent null.
 */
import type { ProviderSource } from "./types";

export type ProviderErrorCategory =
  | "no_token"        // token resolution failed closed (non-retryable)
  | "unauthorized"    // 401 / 403 — token rejected (non-retryable)
  | "not_found"       // 404 — symbol not covered by the provider (non-retryable)
  | "rate_limited"    // 429 (retryable)
  | "server_error"    // 5xx / unclassified non-2xx (retryable)
  | "timeout"         // request exceeded the deadline (retryable)
  | "network"         // transport threw before a response (retryable)
  | "malformed"       // response shape failed validation (non-retryable)
  | "invalid_symbol"; // caller passed an unusable symbol (non-retryable)

const RETRYABLE: ReadonlySet<ProviderErrorCategory> = new Set<ProviderErrorCategory>([
  "rate_limited",
  "server_error",
  "timeout",
  "network",
]);

export function isRetryable(category: ProviderErrorCategory): boolean {
  return RETRYABLE.has(category);
}

export interface ProviderError {
  readonly kind: "provider_error";
  readonly category: ProviderErrorCategory;
  readonly retryable: boolean;
  readonly message: string; // safe, generic — never carries a token or URL
  readonly status?: number; // HTTP status when applicable
  readonly source: ProviderSource;
}

const DEFAULT_MESSAGE: Record<ProviderErrorCategory, string> = {
  no_token: "No usable provider token for this context.",
  unauthorized: "Provider rejected the credentials.",
  not_found: "Symbol not covered by the provider.",
  rate_limited: "Provider rate limit reached.",
  server_error: "Provider returned a server error.",
  timeout: "Provider request timed out.",
  network: "Provider request failed to complete.",
  malformed: "Provider returned an unexpected response shape.",
  invalid_symbol: "Symbol is missing or invalid.",
};

/**
 * Build a normalized ProviderError. `message` (when supplied by a caller) must
 * be a static, safe string — call sites never interpolate tokens or URLs.
 */
export function providerError(
  category: ProviderErrorCategory,
  opts: { source?: ProviderSource; status?: number; message?: string } = {},
): ProviderError {
  return {
    kind: "provider_error",
    category,
    retryable: isRetryable(category),
    message: opts.message ?? DEFAULT_MESSAGE[category],
    ...(opts.status != null ? { status: opts.status } : {}),
    source: opts.source ?? "tiingo",
  };
}

/** Map a non-2xx HTTP status onto a provider-error category. */
export function categorizeStatus(status: number): ProviderErrorCategory {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  // Everything else (5xx, and unclassified non-2xx) is treated conservatively as
  // a retryable server error; Stage 2 may refine specific 4xx handling.
  return "server_error";
}

/** Discriminated outcome for every provider method: success data or a normalized error. */
export type Result<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ProviderError };
