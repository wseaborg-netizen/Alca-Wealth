/**
 * Tiingo fund data service (migration seam) — OFFLINE.
 *
 * The canonical Tiingo provider is mocked (no network); the real in-memory cache
 * is used and cleared between tests. Verifies canonical price-vs-NAV selection,
 * AUM/inception unavailable, unchanged KPI wiring, error handling, and
 * cache/coalescing/credential-scope behavior. Plus source scans proving the
 * migrated runtime paths do not import FMP or fixtures.
 */
import * as fs from "fs";
import * as path from "path";

// ── Mock the canonical provider (createTiingoProvider) — no live calls ─────────
const mockCalls: { method: string; symbol: string; kind?: string }[] = [];
let mockSeriesImpl: (symbol: string) => unknown = () => ({ ok: false, error: { kind: "provider_error", category: "not_found", retryable: false, message: "x", source: "tiingo" } });
let mockHistImpl: (symbol: string) => unknown = () => ({ ok: true, data: { symbol: "B", kind: "price", bars: [], availability: { status: "empty" }, provenance: { source: "tiingo", fetchedAt: "t" }, freshness: { asOf: null, observedAt: "t" } } });

jest.mock("@/lib/market-data", () => {
  const actual = jest.requireActual("@/lib/market-data");
  return {
    ...actual,
    createTiingoProvider: () => ({
      getPriceSeries: async (symbol: string, _c: unknown, opts?: { kind?: string }) => { mockCalls.push({ method: "series", symbol, kind: opts?.kind }); return mockSeriesImpl(symbol); },
      getPriceHistory: async (symbol: string, _c: unknown, opts?: { kind?: string }) => { mockCalls.push({ method: "history", symbol, kind: opts?.kind }); return mockHistImpl(symbol); },
    }),
  };
});

import { getFund, getBenchmarkHistory } from "@/lib/market-data/fundService";
import { cacheClear } from "@/lib/cache";

const prov = { source: "tiingo", fetchedAt: "2026-07-25T00:00:00Z" };
const bar = (date: string, adjClose: number | null, close: number | null = adjClose) => ({ date, close, adjClose, open: null, high: null, low: null, volume: null });
function okSeries(symbol: string, kind: string, bars: unknown[], dists: unknown[] = []) {
  return { ok: true, data: {
    history: { symbol, kind, bars, availability: { status: bars.length ? "available" : "empty", count: bars.length }, provenance: prov, freshness: { asOf: null, observedAt: "t" } },
    distributions: { symbol, distributions: dists, availability: { status: dists.length ? "available" : "empty" }, provenance: prov },
    splits: { symbol, splits: [], availability: { status: "empty" }, provenance: prov },
  } };
}
const errSeries = (category: string, retryable: boolean) => ({ ok: false, error: { kind: "provider_error", category, retryable, message: "x", source: "tiingo" } });
const okBench = (bars: unknown[]) => ({ ok: true, data: { symbol: "SPY", kind: "price", bars, availability: { status: "available", count: bars.length }, provenance: prov, freshness: { asOf: null, observedAt: "t" } } });

beforeEach(async () => {
  await cacheClear();
  mockCalls.length = 0;
  mockSeriesImpl = () => okSeries("X", "price", [bar("2026-07-22", 100), bar("2026-07-23", 101)], [{ exDate: "2026-07-23", amount: 0.5 }]);
  mockHistImpl = () => okBench([bar("2026-07-22", 500), bar("2026-07-23", 501)]);
});

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── Records ───────────────────────────────────────────────────────────────────
describe("fund records", () => {
  test("ETF → price kind, AUM Unavailable, inception Unavailable, KPIs computed", async () => {
    const r = await getFund("VTI", "ETF", "US Equity Large Blend", "SPY");
    expect(mockCalls.find((c) => c.method === "series")?.kind).toBe("price");
    expect(r.ticker).toBe("VTI");
    expect(r.aum).toBeNull();
    expect(r.aumFormatted).toBe("Unavailable");
    expect(r.inceptionDate).toBeNull();
    expect(r.fundAge).toBeNull();
    expect(r.dataSource).toBe("tiingo");
    expect(r.kpi).toBeDefined();
    expect(r.error).toBeUndefined();
  });

  test("mutual fund → NAV kind selected from canonical vehicle (not guessed)", async () => {
    mockSeriesImpl = (s) => okSeries(s, "nav", [bar("2026-07-23", 25.5)]);
    await getFund("VFIAX", "Mutual Fund", "US Equity Large Blend", "SPY");
    expect(mockCalls.find((c) => c.method === "series")?.kind).toBe("nav");
  });

  test("missing adjusted values → falls back to close, still builds", async () => {
    mockSeriesImpl = (s) => okSeries(s, "price", [bar("2026-07-23", null, 50)]);
    const r = await getFund("ABC", "ETF", "Other", "SPY");
    expect(r.error).toBeUndefined();
    expect(r.kpi).toBeDefined();
  });

  test("empty history → no error, KPIs null (insufficient, not fabricated)", async () => {
    mockSeriesImpl = (s) => okSeries(s, "price", []);
    const r = await getFund("NEW", "ETF", "Other", "SPY");
    expect(r.error).toBeUndefined();
    expect(r.kpi.return1y).toBeNull();
  });
});

// ── Errors ─────────────────────────────────────────────────────────────────────
describe("provider failures", () => {
  test("provider error → explicit error record, NOT valid empty financials, NOT cached", async () => {
    mockSeriesImpl = () => errSeries("not_found", false);
    const a = await getFund("ZZZ", "ETF", "Other", "SPY");
    expect(a.error).toBe("not_found");
    expect(a.kpi.return1y).toBeNull();
    const seriesBefore = mockCalls.filter((c) => c.method === "series" && c.symbol === "ZZZ").length;
    const b = await getFund("ZZZ", "ETF", "Other", "SPY"); // error not cached → retried
    void b;
    const seriesAfter = mockCalls.filter((c) => c.method === "series" && c.symbol === "ZZZ").length;
    expect(seriesAfter).toBeGreaterThan(seriesBefore);
  });
});

// ── Cache + coalescing + scope ────────────────────────────────────────────────
describe("cache, coalescing, credential scope", () => {
  test("cache hit: second call served from cache (one provider fetch)", async () => {
    await getFund("VTI", "ETF", "Other", "SPY");
    await getFund("VTI", "ETF", "Other", "SPY");
    expect(mockCalls.filter((c) => c.method === "series" && c.symbol === "VTI")).toHaveLength(1);
  });

  test("coalescing: concurrent identical requests dedupe to one fetch", async () => {
    await Promise.all([getFund("BND", "ETF", "Other", "AGG"), getFund("BND", "ETF", "Other", "AGG")]);
    expect(mockCalls.filter((c) => c.method === "series" && c.symbol === "BND")).toHaveLength(1);
  });

  test("cache key carries a credential SCOPE id and never a token", () => {
    const src = read("src/lib/market-data/fundService.ts");
    expect(src).toMatch(/td:fund:px2:\$\{SCOPE\}/);
    expect(src).toMatch(/SCOPE\s*=\s*"internal"/);
    expect(src).not.toMatch(/\$\{token\}|cacheKey.*token/i);
  });

  test("benchmark history cached", async () => {
    await getBenchmarkHistory("SPY");
    await getBenchmarkHistory("SPY");
    expect(mockCalls.filter((c) => c.method === "history" && c.symbol === "SPY")).toHaveLength(1);
  });
});

// ── Runtime isolation (source scans) ──────────────────────────────────────────
describe("migration isolation", () => {
  test("fund service does not import FMP or test fixtures", () => {
    const src = read("src/lib/market-data/fundService.ts");
    expect(src).not.toMatch(/from "@\/lib\/fmp"|from "\.\.\/fmp"|\/fmp"/);
    // No IMPORT of a test/fixture module (doc comments mentioning "fixtures" are fine).
    expect(src).not.toMatch(/from ["'][^"']*(__tests__|fixture|\.test)/i);
  });

  test("all five migrated routes use the fund service and not FMP/funds runtime", () => {
    const routes = ["funds/[ticker]", "screen", "recommend", "recommend/from-fund", "replace", "compare"];
    for (const r of routes) {
      const src = read(`src/app/api/${r}/route.ts`);
      expect(src).toContain("@/lib/market-data/fundService");
      expect(src).not.toMatch(/from "@\/lib\/funds"/);
      expect(src).not.toMatch(/from "@\/lib\/fmp"/);
    }
  });

  test("Stage 4: Portfolio + Health migrated to the Tiingo fund service (no funds.ts runtime)", () => {
    const portfolio = read("src/app/api/portfolio/select/route.ts");
    const health = read("src/lib/health.ts");
    expect(portfolio).toMatch(/from "@\/lib\/market-data\/fundService"/);
    expect(portfolio).not.toMatch(/from "@\/lib\/funds"/);
    expect(health).toMatch(/from "@\/lib\/market-data\/fundService"/);
    expect(health).not.toMatch(/from "\.\/funds"/);
  });
});
