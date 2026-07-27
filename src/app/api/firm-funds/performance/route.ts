import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext } from "@/lib/db";
import { firmFundsList } from "@/lib/firmReviews";
import { boundedPerformance } from "@/lib/firmInventory";
import { getMarketQuote } from "@/lib/market-data/marketQuote";

/**
 * Bounded performance enrichment for the firm's OWN inventory only. The client
 * posts the tickers it is displaying; the server intersects them with the firm's
 * actual firm_funds holdings (so this can't be used to drive arbitrary provider
 * calls), then fetches each via the cached, normalized market-quote service.
 *
 * Per-ticker failures are isolated → that row is Unavailable, the batch still
 * succeeds. Only the normalized { recentReturn, spark } reaches the client — no
 * raw provider shape and no credential are ever returned.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ performance: null }, { status: 401 });

  const body = await req.json().catch(() => null) as { tickers?: unknown } | null;
  const requested = Array.isArray(body?.tickers) ? body!.tickers.filter((t): t is string => typeof t === "string") : [];
  if (!requested.length) return NextResponse.json({ performance: {} });

  try {
    const funds = await firmFundsList(ctx.sb, ctx.firm.id);
    const firmTickers = new Set(funds.map((f) => f.normalized_ticker));
    const performance = await boundedPerformance(requested, firmTickers, (t) => getMarketQuote(t, true));
    return NextResponse.json({ performance }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Enrichment must never break the inventory; the client falls back to Unavailable.
    return NextResponse.json({ performance: {} }, { status: 200 });
  }
}
