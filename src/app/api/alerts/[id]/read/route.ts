import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext, alertSetStatus } from "@/lib/db";

/** Mark one alert read (firm-scoped via RLS). 401 signed out. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  try {
    const ok = await alertSetStatus(ctx.sb, ctx.firm.id, id, "read");
    if (!ok) return NextResponse.json({ error: "Alert not found." }, { status: 404 });
    return NextResponse.json({ ok: true, status: "read" });
  } catch {
    return NextResponse.json({ error: "Could not update alert." }, { status: 500 });
  }
}
