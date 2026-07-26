/**
 * Add Missing Fund — backend foundation.
 * Pure/deterministic: the evaluator is dependency-injected, so no network or DB
 * is touched. Plus migration + route + no-secret-exposure source scans.
 */
import * as fs from "fs";
import * as path from "path";
import { normalizeTicker, isValidTicker } from "@/lib/tickerNormalize";
import { evaluateFundRequest, ACTIVE_STATUSES, isActiveStatus } from "@/lib/fundRequests";
import { findFund } from "@/lib/universe";
import type { FundSupport } from "@/lib/market-data/fundSupport";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const supported = (name: string, assetType = "ETF"): FundSupport =>
  ({ supported: true, inconclusive: false, name, assetType, reason: null });
const unsupported = (): FundSupport =>
  ({ supported: false, inconclusive: false, name: null, assetType: null, reason: "Not found or not supported by the data provider." });
const inconclusive = (): FundSupport =>
  ({ supported: false, inconclusive: true, name: null, assetType: null, reason: "Provider did not respond — try again shortly." });

// A universe lookup that only knows about one made-up verified fund.
const universeWith = (tickers: Record<string, { name: string; category: string }>) =>
  (t: string) => tickers[t]
    ? ({ ticker: t, name: tickers[t].name, vehicle: "ETF", category: tickers[t].category, primary_category: tickers[t].category } as never)
    : undefined;

// ── Normalization ─────────────────────────────────────────────────────────────

describe("ticker normalization", () => {
  test("trims and uppercases", () => {
    expect(normalizeTicker("  vti ").normalized).toBe("VTI");
    expect(normalizeTicker("brk.b").normalized).toBe("BRK.B");
  });
  test("accepts dot/hyphen class suffixes", () => {
    expect(isValidTicker("BRK.B")).toBe(true);
    expect(isValidTicker("RDS-A")).toBe(true);
  });
  test("rejects empty, spaces, over-length, and junk", () => {
    expect(normalizeTicker("").ok).toBe(false);
    expect(normalizeTicker("   ").ok).toBe(false);
    expect(normalizeTicker("AB CD").ok).toBe(false);      // internal space
    expect(normalizeTicker("TOOLONGSYMBOL12").ok).toBe(false);
    expect(normalizeTicker("12345").ok).toBe(false);      // no letter
    expect(normalizeTicker("$$$").ok).toBe(false);
    expect(normalizeTicker(null).ok).toBe(false);
  });
});

// ── Evaluation ────────────────────────────────────────────────────────────────

describe("evaluateFundRequest", () => {
  const noUniverse = () => undefined;

  test("invalid ticker is rejected before any lookup", async () => {
    const out = await evaluateFundRequest("!!", { lookupUniverse: noUniverse, checkSupport: async () => { throw new Error("should not be called"); } });
    expect(out.ok).toBe(false);
  });

  test("already-in-universe detection short-circuits (no provider call)", async () => {
    let supportCalled = false;
    const out = await evaluateFundRequest("spy", {
      lookupUniverse: universeWith({ SPY: { name: "SPDR S&P 500 ETF", category: "US Equity Large Blend" } }),
      checkSupport: async () => { supportCalled = true; return unsupported(); },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("already_available");
    expect(out.result.alreadyInUniverse).toBe(true);
    expect(out.result.existingFund?.ticker).toBe("SPY");
    expect(supportCalled).toBe(false);
  });

  test("Provider-supported but not in universe → ready_for_review (never auto-added)", async () => {
    const out = await evaluateFundRequest("ABCD", { lookupUniverse: noUniverse, checkSupport: async () => supported("Some New ETF") });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("ready_for_review");
    expect(out.result.providerSupported).toBe(true);
    expect(out.result.alreadyInUniverse).toBe(false);
    expect(out.result.fundName).toBe("Some New ETF");
    expect(out.result.classificationStatus).toBe("pending");
  });

  test("unsupported ticker → unsupported with a reason", async () => {
    const out = await evaluateFundRequest("ZZZZ", { lookupUniverse: noUniverse, checkSupport: async () => unsupported() });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("unsupported");
    expect(out.result.providerSupported).toBe(false);
    expect(out.result.failureReason).toBeTruthy();
  });

  test("inconclusive provider → pending (retryable), not unsupported", async () => {
    const out = await evaluateFundRequest("ABCD", { lookupUniverse: noUniverse, checkSupport: async () => inconclusive() });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("pending");
  });

  test("real verified universe ticker (VTI) is detected as already_available", async () => {
    const out = await evaluateFundRequest("VTI", { lookupUniverse: (t) => findFund(t), checkSupport: async () => { throw new Error("no provider call"); } });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("already_available");
  });
});

describe("duplicate prevention (active-status set)", () => {
  test("active statuses block re-requests; terminal statuses do not", () => {
    expect(ACTIVE_STATUSES).toEqual(["pending", "provider_supported", "needs_classification", "ready_for_review"]);
    expect(isActiveStatus("ready_for_review")).toBe(true);
    expect(isActiveStatus("pending")).toBe(true);
    for (const terminal of ["already_available", "approved", "rejected", "unsupported"]) {
      expect(isActiveStatus(terminal)).toBe(false);
    }
  });
});

// ── Migration ─────────────────────────────────────────────────────────────────

describe("fund_requests migration", () => {
  const mig = read("supabase/migrations/20260719120000_fund_requests.sql").toLowerCase();

  test("creates a firm-scoped table with all statuses and RLS", () => {
    expect(mig).toContain("create table if not exists fund_requests");
    expect(mig).toContain("firm_id");
    for (const s of ["pending", "already_available", "fmp_supported", "needs_classification", "ready_for_review", "approved", "rejected", "unsupported"]) {
      expect(mig).toContain(`'${s}'`);
    }
    expect(mig).toMatch(/alter table fund_requests\s+enable row level security/);
    expect(mig).toContain("is_firm_member(firm_id)");
  });

  test("prevents duplicate active requests and grants nothing to anon", () => {
    expect(mig).toContain("fund_requests_active_unique");
    expect(mig).toMatch(/where status in \('pending', 'fmp_supported', 'needs_classification', 'ready_for_review'\)/);
    expect(mig).not.toMatch(/to anon\b/);
  });
});

// ── API routes + secret safety ─────────────────────────────────────────────────

describe("fund-request API routes", () => {
  const post = read("src/app/api/fund-requests/route.ts");
  const detail = read("src/app/api/fund-requests/[ticker]/route.ts");

  test("routes require auth (401 when signed out) and are firm-scoped", () => {
    expect(post).toContain("requireFirmContext");
    expect(post).toContain("status: 401");
    expect(detail).toContain("requireFirmContext");
    expect(detail).toContain("status: 401");
  });

  test("POST normalizes, checks universe + provider, and dedupes before insert", () => {
    expect(post).toContain("evaluateFundRequest");
    expect(post).toContain("findMergedFund");
    expect(post).toContain("checkFundSupport"); // Stage 4: Tiingo support check
    expect(post).toContain("fundRequestActive");
    expect(post).toContain("classifyFund");
  });

  test("no FMP key or apikey is referenced in routes or the request modules", () => {
    for (const src of [post, detail, read("src/lib/fundRequests.ts"), read("src/lib/tickerNormalize.ts")]) {
      expect(src).not.toMatch(/FMP_API_KEY|apikey=/i);
    }
  });
});

describe("Tiingo support check exposes safe fields only", () => {
  test("checkFundSupport returns provider-neutral support flags; never guesses vehicle or leaks the token", () => {
    const src = read("src/lib/market-data/fundSupport.ts");
    expect(src).toContain("supported");
    expect(src).toContain("inconclusive");
    expect(src).toContain('assetType: "Unknown"'); // vehicle never guessed from Tiingo
    // No token in output/logs, and no provider fallback.
    expect(src).not.toMatch(/console\.(log|warn|error)/);
    expect(src).not.toMatch(/\bfmp\b|financialmodel/i);
    expect(src).not.toMatch(/TIINGO_API_KEY/);
  });
});
