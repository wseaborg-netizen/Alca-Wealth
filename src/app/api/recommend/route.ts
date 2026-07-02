/**
 * Client recommendation engine - takes a client profile and returns top fund matches.
 * Uses the existing screen + scoring infrastructure, tuned to the profile.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRecommendFund, getBenchmarkHistory, BENCHMARKS } from "@/lib/funds";
import { computePercentiles, compositeScore } from "@/lib/kpi";
import { cacheGet } from "@/lib/cache";
import universeData from "@/../data/universe.json";

type UniverseEntry = { ticker: string; name: string; category: string; vehicle: string; benchmark: string };
const UNIVERSE = universeData as UniverseEntry[];

export interface ClientProfile {
  riskTolerance: "conservative" | "moderate" | "aggressive";
  timeHorizon: "short" | "medium" | "long"; // <3y, 3-10y, 10y+
  incomeNeed: "none" | "some" | "high";
  costSensitivity: "low" | "medium" | "high";
  assetClass: string; // "Any", "US Equity", etc.
  vehicle: "Either" | "ETF" | "MF";
  notes: string; // free-text "client needs..."
}

function profileToPriorities(p: ClientProfile): string[] {
  const priorities: string[] = [];
  if (p.riskTolerance === "conservative") priorities.push("Downside protection");
  if (p.riskTolerance === "aggressive") priorities.push("Risk-adjusted return (Sharpe)");
  if (p.riskTolerance === "moderate") priorities.push("Risk-adjusted return (Sharpe)", "Downside protection");
  if (p.incomeNeed !== "none") priorities.push("Income / yield");
  if (p.costSensitivity === "high") priorities.push("Low cost");
  if (p.timeHorizon === "long") priorities.push("Alpha vs benchmark");
  if (p.timeHorizon === "long" || p.timeHorizon === "medium") priorities.push("Consistency vs category");
  return [...new Set(priorities)];
}

// NOTE: expenseRatio and ttmYield are stored in PERCENT units
// (e.g. 0.0945 = 0.0945%, 1.5 = 1.5%) - thresholds must match that scale.
function profileToMaxER(p: ClientProfile): number | null {
  if (p.costSensitivity === "high") return 0.30;   // ≤ 0.30%
  if (p.costSensitivity === "medium") return 1.00; // ≤ 1.00%
  return null;
}

function profileToMinYield(p: ClientProfile): number | null {
  if (p.incomeNeed === "high") return 2.0;  // ≥ 2%
  if (p.incomeNeed === "some") return 1.0;  // ≥ 1%
  return null;
}

function profileToCandidates(p: ClientProfile) {
  let candidates = UNIVERSE;

  // Asset class filter
  if (p.assetClass && p.assetClass !== "Any") {
    candidates = candidates.filter(f => {
      const cat = f.category.toLowerCase();
      const ac = p.assetClass.toLowerCase();
      if (ac === "us equity") return cat.includes("us equity") || cat.includes("sector");
      if (ac === "international equity") return cat.includes("international") || cat.includes("emerging") || cat.includes("world");
      if (ac === "fixed income") return cat.includes("bond") || cat.includes("income") || cat.includes("muni");
      if (ac === "allocation / balanced") return cat.includes("allocation") || cat.includes("target");
      return true;
    });
  }

  // Vehicle filter
  if (p.vehicle !== "Either") {
    candidates = candidates.filter(f => f.vehicle === p.vehicle);
  }

  // Notes keyword matching
  if (p.notes.trim()) {
    const words = p.notes.toLowerCase().split(/\s+/);
    const boost: typeof candidates = [];
    const rest: typeof candidates = [];
    for (const c of candidates) {
      const text = `${c.name} ${c.category}`.toLowerCase();
      if (words.some(w => w.length > 3 && text.includes(w))) boost.push(c);
      else rest.push(c);
    }
    candidates = [...boost, ...rest];
  }

  // Conservative → prefer lower vol categories
  if (p.riskTolerance === "conservative") {
    candidates = candidates.filter(f => {
      const cat = f.category.toLowerCase();
      return !cat.includes("small") && !cat.includes("emerging") && !cat.includes("thematic");
    });
  }

  return candidates.slice(0, 60); // will be trimmed by cache prioritisation below
}

/** Generate a plain-English reason for the recommendation */
function buildReason(profile: ClientProfile, fundName: string, rank: number): string {
  const parts: string[] = [];
  if (rank === 1) parts.push(`Top match for your client's profile.`);
  else if (rank === 2) parts.push(`Strong alternative.`);
  else parts.push(`Solid option to consider.`);

  if (profile.incomeNeed === "high") parts.push("Ranks highly for income generation.");
  else if (profile.incomeNeed === "some") parts.push("Provides moderate income.");

  if (profile.riskTolerance === "conservative") parts.push("Lower drawdown profile suits conservative clients.");
  else if (profile.riskTolerance === "aggressive") parts.push("Strong risk-adjusted returns for growth-oriented clients.");

  if (profile.costSensitivity === "high") parts.push("Cost-efficient choice.");
  if (profile.timeHorizon === "long") parts.push("Consistent long-term track record.");

  return parts.join(" ");
}

export async function POST(req: NextRequest) {
  const profile: ClientProfile = await req.json();

  const candidates = profileToCandidates(profile);
  if (!candidates.length) return NextResponse.json({ funds: [] });

  const priorities = profileToPriorities(profile);
  const maxER = profileToMaxER(profile);
  const minYield = profileToMinYield(profile);

  // Warm benchmark caches (parallel, non-blocking on failure)
  await Promise.allSettled(BENCHMARKS.map(b => getBenchmarkHistory(b)));

  // Split into warm (already in rec cache) vs cold.
  // getRecommendFund uses its own cache key "fund:rec:<ticker>" with 3y history.
  const cacheHits = await Promise.all(
    candidates.map(c => cacheGet(`fund:rec:${c.ticker}`).then(v => !!v))
  );
  const warm = candidates.filter((_, i) => cacheHits[i]);
  const cold = candidates.filter((_, i) => !cacheHits[i]);

  // All warm + up to 20 cold in parallel.
  // getRecommendFund fetches 3y of data (~0.5s each) vs 10y (~2s each),
  // so 20 parallel cold calls complete in ~1-2s total.
  const toFetch = [...warm, ...cold.slice(0, 20)];

  const settled = await Promise.allSettled(
    toFetch.map(c => getRecommendFund(c.ticker, c.vehicle, c.category, c.benchmark))
  );
  const records = settled
    .filter(r => r.status === "fulfilled")
    .map(r => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof getRecommendFund>>>).value);

  // Post-fetch filters
  let filtered = records;
  if (maxER != null) filtered = filtered.filter(r => r.expenseRatio == null || r.expenseRatio <= maxER);
  if (minYield != null) filtered = filtered.filter(r => r.kpi.ttmYield != null && r.kpi.ttmYield >= minYield);
  filtered = filtered.filter(r => !r.error);

  if (!filtered.length) return NextResponse.json({ funds: [], message: "No funds matched this profile. Try relaxing constraints." });

  // Score
  const pcts = computePercentiles(filtered.map(r => ({ kpi: r.kpi, expenseRatio: r.expenseRatio ?? 1 })));
  const scored = filtered.map((r, i) => ({
    ...r,
    percentiles: pcts[i],
    compositeScore: compositeScore(pcts[i], priorities),
  }));
  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  const top5 = scored.slice(0, 5).map((r, i) => ({
    ...r,
    reason: buildReason(profile, r.name, i + 1),
  }));

  return NextResponse.json({ funds: top5, priorities });
}
