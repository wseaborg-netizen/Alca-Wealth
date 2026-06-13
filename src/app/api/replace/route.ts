/**
 * Fund Replacement Engine — given a fund a client holds + a reason to switch,
 * returns ranked alternatives in the same category.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRecommendFund, getBenchmarkHistory, BENCHMARKS } from "@/lib/funds";
import { computePercentiles, compositeScore } from "@/lib/kpi";
import { cacheGet } from "@/lib/cache";
import universeData from "@/../data/universe.json";

type UniverseEntry = { ticker: string; name: string; category: string; vehicle: string; benchmark: string };
const UNIVERSE = universeData as UniverseEntry[];

const REASON_PRIORITIES: Record<string, string[]> = {
  cost:      ["Low cost"],
  alpha:     ["Alpha vs benchmark", "Consistency vs category", "Risk-adjusted return (Sharpe)"],
  risk:      ["Downside protection", "Risk-adjusted return (Sharpe)"],
  yield:     ["Income / yield"],
  overall:   ["Risk-adjusted return (Sharpe)", "Downside protection", "Low cost"],
};

export async function POST(req: NextRequest) {
  const { currentTicker, reason = "overall", amount } = await req.json() as {
    currentTicker: string;
    reason?: "cost" | "alpha" | "risk" | "yield" | "overall";
    amount?: number;
  };

  if (!currentTicker) return NextResponse.json({ error: "currentTicker required" }, { status: 400 });

  // Warm benchmarks
  await Promise.allSettled(BENCHMARKS.map(b => getBenchmarkHistory(b)));

  // Fetch current fund
  const entry = UNIVERSE.find(u => u.ticker.toUpperCase() === currentTicker.toUpperCase());
  let currentFund;
  try {
    const ticker = entry?.ticker ?? currentTicker.toUpperCase();
    const vehicle = entry?.vehicle ?? "ETF";
    const category = entry?.category ?? "US Equity Large Blend";
    const benchmark = entry?.benchmark ?? "SPY";
    currentFund = await getRecommendFund(ticker, vehicle, category, benchmark);
  } catch {
    return NextResponse.json({ error: `Could not fetch data for ${currentTicker}` }, { status: 400 });
  }

  if (currentFund.error) {
    return NextResponse.json({ error: `No data available for ${currentTicker}` }, { status: 400 });
  }

  // Find candidates in same category (broad match)
  const cat = currentFund.category.toLowerCase();
  const assetClass = cat.includes("bond") || cat.includes("income") || cat.includes("fixed") ? "fixed"
    : cat.includes("international") || cat.includes("emerging") || cat.includes("world") ? "intl"
    : cat.includes("allocation") || cat.includes("target") ? "alloc"
    : "equity";

  let candidates = UNIVERSE.filter(u => {
    if (u.ticker.toUpperCase() === currentTicker.toUpperCase()) return false;
    const c = u.category.toLowerCase();
    if (assetClass === "fixed") return c.includes("bond") || c.includes("income") || c.includes("fixed");
    if (assetClass === "intl") return c.includes("international") || c.includes("emerging") || c.includes("world") || c.includes("global");
    if (assetClass === "alloc") return c.includes("allocation") || c.includes("target");
    return !c.includes("bond") && !c.includes("income") && !c.includes("international") &&
      !c.includes("emerging") && !c.includes("allocation") && !c.includes("target");
  });

  // Prefer same category, then same asset class
  const sameCat = candidates.filter(u => u.category === currentFund.category);
  const rest = candidates.filter(u => u.category !== currentFund.category);
  candidates = [...sameCat, ...rest].slice(0, 50);

  // Split warm / cold
  const hits = await Promise.all(candidates.map(c => cacheGet(`fund:rec:${c.ticker}`).then(v => !!v)));
  const warm = candidates.filter((_, i) => hits[i]);
  const cold = candidates.filter((_, i) => !hits[i]);
  const toFetch = [...warm, ...cold.slice(0, 16)];

  const settled = await Promise.allSettled(
    toFetch.map(c => getRecommendFund(c.ticker, c.vehicle, c.category, c.benchmark))
  );
  const records = settled
    .filter(r => r.status === "fulfilled" && !(r as PromiseFulfilledResult<Awaited<ReturnType<typeof getRecommendFund>>>).value.error)
    .map(r => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof getRecommendFund>>>).value);

  if (records.length < 2) {
    return NextResponse.json({ error: "Not enough data to compare alternatives. Try again in a moment." }, { status: 400 });
  }

  // Score all (including current for context)
  const allFunds = [currentFund, ...records];
  const pcts = computePercentiles(allFunds.map(r => ({ kpi: r.kpi, expenseRatio: r.expenseRatio ?? 1 })));
  const priorities = REASON_PRIORITIES[reason] ?? REASON_PRIORITIES.overall;

  const scored = allFunds.map((r, i) => ({
    ...r,
    percentiles: pcts[i],
    compositeScore: compositeScore(pcts[i], priorities),
  }));

  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  const currentScored = scored.find(f => f.ticker.toUpperCase() === currentTicker.toUpperCase())!;
  const alternatives = scored.filter(f => f.ticker.toUpperCase() !== currentTicker.toUpperCase()).slice(0, 6);

  // Compute annual savings vs current fund's ER
  const investAmount = typeof amount === "number" && amount > 0 ? amount : 100000;
  // expenseRatio is in PERCENT units (0.45 = 0.45%), so divide by 100 for $ savings
  const altWithSavings = alternatives.map(alt => ({
    ...alt,
    annualSavings: currentScored.expenseRatio != null && alt.expenseRatio != null
      ? (currentScored.expenseRatio - alt.expenseRatio) / 100 * investAmount
      : null,
  }));

  return NextResponse.json({ current: currentScored, alternatives: altWithSavings, priorities, investAmount });
}
