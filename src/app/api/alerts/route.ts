import { NextResponse } from "next/server";
import { requireFirmContext, alertsList, alertCounts, monitoredEntitiesList } from "@/lib/db";

/** Advisor alerts feed + monitored saved funds (firm-scoped, RLS). 401 signed out. */
export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ alerts: null }, { status: 401 });
  try {
    const [alerts, counts, monitored] = await Promise.all([
      alertsList(ctx.sb, ctx.firm.id, { limit: 100 }),
      alertCounts(ctx.sb, ctx.firm.id),
      monitoredEntitiesList(ctx.sb, ctx.firm.id),
    ]);
    return NextResponse.json({ alerts, counts, monitored }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load alerts." }, { status: 500 });
  }
}
