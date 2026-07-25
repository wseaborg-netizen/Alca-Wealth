/**
 * Scheduled SEC ticker-map refresh (Vercel Cron, daily). Re-downloads the
 * official company_tickers_mf.json into the shared cache so lookups never pay
 * the ~10MB fetch. Protected by CRON_SECRET; deterministic server code only.
 */
import { NextRequest, NextResponse } from "next/server";
import { loadTickerMap } from "@/lib/sec";
import { recordSync } from "@/lib/sec-store";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const map = await loadTickerMap(true);
  await recordSync("ticker-map", !!map, map ? undefined : "network");
  return NextResponse.json({ ok: !!map, tickers: map?.size ?? 0, at: Date.now() });
}
