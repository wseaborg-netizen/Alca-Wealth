/**
 * Metric defensibility — regression tests for the KPI engine's core formulas,
 * the no-invented-values rule for weighted portfolio stats, unavailable
 * handling, and a static scan keeping fake metrics out of rendered components.
 */
import * as fs from "fs";
import * as path from "path";
import { computeKpis, type DailyPrice } from "@/lib/kpi";
import { METRICS, fmtMetric, UNAVAILABLE } from "@/lib/metrics/registry";
import { deriveAssumptions } from "@/components/model/shared";

const ROOT = path.resolve(__dirname, "../..");

/** Weekly price series ending today: value(t) follows annualRet compounding.
    (Weekly cadence keeps every trailing window above the engine's ≥20-point
    density check, like real daily data does.) */
function series(months: number, annualRetPct: number, start = 100): DailyPrice[] {
  const out: DailyPrice[] = [];
  const weeks = Math.round(months * 4.345);
  const weekly = Math.pow(1 + annualRetPct / 100, 7 / 365.25);
  for (let i = weeks; i >= 0; i--) {
    const d = new Date(Date.now() - i * 7 * 86400000);
    out.push({ date: d.toISOString().slice(0, 10), price: start * Math.pow(weekly, weeks - i) });
  }
  return out;
}

describe("annualized return (CAGR) with span guard", () => {
  test("5 years of 10%/yr growth reports ~10% for 1y/3y/5y", () => {
    const s = series(60, 10);
    const k = computeKpis(s, s);
    expect(k.return1y).toBeCloseTo(10, 0);
    expect(k.return3y).toBeCloseTo(10, 0);
    expect(k.return5y).toBeCloseTo(10, 0);
  });

  test("a fund with only 18 months of history gets NO 3y/5y figures (no mislabeled annualization)", () => {
    const s = series(18, 10);
    const k = computeKpis(s, s);
    expect(k.return1y).not.toBeNull();
    expect(k.return3y).toBeNull();   // was previously a wrong number annualized over 3y
    expect(k.return5y).toBeNull();
    expect(k.maxDrawdown3y).toBeNull();
    expect(k.maxDrawdown5y).toBeNull();
  });
});

describe("volatility annualization", () => {
  test("annualized std dev = monthly sample std dev × √12", () => {
    // Alternate ±2% monthly around a flat base.
    const prices: DailyPrice[] = [];
    let p = 100;
    for (let i = 40; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      prices.push({ date: d.toISOString().slice(0, 10), price: p });
      p *= i % 2 === 0 ? 1.02 : 0.98;
    }
    const k = computeKpis(prices, prices);
    // independent expected value
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++) rets.push(prices[i].price / prices[i - 1].price - 1);
    const window = rets.slice(-36 + 1); // 3y window monthlies (36 points → 35 returns aligns loosely)
    const m = window.reduce((s, v) => s + v, 0) / window.length;
    const sd = Math.sqrt(window.reduce((s, v) => s + (v - m) ** 2, 0) / (window.length - 1));
    expect(k.stdDev3y).toBeCloseTo(sd * Math.sqrt(12) * 100, 0);
  });
});

describe("max drawdown from the value series", () => {
  test("a 30% drop then recovery reports ~−30%", () => {
    const prices: DailyPrice[] = [];
    for (let i = 36; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      let price = 100 + (36 - i); // gentle uptrend
      if (i === 18) price = 70;   // crash month
      prices.push({ date: d.toISOString().slice(0, 10), price });
    }
    const k = computeKpis(prices, prices);
    expect(k.maxDrawdown3y).toBeLessThan(-35); // 70 vs peak ~118 → ~-40%
    expect(k.maxDrawdown3y).toBeGreaterThan(-45);
  });
});

describe("fund tracking its benchmark", () => {
  test("beta ≈ 1 and alpha ≈ 0 against itself", () => {
    const s = series(48, 8);
    const k = computeKpis(s, s);
    expect(k.beta3y).toBeCloseTo(1, 1);
    expect(Math.abs(k.alpha3y ?? 99)).toBeLessThan(0.5);
  });
});

describe("weighted portfolio stats never invent missing data", () => {
  const mockCompare = (funds: unknown[]) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({ funds }),
    }) as unknown as typeof fetch;
  };

  test("missing ER on one holding → weighted over the holdings that have it", async () => {
    mockCompare([
      { ticker: "AAA", name: "A", expenseRatio: 0.10, kpi: { return5y: 8, stdDev3y: 12 }, benchmark: "SPY", fetchedAt: 1 },
      { ticker: "BBB", name: "B", expenseRatio: null, kpi: { return5y: 6, stdDev3y: 10 }, benchmark: "SPY", fetchedAt: 1 },
    ]);
    const d = await deriveAssumptions([{ ticker: "AAA", weight: 50 }, { ticker: "BBB", weight: 50 }]);
    expect(d?.expenseRatio).toBeCloseTo(0.10, 5);   // NOT averaged with an invented 0.1 default
    expect(d?.baseReturn).toBeCloseTo(7, 5);
    expect(d?.annualVol).toBeCloseTo(11, 5);
  });

  test("no holding has volatility/ER → null, not a fake number", async () => {
    mockCompare([
      { ticker: "AAA", name: "A", expenseRatio: null, kpi: { return5y: 8, stdDev3y: null }, benchmark: "SPY", fetchedAt: 1 },
    ]);
    const d = await deriveAssumptions([{ ticker: "AAA", weight: 100 }]);
    expect(d?.annualVol).toBeNull();
    expect(d?.expenseRatio).toBeNull();
  });

  test("no return history at all → derivation refuses entirely", async () => {
    mockCompare([{ ticker: "AAA", name: "A", expenseRatio: 0.1, kpi: {}, benchmark: "SPY", fetchedAt: 1 }]);
    expect(await deriveAssumptions([{ ticker: "AAA", weight: 100 }])).toBeNull();
  });
});

describe("unavailable handling", () => {
  test("missing → em dash; true zero stays zero", () => {
    expect(fmtMetric(null, "%")).toBe(UNAVAILABLE);
    expect(fmtMetric(undefined, "ratio")).toBe(UNAVAILABLE);
    expect(fmtMetric(NaN, "%")).toBe(UNAVAILABLE);
    expect(fmtMetric(0, "%")).toBe("0.00%");
  });

  test("registry: every metric declares source, unit, and missing behavior", () => {
    for (const m of METRICS) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(["provider", "calculated", "static", "assumption", "unavailable"]).toContain(m.source);
      expect(m.whenMissing.length).toBeGreaterThan(0);
      if (m.source === "unavailable") expect(m.whenMissing.toLowerCase()).toContain("not displayed");
    }
  });
});

describe("static scan: no fake metrics in rendered components", () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.tsx?$/.test(e.name) ? [p] : [];
    });
  const components = walk(path.join(ROOT, "src/components"));

  test("no Math.random in any component (financial or otherwise)", () => {
    const offenders = components.filter((f) => fs.readFileSync(f, "utf8").includes("Math.random"));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  test('no "expected return" labels in components (assumptions are labeled Downside/Base/Upside)', () => {
    const offenders = components.filter((f) => /expected (return|outcome)/i.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  test("dead legacy metric components stay deleted", () => {
    for (const dead of ["AdvisorTab.tsx", "PortfolioTab.tsx", "tokens.ts.bak"]) {
      expect(fs.existsSync(path.join(ROOT, "src/components", dead))).toBe(false);
    }
  });
});
