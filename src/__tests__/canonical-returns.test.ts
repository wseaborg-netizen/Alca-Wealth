/**
 * Canonical trailing-return engine — the ONE source used by display, Advisor
 * Review Score, ranking, and Firm Funds. Each multi-year result carries BOTH a
 * cumulative total return (PRIMARY display) and a geometric annualized return
 * (secondary), computed directly from the same start/end adjusted values.
 */
import * as fs from "fs";
import * as path from "path";
import {
  canonicalPeriodReturns, PERF_PERIODS, ANNUALIZED_PERIODS, PERIOD_LABEL, DEFAULT_PERF_PERIOD,
} from "@/lib/perf/canonicalReturns";
import { periodsFromBars } from "@/lib/firmPerformance";
import { computeKpis } from "@/lib/kpi";

function weekdays(fromISO: string, toISO: string, holidays: string[] = []): string[] {
  const out: string[] = [];
  const d = new Date(fromISO + "T00:00:00Z"), end = new Date(toISO + "T00:00:00Z");
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay(); if (dow === 0 || dow === 6) continue;
    const s = d.toISOString().slice(0, 10); if (holidays.includes(s)) continue;
    out.push(s);
  }
  return out;
}
function obs(fromISO: string, toISO: string, p0 = 100, p1 = 200, holidays: string[] = []) {
  const ds = weekdays(fromISO, toISO, holidays);
  return ds.map((date, i) => ({ date, value: p0 + (p1 - p0) * (i / (ds.length - 1)) }));
}
const valAt = (b: { date: string; value: number }[], iso: string) => { for (let i = b.length - 1; i >= 0; i--) if (b[i].date <= iso) return b[i].value; return null; };
const END = "2026-07-24"; // Friday

describe("period set + labels", () => {
  test("eight periods; default 1M; annualized only for 3Y/5Y/10Y; labels marked", () => {
    expect([...PERF_PERIODS]).toEqual(["1D", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "10Y"]);
    expect(DEFAULT_PERF_PERIOD).toBe("1M");
    for (const p of ["3Y", "5Y", "10Y"] as const) { expect(ANNUALIZED_PERIODS[p]).toBe(true); expect(PERIOD_LABEL[p]).toBe(`${p} Annualized`); }
    for (const p of ["1D", "1M", "3M", "YTD", "1Y"] as const) expect(ANNUALIZED_PERIODS[p]).toBe(false);
  });
});

describe("cumulative (primary) + annualized (secondary)", () => {
  const b = obs("2015-05-01", END, 100, 280, ["2024-12-25", "2025-01-01"]);
  const { periods, asOf } = canonicalPeriodReturns(b);
  const last = b[b.length - 1].value;

  test("every multi-year period returns BOTH cumulative and annualized", () => {
    for (const p of ["3Y", "5Y", "10Y"] as const) {
      expect(periods[p].cumulativeReturn).not.toBeNull();
      expect(periods[p].annualizedReturn).not.toBeNull();
      expect(periods[p].annualizable).toBe(true);
    }
    // short periods: cumulative only, annualized null
    for (const p of ["1D", "1M", "3M", "YTD", "1Y"] as const) {
      expect(periods[p].cumulativeReturn).not.toBeNull();
      expect(periods[p].annualizedReturn).toBeNull();
    }
  });
  test("cumulative is computed DIRECTLY from start/end adjusted values", () => {
    for (const [p, cut] of [["1M", "2026-06-24"], ["YTD", "2025-12-31"], ["1Y", "2025-07-24"], ["5Y", "2021-07-24"], ["10Y", "2016-07-24"]] as const) {
      const s = valAt(b, cut)!;
      expect(periods[p].cumulativeReturn!).toBeCloseTo((last - s) / s, 10);
    }
    // 1D uses the previous completed EOD
    expect(periods["1D"].cumulativeReturn!).toBeCloseTo((last - b[b.length - 2].value) / b[b.length - 2].value, 10);
  });
  test("annualized uses ACTUAL elapsed time and is NOT derived from a rounded cumulative", () => {
    for (const [p, cut] of [["3Y", "2023-07-24"], ["5Y", "2021-07-24"], ["10Y", "2016-07-24"]] as const) {
      const s = periods[p].startDate!, sv = valAt(b, cut)!;
      const T = (Date.parse(END) - Date.parse(s)) / (365.25 * 864e5);
      expect(periods[p].annualizedReturn!).toBeCloseTo(Math.pow(last / sv, 1 / T) - 1, 8);
      // annualized ≪ cumulative for a rising multi-year series
      expect(periods[p].annualizedReturn!).toBeLessThan(periods[p].cumulativeReturn!);
      // NOT re-compounding a rounded annualized value back into cumulative
      const roundedAnnualized = Number(periods[p].annualizedReturn!.toFixed(4));
      const fromRounded = Math.pow(1 + roundedAnnualized, T) - 1;
      expect(periods[p].cumulativeReturn!).not.toBe(fromRounded);
    }
  });
  test("sparkline shares the source range; returns unrounded; as-of = latest EOD", () => {
    expect(asOf).toBe(END);
    expect(periods["3M"].spark![0]).toBeCloseTo(valAt(b, "2026-04-24")!, 10);
    expect(periods["3M"].spark!.at(-1)).toBeCloseTo(last, 10);
    const r = periods["1M"].cumulativeReturn!;
    expect(r).not.toBe(Number(r.toFixed(4)));
  });
});

describe("boundaries + availability", () => {
  test("weekend + holiday cutoff rolls back to the prior trading day", () => {
    const b = obs("2026-01-02", END, 100, 130, ["2026-06-24"]);
    expect(b.find((x) => x.date === "2026-06-24")).toBeUndefined();
    const start = valAt(b, "2026-06-24")!;
    expect(canonicalPeriodReturns(b).periods["1M"].cumulativeReturn!).toBeCloseTo((b[b.length - 1].value - start) / start, 10);
  });
  test("exact boundary observation used; leap-year cutoff normalizes", () => {
    const b = obs("2023-07-24", END, 100, 200);
    expect(canonicalPeriodReturns(b).periods["3Y"].startDate).toBe("2023-07-24");
    expect(canonicalPeriodReturns(obs("2023-01-02", "2025-03-03", 100, 150)).periods["1Y"].cumulativeReturn).not.toBeNull();
  });
  test("YTD starts at the prior year-end observation", () => {
    const b = obs("2025-06-02", END, 100, 160);
    expect(canonicalPeriodReturns(b).periods["YTD"].startDate).toBe(valAt(b, "2025-12-31") != null ? b.filter((x) => x.date <= "2025-12-31").at(-1)!.date : null);
    const dec31 = valAt(b, "2025-12-31")!;
    expect(canonicalPeriodReturns(b).periods["YTD"].cumulativeReturn!).toBeCloseTo((b[b.length - 1].value - dec31) / dec31, 10);
  });
  test("fund inception inside range: has 3Y/5Y, lacks 10Y", () => {
    const { periods } = canonicalPeriodReturns(obs("2019-09-01", END, 100, 180));
    expect(periods["3Y"].cumulativeReturn).not.toBeNull();
    expect(periods["5Y"].cumulativeReturn).not.toBeNull();
    expect(periods["10Y"].cumulativeReturn).toBeNull();
    expect(periods["10Y"].unavailableReason).not.toBeNull();
  });
  test("insufficient 3Y/5Y/10Y Unavailable (never 0); valid negative/zero remain valid", () => {
    const { periods } = canonicalPeriodReturns(obs("2024-09-01", END, 100, 150));
    for (const p of ["3Y", "5Y", "10Y"] as const) expect(periods[p].cumulativeReturn).toBeNull();
    expect(canonicalPeriodReturns(obs("2024-01-02", END, 200, 150)).periods["1Y"].cumulativeReturn!).toBeLessThan(0);
    const flat = weekdays("2024-01-02", END).map((date) => ({ date, value: 100 }));
    expect(canonicalPeriodReturns(flat).periods["1Y"].cumulativeReturn).toBe(0);
  });
  test("adjusted value only; junk (<=0) filtered; provider-neutral engine", () => {
    const b = [{ date: "2026-07-20", value: 100 }, { date: "2026-07-21", value: 0 }, { date: "2026-07-22", value: 110 }, { date: "2026-07-23", value: 121 }, { date: "2026-07-24", value: 133.1 }];
    expect(canonicalPeriodReturns(b).periods["1D"].cumulativeReturn!).toBeCloseTo((133.1 - 121) / 121, 10);
    const src = fs.readFileSync(path.resolve(__dirname, "../lib/perf/canonicalReturns.ts"), "utf8");
    expect(src).not.toMatch(/market-data|tiingo|fetch\(|createServerClient|process\.env/i);
  });
});

describe("one engine across consumers", () => {
  const raw = obs("2015-05-01", END, 100, 240);
  const asBars = raw.map((o) => ({ date: o.date, adjClose: o.value }));
  const asDaily = raw.map((o) => ({ date: o.date, price: o.value }));

  test("Firm Funds adapter: recentReturn = cumulative, annualizedReturn = annualized (same canonical)", () => {
    const canon = canonicalPeriodReturns(raw).periods;
    const ff = periodsFromBars(asBars).periods;
    for (const p of PERF_PERIODS) {
      expect(ff[p].recentReturn).toBe(canon[p].cumulativeReturn);   // PRIMARY = cumulative
      expect(ff[p].annualizedReturn).toBe(canon[p].annualizedReturn);
      expect(ff[p].annualizable).toBe(canon[p].annualizable);
    }
  });
  test("KPI pipeline: display cumulative + annualized from canonical; score-consumed uses annualized (multi-year)", () => {
    const canon = canonicalPeriodReturns(raw).periods;
    const kpi = computeKpis(asDaily, asDaily, [], asDaily[asDaily.length - 1].price);
    for (const p of ["1Y", "3Y", "5Y", "10Y"] as const) {
      expect(kpi.periods[p].cumulativeReturn!).toBeCloseTo(canon[p].cumulativeReturn! * 100, 8);
      expect(kpi.cumReturn[p]!).toBeCloseTo(canon[p].cumulativeReturn! * 100, 8);
      if (canon[p].annualizable) {
        expect(kpi.periods[p].annualizedReturn!).toBeCloseTo(canon[p].annualizedReturn! * 100, 8);
        expect(kpi.periods[p].return!).toBeCloseTo(canon[p].annualizedReturn! * 100, 8);  // score = annualized
      } else {
        expect(kpi.periods[p].return!).toBeCloseTo(canon[p].cumulativeReturn! * 100, 8);   // 1Y score = cumulative
      }
    }
    expect(kpi.periods["3Y"].maxDrawdown).not.toBeNull(); // non-return analytics still computed
  });
});
