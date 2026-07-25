import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext, scenariosList, scenarioUpsert, scenarioDelete } from "@/lib/db";

/** Saved Model scenarios — firm-scoped, RLS-enforced. */

export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ scenarios: [] });
  try { return NextResponse.json({ scenarios: await scenariosList(ctx.sb, ctx.firm.id) }); }
  catch { return NextResponse.json({ scenarios: [] }); }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, name, tool, subject, assumptions, extra, version } = body ?? {};
  if (!name?.trim() || !tool || !assumptions)
    return NextResponse.json({ error: "name, tool, assumptions required" }, { status: 400 });
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  try {
    const savedId = await scenarioUpsert(ctx.sb, ctx.firm.id, ctx.user.id,
      { id, name: name.trim().slice(0, 80), tool, subject: subject ?? "", assumptions, extra, version });
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
  try { await scenarioDelete(ctx.sb, ctx.firm.id, id); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 }); }
}
