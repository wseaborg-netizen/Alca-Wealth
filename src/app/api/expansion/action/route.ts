import { NextRequest, NextResponse } from "next/server";
import {
  requireFirmContext, fundRequestGetById, fundRequestDeleteMany, fundRequestDeleteByStatuses,
} from "@/lib/db";
import { approveRequest, editApproveRequest, retryRequest } from "@/lib/expansionServer";
import { REVIEW_STATUSES, FAILED_STATUSES } from "@/lib/expansionOps";

/**
 * Expansion — review + failed operator actions (firm-scoped, auth-gated):
 *   approve · editApprove · delete · deleteAllReview · retry · deleteAllFailed
 * Approving/retry inserts a VERIFIED dynamic fund → merged universe updates live.
 */
type Body = {
  action: "approve" | "editApprove" | "delete" | "deleteAllReview" | "retry" | "deleteAllFailed";
  ids?: string[]; id?: string; fields?: Record<string, string | null>;
};

export async function POST(req: NextRequest) {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { sb, firm, user } = ctx;
  const body = await req.json().catch(() => null) as Body | null;
  const action = body?.action;
  const ids = (body?.ids ?? (body?.id ? [body.id] : [])).filter(Boolean);

  try {
    switch (action) {
      case "approve": {
        let approved = 0; const failures: { id: string; reason: string }[] = [];
        for (const id of ids) {
          const r = await fundRequestGetById(sb, firm.id, id);
          if (!r) { failures.push({ id, reason: "Not found" }); continue; }
          const res = await approveRequest(sb, firm.id, user.id, r);
          if (res.ok) approved++; else failures.push({ id, reason: res.reason ?? "Approve failed" });
        }
        return NextResponse.json({ ok: true, approved, failures });
      }
      case "editApprove": {
        if (!body?.id || !body.fields) return NextResponse.json({ error: "id + fields required" }, { status: 400 });
        const r = await fundRequestGetById(sb, firm.id, body.id);
        if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const res = await editApproveRequest(sb, firm.id, user.id, r, body.fields as never);
        if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
        return NextResponse.json({ ok: true });
      }
      case "retry": {
        let retried = 0; const outcomes: { id: string; status: string }[] = [];
        for (const id of ids) {
          const r = await fundRequestGetById(sb, firm.id, id);
          if (!r) continue;
          const res = await retryRequest(sb, firm.id, user.id, r);
          if (res.ok) { retried++; outcomes.push({ id, status: res.status }); }
        }
        return NextResponse.json({ ok: true, retried, outcomes });
      }
      case "delete":
        return NextResponse.json({ ok: true, deleted: await fundRequestDeleteMany(sb, firm.id, ids) });
      case "deleteAllReview":
        return NextResponse.json({ ok: true, deleted: await fundRequestDeleteByStatuses(sb, firm.id, REVIEW_STATUSES) });
      case "deleteAllFailed":
        return NextResponse.json({ ok: true, deleted: await fundRequestDeleteByStatuses(sb, firm.id, FAILED_STATUSES) });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
}
