import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext } from "@/lib/db";
import { buildFirmInventory, addFirmFundToInventory } from "@/lib/firmInventory";
import { firmFundUpdate, FirmReviewError, type FirmFundStatus } from "@/lib/firmReviews";

/**
 * Firm Funds inventory API — firm-scoped, RLS-enforced. The firm is always
 * resolved server-side from the session (requireFirmContext); the browser never
 * supplies or overrides the firm identity. GET returns inventory display data (canonical
 * identity + firm fields + derived last review). POST adds a canonical ticker or
 * updates firm-owned fields only. Performance enrichment lives in ./performance.
 */

/** Map a typed repository error to an HTTP status + safe message. */
function errorResponse(e: unknown) {
  if (e instanceof FirmReviewError) {
    const status =
      e.code === "not_in_universe" ? 422 :
      e.code === "duplicate" ? 409 :
      e.code === "invalid_ticker" || e.code === "invalid_status" ? 400 :
      e.code === "not_found" ? 404 : 500;
    return NextResponse.json({ error: e.message, code: e.code }, { status });
  }
  return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
}

export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ inventory: null }, { status: 401 });
  try {
    const inventory = await buildFirmInventory(ctx.sb, ctx.firm.id);
    return NextResponse.json({ inventory }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action as string | undefined;
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    switch (action) {
      case "add": {
        const row = await addFirmFundToInventory(ctx.sb, ctx.firm.id, ctx.user.id, {
          ticker: String(body?.ticker ?? ""),
          status: body?.status as FirmFundStatus | undefined,
          fundRole: (body?.fundRole as string | null | undefined) ?? null,
          approvalRationale: (body?.approvalRationale as string | null | undefined) ?? null,
          nextReviewDate: (body?.nextReviewDate as string | null | undefined) ?? null,
        });
        return NextResponse.json({ ok: true, fund: row });
      }
      case "update": {
        const id = String(body?.id ?? "");
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        // Only firm-owned fields — never canonical identity or ticker.
        const patch: Parameters<typeof firmFundUpdate>[3] = {};
        if (body?.status !== undefined) patch.status = body.status as FirmFundStatus;
        if (body?.fundRole !== undefined) patch.fundRole = (body.fundRole as string | null) ?? null;
        if (body?.approvalRationale !== undefined) patch.approvalRationale = (body.approvalRationale as string | null) ?? null;
        if (body?.nextReviewDate !== undefined) patch.nextReviewDate = (body.nextReviewDate as string | null) ?? null;
        const row = await firmFundUpdate(ctx.sb, ctx.firm.id, id, patch);
        return NextResponse.json({ ok: true, fund: row });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
