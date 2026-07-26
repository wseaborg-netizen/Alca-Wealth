/**
 * Fund selection for the Portfolio Builder — powered by the unified Advisor
 * Review Score engine (the same one behind Analysis, the Screener, and
 * Similar Funds). Each sleeve maps to a scoring CONTEXT (core → Low Cost /
 * Core Index, growth → Growth, bonds → Downside Protection or Income by
 * goal), candidates are scored peer-relative within the sleeve's category
 * pool, and the pick carries an advisor-safe reason. A curated seed fund is
 * always in the pool; when live metrics are unavailable the route falls back
 * honestly (reason states it) — scores are never invented.
 */
import { NextRequest, NextResponse } from "next/server";
import { getFund, getBenchmarkHistory, BENCHMARKS } from "@/lib/market-data/fundService";
import { getMergedUniverse } from "@/lib/universeServer";
import { rankRecords, sleeveContext } from "@/lib/metrics/recordScore";
import { CONTEXT_LABELS } from "@/lib/metrics/score";

const CANDIDATES_PER_SLEEVE = 8;

interface SleeveReq { key: string; category: string; vehicle: string; seed: string }

export async function POST(req: NextRequest) {
  const { sleeves, goal } = (await req.json()) as { sleeves: SleeveReq[]; goal?: string };
  if (!Array.isArray(sleeves) || sleeves.length === 0) {
    return NextResponse.json({ error: "sleeves required" }, { status: 400 });
  }

  const [UNIVERSE] = await Promise.all([
    getMergedUniverse(),
    Promise.allSettled(BENCHMARKS.map((b) => getBenchmarkHistory(b))),
  ]);

  const picks: Record<string, {
    ticker: string; name: string; vehicle: string; expenseRatio: number | null;
    reason: string; score: number | null; poolSize: number; context: string;
  }> = {};

  await Promise.all(sleeves.map(async (s) => {
    const seedTicker = (s.seed || "").toUpperCase();
    const preferVehicle = s.vehicle;

    // Candidate pool: same category, prefer the requested vehicle. Always include the seed.
    let pool = UNIVERSE.filter((u) => u.category === s.category);
    const sameVeh = pool.filter((u) => u.vehicle === preferVehicle);
    if (sameVeh.length >= 3) pool = sameVeh;

    const seedEntry = UNIVERSE.find((u) => u.ticker.toUpperCase() === seedTicker);
    let candidates = pool.slice(0, CANDIDATES_PER_SLEEVE);
    if (seedEntry && !candidates.find((c) => c.ticker.toUpperCase() === seedTicker)) {
      candidates = [seedEntry, ...candidates].slice(0, CANDIDATES_PER_SLEEVE);
    }
    if (candidates.length === 0 && seedEntry) candidates = [seedEntry];

    // Fetch metrics
    const settled = await Promise.allSettled(
      candidates.map((c) => getFund(c.ticker, c.vehicle, c.category, c.benchmark))
    );
    const records = settled
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof getFund>>> =>
        r.status === "fulfilled" && !r.value.error)
      .map((r) => r.value);

    // Fallback: nothing usable -> seed (or first candidate)
    if (records.length === 0) {
      const fb = seedEntry ?? candidates[0];
      if (fb) picks[s.key] = { ticker: fb.ticker, name: fb.name, vehicle: fb.vehicle,
        expenseRatio: null, reason: "Curated core fund (live metrics unavailable).",
        score: null, poolSize: 0, context: sleeveContext(s.category, goal) };
      return;
    }

    // Score the pool with the unified engine, context chosen by sleeve type.
    const context = sleeveContext(s.category, goal);
    const ranked = rankRecords(records, context, "3Y");
    const win = ranked[0];
    if (!win || win.score == null) {
      // Not enough peer data to score — fall back to the cheapest candidate,
      // and say so instead of inventing a score.
      const cheapest = [...records].sort((a, b) => (a.expenseRatio ?? 99) - (b.expenseRatio ?? 99))[0];
      picks[s.key] = { ticker: cheapest.ticker, name: cheapest.name, vehicle: cheapest.vehicle,
        expenseRatio: cheapest.expenseRatio,
        reason: `Lowest-cost ${s.category} candidate (insufficient peer data to score this sleeve).`,
        score: null, poolSize: records.length, context };
      return;
    }

    const erPct = win.item.expenseRatio != null ? ` (${win.item.expenseRatio.toFixed(2)}% expense)` : "";
    const reason = `Fits the sleeve — strongest peer-relative score for ${CONTEXT_LABELS[context]} among ${records.length} ${s.category} funds${erPct}. ${win.reason ?? ""}`.trim();

    picks[s.key] = {
      ticker: win.item.ticker, name: win.item.name, vehicle: win.item.vehicle,
      expenseRatio: win.item.expenseRatio, reason, score: win.score, poolSize: records.length, context,
    };
  }));

  return NextResponse.json({ picks, goal: goal ?? "balanced" });
}
