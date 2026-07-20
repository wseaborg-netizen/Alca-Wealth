import { NextResponse } from "next/server";
import { requireFirmContext, dynamicFundsListVerified } from "@/lib/db";
import { getUniverseCounts } from "@/lib/universeServer";

/**
 * Expansion Hub summary — merged universe counts + recently added dynamic funds.
 * Auth-gated (internal). Returns safe identity fields only; no secrets/payloads.
 */
export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ counts: null }, { status: 401 });
  try {
    const [counts, dyn] = await Promise.all([
      getUniverseCounts(ctx.sb),
      dynamicFundsListVerified(ctx.sb),
    ]);
    const recent = dyn.slice(0, 12).map((f) => ({
      ticker: f.normalized_ticker, fund_name: f.fund_name, category: f.category,
      vehicle: f.vehicle, created_at: f.created_at,
    }));
    return NextResponse.json({ counts, recent }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load expansion summary." }, { status: 500 });
  }
}
