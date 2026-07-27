import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext } from "@/lib/db";
import { firmFundByTicker, reviewsForFirmFund } from "@/lib/firmReviews";

/**
 * Firm-fund context for the contextual workspace — firm-scoped, RLS-enforced.
 * Returns the firm's own firm_funds row for a ticker (or null when the fund is
 * not in the firm's inventory) plus its read-only review history. The firm is
 * resolved server-side (requireFirmContext); the browser never supplies the firm identity.
 * Canonical identity (name/category/benchmark/vehicle) is NOT returned here — the
 * client already resolves it from the universe via /api/funds; nothing is
 * duplicated. No provider payload is involved.
 */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 400 });

  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ firmFund: null, reviews: [] }, { status: 401 });

  try {
    const firmFund = await firmFundByTicker(ctx.sb, ctx.firm.id, ticker);
    const reviews = firmFund ? await reviewsForFirmFund(ctx.sb, ctx.firm.id, firmFund.id) : [];
    return NextResponse.json({ firmFund, reviews }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not load firm context." }, { status: 500 });
  }
}
