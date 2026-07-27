/**
 * Canonical trailing-return engine — the ONE source used by display, Advisor
 * Review Score, ranking, screener, comparison, analysis, and Firm Funds.
 *
 * Covers the full 1D–10Y period set, calendar-cutoff boundaries (weekend/holiday/
 * leap/exact/missing-observation/prior-valid), geometric annualization over actual
 * elapsed time, fund inception inside the range, insufficient 3Y/5Y/10Y history,
 * adjusted-value-only consumption, full precision, valid negative returns, and
 * end-to-end consistency with the KPI pipeline (same inputs → same return).
 */
import * as fs from "fs";
import * as path from "path";
import {
  canonicalPeriodReturns, PERF_PERIODS, ANNUALIZED_PERIODS, PERIOD_LABEL, DEFAULT_PERF_PERIOD,
} from "@/lib/perf/canonicalReturns";
import { periodsFromBars } from "@/lib/firmPerformance";
import { computeKpis } from "@/lib/kpi";

// Weekday-only date strings in [from, to], optionally skipping holidays.
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
// Linear adjusted series p0→p1 across the weekday span.
function obs(fromISO: string, toISO: string, p0 = 100, p1 = 200, holidays: string[] = []) {
  const ds = weekdays(fromISO, toISO, holidays);
  return ds.map((date, i) => ({ date, value: p0 + (p1 - p0) * (i / (ds.length - 1)) }));
}
const valAt = (b: { date: string; value: number }[], iso: string) => { for (let i = b.length - 1; i >= 0; i--) if (b[i].date <= iso) return b[i].value; return null; };
const END = "2026-07-24"; // a Friday

describe("period set + labels", () => {
  test("eight standardized periods; default 1M; annualized only for 3Y/5Y/10Y", () => {
    expect([...PERF_PERIODS]).toEqual(["1D", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "10Y"]);
    expect(DEFAULT_PERF_PERIOD).toBe("1M");
    expect(PERIOD_LABEL["3Y"]).toBe("3Y Annualized");
    expect(PERIOD_LABEL["5Y"]).toBe("5Y Annualized");
    expect(PERIOD_LABEL["10Y"]).toBe("10Y Annualized");
    for (const p of ["3Y", "5Y", "10Y"] as const) expect(ANNUALIZED_PERIODS[p]).toBe(true);
    for (const p of ["1D", "1M", "3M", "YTD", "1Y"] as const) expect(ANNUALIZED_PERIODS[p]).toBe(false);
  });
});

describe("returns over 11 years of history", () => {
  const b = obs("2015-05-01", END, 100, 260, ["2024-12-25", "2025-01-01", "2020-11-26"]);
  const { periods, asOf } = canonicalPeriodReturns(b);
  const last = b[b.length - 1].value;

  test("as-of = latest completed EOD; cumulative vs annualized classification", () => {
    expect(asOf).toBe(END);
    for (const p of ["1D", "1M", "3M", "YTD", "1Y"] as const) expect(periods[p].cumulative).toBe(true);
    for (const p of ["3Y", "5Y", "10Y"] as const) expect(periods[p].cumulative).toBe(false);
  });
  test("cumulative windows use calendar cutoffs (nearest trading day on/before)", () => {
    expect(periods["1D"].return!).toBeCloseTo((last - b[b.length - 2].value) / b[b.length - 2].value, 10);
    expect(periods["1M"].return!).toBeCloseTo((last - valAt(b, "2026-06-24")!) / valAt(b, "2026-06-24")!, 10);
    expect(periods["3M"].return!).toBeCloseTo((last - valAt(b, "2026-04-24")!) / valAt(b, "2026-04-24")!, 10);
    expect(periods["YTD"].return!).toBeCloseTo((last - valAt(b, "2025-12-31")!) / valAt(b, "2025-12-31")!, 10);
    expect(periods["1Y"].return!).toBeCloseTo((last - valAt(b, "2025-07-24")!) / valAt(b, "2025-07-24")!, 10);
  });
  test("3Y/5Y/10Y are geometric annualized over ACTUAL elapsed time", () => {
    for (const [p, cut] of [["3Y", "2023-07-24"], ["5Y", "2021-07-24"], ["10Y", "2016-07-24"]] as const) {
      const s = periods[p].startDate!, sv = valAt(b, cut)!;
      const T = (Date.parse(END) - Date.parse(s)) / (365.25 * 864e5);
      expect(periods[p].return!).toBeCloseTo(Math.pow(last / sv, 1 / T) - 1, 8);
      // annualized ≪ cumulative for a rising multi-year series
      expect(periods[p].return!).toBeLessThan((last - sv) / sv);
    }
  });
  test("sparkline shares the return's source range; returns unrounded", () => {
    expect(periods["3M"].spark![0]).toBeCloseTo(valAt(b, "2026-04-24")!, 10);
    expect(periods["3M"].spark!.at(-1)).toBeCloseTo(last, 10);
    const r = periods["1M"].return!;
    expect(r).not.toBe(Number(r.toFixed(4))); // full precision retained
  });
});

describe("boundaries", () => {
  test("weekend + holiday cutoff → nearest prior trading day", () => {
    // 1M cutoff 2026-06-24 is a Wednesday; make it a holiday so start rolls back a day.
    const b = obs("2026-01-02", END, 100, 130, ["2026-06-24"]);
    const start = valAt(b, "2026-06-24"); // = 2026-06-23 value (holiday rolled back)
    expect(b.find((x) => x.date === "2026-06-24")).toBeUndefined();
    expect(canonicalPeriodReturns(b).periods["1M"].return!).toBeCloseTo((b[b.length - 1].value - start!) / start!, 10);
  });
  test("exact boundary observation is used when present", () => {
    const b = obs("2023-07-24", END, 100, 200); // first bar exactly at last−3Y
    const { periods } = canonicalPeriodReturns(b);
    const T = (Date.parse(END) - Date.parse("2023-07-24")) / (365.25 * 864e5);
    expect(periods["3Y"].startDate).toBe("2023-07-24");
    expect(periods["3Y"].return!).toBeCloseTo(Math.pow(200 / 100, 1 / T) - 1, 8);
  });
  test("leap-year cutoff normalizes without error", () => {
    const b = obs("2023-01-02", "2025-03-03", 100, 150); // 1Y cutoff from 2025-03-03 → 2024-03-03 (leap yr)
    expect(canonicalPeriodReturns(b).periods["1Y"].return).not.toBeNull();
  });
  test("fund inception inside the range: has 3Y/5Y but not 10Y", () => {
    const b = obs("2019-09-01", END, 100, 180); // ~6.9y of history
    const { periods } = canonicalPeriodReturns(b);
    expect(periods["3Y"].return).not.toBeNull();
    expect(periods["5Y"].return).not.toBeNull();
    expect(periods["10Y"].return).toBeNull();
    expect(periods["10Y"].unavailableReason).toMatch(/cutoff|history/i);
  });
  test("insufficient 3Y/5Y/10Y stay Unavailable (never 0)", () => {
    const b = obs("2024-09-01", END, 100, 150); // < 2y
    const { periods } = canonicalPeriodReturns(b);
    for (const p of ["3Y", "5Y", "10Y"] as const) {
      expect(periods[p].return).toBeNull();
      expect(periods[p].unavailableReason).not.toBeNull();
    }
    expect(periods["1Y"].return).not.toBeNull();
  });
  test("valid negative and zero returns remain valid (not Unavailable)", () => {
    const down = obs("2024-01-02", END, 200, 150); // falling series
    expect(canonicalPeriodReturns(down).periods["1Y"].return!).toBeLessThan(0);
    const flat = weekdays("2024-01-02", END).map((date) => ({ date, value: 100 }));
    expect(canonicalPeriodReturns(flat).periods["1Y"].return).toBe(0);
  });
});

describe("basis + input protection", () => {
  test("consumes the adjusted value only (positive, finite); junk filtered", () => {
    const b = [
      { date: "2026-07-20", value: 100 }, { date: "2026-07-21", value: 0 }, // dropped (<=0)
      { date: "2026-07-22", value: 110 }, { date: "2026-07-23", value: 121 }, { date: "2026-07-24", value: 133.1 },
    ];
    const { periods } = canonicalPeriodReturns(b);
    expect(periods["1D"].return!).toBeCloseTo((133.1 - 121) / 121, 10);
  });
  test("engine is provider-neutral (no provider/token/network imports)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../lib/perf/canonicalReturns.ts"), "utf8");
    expect(src).not.toMatch(/market-data|tiingo|fetch\(|createServerClient|process\.env/i);
  });
});

// ── ONE-ENGINE consistency: display (Firm Funds) + scoring (KPI) agree ─────────

describe("single canonical engine across consumers", () => {
  const raw = obs("2015-05-01", END, 100, 240);
  const asBars = raw.map((o) => ({ date: o.date, adjClose: o.value }));
  const asDaily = raw.map((o) => ({ date: o.date, price: o.value }));

  test("Firm Funds adapter matches the canonical engine exactly", () => {
    const canon = canonicalPeriodReturns(raw).periods;
    const ff = periodsFromBars(asBars).periods;
    for (const p of PERF_PERIODS) expect(ff[p].recentReturn).toBe(canon[p].return);
  });

  test("KPI pipeline returns come from the canonical engine (same inputs → same return)", () => {
    const canon = canonicalPeriodReturns(raw).periods;
    const kpi = computeKpis(asDaily, asDaily, [], asDaily[asDaily.length - 1].price);
    for (const p of ["1Y", "3Y", "5Y", "10Y"] as const) {
      const expected = canon[p].return != null ? canon[p].return! * 100 : null;
      if (expected == null) expect(kpi.periods[p].return).toBeNull();
      else expect(kpi.periods[p].return!).toBeCloseTo(expected, 8);
    }
    // top-level fields mirror the period returns
    expect(kpi.return3y).toBe(kpi.periods["3Y"].return);
    expect(kpi.return5y).toBe(kpi.periods["5Y"].return);
    // non-return analytics still computed (unchanged pipeline)
    expect(kpi.periods["3Y"].maxDrawdown).not.toBeNull();
    expect(kpi.maxDrawdown3y).not.toBeNull();
  });
});
