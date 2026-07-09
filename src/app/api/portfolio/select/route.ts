/**
 * Data-driven fund selection for the Portfolio Builder.
 *
 * For each target sleeve (asset-class bucket) we screen the universe within that
 * category, score every candidate on the same multi-factor engine the Screen tab
 * uses (cost, risk-adjusted return, downside protection, alpha, consistency,
 * yield) - weighted by the client's goal - and return the single best fund plus
 * a plain-English reason. A curated seed fund is always in the pool, and if live
 * metrics are unavailable we fall back to the lowest-cost fund in the category,
 * then to the seed, so a portfolio is always produced.
 */
import { NextRequest, NextResponse } from "next/server";
import { getFund, getBenchmarkHistory, BENCHMARKS } from "@/lib/funds";
import { computePercentiles, compositeScore } from "@/lib/kpi";
import { UNIVERSE } from "@/lib/universe";

// Goal -> which factors the score should weight (keys map into PRIORITY_MAP).
const GOAL_PRIORITIES: Record<string, string[]> = {
  income:   ["Income / yield", "Downside protection", "Low cost"],
  balanced: ["Risk-adjusted return (Sharpe)", "Low cost", "Downside protection"],
  growth:   ["Risk-adjusted return (Sharpe)", "Alpha vs benchmark", "Low cost"],
};

const FACTOR_PHRASE: Record<string, string> = {
  cost: "low cost", riskAdj: "strong risk-adjusted return", downside: "downside protection",
  alpha: "alpha vs benchmark", consistency: "consistency", yield: "income",
};

const CANDIDATES_PER_SLEEVE = 8;

interface SleeveReq { key: string; category: string; vehicle: string; seed: string }

export async function POST(req: NextRequest) {
  const { sleeves, goal } = (await req.json()) as { sleeves: SleeveReq[]; goal?: string };
  if (!Array.isArray(sleeves) || sleeves.length === 0) {
    return NextResponse.json({ error: "sleeves required" }, { status: 400 });
  }
  const priorities = GOAL_PRIORITIES[goal ?? "balanced"] ?? GOAL_PRIORITIES.balanced;

  await Promise.allSettled(BENCHMARKS.map((b) => getBenchmarkHistory(b)));

  const picks: Record<string, {
    ticker: string; name: string; vehicle: string; expenseRatio: number | null;
    reason: string; score: number | null; poolSize: number;
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
        expenseRatio: null, reason: "Curated core fund (live metrics unavailable).", score: null, poolSize: 0 };
      return;
    }

    // Score the pool
    const pcts = computePercentiles(records.map((r) => ({ kpi: r.kpi, expenseRatio: r.expenseRatio ?? 1 })));
    const scored = records.map((r, i) => ({ r, p: pcts[i], score: compositeScore(pcts[i], priorities) }));
    scored.sort((a, b) => b.score - a.score);
    const win = scored[0];

    // Build reason from the winner's two strongest factors
    const topFactors = (Object.entries(win.p) as [string, number][])
      .sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => FACTOR_PHRASE[k] ?? k);
    const erPct = win.r.expenseRatio != null ? ` (${win.r.expenseRatio.toFixed(2)}% expense)` : "";
    const reason = `Best fit among ${records.length} ${s.category} funds - ${topFactors[0]} and ${topFactors[1]}${erPct}.`;

    picks[s.key] = {
      ticker: win.r.ticker, name: win.r.name, vehicle: win.r.vehicle,
      expenseRatio: win.r.expenseRatio, reason, score: win.score, poolSize: records.length,
    };
  }));

  return NextResponse.json({ picks, goal: goal ?? "balanced" });
}
