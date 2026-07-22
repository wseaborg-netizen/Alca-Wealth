/**
 * Methodology regression tests — deterministic sample series against the
 * central performance module, plus a scan preventing duplicate competing
 * implementations of alpha/beta/Sharpe/Sortino outside it.
 */
import * as fs from "fs";
import * as path from "path";
import {
  cumulativeReturn, annualizedReturn, periodicReturns, annualizedVolatility,
  maxDrawdown, betaAlpha, sharpeRatio, sortinoRatio, geometricAnnualized,
  alignByMonth, sampleStdDev, RISK_FREE_ANNUAL, MIN_OBS, type PricePoint,
} from "@/lib/metrics/performance";

const pt = (date: string, price: number): PricePoint => ({ date, price });

describe("cumulative + annualized return", () => {
  test("cumulative return from start/end adjusted values", () => {
    expect(cumulativeReturn([pt("2020-01-01", 100), pt("2021-01-01", 125)])).toBeCloseTo(25, 2);
  });

  test("CAGR uses ACTUAL elapsed days, not integer years", () => {
    // 100 → 121 over exactly 2 years → 10%/yr
    expect(annualizedReturn([pt("2020-01-01", 100), pt("2022-01-01", 121)])).toBeCloseTo(10, 1);
    // same growth over 18 months → far more than 10%/yr (≈ 13.6%)
    const r18 = annualizedReturn([pt("2020-01-01", 100), pt("2021-07-01", 121)])!;
    expect(r18).toBeGreaterThan(13);
    expect(r18).toBeLessThan(14.2);
  });

  test("degenerate series → null, not zero", () => {
    expect(annualizedReturn([pt("2020-01-01", 100)])).toBeNull();
    expect(cumulativeReturn([])).toBeNull();
  });
});

describe("periodic returns + volatility annualization", () => {
  test("daily return calculation", () => {
    const r = periodicReturns([pt("a", 100), pt("b", 101), pt("c", 99.99)]);
    expect(r[0]).toBeCloseTo(0.01, 10);
    expect(r[1]).toBeCloseTo(99.99 / 101 - 1, 10);
  });

  test("monthly σ annualizes with √12", () => {
    const rets = Array.from({ length: 36 }, (_, i) => (i % 2 ? 0.02 : -0.02));
    const sd = sampleStdDev(rets)!;
    expect(annualizedVolatility(rets, 12)).toBeCloseTo(sd * Math.sqrt(12) * 100, 2);
  });

  test("below MIN_OBS → null", () => {
    expect(annualizedVolatility([0.01, -0.01], 12)).toBeNull();
  });
});

describe("max drawdown", () => {
  test("peak-to-trough from the value series", () => {
    const s = [pt("a", 100), pt("b", 120), pt("c", 90), pt("d", 130), pt("e", 104)];
    expect(maxDrawdown(s)).toBeCloseTo(-25, 2); // 120 → 90
  });
});

describe("beta + Jensen's alpha (aligned observations, excess returns)", () => {
  const bench = Array.from({ length: 36 }, (_, i) => (i % 3 === 0 ? 0.03 : i % 3 === 1 ? -0.01 : 0.01));

  test("a fund that is exactly the benchmark: beta 1, alpha 0", () => {
    const r = betaAlpha(bench, bench, 12)!;
    expect(r.beta).toBeCloseTo(1, 3);
    expect(r.alphaAnnualPct).toBeCloseTo(0, 2);
  });

  test("a 2× levered clone: beta 2, alpha reflects CAPM residual", () => {
    const fund = bench.map((r) => r * 2);
    const res = betaAlpha(fund, bench, 12)!;
    expect(res.beta).toBeCloseTo(2, 2);
    // expected alpha from the same formula, independently:
    const annF = geometricAnnualized(fund, 12)!;
    const annB = geometricAnnualized(bench, 12)!;
    const expected = (annF - (RISK_FREE_ANNUAL + res.beta * (annB - RISK_FREE_ANNUAL))) * 100;
    expect(res.alphaAnnualPct).toBeCloseTo(expected, 2);
  });

  test("constant outperformance produces positive alpha", () => {
    const fund = bench.map((r) => r + 0.005); // +50bp every month
    const res = betaAlpha(fund, bench, 12)!;
    expect(res.beta).toBeCloseTo(1, 2);
    expect(res.alphaAnnualPct).toBeGreaterThan(4);
  });

  test("insufficient overlap → null (never a number)", () => {
    expect(betaAlpha(bench.slice(0, MIN_OBS - 1), bench.slice(0, MIN_OBS - 1), 12)).toBeNull();
  });

  test("alignByMonth intersects shared months only", () => {
    const a = [pt("2024-01-31", 1), pt("2024-02-29", 1), pt("2024-03-28", 1)];
    const b = [pt("2024-01-30", 2), pt("2024-03-29", 2)];
    const { a: fa, b: fb } = alignByMonth(a, b);
    expect(fa.map((p) => p.date.slice(0, 7))).toEqual(["2024-01", "2024-03"]);
    expect(fb).toHaveLength(2);
  });
});

describe("Sharpe / Sortino with explicit assumptions", () => {
  const steady = Array.from({ length: 36 }, () => 0.01); // 1%/mo, zero σ → null (division guard)
  const wobbly = Array.from({ length: 36 }, (_, i) => 0.01 + (i % 2 ? 0.02 : -0.02));

  test("zero-volatility series returns null rather than Infinity", () => {
    expect(sharpeRatio(steady, 12)).toBeNull();
  });

  test("Sharpe matches hand-computed value with explicit rf", () => {
    const rf = 0.02;
    const annRet = geometricAnnualized(wobbly, 12)!;
    const annVol = sampleStdDev(wobbly)! * Math.sqrt(12);
    expect(sharpeRatio(wobbly, 12, rf)).toBeCloseTo((annRet - rf) / annVol, 3);
  });

  test("Sortino uses downside deviation below the explicit target", () => {
    const s0 = sortinoRatio(wobbly, 12, 0)!;      // MAR 0%
    const s45 = sortinoRatio(wobbly, 12, 0.045)!; // MAR = rf
    expect(s0).toBeGreaterThan(s45);              // higher hurdle → lower ratio
  });

  test("insufficient observations → null", () => {
    expect(sharpeRatio([0.01, 0.02], 12)).toBeNull();
    expect(sortinoRatio([0.01, 0.02], 12)).toBeNull();
  });
});

describe("no duplicate metric implementations", () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.tsx?$/.test(e.name) ? [p] : [];
    });
  const ROOT = path.resolve(__dirname, "../..");

  test("alpha/beta/Sharpe/Sortino math exists only in the central module", () => {
    const allowed = new Set([
      path.join(ROOT, "src/lib/metrics/performance.ts"),
    ]);
    const files = [...walk(path.join(ROOT, "src/lib")), ...walk(path.join(ROOT, "src/components"))];
    const offenders: string[] = [];
    for (const f of files) {
      if (allowed.has(f)) continue;
      const src = fs.readFileSync(f, "utf8");
      // formula fingerprints: covariance-over-variance and excess-over-sigma
      if (/cov\s*\/\s*(benchVar|bvar|variance)/.test(src)) offenders.push(`${path.relative(ROOT, f)} (beta)`);
      if (/RISK_FREE_ANNUAL\s*\)\s*\/\s*ann/.test(src)) offenders.push(`${path.relative(ROOT, f)} (sharpe)`);
      if (/downsideDev|downside_deviation/i.test(src) && !f.includes("__tests__")) offenders.push(`${path.relative(ROOT, f)} (sortino)`);
    }
    expect(offenders).toEqual([]);
  });

  test("risk-free assumption is defined exactly once", () => {
    const files = walk(path.join(ROOT, "src")).filter((f) => !f.includes("__tests__"));
    const defs = files.filter((f) => /const RISK_FREE_ANNUAL\s*=/.test(fs.readFileSync(f, "utf8")));
    expect(defs.map((f) => path.relative(ROOT, f))).toEqual(["src/lib/metrics/performance.ts"]);
  });
});
