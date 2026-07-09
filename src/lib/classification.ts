/**
 * Fund Classification Database — identity / categorization layer.
 *
 * SCOPE: classification only. No performance or numeric fields live here
 * (expense ratio, alpha, beta, volatility, returns, yield — those come from the
 * data providers, separately). Every classification field must use a predefined
 * value from the controlled taxonomy (data/taxonomy.json) — no free-form text.
 *
 * TRUST MODEL: entries may be AI-proposed, but only `verified: true` records are
 * authoritative for benchmark selection, alpha, diversification, and the
 * recommendation engine. Stored in data/classifications.json, keyed by ticker.
 */
import taxonomyRaw from "@/../data/taxonomy.json";

type TaxonomyKey =
  | "fund_type" | "asset_class" | "primary_category" | "region" | "market_cap" | "style"
  | "style_box" | "management_style" | "portfolio_role" | "investment_focus" | "benchmark_category";

// Controlled vocabulary — the single source of truth for allowed values.
export const TAXONOMY = taxonomyRaw as Record<TaxonomyKey, string[]> & { _comment?: string };

export interface FundClassification {
  // Identity
  ticker: string;
  fund_name: string;
  issuer: string;
  fund_type: string;           // TAXONOMY.fund_type
  // Classification
  asset_class: string;         // TAXONOMY.asset_class
  primary_category: string;    // TAXONOMY.primary_category
  region: string;              // TAXONOMY.region
  market_cap: string | null;   // TAXONOMY.market_cap — null for non-equity
  style: string | null;        // TAXONOMY.style — null for non-equity
  style_box: string | null;    // TAXONOMY.style_box — null for non-equity
  management_style: string;    // TAXONOMY.management_style
  portfolio_role: string;      // TAXONOMY.portfolio_role
  investment_focus: string;    // TAXONOMY.investment_focus
  benchmark_category: string;  // TAXONOMY.benchmark_category
  // Administrative
  verified: boolean;
  source: string;
  notes?: string;              // optional free text — the only non-controlled field
}

export interface ClassificationStore {
  schemaVersion: number;
  updatedAt: string | null;
  funds: Record<string, FundClassification>;
}

// Fields that must always hold a controlled, non-null value.
const REQUIRED_ENUM: TaxonomyKey[] = [
  "fund_type", "asset_class", "primary_category", "region",
  "management_style", "portfolio_role", "investment_focus", "benchmark_category",
];
// Fields that hold a controlled value OR null (not applicable to bonds/cash/multi-asset).
const NULLABLE_ENUM: TaxonomyKey[] = ["market_cap", "style", "style_box"];

/**
 * Validate one classification record against the controlled taxonomy.
 * Returns a list of human-readable errors (empty = valid). This is the gate that
 * makes the database "right every time": nothing off-taxonomy can be stored.
 */
export function validateClassification(f: Partial<FundClassification>): string[] {
  const errs: string[] = [];
  if (!f.ticker || !String(f.ticker).trim()) errs.push("missing ticker");
  if (!f.fund_name || !String(f.fund_name).trim()) errs.push("missing fund_name");
  if (!f.issuer || !String(f.issuer).trim()) errs.push("missing issuer");

  for (const key of REQUIRED_ENUM) {
    const v = f[key as keyof FundClassification];
    if (v == null || !TAXONOMY[key].includes(String(v))) {
      errs.push(`${key}: "${v ?? "null"}" is not an allowed value`);
    }
  }
  for (const key of NULLABLE_ENUM) {
    const v = f[key as keyof FundClassification];
    if (v != null && !TAXONOMY[key].includes(String(v))) {
      errs.push(`${key}: "${v}" is not an allowed value (or null)`);
    }
    // market_cap / style are expected on Equity funds.
    if (f.asset_class === "Equity" && v == null) {
      errs.push(`${key}: required for Equity funds`);
    }
  }
  if (typeof f.verified !== "boolean") errs.push("verified must be true/false");
  if (!f.source || !String(f.source).trim()) errs.push("missing source");
  return errs;
}
