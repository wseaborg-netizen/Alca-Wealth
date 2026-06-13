/**
 * Fund-based factor recommendation.
 * Given a fund the client currently holds, find — for EACH factor (cost, risk-adjusted
 * return, downside protection, income, alpha) — the single best same-category alternative,
 * with a plain-English articulation of why and by how much.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRecommendFund, getBenchmarkHistory, BENCHMARKS } from "@/lib/funds";
import { computePercentiles } from "@/lib/kpi";
import { cacheGet } from "@/lib/cache";
import universeData from "@/../data/universe.json";

type UniverseEntry = { ticker: string; name: string; category: string; vehicle: string; benchmark: string };
const UNIVERSE = universeData as UniverseEntry[];

export async function POST(req: NextRequest) {
  const { currentTicker, amount } = (await req.json()) as { currentTicker: string; amount?: number };
  if (!currentTicker) return NextResponse.json({ error: "currentTicker required" }, { status: 400 });

  const investAmount = typeof amount === "number" && amount > 0 ? amount : 100000;

  // Warm benchmarks
  await Promise.allSettled(BENCHMARKS.map((b) => getBenchmarkHistory(b)));

  // Resolve current fund
  const entry = UNIVERSE.find((u) => u.ticker.toUpperCase() === currentTicker.toUpperCase());
  let currentFund;
  try {
    const ticker   = entry?.ticker   ?? currentTicker.toUpperCase();
    const vehicle  = entry?.vehicle  ?? "ETF";
    const category = entry?.category ?? "US Equity Large Blend";
    const benchmark = entry?.benchmark ?? "SPY";
    currentFund = await getRecommendFund(ticker, vehicle, category, benchmark);
  } catch {
    return NextResponse.json({ error: `Could not fetch data for ${currentTicker}` }, { status: 400 });
  }
  if (currentFund.error) {
    return NextResponse.json({ error: `No data available for ${currentTicker}` }, { status: 400 });
  }

  // Same broad asset class → candidate pool
  const cat = currentFund.category.toLowerCase();
  const assetClass =
    cat.includes("bond") || cat.includes("income") || cat.includes("fixed") ? "fixed" :
    cat.includes("international") || cat.includes("emerging") || cat.includes("world") ? "intl" :
    cat.includes("allocation") || cat.includes("target") ? "alloc" : "equity";

  let candidates = UNIVERSE.filter((u) => {
    if (u.ticker.toUpperCase() === currentTicker.toUpperCase()) return false;
    const c = u.category.toLowerCase();
    if (assetClass === "fixed") return c.includes("bond") || c.includes("income") || c.includes("fixed");
    if (assetClass === "intl")  return c.includes("international") || c.includes("emerging") || c.includes("world") || c.includes("global");
    if (assetClass === "alloc") return c.includes("allocation") || c.includes("target");
    return !c.includes("bond") && !c.includes("income") && !c.includes("international") &&
           !c.includes("emerging") && !c.includes("allocation") && !c.includes("target");
  });

  // Prefer exact category first
  const sameCat = candidates.filter((u) => u.category === currentFund.category);
  const rest    = candidates.filter((u) => u.category !== currentFund.category);
  candidates = [...sameCat, ...rest].slice(0, 50);

  // Warm vs cold split → fetch (3y data, parallel)
  const hits = await Promise.all(candidates.map((c) => cacheGet(`fund:rec:${c.ticker}`).then((v) => !!v)));
  const warm = candidates.filter((_, i) => hits[i]);
  const cold = candidates.filter((_, i) => !hits[i]);
  const toFetch = [...warm, ...cold.slice(0, 16)];

  const settled = await Promise.allSettled(
    toFetch.map((c) => getRecommendFund(c.ticker, c.vehicle, c.category, c.benchmark))
  );
  const records = settled
    .filter((r) => r.status === "fulfilled" && !(r as PromiseFulfilledResult<Awaited<ReturnType<typeof getRecommendFund>>>).value.error)
    .map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof getRecommendFund>>>).value);

  if (records.length < 2) {
    return NextResponse.json({ error: "Not enough comparable funds. Try again in a moment." }, { status: 400 });
  }

  // Percentiles across current + candidates
  const all = [currentFund, ...records];
  const pcts = computePercentiles(all.map((r) => ({ kpi: r.kpi, expenseRatio: r.expenseRatio ?? 1 })));
  const scored = all.map((r, i) => ({ ...r, percentiles: pcts[i] }));
  const cur = scored[0];
  const alts = scored.slice(1);

  // ── Factor definitions ──
  type PKey = "cost" | "riskAdj" | "downside" | "alpha" | "yield";
  const num = (v: number | null) => (v == null ? null : v);

  const factors: Array<{
    key: PKey;
    label: string;
    metricLabel: string;
    curValue: number | null;
    altValue: number | null;
    fmt: (v: number | null) => string;
    higherIsBetter: boolean;
    blurb: string;
    ticker: string;
    name: string;
    category: string;
    vehicle: string;
    improvement: boolean;
  }> = [];

  const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}%`);
  const rat = (v: number | null) => (v == null ? "—" : v.toFixed(2));

  // helper: best alt by percentile key
  const bestBy = (key: PKey) =>
    alts.reduce((best, f) => (f.percentiles[key] > (best?.percentiles[key] ?? -1) ? f : best),
      null as (typeof alts)[number] | null);

  // 1) Lower cost
  {
    const b = bestBy("cost");
    if (b) {
      const cv = num(cur.expenseRatio), av = num(b.expenseRatio);
      const bps = cv != null && av != null ? Math.round((cv - av) * 100) : 0;
      factors.push({
        key: "cost", label: "Lower Cost", metricLabel: "Expense ratio",
        curValue: cv, altValue: av, fmt: pct, higherIsBetter: false,
        improvement: av != null && cv != null && av < cv,
        ticker: b.ticker, name: b.name, category: b.category, vehicle: b.vehicle,
        blurb: av != null && cv != null && av < cv
          ? `${b.ticker} charges ${pct(av)} vs your ${pct(cv)} — ${bps} bps/yr cheaper.`
          : `Your fund is already among the cheapest in its category.`,
      });
    }
  }
  // 2) Risk-adjusted return (Sharpe)
  {
    const b = bestBy("riskAdj");
    if (b) {
      const cv = num(cur.kpi.sharpe3y), av = num(b.kpi.sharpe3y);
      factors.push({
        key: "riskAdj", label: "Risk-Adjusted Return", metricLabel: "Sharpe ratio (3y)",
        curValue: cv, altValue: av, fmt: rat, higherIsBetter: true,
        improvement: av != null && cv != null && av > cv,
        ticker: b.ticker, name: b.name, category: b.category, vehicle: b.vehicle,
        blurb: av != null && cv != null && av > cv
          ? `${b.ticker} earns a ${rat(av)} Sharpe vs your ${rat(cv)} — more return per unit of risk.`
          : `Your fund already has top-tier risk-adjusted returns here.`,
      });
    }
  }
  // 3) Downside protection (max drawdown 3y — less negative is better)
  {
    const b = bestBy("downside");
    if (b) {
      const cv = num(cur.kpi.maxDrawdown3y), av = num(b.kpi.maxDrawdown3y);
      factors.push({
        key: "downside", label: "Downside Protection", metricLabel: "Max drawdown (3y)",
        curValue: cv, altValue: av, fmt: pct, higherIsBetter: true, // less negative = higher
        improvement: av != null && cv != null && av > cv,
        ticker: b.ticker, name: b.name, category: b.category, vehicle: b.vehicle,
        blurb: av != null && cv != null && av > cv
          ? `${b.ticker} fell only ${pct(av)} at its 3y worst vs your ${pct(cv)} — shallower drawdowns.`
          : `Your fund already holds up best on the downside here.`,
      });
    }
  }
  // 4) Income / yield
  {
    const b = bestBy("yield");
    if (b) {
      const cv = num(cur.kpi.ttmYield), av = num(b.kpi.ttmYield);
      factors.push({
        key: "yield", label: "Higher Income", metricLabel: "TTM yield",
        curValue: cv, altValue: av, fmt: pct, higherIsBetter: true,
        improvement: av != null && cv != null && av > cv,
        ticker: b.ticker, name: b.name, category: b.category, vehicle: b.vehicle,
        blurb: av != null && cv != null && av > cv
          ? `${b.ticker} yields ${pct(av)} vs your ${pct(cv)} — more income for the client.`
          : `Your fund already yields near the top of its category.`,
      });
    }
  }
  // 5) Alpha vs benchmark
  {
    const b = bestBy("alpha");
    if (b) {
      const cv = num(cur.kpi.alpha3y), av = num(b.kpi.alpha3y);
      factors.push({
        key: "alpha", label: "Alpha vs Benchmark", metricLabel: "Alpha (3y, ann.)",
        curValue: cv, altValue: av, fmt: pct, higherIsBetter: true,
        improvement: av != null && cv != null && av > cv,
        ticker: b.ticker, name: b.name, category: b.category, vehicle: b.vehicle,
        blurb: av != null && cv != null && av > cv
          ? `${b.ticker} added ${pct(av)} alpha vs benchmark, ahead of your ${pct(cv)}.`
          : `Your fund already leads its category on alpha.`,
      });
    }
  }

  // ── Top 3 best-fit picks (best overall alternatives, not just per-factor) ──
  const PKEYS: PKey[] = ["cost", "riskAdj", "downside", "alpha", "yield"];
  const PKEY_LABEL: Record<string, string> = {
    cost: "low cost", riskAdj: "risk-adjusted return", downside: "downside protection",
    alpha: "alpha", consistency: "consistency", yield: "income",
  };
  const fitScore = (p: Record<string, number>) => {
    const keys = ["cost", "riskAdj", "downside", "alpha", "consistency", "yield"];
    const vals = keys.map((k) => p[k] ?? 0);
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  };
  const curFit = fitScore(cur.percentiles as unknown as Record<string, number>);
  const topPicks = alts
    .map((a) => ({ a, fit: fitScore(a.percentiles as unknown as Record<string, number>) }))
    .sort((x, y) => y.fit - x.fit)
    .slice(0, 3)
    .map(({ a, fit }) => {
      const p = a.percentiles as unknown as Record<string, number>;
      const strengths = PKEYS
        .map((k) => [k, p[k] ?? 0] as [string, number])
        .sort((x, y) => y[1] - x[1])
        .slice(0, 2)
        .map(([k]) => PKEY_LABEL[k]);
      const betterThanCur = fit > curFit;
      return {
        ticker: a.ticker, name: a.name, category: a.category, vehicle: a.vehicle,
        expenseRatio: a.expenseRatio, matchScore: fit,
        sameCategory: a.category === cur.category,
        kpi: {
          sharpe3y: a.kpi.sharpe3y, return3y: a.kpi.return3y, alpha3y: a.kpi.alpha3y,
          ttmYield: a.kpi.ttmYield, maxDrawdown3y: a.kpi.maxDrawdown3y,
        },
        reason: `Best all-around fit — strong on ${strengths[0]} and ${strengths[1]}` +
          (betterThanCur ? `, and grades out ahead of ${cur.ticker} overall.` : `.`),
      };
    });

  return NextResponse.json({
    current: {
      ticker: cur.ticker, name: cur.name, category: cur.category, vehicle: cur.vehicle,
      expenseRatio: cur.expenseRatio, matchScore: curFit,
      kpi: {
        sharpe3y: cur.kpi.sharpe3y, maxDrawdown3y: cur.kpi.maxDrawdown3y,
        ttmYield: cur.kpi.ttmYield, alpha3y: cur.kpi.alpha3y, return3y: cur.kpi.return3y,
      },
    },
    topPicks,
    factors,
    investAmount,
    poolSize: records.length,
  });
}
