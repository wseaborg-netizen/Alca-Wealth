/**
 * Expansion Operations Center — pure helpers shared by the ops routes + UI.
 * Maps the fund_request lifecycle onto the operator-facing buckets, issue
 * reasons, failure reasons, confidence, and the controlled edit dropdowns.
 * No fabricated data — every label is derived from a real request status/reason.
 */
import taxonomyRaw from "@/../data/config/fund-taxonomy.json";

const tax = taxonomyRaw as Record<string, string[] | string>;
const list = (k: string): string[] => (Array.isArray(tax[k]) ? (tax[k] as string[]) : []);

/** Controlled dropdown options for Edit & Approve (from the ALCA taxonomy). */
export const TAXONOMY_OPTIONS = {
  asset_class: list("asset_class"),
  primary_category: list("primary_category"),
  region: list("region"),
  management_style: list("management_style"),
  portfolio_role: list("portfolio_role"),
  investment_focus: list("investment_focus"),
  benchmark_category: list("benchmark_category"),
  market_cap: list("market_cap"),
  style: list("style"),
};

/** The operator buckets a request status resolves to. */
export type OpsBucket = "verified" | "review" | "failed" | "duplicate" | "unsupported";

const FAILED = new Set(["pending", "classification_failed"]);

export function opsBucket(status: string): OpsBucket {
  if (status === "added_to_universe" || status === "approved") return "verified";
  if (status === "already_available") return "duplicate";
  if (status === "unsupported") return "unsupported";
  if (FAILED.has(status)) return "failed";
  return "review"; // needs_classification / ready_for_review / failed_validation / fmp_supported / rejected
}

/** Statuses that appear in the Review Queue vs the Failed Imports tab. */
export const REVIEW_STATUSES = ["needs_classification", "ready_for_review", "failed_validation", "fmp_supported"];
export const FAILED_STATUSES = ["pending", "classification_failed", "unsupported"];

/** Human "Issue" label for a review-queue row. */
export function issueLabel(status: string, reason: string | null): string {
  const r = (reason ?? "").toLowerCase();
  if (status === "failed_validation") return "Invalid Taxonomy Value";
  if (status === "ready_for_review") return "Needs Verification";
  if (status === "fmp_supported") return "Incomplete Metadata";
  if (status === "needs_classification") {
    if (r.includes("market cap")) return "Missing Category";
    if (r.includes("no classification rule")) return "Unknown Classification";
    if (r.includes("asset")) return "Unknown Asset Class";
    return "Low Confidence Classification";
  }
  return "Needs Review";
}

/** Human "Failure Reason" for a failed-imports row. */
export function failureLabel(status: string, reason: string | null): string {
  const r = (reason ?? "").toLowerCase();
  if (status === "unsupported") return r.includes("not found") ? "Ticker Not Found" : "Unsupported Security";
  if (status === "classification_failed") return "Classifier Error";
  if (status === "pending") {
    if (r.includes("not configured")) return "Provider Not Configured";
    if (r.includes("did not respond") || r.includes("try again")) return "Provider Error";
    if (r.includes("timeout")) return "Timeout";
    return "Provider Error";
  }
  return "Import Failed";
}

/** Confidence proxy for a review row (no fabricated score). */
export function confidenceOf(status: string, classificationStatus: string | null): "High" | "Medium" | "Low" | "Invalid" | "—" {
  if (status === "added_to_universe" || status === "approved") return "High";
  if (status === "failed_validation") return "Invalid";
  if (status === "ready_for_review") return "Medium";
  if (status === "needs_classification") return "Low";
  if (classificationStatus === "verified") return "High";
  return "—";
}
