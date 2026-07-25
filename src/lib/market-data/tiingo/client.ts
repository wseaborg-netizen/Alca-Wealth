/**
 * Tiingo transport — SERVER-SIDE ONLY. The single HTTP boundary for Tiingo.
 *
 * Auth uses Tiingo's supported `Authorization: Token <token>` HEADER (not a URL
 * query parameter), so the token can never appear in a logged or captured URL.
 * This module logs NOTHING — not the URL, not the headers, not the token — and
 * never returns the token to callers. Every failure is a normalized ProviderError.
 *
 * The provider path passed in must already be encoded and must NOT contain the
 * token. Requests enforce an explicit timeout via AbortController.
 */
import { providerError, categorizeStatus, type ProviderError } from "../errors";

export const TIINGO_BASE_URL = "https://api.tiingo.com";
export const DEFAULT_TIMEOUT_MS = 8000;

export interface TransportDeps {
  /** Injectable fetch for tests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export type TransportResult =
  | { readonly ok: true; readonly json: unknown }
  | { readonly ok: false; readonly error: ProviderError };

/**
 * GET a Tiingo API path and return parsed JSON on 2xx, else a normalized
 * ProviderError. Never throws to the caller and never leaks the token.
 */
export async function tiingoGet(path: string, token: string, deps: TransportDeps = {}): Promise<TransportResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${TIINGO_BASE_URL}${path}`, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Token ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: providerError(categorizeStatus(res.status), { status: res.status }) };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { ok: false, error: providerError("malformed") };
    }
    return { ok: true, json };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, error: providerError(aborted ? "timeout" : "network") };
  } finally {
    clearTimeout(timer);
  }
}
