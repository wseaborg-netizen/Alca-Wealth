import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext, comparisonsList, comparisonUpsert, comparisonDelete } from "@/lib/db";

/** Saved fund comparisons — firm-scoped, RLS-enforced. */

export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ comparisons: [] });
  try { return NextResponse.json({ comparisons: await comparisonsList(ctx.sb, ctx.firm.id) }); }
  catch { return NextResponse.json({ comparisons: [] }); }
}

export async function POST(req: NextRequest) {
  const { id, name, tickers } = await req.json() ?? {};
  if (!name?.trim() || !Array.isArray(tickers))
    return NextResponse.json({ error: "name and tickers[] required" }, { status: 400 });
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  try {
    const savedId = await comparisonUpsert(ctx.sb, ctx.firm.id, ctx.user.id,
      { id, name: name.trim().slice(0, 80), tickers });
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
  try { await comparisonDelete(ctx.sb, ctx.firm.id, id); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 }); }
}
