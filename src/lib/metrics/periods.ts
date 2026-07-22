/**
 * Analysis periods — the global period vocabulary for fund analysis, plus the
 * documented "Overall" blend. Extends the central methodology system
 * (performance.ts / registry.ts); see docs/category-benchmarking-methodology.md.
 */

export type Period = "1Y" | "3Y" | "5Y" | "10Y";
export type PeriodOrOverall = Period | "Overall";

export const PERIODS: Period[] = ["1Y", "3Y", "5Y", "10Y"];
export const PERIOD_YEARS: Record<Period, number> = { "1Y": 1, "3Y": 3, "5Y": 5, "10Y": 10 };

/** Documented Overall blend weights. Missing periods are dropped and the
    remaining weights renormalized — but only when enough history exists. */
export const OVERALL_WEIGHTS: Record<Period, number> = { "1Y": 0.10, "3Y": 0.25, "5Y": 0.30, "10Y": 0.35 };

/**
 * Blend per-period values into an Overall figure.
 * Rules:
 *  - null periods are dropped; remaining weights renormalize.
 *  - Requires at least the 3Y value (a 1Y-only fund gets NO confident Overall).
 *  - Returns the blend plus which periods actually contributed.
 */
export function blendOverall(values: Partial<Record<Period, number | null>>):
  { value: number; used: Period[] } | null {
  const usable = PERIODS.filter((p) => values[p] != null);
  if (!usable.includes("3Y")) return null; // 1Y alone is not an "Overall"
  let wSum = 0, acc = 0;
  for (const p of usable) { wSum += OVERALL_WEIGHTS[p]; acc += OVERALL_WEIGHTS[p] * (values[p] as number); }
  if (wSum <= 0) return null;
  return { value: +(acc / wSum).toFixed(2), used: usable };
}
