import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext } from "@/lib/db";
import { buildReviewDetail, addReviewCandidateValidated } from "@/lib/firmInventory";
import {
  reviewUpdate, reviewComplete, reviewCancel, assertReviewMutable,
  candidateRemove, candidateSelect, evidenceAdd, evidenceRemove,
  type ReviewStatus, type ReviewDecision,
} from "@/lib/firmReviews";
import { reviewErrorResponse } from "../route";

/**
 * One review — firm-scoped detail (GET) + workflow actions (POST). Firm resolved
 * server-side; the browser never supplies the firm identity. All mutations of an
 * active review are guarded so completed/cancelled reviews are read-only, and DB
 * constraints remain the final authority. No destructive delete exists.
 */
export async function GET(_req: NextRequest, ctxp: { params: Promise<{ id: string }> }) {
  const { id } = await ctxp.params;
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ detail: null }, { status: 401 });
  try {
    const detail = await buildReviewDetail(ctx.sb, ctx.firm.id, id);
    if (!detail) return NextResponse.json({ error: "Review not found." }, { status: 404 });
    return NextResponse.json({ detail }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return reviewErrorResponse(e);
  }
}

export async function POST(req: NextRequest, ctxp: { params: Promise<{ id: string }> }) {
  const { id } = await ctxp.params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action as string | undefined;
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sb = ctx.sb, firmId = ctx.firm.id;

  try {
    switch (action) {
      case "update": {
        await assertReviewMutable(sb, firmId, id);
        const review = await reviewUpdate(sb, firmId, id, {
          status: body?.status as ReviewStatus | undefined,   // open → in_review only (validated)
          reason: (body?.reason as string | null | undefined),
          assignedReviewer: (body?.assignedReviewer as string | null | undefined),
          reviewDate: (body?.reviewDate as string | null | undefined),
          rationale: (body?.rationale as string | null | undefined),
          effectiveDate: (body?.effectiveDate as string | null | undefined),
          nextReviewDate: (body?.nextReviewDate as string | null | undefined),
        });
        return NextResponse.json({ ok: true, review });
      }
      case "complete": {
        const review = await reviewComplete(sb, firmId, id, {
          decision: body?.decision as ReviewDecision,
          rationale: (body?.rationale as string | null | undefined) ?? null,
          completedDate: (body?.completedDate as string | null | undefined) ?? null,
          effectiveDate: (body?.effectiveDate as string | null | undefined) ?? null,
          nextReviewDate: (body?.nextReviewDate as string | null | undefined) ?? null,
        });
        return NextResponse.json({ ok: true, review });
      }
      case "cancel": {
        const review = await reviewCancel(sb, firmId, id);
        return NextResponse.json({ ok: true, review });
      }
      case "candidateAdd": {
        await assertReviewMutable(sb, firmId, id);
        const candidate = await addReviewCandidateValidated(sb, id, {
          ticker: String(body?.ticker ?? ""),
          displayOrder: typeof body?.displayOrder === "number" ? body.displayOrder : undefined,
          notes: (body?.notes as string | null | undefined) ?? null,
        });
        return NextResponse.json({ ok: true, candidate });
      }
      case "candidateRemove": {
        await assertReviewMutable(sb, firmId, id);
        await candidateRemove(sb, id, String(body?.candidateId ?? ""));
        return NextResponse.json({ ok: true });
      }
      case "candidateSelect": {
        await assertReviewMutable(sb, firmId, id);
        const cid = body?.candidateId ? String(body.candidateId) : null;   // null clears selection
        await candidateSelect(sb, id, cid);
        return NextResponse.json({ ok: true });
      }
      case "evidenceAdd": {
        await assertReviewMutable(sb, firmId, id);
        const evidence = await evidenceAdd(sb, firmId, id, ctx.user.id, {
          evidenceType: String(body?.evidenceType ?? "note"),
          title: (body?.title as string | null | undefined) ?? null,
          sourceReference: (body?.sourceReference as string | null | undefined) ?? null,
          asOfDate: (body?.asOfDate as string | null | undefined) ?? null,
          snapshot: body?.snapshot ?? null,
        });
        return NextResponse.json({ ok: true, evidence });
      }
      case "evidenceRemove": {
        await assertReviewMutable(sb, firmId, id);
        await evidenceRemove(sb, id, String(body?.evidenceId ?? ""));
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return reviewErrorResponse(e);
  }
}
