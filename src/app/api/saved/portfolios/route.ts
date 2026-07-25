import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext, portfoliosList, portfolioUpsert, portfolioDelete } from "@/lib/db";

/** Saved portfolios — firm-scoped, RLS-enforced.
    Names must be anonymous/de-identified labels; never real client names. */

export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ portfolios: [] });
  try { return NextResponse.json({ portfolios: await portfoliosList(ctx.sb, ctx.firm.id) }); }
  catch { return NextResponse.json({ portfolios: [] }); }
}

export async function POST(req: NextRequest) {
  const { id, name, payload } = await req.json() ?? {};
  if (!name?.trim() || !payload)
    return NextResponse.json({ error: "name and payload required" }, { status: 400 });
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  try {
    const savedId = await portfolioUpsert(ctx.sb, ctx.firm.id, ctx.user.id,
      { id, name: name.trim().slice(0, 80), payload });
    return NextResponse.json({ ok: true, id: savedId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  try { await portfolioDelete(ctx.sb, ctx.firm.id, id); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 }); }
}
