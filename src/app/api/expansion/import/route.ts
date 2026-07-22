import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext } from "@/lib/db";
import { processTicker } from "@/lib/expansionServer";

/**
 * Expansion — bulk/single import. Body `{ tickers: string[] }` (or `{ ticker }`).
 * Each ticker resolves to exactly one lifecycle state (verified / needs review /
 * duplicate / failed / unsupported). Verified funds are inserted into the
 * dynamic universe immediately. Auth-gated. No fabricated data.
 */
const MAX_PER_IMPORT = 200;

export async function POST(req: NextRequest) {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await req.json().catch(() => null) as { tickers?: unknown; ticker?: unknown } | null;
  const raw = Array.isArray(body?.tickers) ? body!.tickers : body?.ticker != null ? [body.ticker] : [];
  const tickers = Array.from(new Set(
    raw.map((t) => String(t).trim().toUpperCase()).filter(Boolean),
  )).slice(0, MAX_PER_IMPORT);

  if (tickers.length === 0) return NextResponse.json({ error: "Provide one or more tickers." }, { status: 400 });

  const summary = { added: 0, needsReview: 0, duplicates: 0, failed: 0, unsupported: 0, total: tickers.length };
  const results: { ticker: string; status: string; bucket: string; fundName: string | null }[] = [];

  for (const t of tickers) {
    try {
      const o = await processTicker(ctx.sb, ctx.firm.id, ctx.user.id, t);
      results.push(o);
      if (o.bucket === "verified") summary.added++;
      else if (o.bucket === "review") summary.needsReview++;
      else if (o.bucket === "duplicate") summary.duplicates++;
      else if (o.bucket === "unsupported") summary.unsupported++;
      else summary.failed++;
    } catch {
      summary.failed++;
      results.push({ ticker: t, status: "failed", bucket: "failed", fundName: null });
    }
  }

  return NextResponse.json({ summary, results }, { headers: { "Cache-Control": "no-store" } });
}
