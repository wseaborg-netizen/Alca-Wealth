import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext, watchlistGet, watchlistAdd, watchlistRemove } from "@/lib/db";

/** Firm-scoped watchlist (default list per workspace). RLS enforces that the
    session user is a member of the firm — authorization is not React state. */

/** GET /api/watchlist - fetch saved tickers */
export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ tickers: [] });
  try {
    return NextResponse.json({ tickers: await watchlistGet(ctx.sb, ctx.firm.id) });
  } catch { return NextResponse.json({ tickers: [] }); }
}

/** POST /api/watchlist - add a ticker */
export async function POST(req: NextRequest) {
  const { ticker } = await req.json() as { ticker: string };
  if (!ticker?.trim()) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  try {
    await watchlistAdd(ctx.sb, ctx.firm.id, ctx.user.id, ticker);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

/** DELETE /api/watchlist - remove a ticker */
export async function DELETE(req: NextRequest) {
  const { ticker } = await req.json() as { ticker: string };
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  try {
    await watchlistRemove(ctx.sb, ctx.firm.id, ticker);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
