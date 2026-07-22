import { NextResponse } from "next/server";
import { requireFirmContext, fundRequestsByStatuses } from "@/lib/db";
import { getUniverseCounts } from "@/lib/universeServer";
import { classifyFund } from "@/lib/classify";
import { REVIEW_STATUSES, FAILED_STATUSES, issueLabel, failureLabel, confidenceOf } from "@/lib/expansionOps";

/**
 * Expansion — Review Queue + Failed Imports data (firm-scoped). The suggested
 * classification + confidence are re-derived from the stored fund name using
 * the SAME classifier rules (never fabricated), so no schema change is needed.
 * Auth-gated (401 signed out).
 */
export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ review: null }, { status: 401 });
  try {
    const [reviewRows, failedRows, counts] = await Promise.all([
      fundRequestsByStatuses(ctx.sb, ctx.firm.id, REVIEW_STATUSES),
      fundRequestsByStatuses(ctx.sb, ctx.firm.id, FAILED_STATUSES),
      getUniverseCounts(ctx.sb),
    ]);

    const review = reviewRows.map((r) => {
      let suggestedPrimary: string | null = null, suggestedCategory: string | null = null;
      let suggested: Record<string, string | null> | null = null;
      try {
        const cls = classifyFund({ normalizedTicker: r.normalized_ticker, name: r.fund_name ?? r.normalized_ticker, fundType: null });
        suggestedPrimary = cls.fields?.primary_category ?? null;
        suggestedCategory = cls.category ?? cls.fields?.primary_category ?? null;
        suggested = cls.fields ? { ...cls.fields } : null;   // full fields for the Edit form
      } catch { /* leave null — honest "—" in the UI */ }
      return {
        id: r.id, ticker: r.normalized_ticker, fund_name: r.fund_name,
        issue: issueLabel(r.status, r.failure_reason), reason: r.failure_reason,
        suggestedPrimary, suggestedCategory, suggested,
        confidence: confidenceOf(r.status, r.classification_status),
        provider: r.fmp_supported ? "FMP" : "—", status: r.status, imported_at: r.requested_at,
      };
    });

    const failed = failedRows.map((r) => ({
      id: r.id, ticker: r.normalized_ticker, fund_name: r.fund_name,
      failureReason: failureLabel(r.status, r.failure_reason),
      providerResponse: r.fmp_supported ? "Provider returned data" : (r.failure_reason ?? "—"),
      status: r.status, attempted_at: r.requested_at,
    }));

    return NextResponse.json({
      review, failed,
      counts: { review: review.length, failed: failed.length, universe: counts },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load the review queue." }, { status: 500 });
  }
}
