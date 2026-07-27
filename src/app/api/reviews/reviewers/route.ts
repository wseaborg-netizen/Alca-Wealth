import { NextResponse } from "next/server";
import { requireFirmContext } from "@/lib/db";
import { firmReviewersList } from "@/lib/firmReviews";

/**
 * Eligible reviewers — members of the CURRENT firm only (firm resolved server-
 * side). Other firms' users are never exposed. Only user ids + roles are
 * available under RLS; the current user is flagged so the UI can label "You".
 * Assigning an arbitrary cross-firm user id is rejected by the DB composite FK
 * from assigned_reviewer to the firm's membership table.
 */
export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ reviewers: null }, { status: 401 });
  try {
    const members = await firmReviewersList(ctx.sb, ctx.firm.id);
    const reviewers = members.map((m) => ({ userId: m.userId, role: m.role, isSelf: m.userId === ctx.user.id }));
    return NextResponse.json({ reviewers }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load reviewers." }, { status: 500 });
  }
}
