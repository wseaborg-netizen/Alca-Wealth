import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext } from "@/lib/db";
import { firmFundsList } from "@/lib/firmReviews";
import { getMergedUniverse } from "@/lib/universeServer";
import { boundedPeriodPerformance, fetchPeriodPerformance } from "@/lib/firmPerformance";

/**
 * Bounded ALL-PERIOD performance enrichment for the firm's OWN inventory only.
 * The client posts the tickers it is displaying; the server intersects them with
 * the firm's actual firm_funds holdings (so this can't drive arbitrary provider
 * calls), resolves each fund's vehicle from the universe (ETF → adjusted, mutual
 * fund → NAV), and fetches all six period windows from one cached history call.
 *
 * Per-ticker failures are isolated → that row is Unavailable, the batch still
 * succeeds. Only normalized { recentReturn, spark } per period reaches the client
 * — no raw provider shape and no credential are ever returned. The client selects
 * which period to display, so switching periods needs no re-fetch.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ performance: null }, { status: 401 });

  const body = await req.json().catch(() => null) as { tickers?: unknown } | null;
  const requested = Array.isArray(body?.tickers) ? body!.tickers.filter((t): t is string => typeof t === "string") : [];
  if (!requested.length) return NextResponse.json({ performance: {} });

  try {
    const [funds, universe] = await Promise.all([firmFundsList(ctx.sb, ctx.firm.id), getMergedUniverse(ctx.sb)]);
    const firmTickers = new Set(funds.map((f) => f.normalized_ticker));
    const vehicleByTicker = new Map(universe.map((u) => [u.ticker, u.vehicle]));
    const vehicleOf = (t: string) => vehicleByTicker.get(t) ?? null;
    const performance = await boundedPeriodPerformance(requested, firmTickers, vehicleOf, fetchPeriodPerformance);
    return NextResponse.json({ performance }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Enrichment must never break the inventory; the client falls back to Unavailable.
    return NextResponse.json({ performance: {} }, { status: 200 });
  }
}
