import {
  projectPaths, monthlyRate, spreadReturns, migrateScenario, scenarioDiff,
  validateReturns, validateHoldings, STRESS_PRESETS, SCENARIO_VERSION,
  fmtMoney, fmtMoneyAxis,
  type ModelAssumptions,
} from "@/lib/model";

const BASE: ModelAssumptions = {
  years: 10, initial: 100_000, monthlyContribution: 0, monthlyWithdrawal: 0,
  downReturn: 5, baseReturn: 7, upReturn: 9, annualVol: 10, inflation: 2.5, expenseRatio: 0,
};

describe("model engine — deterministic three-path projection", () => {
  test("zero-flow compound growth matches closed form", () => {
    const r = projectPaths({ ...BASE, downReturn: 7, upReturn: 7 });
    const expected = 100_000 * Math.pow(1.07, 10);
    expect(r.ending.base).toBeCloseTo(expected, 0);
    // identical assumptions → identical paths
    expect(r.ending.down).toBeCloseTo(expected, 0);
    expect(r.ending.up).toBeCloseTo(expected, 0);
  });

  test("paths follow their own return assumptions (down < base < up)", () => {
    const r = projectPaths(BASE);
    expect(r.ending.down).toBeCloseTo(100_000 * Math.pow(1.05, 10), 0);
    expect(r.ending.base).toBeCloseTo(100_000 * Math.pow(1.07, 10), 0);
    expect(r.ending.up).toBeCloseTo(100_000 * Math.pow(1.09, 10), 0);
    expect(r.ending.down).toBeLessThan(r.ending.base);
    expect(r.ending.base).toBeLessThan(r.ending.up);
  });

  test("volatility is a display metric only — it never adjusts a return path", () => {
    const lowVol = projectPaths({ ...BASE, annualVol: 5 });
    const highVol = projectPaths({ ...BASE, annualVol: 25 });
    expect(highVol.ending).toEqual(lowVol.ending);
    expect(highVol.points).toEqual(lowVol.points);
  });

  test("expenses are NOT double-counted: returns are net, ER is informational", () => {
    // Same net return, wildly different expense ratios → identical growth.
    const cheap = projectPaths({ ...BASE, expenseRatio: 0.03 });
    const pricey = projectPaths({ ...BASE, expenseRatio: 1.5 });
    expect(pricey.ending.base).toBeCloseTo(cheap.ending.base, 6);
    // The ER still drives the estimated-embedded-expenses figure.
    expect(pricey.totals.feesApprox).toBeGreaterThan(cheap.totals.feesApprox);
    expect(cheap.totals.feesApprox).toBeGreaterThan(0);
  });

  test("contributions accumulate", () => {
    const r = projectPaths({ ...BASE, initial: 0, downReturn: 0, baseReturn: 0, upReturn: 0, monthlyContribution: 100 });
    expect(r.ending.base).toBeCloseTo(100 * 120, 0);
    expect(r.totals.contributed).toBe(12_000);
    // per-point cumulative contributions are exposed for tooltips
    expect(r.points[12].contributed).toBe(1_200);
  });

  test("heavy withdrawals deplete the portfolio and record the month per path", () => {
    const r = projectPaths({ ...BASE, initial: 10_000, downReturn: 0, baseReturn: 0, upReturn: 0, monthlyWithdrawal: 1_000 });
    expect(r.ending.base).toBe(0);
    expect(r.depletionMonth.base).toBe(10);
    expect(r.depletionMonth.down).toBe(10);
    expect(r.depletionMonth.up).toBe(10);
    expect(Math.min(...r.points.map((p) => p.base))).toBeGreaterThanOrEqual(0);
  });

  test("downside can deplete while base survives", () => {
    const r = projectPaths({ ...BASE, initial: 100_000, downReturn: -8, baseReturn: 7, upReturn: 9, monthlyWithdrawal: 500, years: 30 });
    expect(r.depletionMonth.down).toBeDefined();
    expect(r.depletionMonth.base).toBeUndefined();
  });

  test("inflation-adjusted value deflates the nominal path", () => {
    const r = projectPaths(BASE);
    expect(r.ending.baseReal).toBeLessThan(r.ending.base);
    expect(r.ending.baseReal).toBeCloseTo(r.ending.base / Math.pow(1.025, 10), 0);
    expect(r.ending.downReal).toBeCloseTo(r.ending.down / Math.pow(1.025, 10), 0);
  });

  test("monthlyRate round-trips an annual rate", () => {
    expect(Math.pow(1 + monthlyRate(7), 12)).toBeCloseTo(1.07, 10);
  });

  test("deterministic: same inputs give identical outputs", () => {
    const a = projectPaths(BASE);
    const b = projectPaths(BASE);
    expect(a.ending).toEqual(b.ending);
    expect(a.points.length).toBe(121);
  });
});

describe("market-decline shock timing", () => {
  test("shock in year 1 applies immediately to the starting value", () => {
    const r = projectPaths({ ...BASE, initialShockPct: 30, shockYear: 1 });
    expect(r.points[0].base).toBeCloseTo(70_000, 6);
  });

  test("shock in year 5 hits at the start of year 5, not before", () => {
    const noShock = projectPaths(BASE);
    const r = projectPaths({ ...BASE, initialShockPct: 30, shockYear: 5 });
    // Months before the shock match the unstressed path exactly.
    for (let m = 0; m < 48; m++) expect(r.points[m].base).toBeCloseTo(noShock.points[m].base, 6);
    // The shock month is ~30% below the unstressed value.
    expect(r.points[48].base).toBeCloseTo(noShock.points[48].base * 0.7, 0);
    expect(r.ending.base).toBeLessThan(noShock.ending.base);
  });

  test("shock timing changes the outcome when cash flows exist", () => {
    const early = projectPaths({ ...BASE, monthlyContribution: 500, initialShockPct: 30, shockYear: 1 });
    const late = projectPaths({ ...BASE, monthlyContribution: 500, initialShockPct: 30, shockYear: 8 });
    expect(early.ending.base).not.toBeCloseTo(late.ending.base, 0);
  });
});

describe("extended low-return period (phase1)", () => {
  test("reduces every path by the same delta during the phase, then resumes", () => {
    const plain = projectPaths({ ...BASE, years: 20 });
    const phased = projectPaths({ ...BASE, years: 20, phase1: { months: 120, annualReturn: BASE.baseReturn - 3 } });
    expect(phased.ending.base).toBeLessThan(plain.ending.base);
    expect(phased.ending.down).toBeLessThan(plain.ending.down); // delta applies to downside too
    // During the phase the base path compounds at 4%; afterwards at 7%.
    expect(phased.points[120].base).toBeCloseTo(100_000 * Math.pow(1.04, 10), 0);
    expect(phased.ending.base).toBeCloseTo(100_000 * Math.pow(1.04, 10) * Math.pow(1.07, 10), 0);
  });
});

describe("stress presets", () => {
  const withFlows = { ...BASE, monthlyWithdrawal: 300 };
  test("each preset changes outcomes in its stated direction", () => {
    const base = projectPaths(withFlows);
    for (const p of STRESS_PRESETS) {
      const stressed = projectPaths(p.apply({ ...withFlows }));
      if (p.riskMetricOnly) {
        // Higher volatility must NOT fake a return hit.
        expect(stressed.ending.base).toBeCloseTo(base.ending.base, 6);
      } else if (p.id === "inflation") {
        expect(stressed.ending.baseReal).toBeLessThan(base.ending.baseReal);
        expect(stressed.ending.base).toBeCloseTo(base.ending.base, 6); // nominal unchanged
      } else {
        expect(stressed.ending.base).toBeLessThanOrEqual(base.ending.base);
      }
    }
  });
  test("every preset declares change, timing, duration, and kind", () => {
    for (const p of STRESS_PRESETS) {
      expect(p.change.length).toBeGreaterThan(0);
      expect(p.timing.length).toBeGreaterThan(0);
      expect(p.duration.length).toBeGreaterThan(0);
      expect(["one-time shock", "recurring assumption"]).toContain(p.kind);
    }
  });
});

describe("validation", () => {
  test("return assumptions: ordering and bounds enforced", () => {
    expect(validateReturns({ downReturn: 4, baseReturn: 6, upReturn: 8 })).toEqual([]);
    expect(validateReturns({ downReturn: 7, baseReturn: 6, upReturn: 8 }).join(" ")).toMatch(/Downside/);
    expect(validateReturns({ downReturn: 4, baseReturn: 9, upReturn: 8 }).join(" ")).toMatch(/Upside/);
    expect(validateReturns({ downReturn: -40, baseReturn: 6, upReturn: 8 }).length).toBeGreaterThan(0);
    expect(validateReturns({ downReturn: NaN, baseReturn: 6, upReturn: 8 }).length).toBeGreaterThan(0);
  });

  test("holdings: missing/unknown tickers and weight tolerance", () => {
    const known = new Set(["VTI", "AGG"]);
    expect(validateHoldings([{ ticker: "VTI", weight: 60 }, { ticker: "AGG", weight: 40 }], known)).toEqual([]);
    // small rounding tolerance is allowed
    expect(validateHoldings([{ ticker: "VTI", weight: 60.3 }, { ticker: "AGG", weight: 39.9 }], known)).toEqual([]);
    expect(validateHoldings([{ ticker: "VTI", weight: 60 }, { ticker: "AGG", weight: 30 }], known).join(" ")).toMatch(/total/i);
    expect(validateHoldings([{ ticker: "", weight: 100 }], known).join(" ")).toMatch(/missing/i);
    expect(validateHoldings([{ ticker: "ZZZZ", weight: 100 }], known).join(" ")).toMatch(/not in the fund universe/);
    expect(validateHoldings([], known).join(" ")).toMatch(/at least one/i);
  });
});

describe("saved-scenario migration (v1 → v2)", () => {
  const legacy = {
    id: "sc_old1", name: "Old projection", tool: "projection", subject: "VTI / AGG",
    savedAt: 1700000000000,
    assumptions: {
      years: 10, initial: 100_000, monthlyContribution: 0, monthlyWithdrawal: 0,
      annualReturn: 7, annualVol: 10, inflation: 2.5, expenseRatio: 1,
    },
  };

  test("legacy annualReturn (gross) becomes an equivalent net base return", () => {
    const m = migrateScenario(legacy)!;
    expect(m.version).toBe(SCENARIO_VERSION);
    expect(m.migrated).toBe(true);
    // old engine compounded at 7% − 1% ER = 6% net; migration preserves that
    expect(m.assumptions.baseReturn).toBeCloseTo(6, 6);
    expect(m.assumptions.downReturn).toBeCloseTo(4, 6);
    expect(m.assumptions.upReturn).toBeCloseTo(8, 6);
    expect(m.assumptions.annualVol).toBe(10);
    // the migrated base path reproduces the legacy base-path ending
    const r = projectPaths(m.assumptions);
    expect(r.ending.base).toBeCloseTo(100_000 * Math.pow(1.06, 10), 0);
  });

  test("v2 scenarios pass through unchanged", () => {
    const modern = { id: "sc_new", name: "New", tool: "projection", subject: "x",
      savedAt: 1, version: 2, assumptions: { ...BASE } };
    const m = migrateScenario(modern)!;
    expect(m.migrated).toBeUndefined();
    expect(m.assumptions).toEqual(BASE);
  });

  test("malformed entries are dropped, not crashed on", () => {
    expect(migrateScenario(null)).toBeNull();
    expect(migrateScenario({})).toBeNull();
    expect(migrateScenario("junk")).toBeNull();
  });
});

describe("scenario difference summary", () => {
  test("reports exact assumption and outcome deltas", () => {
    const a = { name: "A", a: { ...BASE } };
    const b = { name: "B", a: { ...BASE, baseReturn: 8, monthlyContribution: 200, expenseRatio: 0.05 } };
    const ra = projectPaths(a.a);
    const rb = projectPaths(b.a);
    const diff = scenarioDiff(a, b, ra, rb);
    const byLabel = Object.fromEntries(diff.map((d) => [d.label, d.delta]));
    expect(byLabel["Base return"]).toBe("+1.00 pt");
    expect(byLabel["Monthly contribution"]).toBe("+$200");
    expect(byLabel["Expenses"]).toBe("+0.05 pt");
    expect(byLabel["Ending value (base)"]).toMatch(/^\+\$/);
    expect(byLabel["Ending value (downside)"]).toBeDefined();
    // unchanged assumptions are omitted
    expect(byLabel["Inflation"]).toBeUndefined();
  });
});

describe("spreadReturns defaults", () => {
  test("base ± 2 percentage points, editable starting point", () => {
    expect(spreadReturns(6)).toEqual({ downReturn: 4, baseReturn: 6, upReturn: 8 });
    expect(spreadReturns(6, 3)).toEqual({ downReturn: 3, baseReturn: 6, upReturn: 9 });
  });
});

describe("currency formatting", () => {
  test("abbreviates axis values as $K / $M", () => {
    expect(fmtMoneyAxis(2_500_000)).toBe("$2.5M");
    expect(fmtMoneyAxis(100_000)).toBe("$100K");
    expect(fmtMoneyAxis(950)).toBe("$950");
    expect(fmtMoneyAxis(0)).toBe("$0");
  });
  test("stat values stay readable", () => {
    expect(fmtMoney(1_254_300)).toBe("$1.25M");
    expect(fmtMoney(254_300)).toBe("$254K");
    expect(fmtMoney(25_430)).toBe("$25,430");
  });
});
