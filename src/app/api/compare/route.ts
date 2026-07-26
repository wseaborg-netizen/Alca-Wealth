import { NextRequest, NextResponse } from "next/server";
import { getFund, getRecommendFund, getBenchmarkHistory, BENCHMARKS, inferVehicle, type FundRecord } from "@/lib/market-data/fundService";
import { computePercentiles } from "@/lib/kpi";
import { getMergedUniverse } from "@/lib/universeServer";
import { type UniverseFund } from "@/lib/universe";

const MAX_FUNDS = 6;
const MAX_COLD_PEERS = 16; // budget for cold peer fetches across all categories

export async function POST(req: NextRequest) {
  const { tickers } = await req.json() as { tickers: string[] };

  if (!tickers?.length || tickers.length < 1) {
    return NextResponse.json({ error: "At least one ticker required" }, { status: 400 });
  }

  const limited = tickers.slice(0, MAX_FUNDS).map((t) => t.toUpperCase());

  // Pre-warm benchmark caches + load the merged universe (base + verified dynamic)
  const [UNIVERSE] = await Promise.all([
    getMergedUniverse(),
    Promise.allSettled(BENCHMARKS.map((b) => getBenchmarkHistory(b))),
  ]);

  // Fetch the compared funds (full 5y data)
  const records = await Promise.all(
    limited.map(async (t) => {
      const entry = UNIVERSE.find((u) => u.ticker === t);
      return getFund(t, entry?.vehicle ?? inferVehicle(t), entry?.category ?? "Other", entry?.benchmark ?? "SPY");
    })
  );

  // ── Category-relative percentiles ──
  // Gather same-category peers for each fund and rank each fund WITHIN its category,
  // so the percentiles mean "vs. its category" rather than "vs. the 2-6 compared funds".
  const distinctCats = [...new Set(records.map((r) => r.category))];
  const comparedTickers = new Set(limited);

  // Deterministic peer fetch plan, capped to a bounded budget.
  const peerPlan: { ticker: string; entry: UniverseFund }[] = [];
  for (const cat of distinctCats) {
    const peers = UNIVERSE.filter((u) => u.category === cat && !comparedTickers.has(u.ticker));
    peers.forEach((p) => peerPlan.push({ ticker: p.ticker, entry: p }));
  }
  const toFetch = peerPlan.slice(0, MAX_COLD_PEERS);

  const peerSettled = await Promise.allSettled(
    toFetch.map((p) => getRecommendFund(p.ticker, p.entry.vehicle, p.entry.category, p.entry.benchmark))
  );
  const peerRecords: FundRecord[] = peerSettled
    .filter((r): r is PromiseFulfilledResult<FundRecord> => r.status === "fulfilled" && !r.value.error)
    .map((r) => r.value);

  // Index peers by category
  const peersByCat = new Map<string, FundRecord[]>();
  for (const pr of peerRecords) {
    const arr = peersByCat.get(pr.category) ?? [];
    arr.push(pr);
    peersByCat.set(pr.category, arr);
  }

  // For each compared fund, compute its percentile inside its category pool.
  const result = records.map((r) => {
    const pool = [r, ...(peersByCat.get(r.category) ?? [])];
    // Only meaningful if we have a real peer group; otherwise fall back to a neutral profile.
    const pcts = computePercentiles(pool.map((f) => ({ kpi: f.kpi, expenseRatio: f.expenseRatio ?? 1 })));
    const me = pcts[0] ?? { cost: 50, riskAdj: 50, downside: 50, alpha: 50, consistency: 50, yield: 50 };
    return { ...r, percentiles: me, peerCount: pool.length - 1 };
  });

  return NextResponse.json({ funds: result });
}
