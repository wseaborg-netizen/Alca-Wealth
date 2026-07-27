import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext } from "@/lib/db";
import { buildReviewsList, createReviewValidated } from "@/lib/firmInventory";
import { FirmReviewError, REVIEW_STATUSES, type ReviewStatus } from "@/lib/firmReviews";

/**
 * Fund Reviews — firm-scoped list + create. The firm is resolved server-side
 * (requireFirmContext); the browser never supplies the firm identity. Creating a
 * review requires a reason and a fund that belongs to the current firm.
 */
export function reviewErrorResponse(e: unknown) {
  if (e instanceof FirmReviewError) {
    const status =
      e.code === "not_in_universe" || e.code === "replace_needs_candidate" ? 422 :
      e.code === "reason_required" || e.code === "invalid_status" || e.code === "invalid_decision" ||
      e.code === "invalid_ticker" || e.code === "decision_required" || e.code === "date_order" ? 400 :
      e.code === "duplicate" || e.code === "review_closed" ? 409 :
      e.code === "not_found" || e.code === "not_in_firm" ? 404 : 500;
    return NextResponse.json({ error: e.message, code: e.code }, { status });
  }
  return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ reviews: null }, { status: 401 });
  const statusParam = req.nextUrl.searchParams.get("status");
  const statuses = statusParam && (REVIEW_STATUSES as readonly string[]).includes(statusParam)
    ? [statusParam as ReviewStatus] : undefined;
  try {
    const reviews = await buildReviewsList(ctx.sb, ctx.firm.id, statuses ? { statuses } : undefined);
    return NextResponse.json({ reviews }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return reviewErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const review = await createReviewValidated(ctx.sb, ctx.firm.id, {
      firmFundId: String(body?.firmFundId ?? ""),
      reason: (body?.reason as string | null | undefined) ?? null,
      assignedReviewer: (body?.assignedReviewer as string | null | undefined) ?? null,
      openedDate: (body?.openedDate as string | undefined) || undefined,
      reviewDate: (body?.reviewDate as string | null | undefined) ?? null,
    });
    return NextResponse.json({ ok: true, review });
  } catch (e) {
    return reviewErrorResponse(e);
  }
}
