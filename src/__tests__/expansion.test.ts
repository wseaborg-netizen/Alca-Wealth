/**
 * Expansion Hub — runtime classification + dynamic universe overlay.
 * Deterministic: the classifier is real (shared pipeline rules), the evaluator
 * is dependency-injected, and the merge is exercised with a stubbed DB. No
 * network, no live Supabase.
 */
import * as fs from "fs";
import * as path from "path";

// Stub the DB + Supabase client so the merged-universe loader can run offline.
const mockVerifiedRows: unknown[] = [];
jest.mock("@/lib/supabase", () => ({ createServerClient: async () => ({ __stub: true }) }));
jest.mock("@/lib/db", () => ({
  dynamicFundsListVerified: async () => mockVerifiedRows,
  dynamicFundByTicker: async (_sb: unknown, t: string) => mockVerifiedRows.find((r) => (r as { normalized_ticker: string }).normalized_ticker === t) ?? null,
  dynamicFundCount: async () => mockVerifiedRows.length,
}));

import { classifyFund, classifierSelfTest } from "@/lib/classify";
import { evaluateFundRequest } from "@/lib/fundRequests";
import { dynamicRowToUniverseFund, getMergedUniverse, getUniverseCounts, findMergedFund } from "@/lib/universeServer";
import { UNIVERSE } from "@/lib/universe";
import type { FundSupport } from "@/lib/market-data/fundSupport";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const supported = (name: string, assetType = "ETF"): FundSupport => ({ supported: true, inconclusive: false, name, assetType, reason: null });

afterEach(() => { mockVerifiedRows.length = 0; });

// ── Runtime classifier (shared rules + taxonomy) ──────────────────────────────

describe("runtime classification", () => {
  test("classifies a clear ETF name to taxonomy-valid fields (verified)", () => {
    const r = classifyFund({ normalizedTicker: "VTI", name: "Vanguard Total Stock Market ETF", fundType: "ETF" });
    expect(r.status).toBe("verified");
    expect(r.fields?.primary_category).toBe("US Large Blend");
    expect(r.category).toBeTruthy();      // legacy category mapped
    expect(r.benchmark).toBe("SPY");
  });

  test("classifies a bond fund correctly", () => {
    const r = classifyFund({ normalizedTicker: "BND", name: "Vanguard Total Bond Market ETF", fundType: "ETF" });
    expect(r.status).toBe("verified");
    expect(r.fields?.asset_class).toBe("Fixed Income");
    expect(r.benchmark).toBe("AGG");
  });

  test("an unclassifiable name is NEVER faked — returns needs_classification", () => {
    const r = classifyFund({ normalizedTicker: "ZZZ", name: "ABC Opportunities Trust", fundType: "Mutual Fund" });
    expect(r.status).toBe("needs_classification");
    expect(r.fields === null || r.category === null).toBe(true);
    expect(r.reason).toBeTruthy();
  });

  test("classifier self-test passes (taxonomy loads, sample verifies)", () => {
    expect(classifierSelfTest().ok).toBe(true);
  });
});

// ── Add-fund evaluation with the classifier wired in ──────────────────────────

describe("evaluateFundRequest with classification", () => {
  const noUniverse = () => undefined;

  test("supported + classifiable → added_to_universe with fields to persist", async () => {
    const out = await evaluateFundRequest("newetf", {
      lookupUniverse: noUniverse,
      checkSupport: async () => supported("Schwab US Dividend Equity ETF"),
      classify: classifyFund,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("added_to_universe");
    expect(out.result.classification?.status).toBe("verified");
    expect(out.result.classification?.fields?.primary_category).toBeTruthy();
  });

  test("supported but unclassifiable → needs_classification, NOT added", async () => {
    const out = await evaluateFundRequest("weird", {
      lookupUniverse: noUniverse,
      checkSupport: async () => supported("ABC Opportunities Trust", "Mutual Fund"),
      classify: classifyFund,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("needs_classification");
    expect(out.result.classification?.status).toBe("needs_classification");
  });

  test("async merged-universe lookup hit → already_available (no provider, no classify)", async () => {
    let touched = false;
    const out = await evaluateFundRequest("vti", {
      lookupUniverse: async (t) => UNIVERSE.find((f) => f.ticker === t),
      checkSupport: async () => { touched = true; return supported("x"); },
      classify: () => { touched = true; throw new Error("should not classify"); },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.status).toBe("already_available");
    expect(touched).toBe(false);
  });
});

// ── Dynamic universe overlay + merge ──────────────────────────────────────────

const dynRow = (ticker: string, primary = "US Large Blend", cat = "US Equity Large Blend") => ({
  id: "d1", ticker, normalized_ticker: ticker, fund_name: `${ticker} Test Fund`, vehicle: "ETF",
  asset_class: "Equity", primary_category: primary, category: cat, benchmark: "SPY",
  benchmark_category: "US Large Cap", management_style: "Passive", portfolio_role: "Core",
  investment_focus: "Broad Market", region: "US", market_cap: "Large", style: "Blend", style_box: "Large Blend",
  classification_source: "rule-based", verified: true, created_at: "2026-07-20T00:00:00Z", updated_at: "2026-07-20T00:00:00Z",
});

describe("dynamic universe merge", () => {
  test("dynamicRowToUniverseFund maps into the UniverseFund shape", () => {
    const uf = dynamicRowToUniverseFund(dynRow("ABCD") as never);
    expect(uf.ticker).toBe("ABCD");
    expect(uf.category).toBe("US Equity Large Blend");
    expect(uf.benchmark).toBe("SPY");
    expect(uf.verified).toBe(true);
    expect(uf.source).toBe("dynamic");
  });

  test("merged universe appends a NEW verified dynamic fund and updates the count", async () => {
    const base = await getMergedUniverse();
    expect(base.length).toBe(UNIVERSE.length);      // nothing dynamic yet

    mockVerifiedRows.push(dynRow("ZNEW"));
    const merged = await getMergedUniverse();
    expect(merged.length).toBe(UNIVERSE.length + 1);
    expect(merged.some((f) => f.ticker === "ZNEW")).toBe(true);

    const counts = await getUniverseCounts();
    expect(counts.static).toBe(UNIVERSE.length);
    expect(counts.dynamic).toBe(1);
    expect(counts.merged).toBe(UNIVERSE.length + 1);

    expect((await findMergedFund("ZNEW"))?.ticker).toBe("ZNEW");
  });

  test("a dynamic row duplicating a static ticker does NOT double-count (static wins)", async () => {
    mockVerifiedRows.push(dynRow("VTI"));           // VTI is in the static base
    const merged = await getMergedUniverse();
    expect(merged.filter((f) => f.ticker === "VTI").length).toBe(1);
    expect(merged.length).toBe(UNIVERSE.length);
  });
});

// ── Migration + wiring + safety source scans ──────────────────────────────────

describe("dynamic universe migration + route wiring", () => {
  const mig = read("supabase/migrations/20260720000000_dynamic_universe.sql").toLowerCase();

  test("creates dynamic_funds with RLS and the extended request statuses", () => {
    expect(mig).toContain("create table if not exists dynamic_funds");
    expect(mig).toMatch(/alter table dynamic_funds\s+enable row level security/);
    expect(mig).toContain("is_firm_member(firm_id)");
    expect(mig).toContain("dynamic_funds_ticker_unique");
    for (const s of ["added_to_universe", "classification_failed", "failed_validation"]) expect(mig).toContain(`'${s}'`);
    expect(mig).not.toMatch(/to anon\b/);
    expect(mig).not.toMatch(/service_role/);
  });

  test("read routes merge the dynamic overlay", () => {
    expect(read("src/app/api/universe/route.ts")).toContain("getMergedUniverse");
    expect(read("src/app/api/screen/route.ts")).toContain("getMergedUniverse");
    expect(read("src/app/api/funds/[ticker]/route.ts")).toContain("findMergedFund");
  });

  test("Expansion Operations Center is reachable from the nav and mounts", () => {
    const shell = read("src/components/AppShell.tsx");
    expect(shell).toContain('"Expansion"');
    expect(shell).toContain("ExpansionTab");
    const tab = read("src/components/ExpansionTab.tsx");
    expect(tab).toContain("/api/expansion/import");
    expect(tab).toContain("/api/expansion/queue");
    expect(tab).toContain("refreshMergedUniverse");             // live propagation on approve
    expect(tab).toContain("Sign in to use the Expansion Operations Center"); // signed-out handling
  });

  test("expansion summary route is auth-gated (401 signed out)", () => {
    const src = read("src/app/api/expansion/route.ts");
    expect(src).toContain("requireFirmContext");
    expect(src).toContain("status: 401");
  });

  test("no FMP key exposure and no hardcoded universe count in the overlay/classifier", () => {
    for (const p of ["src/lib/universeServer.ts", "src/lib/classify/index.ts", "src/lib/classify/core.js", "src/lib/health.ts"]) {
      const src = read(p);
      expect(src).not.toMatch(/FMP_API_KEY|apikey=/i);
    }
    // Count must derive from UNIVERSE.length + a live dynamic COUNT, never a literal.
    expect(read("src/lib/universeServer.ts")).toContain("UNIVERSE.length");
    expect(read("src/lib/universeServer.ts")).not.toMatch(/merged:\s*\d{2,}/);
  });
});
