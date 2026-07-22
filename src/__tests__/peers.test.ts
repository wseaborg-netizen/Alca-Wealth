/**
 * Category benchmarking + period foundation:
 *  - same-category peer grouping from the verified taxonomy
 *  - no fake ranks (unknown category / thin peer sets / full-universe fallback)
 *  - Overall blend weighting + renormalization rules
 *  - per-period unavailable behavior
 */
import { peerGroupOf, peersOf, rankAmong, rankSentence, MIN_PEERS } from "@/lib/metrics/peers";
import { PERIODS, OVERALL_WEIGHTS, blendOverall } from "@/lib/metrics/periods";
import { UNIVERSE } from "@/lib/universe";

describe("peer grouping", () => {
  test("peer group is the verified primary_category", () => {
    const f = UNIVERSE.find((u) => u.primary_category === "US Large Blend")!;
    expect(peerGroupOf(f)).toBe("US Large Blend");
  });

  test("unknown/catch-all categories get NO peer group", () => {
    expect(peerGroupOf(null)).toBeNull();
    expect(peerGroupOf({ primary_category: "Other", verified: true })).toBeNull();
    expect(peerGroupOf({ primary_category: "Alternative", verified: true })).toBeNull();
    expect(peerGroupOf({ primary_category: "", verified: true })).toBeNull();
    expect(peerGroupOf({ primary_category: "US Large Blend", verified: false })).toBeNull();
  });

  test("peersOf returns only same-category funds (never the full universe)", () => {
    const f = UNIVERSE.find((u) => u.primary_category === "US Large Blend")!;
    const pg = peersOf(f.ticker)!;
    expect(pg.group).toBe("US Large Blend");
    expect(pg.peers.length).toBeGreaterThan(0);
    expect(pg.peers.length).toBeLessThan(UNIVERSE.length); // not a universe fallback
    for (const p of pg.peers) expect(p.primary_category).toBe("US Large Blend");
  });

  test("a ticker outside the universe gets no peers", () => {
    expect(peersOf("ZZZZZZ")).toBeNull();
  });
});

describe("category rank", () => {
  test("rank counts only peers WITH data and reports the true count", () => {
    const r = rankAmong(8, [10, 9, 7, null, undefined, 5], "US Large Blend", "annualized return")!;
    expect(r.rank).toBe(3);        // 10 and 9 are better
    expect(r.count).toBe(5);       // 4 peers with data + self
    expect(rankSentence(r, "3Y")).toBe("Ranked 3 of 5 US Large Blend funds over 3Y (by annualized return)");
  });

  test("fewer than MIN_PEERS with data → no rank (no fake confidence)", () => {
    expect(rankAmong(8, [10, null, null], "X", "annualized return")).toBeNull();
    expect(MIN_PEERS).toBeGreaterThanOrEqual(5);
  });

  test("missing own value → no rank", () => {
    expect(rankAmong(null, [1, 2, 3, 4, 5], "X", "annualized return")).toBeNull();
  });

  test("lower-is-better direction works (e.g. expense ranking)", () => {
    const r = rankAmong(0.05, [0.03, 0.2, 0.4, 0.6], "X", "expense ratio", false)!;
    expect(r.rank).toBe(2); // only 0.03 is lower/better
  });
});

describe("Overall blend", () => {
  test("weights sum to 1 across the four periods", () => {
    expect(PERIODS.reduce((s, p) => s + OVERALL_WEIGHTS[p], 0)).toBeCloseTo(1, 10);
  });

  test("full history blends with the documented weights", () => {
    const b = blendOverall({ "1Y": 10, "3Y": 8, "5Y": 6, "10Y": 4 })!;
    expect(b.value).toBeCloseTo(10 * 0.10 + 8 * 0.25 + 6 * 0.30 + 4 * 0.35, 2);
    expect(b.used).toEqual(["1Y", "3Y", "5Y", "10Y"]);
  });

  test("missing 10Y renormalizes over the remaining weights", () => {
    const b = blendOverall({ "1Y": 10, "3Y": 8, "5Y": 6, "10Y": null })!;
    const expected = (10 * 0.10 + 8 * 0.25 + 6 * 0.30) / (0.10 + 0.25 + 0.30);
    expect(b.value).toBeCloseTo(expected, 2);
    expect(b.used).toEqual(["1Y", "3Y", "5Y"]);
  });

  test("1Y-only history gets NO confident Overall", () => {
    expect(blendOverall({ "1Y": 12, "3Y": null, "5Y": null, "10Y": null })).toBeNull();
    expect(blendOverall({})).toBeNull();
  });
});

describe("per-period unavailable behavior (kpi integration)", () => {
  // Young fund: 18 months of weekly data → 1Y stats exist, 3/5/10Y do not.
  test("periods beyond available history are null, never invented", async () => {
    const { computeKpis } = await import("@/lib/kpi");
    const prices: { date: string; price: number }[] = [];
    const weeks = 78;
    for (let i = weeks; i >= 0; i--) {
      const d = new Date(Date.now() - i * 7 * 86400000);
      prices.push({ date: d.toISOString().slice(0, 10), price: 100 * Math.pow(1.001, weeks - i) });
    }
    const k = computeKpis(prices, prices);
    expect(k.periods["1Y"].return).not.toBeNull();
    expect(k.periods["3Y"].return).toBeNull();
    expect(k.periods["5Y"].return).toBeNull();
    expect(k.periods["10Y"].return).toBeNull();
    expect(k.periods["3Y"].sharpe).toBeNull();
    expect(k.periods["10Y"].maxDrawdown).toBeNull();
  });
});
