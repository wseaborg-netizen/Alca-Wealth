import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext, fundRequestByTicker } from "@/lib/db";
import { normalizeTicker } from "@/lib/tickerNormalize";
import { findFund } from "@/lib/universe";

/**
 * Status of a single fund request (firm-scoped). Also reports when the ticker
 * is already in the verified universe, so a caller can distinguish
 * "already available" from "no request on file".
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ request: null }, { status: 401 });

  const { ticker } = await params;
  const norm = normalizeTicker(ticker);
  if (!norm.ok) return NextResponse.json({ error: norm.reason }, { status: 400 });

  const inUniverse = findFund(norm.normalized);
  try {
    const request = await fundRequestByTicker(ctx.sb, ctx.firm.id, norm.normalized);
    return NextResponse.json({
      ticker: norm.normalized,
      alreadyInUniverse: !!inUniverse,
      request: request ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Could not load the fund request." }, { status: 500 });
  }
}
