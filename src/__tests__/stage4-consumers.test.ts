/**
 * Stage 4 — remaining runtime consumers migrated to Tiingo. Offline only:
 * services take an injected fake provider; no network, no FMP, no fixtures at
 * runtime. Covers quote math, fund records, support checks, the Expansion
 * unknown-vehicle rule, health categories, proxy labels, and FMP isolation.
 */
import * as fs from "fs";
import * as path from "path";
import { cacheClear } from "@/lib/cache";
import type { MarketDataProvider, ProviderErrorCategory, PriceBar } from "@/lib/market-data";
import { getMarketQuote, __setProviderForTests as setQuoteProvider } from "@/lib/market-data/marketQuote";
import { getFund, __setProviderForTests as setFundProvider } from "@/lib/market-data/fundService";
import { checkFundSupport, __setProviderForTests as setSupportProvider } from "@/lib/market-data/fundSupport";
import { evaluateFundRequest } from "@/lib/fundRequests";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── Fake provider plumbing ────────────────────────────────────────────────────
const PROV = { source: "tiingo" as const, fetchedAt: "2026-07-25T00:00:00Z" };
const bar = (date: string, adjClose: number): PriceBar => ({ date, close: adjClose, adjClose, open: null, high: null, low: null, volume: null });
/** N+1 daily bars ending today, spanning ~N days (so KPI periods are non-null). */
function recentBars(days: number): PriceBar[] {
  const out: PriceBar[] = [];
  const today = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    out.push(bar(d.toISOString().slice(0, 10), 100 + (days - i) * 0.05));
  }
  return out;
}
const err = (category: ProviderErrorCategory) => ({ ok: false as const, error: { kind: "provider_error" as const, category, retryable: false, message: "x", source: "tiingo" as const } });
const notStub = async () => { throw new Error("not stubbed"); };

function fakeProvider(over: Partial<MarketDataProvider>): MarketDataProvider {
  return {
    getSecurityMetadata: notStub, getPriceHistory: notStub, getDistributions: notStub,
    getSplits: notStub, getPriceSeries: notStub, ...over,
  } as MarketDataProvider;
}
function priceHistory(bars: PriceBar[]) {
  return { ok: true as const, data: { symbol: "X", kind: "price" as const, bars, availability: { status: "available" as const, count: bars.length }, provenance: PROV, freshness: { asOf: bars.at(-1)?.date ?? null, observedAt: PROV.fetchedAt } } };
}
function priceSeries(bars: PriceBar[], divs: { exDate: string; amount: number }[] = []) {
  return { ok: true as const, data: {
    history: priceHistory(bars).data,
    distributions: { symbol: "X", distributions: divs, availability: divs.length ? { status: "available" as const, count: divs.length } : { status: "empty" as const }, provenance: PROV },
    splits: { symbol: "X", splits: [], availability: { status: "empty" as const }, provenance: PROV },
  } };
}

beforeEach(async () => {
  await cacheClear();
  setQuoteProvider(null); setFundProvider(null); setSupportProvider(null);
});

// ── Dashboard / market quote ──────────────────────────────────────────────────
describe("market quote (Dashboard / Advisor Overview)", () => {
  const bars = [bar("2026-07-20", 100), bar("2026-07-21", 110), bar("2026-07-22", 121)];

  test("computes latest value + 1d change from Tiingo adjusted history", async () => {
    setQuoteProvider(fakeProvider({ getPriceHistory: async () => priceHistory(bars) }));
    const q = await getMarketQuote("SPY");
    expect(q).not.toBeNull();
    expect(q!.price).toBe(121);
    expect(q!.change1d).toBeCloseTo((121 - 110) / 110);
  });

  test("provider error → null (explicit unavailable, not fabricated, not cached)", async () => {
    let calls = 0;
    setQuoteProvider(fakeProvider({ getPriceHistory: async () => { calls++; return err("unauthorized"); } }));
    expect(await getMarketQuote("SPY")).toBeNull();
    await getMarketQuote("SPY");
    expect(calls).toBe(2); // not cached → retried
  });

  test("insufficient history → null", async () => {
    setQuoteProvider(fakeProvider({ getPriceHistory: async () => priceHistory([bar("2026-07-22", 100)]) }));
    expect(await getMarketQuote("SPY")).toBeNull();
  });

  test("successful quote is cached + coalesced (one provider call)", async () => {
    let calls = 0;
    setQuoteProvider(fakeProvider({ getPriceHistory: async () => { calls++; return priceHistory(bars); } }));
    const [a, b] = await Promise.all([getMarketQuote("SPY"), getMarketQuote("SPY")]); // coalesced
    await getMarketQuote("SPY"); // cache hit
    expect(a).toEqual(b);
    expect(calls).toBe(1);
  });
});

// ── Fund service (Portfolio + Health reuse) ───────────────────────────────────
describe("fund service records", () => {
  const bars = Array.from({ length: 30 }, (_, i) => bar(`2026-06-${String(i + 1).padStart(2, "0")}`, 100 + i));

  test("ETF → price kind; AUM + inception Unavailable; source tiingo", async () => {
    let kind: string | undefined;
    setFundProvider(fakeProvider({ getPriceSeries: async (_s, _c, o) => { kind = o?.kind; return priceSeries(bars); }, getPriceHistory: async () => priceHistory(bars) }));
    const r = await getFund("VTI", "ETF", "US Equity Large Blend", "SPY");
    expect(kind).toBe("price");
    expect(r.aum).toBeNull();
    expect(r.aumFormatted).toBe("Unavailable");
    expect(r.inceptionDate).toBeNull();
    expect(r.fundAge).toBeNull();
    expect(r.dataSource).toBe("tiingo");
    expect(r.error).toBeUndefined();
  });

  test("mutual fund → NAV kind selected from canonical vehicle", async () => {
    let kind: string | undefined;
    setFundProvider(fakeProvider({ getPriceSeries: async (_s, _c, o) => { kind = o?.kind; return priceSeries(bars); }, getPriceHistory: async () => priceHistory(bars) }));
    await getFund("VFIAX", "Mutual Fund", "US Equity Large Blend", "SPY");
    expect(kind).toBe("nav");
  });

  test("provider failure → explicit error record, empty KPIs, not zeroed", async () => {
    setFundProvider(fakeProvider({ getPriceSeries: async () => err("not_found"), getPriceHistory: async () => err("not_found") }));
    const r = await getFund("ZZZZ", "ETF", "Other", "SPY");
    expect(r.error).toBe("not_found");
    expect(r.kpi.return3y).toBeNull(); // no fabricated 0
    expect(r.aum).toBeNull();
  });
});

// ── Expansion fund support + classification rule ──────────────────────────────
describe("Expansion support + unknown-vehicle rule", () => {
  test("supported symbol → assetType Unknown (never guessed)", async () => {
    setSupportProvider(fakeProvider({ getSecurityMetadata: async () => ({ ok: true, data: { symbol: "NEW", displayName: "New Bond ETF", securityType: "unknown", coverageStartDate: "2015-01-01", aum: { status: "unavailable", reason: "not_supported_by_provider" }, provenance: PROV } }) }));
    const s = await checkFundSupport("NEW");
    expect(s.supported).toBe(true);
    expect(s.assetType).toBe("Unknown");
    expect(s.name).toBe("New Bond ETF");
  });

  test("not-found → unsupported; provider error → inconclusive (never a rejection)", async () => {
    setSupportProvider(fakeProvider({ getSecurityMetadata: async () => err("not_found") }));
    const nf = await checkFundSupport("BAD");
    expect(nf.supported).toBe(false);
    expect(nf.inconclusive).toBe(false);

    setSupportProvider(fakeProvider({ getSecurityMetadata: async () => err("timeout") }));
    const to = await checkFundSupport("VTI");
    expect(to.supported).toBe(false);
    expect(to.inconclusive).toBe(true); // retryable, not "unsupported"
  });

  test("verified classification but UNKNOWN vehicle + not canonical → needs review (not auto-added)", async () => {
    const out = await evaluateFundRequest("NEWETF", {
      lookupUniverse: () => undefined,
      checkFmp: async () => ({ supported: true, inconclusive: false, name: "Schwab US Dividend ETF", assetType: "Unknown", reason: null }),
      classify: () => ({ status: "verified", fields: { asset_class: "Equity", primary_category: "US Large Value" } as never, category: "US Equity Large Value", benchmark: "SPY", source: "rule-based", reason: null }),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("needs_classification"); // NOT added_to_universe
    expect(out.result.vehicle).toBeNull();
  });

  test("known vehicle + verified → added_to_universe (unchanged path)", async () => {
    const out = await evaluateFundRequest("NEWETF", {
      lookupUniverse: () => undefined,
      checkFmp: async () => ({ supported: true, inconclusive: false, name: "Schwab US Dividend ETF", assetType: "ETF", reason: null }),
      classify: () => ({ status: "verified", fields: { asset_class: "Equity", primary_category: "US Large Value" } as never, category: "US Equity Large Value", benchmark: "SPY", source: "rule-based", reason: null }),
    });
    expect(out.ok && out.result.status).toBe("added_to_universe");
  });
});

// ── System Health provider categories ─────────────────────────────────────────
describe("System Health — Tiingo probe categories", () => {
  async function marketDataCheck() {
    const { runSystemHealth } = await import("@/lib/health");
    const res = await runSystemHealth({ signedIn: false });
    return res.checks.find((c) => c.key === "marketData")!;
  }
  const goodBars = recentBars(500); // > 1y of daily history so KPI periods populate

  test("healthy when the probe returns usable adjusted history", async () => {
    setFundProvider(fakeProvider({ getPriceSeries: async () => priceSeries(goodBars), getPriceHistory: async () => priceHistory(goodBars) }));
    expect((await marketDataCheck()).status).toBe("healthy");
  });
  test("unauthorized token → error", async () => {
    setFundProvider(fakeProvider({ getPriceSeries: async () => err("unauthorized"), getPriceHistory: async () => err("unauthorized") }));
    expect((await marketDataCheck()).status).toBe("error");
  });
  test("rate limited → warning", async () => {
    setFundProvider(fakeProvider({ getPriceSeries: async () => err("rate_limited"), getPriceHistory: async () => err("rate_limited") }));
    expect((await marketDataCheck()).status).toBe("warning");
  });
});

// ── Source scans: proxies, FMP isolation, safety ──────────────────────────────
describe("Stage 4 isolation + proxy labeling", () => {
  test("market route uses labeled ETF proxies, never native index names", () => {
    const src = read("src/app/api/market/route.ts");
    for (const t of ["SPY", "DIA", "QQQ"]) expect(src).toContain(`ticker: "${t}"`);
    expect(src).toContain("ETF Proxy");
    expect(src).toContain("isProxy: true");
    // No proxy row labeled as the native index.
    expect(src).not.toMatch(/label:\s*"S&P 500"\s*,/);
    expect(src).not.toMatch(/label:\s*"Nasdaq"\s*,/);
    expect(src).not.toContain('"^GSPC"');
  });

  test("no active Stage 4 runtime path imports FMP", () => {
    const files = [
      "src/app/api/portfolio/select/route.ts", "src/lib/health.ts",
      "src/app/api/market/route.ts", "src/app/api/advisor-overview/route.ts",
      "src/app/api/fund-requests/route.ts", "src/lib/expansionServer.ts",
      "src/lib/market-data/marketQuote.ts", "src/lib/market-data/fundService.ts", "src/lib/market-data/fundSupport.ts",
    ];
    for (const f of files) {
      const src = read(f);
      expect(src).not.toMatch(/import\s+\{[^}]*\}\s+from\s+"@\/lib\/fmp"/);   // no VALUE import of fmp
      expect(src).not.toMatch(/import\s+\{[^}]*\}\s+from\s+"@\/lib\/funds"/); // no VALUE import of funds.ts (type-only ok)
    }
  });

  test("no runtime module imports a test fixture; no client token exposure", () => {
    for (const f of ["src/lib/market-data/marketQuote.ts", "src/lib/market-data/fundService.ts", "src/lib/market-data/fundSupport.ts"]) {
      const src = read(f);
      expect(src).not.toMatch(/from\s+["'][^"']*(__tests__|fixtures?)[^"']*["']/i); // no import FROM a test/fixture path
      expect(src).not.toContain("NEXT_PUBLIC_TIINGO");
      expect(src).not.toMatch(/console\.(log|warn|error)/);
    }
  });
});
