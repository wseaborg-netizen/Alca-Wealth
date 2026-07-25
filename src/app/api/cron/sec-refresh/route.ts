/**
 * Scheduled SEC refresh (Vercel Cron, every 6h) — keeps tracked funds fresh
 * with zero manual involvement. Protected by CRON_SECRET (Vercel injects
 * `Authorization: Bearer <CRON_SECRET>` on scheduled invocations).
 * Deterministic server code only: no AI, no developer commands.
 */
import { NextRequest, NextResponse } from "next/server";
import { refreshTicker } from "@/lib/sec-service";
import { computeFreshness } from "@/lib/sec";
import { listTrackedTickers, getSyncStatus } from "@/lib/sec-store";

export const maxDuration = 60;
const BATCH = 8;                       // safe batch per run under the 4 rps global cap
const SKIP_IF_FRESHER_THAN = 5.5 * 60 * 60 * 1000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never run unauthenticated
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tracked = await listTrackedTickers(60);
  const results: { ticker: string; action: string }[] = [];
  let refreshed = 0;

  for (const t of tracked) {
    if (refreshed >= BATCH) { results.push({ ticker: t, action: "deferred" }); continue; }
    try {
      const sync = await getSyncStatus(t);
      if (computeFreshness(sync?.lastSuccessful ?? null, Date.now(), SKIP_IF_FRESHER_THAN) === "fresh") {
        results.push({ ticker: t, action: "skipped_fresh" });
        continue;
      }
      const out = await refreshTicker(t);
      refreshed++;
      results.push({ ticker: t, action: out ? "refreshed" : "locked_or_unavailable" });
    } catch {
      results.push({ ticker: t, action: "failed" }); // one failure never stops the batch
    }
  }
  return NextResponse.json({ ok: true, tracked: tracked.length, refreshed, results, at: Date.now() });
}
