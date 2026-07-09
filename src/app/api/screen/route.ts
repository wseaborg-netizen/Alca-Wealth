import { NextRequest, NextResponse } from "next/server";
import { getFund, getBenchmarkHistory, BENCHMARKS } from "@/lib/funds";
import { computePercentiles, compositeScore } from "@/lib/kpi";
import { UNIVERSE } from "@/lib/universe";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    assetClass,
    marketCap,
    style,
    vehicle,
    maxExpenseRatio,
    minYield,
    minTrackRecord,
    minAlpha,
    minSharpe,
    minReturn3y,
    search,
    priorities,
    categories,
  } = body as {
    assetClass?: string;
    marketCap?: string;
    style?: string;
    vehicle?: string;
    maxExpenseRatio?: number;
    minYield?: number;
    minTrackRecord?: number;
    minAlpha?: number;
    minSharpe?: number;
    minReturn3y?: number;
    search?: string;
    priorities?: string[];
    categories?: string[];
  };

  // Filter universe
  let candidates = UNIVERSE;

  // Style-box: explicit category selection (union of selected boxes).
  // When present, this is the primary cap/style filter and takes precedence.
  if (Array.isArray(categories) && categories.length > 0) {
    const want = new Set(categories.map((c) => c.toLowerCase()));
    candidates = candidates.filter((f) => want.has(f.category.toLowerCase()));
  }

  if (assetClass && assetClass !== "Any") {
    candidates = candidates.filter((f) => {
      const cat = f.category.toLowerCase();
      const ac = assetClass.toLowerCase();
      if (ac === "us equity") return cat.includes("us equity") || cat.includes("sector");
      if (ac === "international equity") return cat.includes("international") || cat.includes("emerging") || cat.includes("world");
      if (ac === "fixed income") return cat.includes("bond") || cat.includes("income") || cat.includes("muni") || cat.includes("treasury") || cat.includes("inflation");
      if (ac === "allocation / balanced") return cat.includes("allocation") || cat.includes("balanced") || cat.includes("target");
      if (ac === "sector / thematic") return cat.includes("sector");
      if (ac === "alternatives") return cat.includes("commodit") || cat.includes("alternative") || cat.includes("real asset");
      return true;
    });
  }

  if (marketCap && marketCap !== "Any") {
    const mc = marketCap.toLowerCase();
    candidates = candidates.filter((f) => {
      const cat = f.category.toLowerCase();
      if (mc === "large cap") return cat.includes("large");
      if (mc === "mid cap") return cat.includes("mid");
      if (mc === "small cap") return cat.includes("small");
      return true;
    });
  }

  if (style && style !== "Any") {
    const s = style.toLowerCase();
    candidates = candidates.filter((f) => {
      const cat = f.category.toLowerCase();
      if (s === "growth") return cat.includes("growth");
      if (s === "value") return cat.includes("value");
      if (s === "blend") return cat.includes("blend") || (!cat.includes("growth") && !cat.includes("value"));
      return true;
    });
  }

  if (vehicle && vehicle !== "Either") {
    candidates = candidates.filter((f) =>
      f.vehicle.toLowerCase() === vehicle.toLowerCase()
    );
  }

  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    candidates = candidates.filter(
      (f) =>
        f.ticker.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
    );
  }

  // Limit to 40 candidates max to stay within API budget
  candidates = candidates.slice(0, 40);

  if (candidates.length === 0) {
    return NextResponse.json({ funds: [], message: "No funds matched the filters." });
  }

  // Pre-warm benchmark caches
  await Promise.allSettled(BENCHMARKS.map((b) => getBenchmarkHistory(b)));

  // Fetch all candidate fund data (serial to respect rate limits)
  const records = [];
  for (const c of candidates) {
    try {
      const r = await getFund(c.ticker, c.vehicle, c.category, c.benchmark);
      records.push(r);
    } catch {
      // skip on fetch error
    }
  }

  // Apply post-fetch filters
  let filtered = records;

  if (maxExpenseRatio != null) {
    filtered = filtered.filter(
      (r) => r.expenseRatio == null || r.expenseRatio <= maxExpenseRatio
    );
  }

  if (minTrackRecord != null) {
    filtered = filtered.filter(
      (r) => r.fundAge == null || r.fundAge >= minTrackRecord
    );
  }

  if (minYield != null) {
    filtered = filtered.filter(
      (r) => r.kpi.ttmYield != null && r.kpi.ttmYield >= minYield
    );
  }

  if (minAlpha != null) {
    filtered = filtered.filter((r) => r.kpi.alpha3y != null && r.kpi.alpha3y >= minAlpha);
  }
  if (minSharpe != null) {
    filtered = filtered.filter((r) => r.kpi.sharpe3y != null && r.kpi.sharpe3y >= minSharpe);
  }
  if (minReturn3y != null) {
    filtered = filtered.filter((r) => r.kpi.return3y != null && r.kpi.return3y >= minReturn3y);
  }

  if (filtered.length === 0) {
    return NextResponse.json({ funds: [], message: "No funds passed the expense/track-record filter." });
  }

  // Compute percentiles + composite scores
  const pcts = computePercentiles(
    filtered.map((r) => ({ kpi: r.kpi, expenseRatio: r.expenseRatio ?? 1 }))
  );

  const scored = filtered.map((r, i) => ({
    ...r,
    percentiles: pcts[i],
    compositeScore: compositeScore(pcts[i], priorities ?? []),
  }));

  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  return NextResponse.json({ funds: scored });
}
