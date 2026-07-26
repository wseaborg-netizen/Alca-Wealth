/**
 * ALCA canonical market-data types — provider-neutral, server-serializable.
 *
 * These are the ONLY shapes Stage 3+ consumers will import. Provider response
 * objects (Tiingo, …) are never exposed here: every field is ALCA-owned and
 * carries explicit availability, provenance, and freshness so a consumer can
 * always distinguish "the value is 0" from "we don't have it, and here is why".
 *
 * Date conventions (explicit, never ambiguous):
 *  - Calendar dates (price / NAV / distribution / split / coverage-start) are ISO
 *    date-only strings, "YYYY-MM-DD", as the provider reports them on the
 *    exchange trading calendar.
 *  - Timestamps (fetchedAt / observedAt) are full ISO-8601 UTC instants.
 */

/** Which upstream supplied a piece of data (provider-neutral; extensible). */
export type ProviderSource = "tiingo";

/** Why a field has no value — preserved, never collapsed into a bare null. */
export type UnavailableReason =
  | "not_supported_by_provider" // the provider / plan does not expose this field at all
  | "not_provided"              // provider supports it but returned nothing for this symbol
  | "insufficient_history"      // too few observations to be meaningful
  | "provider_error";           // an upstream error prevented retrieval

/** A scalar that is present, or explicitly absent with a reason (never silent null). */
export type Availability<T> =
  | { readonly status: "available"; readonly value: T }
  | { readonly status: "unavailable"; readonly reason: UnavailableReason };

export const available = <T>(value: T): Availability<T> => ({ status: "available", value });
export const unavailable = <T>(reason: UnavailableReason): Availability<T> => ({ status: "unavailable", reason });

/** Where a successful result came from and when ALCA fetched it. */
export interface Provenance {
  readonly source: ProviderSource;
  readonly fetchedAt: string; // ISO-8601 UTC instant
}

/** How current the underlying data is. */
export interface Freshness {
  readonly asOf: string | null; // ISO date of the latest observation (e.g. last bar); null if none
  readonly observedAt: string;  // ISO-8601 UTC instant ALCA observed it
}

/** Availability envelope for a time series: empty ≠ insufficient ≠ unavailable. */
export type SeriesAvailability =
  | { readonly status: "available"; readonly count: number }
  | { readonly status: "empty" }                                // provider returned zero rows (honest, not an error)
  | { readonly status: "insufficient"; readonly count: number } // some rows, but below a usable threshold
  | { readonly status: "unavailable"; readonly reason: UnavailableReason };

// ── Security metadata ─────────────────────────────────────────────────────────

export type SecurityType = "etf" | "mutual_fund" | "equity" | "index_proxy" | "unknown";

export interface SecurityMetadata {
  readonly symbol: string;
  readonly displayName: string | null;
  readonly securityType: SecurityType;
  /**
   * Provider COVERAGE start — the earliest date the provider has data for.
   * This is NOT the fund's inception date and must never be labeled as such
   * until separately validated.
   */
  readonly coverageStartDate: string | null;
  /** Assets under management — Tiingo does not supply this, so it is explicitly Unavailable. */
  readonly aum: Availability<number>;
  readonly provenance: Provenance;
  // NOTE: expense ratio is intentionally NOT modeled here — it is not a Tiingo field
  // and must not be sourced/modeled as Tiingo data unless supported and verified later.
}

// ── Price / NAV history ─────────────────────────────────────────────────────────

/** A single observation. `close` / `adjClose` carry price (ETF) or NAV (mutual fund). */
export interface PriceBar {
  readonly date: string;            // "YYYY-MM-DD"
  readonly close: number | null;    // raw close / NAV
  readonly adjClose: number | null; // split + distribution adjusted close / NAV
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly volume: number | null;
}

/** Whether a series is ETF price history or mutual-fund NAV history (same shape, labeled). */
export type PriceSeriesKind = "price" | "nav";

export interface PriceHistory {
  readonly symbol: string;
  readonly kind: PriceSeriesKind;
  readonly bars: readonly PriceBar[]; // may be empty; see availability
  readonly availability: SeriesAvailability;
  readonly provenance: Provenance;
  readonly freshness: Freshness;
}

// ── Distributions ───────────────────────────────────────────────────────────────

export interface Distribution {
  readonly exDate: string; // ex / effective date "YYYY-MM-DD"
  readonly amount: number; // cash per share
}

export interface DistributionHistory {
  readonly symbol: string;
  readonly distributions: readonly Distribution[];
  readonly availability: SeriesAvailability;
  readonly provenance: Provenance;
}

// ── Splits ───────────────────────────────────────────────────────────────────────

export interface Split {
  readonly date: string;   // effective date "YYYY-MM-DD"
  readonly factor: number; // e.g. 2 = 2:1 forward split, 0.5 = 1:2 reverse
}

export interface SplitHistory {
  readonly symbol: string;
  readonly splits: readonly Split[];
  readonly availability: SeriesAvailability;
  readonly provenance: Provenance;
}

// ── Combined series ───────────────────────────────────────────────────────────

/** Price/NAV history + distributions + splits derived from ONE `/prices` fetch. */
export interface PriceSeries {
  readonly history: PriceHistory;
  readonly distributions: DistributionHistory;
  readonly splits: SplitHistory;
}
