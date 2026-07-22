/**
 * Unified contextual Advisor Review Score (2B → 2C) — deterministic engine
 * tests plus scans: no recommendation language, no hardcoded/fake scores, no
 * old rating system left in active UI, display capped below 100.
 */
import * as fs from "fs";
import * as path from "path";
import {
  percentileAmong, scoreFundForContext, reviewScore, overallReviewScore,
  getPeerAlternativesForContext, pickAlternatives, rankFundsForContext,
  displayScore, scoreBand, CONTEXT_WEIGHTS, SCORE_CONTEXTS, MIN_COMPONENTS,
  type ScoreInputs, type AlternativeCandidate,
} from "@/lib/metrics/score";
import type { PeriodStats } from "@/lib/kpi";

const stats = (over: Partial<PeriodStats>): PeriodStats => ({
  return: null, volatility: null, sharpe: null, sortino: null,
  beta: null, alpha: null, maxDrawdown: null, ...over,
});
const inputs = (s: Partial<PeriodStats>, er: number | null = 0.2, extra: Partial<ScoreInputs> = {}): ScoreInputs => ({
  stats: stats(s), expenseRatio: er,
  ttmYield: null, taxScore: null, fundAge: null, battingAvg: null, ...extra,
});

/** Nine peers with a clean spread so percentiles are predictable. */
const PEERS: ScoreInputs[] = Array.from({ length: 9 }, (_, i) => inputs({
  return: 2 + i,                 // 2..10
  sharpe: 0.2 + i * 0.1,         // 0.2..1.0
  maxDrawdown: -30 + i * 2,      // -30..-14 (later = shallower = better)
  volatility: 20 - i,            // 20..12 (later = lower = better)
}, 1.0 - i * 0.1,                // ER 1.0..0.2 (later = cheaper)
  { ttmYield: 1 + i * 0.3, fundAge: 3 + i, battingAvg: 40 + i * 2, taxScore: 50 + i * 4 }));

describe("percentile rank", () => {
  test("direction: higher-is-better and lower-is-better", () => {
    expect(percentileAmong(10, [2, 4, 6, 8], true)).toBe(100);
    expect(percentileAmong(2, [4, 6, 8, 10], true)).toBe(0);
    expect(percentileAmong(0.02, [0.1, 0.5, 0.9, 1.2], false)).toBe(100); // cheapest wins
  });
  test("ties are deterministic (count half)", () => {
    expect(percentileAmong(5, [5, 5, 1, 9], true)).toBe(Math.round(((1 + 1) / 4) * 100));
  });
  test("insufficient peers → null", () => {
    expect(percentileAmong(5, [1, 2], true)).toBeNull();
    expect(percentileAmong(null, [1, 2, 3, 4, 5], true)).toBeNull();
  });
});

describe("advisor review score (contextual engine)", () => {
  const strongFund = inputs({ return: 12, sharpe: 1.5, maxDrawdown: -10, volatility: 10 }, 0.05,
    { ttmYield: 4, fundAge: 15, battingAvg: 65, taxScore: 90 });

  test("top-of-category fund scores near 100 internally", () => {
    const r = scoreFundForContext(strongFund, PEERS, "overall")!;
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.band).toBe("Strong peer-relative profile");
  });

  test("displayed score is capped below 100", () => {
    expect(displayScore(100)).toBe(99);
    expect(displayScore(99)).toBe(99);
    expect(displayScore(72)).toBe(72);
  });

  test("score CHANGES with scoring context (not one fixed number)", () => {
    // Cheap but weak-return fund: excels for Low Cost, mediocre for Growth.
    const cheapSlow = inputs({ return: 3, sharpe: 0.35, maxDrawdown: -16, volatility: 13 }, 0.02,
      { fundAge: 20, battingAvg: 44, taxScore: 85, ttmYield: 1.2 });
    const lowCost = scoreFundForContext(cheapSlow, PEERS, "lowCost")!;
    const growth = scoreFundForContext(cheapSlow, PEERS, "growth")!;
    expect(lowCost.score).toBeGreaterThan(growth.score + 10);
  });

  test("income context rewards yield; growth context does not use yield", () => {
    const highYield = inputs({ return: 5, sharpe: 0.55, maxDrawdown: -22, volatility: 16 }, 0.4, { ttmYield: 6 });
    const inc = scoreFundForContext(highYield, PEERS, "income")!;
    expect(inc.components.find((c) => c.key === "yield")?.score).toBeGreaterThanOrEqual(90);
    const gr = scoreFundForContext(highYield, PEERS, "growth")!;
    expect(gr.components.find((c) => c.key === "yield")).toBeUndefined();
  });

  test("lower expense scores better; shallower drawdown scores better; higher Sharpe scores better", () => {
    const base = { return: 6, sharpe: 0.6, maxDrawdown: -22, volatility: 16 };
    expect(scoreFundForContext(inputs(base, 0.03), PEERS, "overall")!.score)
      .toBeGreaterThan(scoreFundForContext(inputs(base, 1.5), PEERS, "overall")!.score);
    expect(scoreFundForContext(inputs({ ...base, maxDrawdown: -12 }), PEERS, "overall")!.score)
      .toBeGreaterThan(scoreFundForContext(inputs({ ...base, maxDrawdown: -40 }), PEERS, "overall")!.score);
    expect(scoreFundForContext(inputs({ ...base, sharpe: 1.4 }), PEERS, "overall")!.score)
      .toBeGreaterThan(scoreFundForContext(inputs({ ...base, sharpe: 0.1 }), PEERS, "overall")!.score);
  });

  test("missing metrics are reweighted, never zeroed", () => {
    const r = scoreFundForContext(
      inputs({ return: 12, sharpe: 1.5, maxDrawdown: -10, volatility: null }, null), PEERS, "overall")!;
    expect(r.missing).toContain("cost");
    expect(r.missing).toContain("volatility");
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.components.find((c) => c.key === "cost")?.score).toBeNull();
  });

  test("fewer than MIN_COMPONENTS valid → no score; thin peer set → no score", () => {
    expect(MIN_COMPONENTS).toBeGreaterThanOrEqual(3);
    expect(scoreFundForContext(inputs({ return: 5 }, null), PEERS, "overall")).toBeNull();
    expect(scoreFundForContext(strongFund, PEERS.slice(0, 2), "overall")).toBeNull();
  });

  test("every context's weights sum to 1", () => {
    for (const ctx of SCORE_CONTEXTS) {
      const sum = Object.values(CONTEXT_WEIGHTS[ctx]).reduce((s, w) => s + (w ?? 0), 0);
      expect(sum).toBeCloseTo(1, 10);
    }
    // context emphasis sanity
    expect(CONTEXT_WEIGHTS.lowCost.cost!).toBeGreaterThan(CONTEXT_WEIGHTS.overall.cost!);
    expect(CONTEXT_WEIGHTS.growth.performance!).toBeGreaterThan(CONTEXT_WEIGHTS.overall.performance!);
    expect(CONTEXT_WEIGHTS.downside.downside!).toBeGreaterThan(CONTEXT_WEIGHTS.overall.downside!);
    expect(CONTEXT_WEIGHTS.income.yield!).toBeGreaterThanOrEqual(0.25);
  });

  test("2B alias still works (single engine, no competing system)", () => {
    expect(reviewScore(strongFund, PEERS)).toEqual(scoreFundForContext(strongFund, PEERS, "overall"));
  });
});

describe("Overall period score", () => {
  const mk = (score: number) => ({ score } as ReturnType<typeof reviewScore> & { score: number });
  test("blends with the documented weights; notes limited history; refuses 1Y-only", () => {
    const full = overallReviewScore({ "1Y": mk(80), "3Y": mk(70), "5Y": mk(60), "10Y": mk(50) })!;
    expect(full.score).toBe(Math.round(80 * 0.10 + 70 * 0.25 + 60 * 0.30 + 50 * 0.35));
    expect(full.note).toBeNull();
    const partial = overallReviewScore({ "1Y": mk(80), "3Y": mk(70) })!;
    expect(partial.note).toMatch(/Limited history/);
    expect(overallReviewScore({ "1Y": mk(90) })).toBeNull();
  });
});

describe("ranking helper (screener / future portfolio-builder entry point)", () => {
  test("rankFundsForContext orders by context score with reasons; unscored sort last", () => {
    const set = PEERS.map((inp, i) => ({ item: `F${i}`, inputs: inp }));
    set.push({ item: "THIN", inputs: inputs({ return: 5 }, null) }); // not enough components
    const ranked = rankFundsForContext(set, "overall");
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score ?? 0);
    expect(ranked[ranked.length - 1].item).toBe("THIN");
    expect(ranked[ranked.length - 1].score).toBeNull();
    expect(ranked[0].reason).toBeTruthy();
  });

  test("context changes the ranking order", () => {
    // cheap-but-slow vs expensive-but-fast
    const set = [
      { item: "CHEAP", inputs: inputs({ return: 3, sharpe: 0.4, maxDrawdown: -15, volatility: 12 }, 0.02, { fundAge: 20 }) },
      { item: "FAST", inputs: inputs({ return: 11, sharpe: 1.2, maxDrawdown: -28, volatility: 19 }, 0.9, { fundAge: 6 }) },
      ...PEERS.slice(0, 5).map((inp, i) => ({ item: `P${i}`, inputs: inp })),
    ];
    const byLowCost = rankFundsForContext(set, "lowCost").findIndex((r) => r.item === "CHEAP");
    const byGrowth = rankFundsForContext(set, "growth").findIndex((r) => r.item === "CHEAP");
    expect(byLowCost).toBeLessThan(byGrowth);
  });
});

describe("peer alternatives (context-aware)", () => {
  const subject: AlternativeCandidate = {
    ticker: "SUBJ", name: "Subject", category: "US Large Blend", score: 60,
    stats: stats({ return: 6, sharpe: 0.6, maxDrawdown: -22 }), expenseRatio: 0.5,
  };
  const cand = (t: string, score: number | null, over: Partial<PeriodStats>, er: number | null): AlternativeCandidate =>
    ({ ticker: t, name: t, category: "US Large Blend", score, stats: stats(over), expenseRatio: er });

  test("same category, excludes subject, includes rationale, caps at 5", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      cand(`P${i}`, 90 - i, { return: 8, sharpe: 1.2, maxDrawdown: -12 }, 0.05));
    const alts = getPeerAlternativesForContext(subject, [subject, ...many], "3Y", "overall");
    expect(alts).toHaveLength(5);
    for (const a of alts) {
      expect(a.ticker).not.toBe("SUBJ");
      expect(a.category).toBe("US Large Blend");
      expect(a.rationale.length).toBeGreaterThan(0);
    }
  });

  test("context shapes the leading rationale", () => {
    const c = cand("AAA", 85, { return: 8, sharpe: 1.1, maxDrawdown: -15 }, 0.1);
    const low = getPeerAlternativesForContext(subject, [c], "3Y", "lowCost")[0];
    expect(low.rationale.startsWith("lower expense ratio")).toBe(true);
    const dwn = getPeerAlternativesForContext(subject, [c], "5Y", "downside")[0];
    expect(dwn.rationale.startsWith("shallower 5Y drawdown")).toBe(true);
  });

  test("no articulable advantage → not surfaced; 2B alias works", () => {
    const worse = cand("WWW", 20, { return: 2, sharpe: 0.1, maxDrawdown: -45 }, 1.5);
    expect(getPeerAlternativesForContext(subject, [worse], "3Y", "overall")).toEqual([]);
    expect(pickAlternatives(subject, [worse], "3Y")).toEqual([]);
  });
});

describe("old rating system removed + language/integrity scans", () => {
  const ROOT = path.resolve(__dirname, "../..");
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

  test("old letter grade / worth-it rating is gone from Analysis", () => {
    const src = read("src/components/AnalysisTab.tsx");
    expect(src).not.toContain("overallRating");
    expect(src).not.toContain("Is it worth it?");
    expect(src).not.toContain("Overall rating");
    expect(src).not.toContain("ratingColors");
  });

  test("screener no longer uses the old compositeScore engine", () => {
    const src = read("src/app/api/screen/route.ts");
    expect(src).not.toContain("compositeScore(");
    expect(src).toContain("rankFundsForContext");
  });

  test("no recommendation language in score engine or Analysis/Screen UI strings", () => {
    const banned = /best fund|guaranteed alpha|recommendation\b|should invest|client recommendation|buy this|sell this/i;
    for (const f of ["src/lib/metrics/score.ts", "src/components/AnalysisTab.tsx", "src/components/ScreenTab.tsx"]) {
      const cleaned = read(f).replace(/never a recommendation|never recommendation\s*\/|not client advice|not a rating/gi, "");
      expect(cleaned).not.toMatch(banned);
    }
  });

  test("score bands cover the documented ranges; no hardcoded scores", () => {
    expect(scoreBand(90)).toMatch(/^Strong/);
    expect(scoreBand(10)).toMatch(/^Very weak/);
    const src = read("src/lib/metrics/score.ts");
    expect(src).not.toMatch(/score:\s*\d/);
    expect(src).not.toContain("Math.random");
  });
});
