/**
 * Phase 2C — Firm Funds inventory.
 *
 * Unit tests for the server composition + enrichment logic (with a mocked
 * universe + a lightweight Supabase chain mock) plus source scans confirming
 * firm isolation, canonical validation, honest unavailable states, contextual
 * navigation, and no client-side provider/token access. No live DB or provider.
 */
import * as fs from "fs";
import * as path from "path";

jest.mock("@/lib/universeServer", () => ({
  findMergedFund: jest.fn(async (t: string) =>
    t.toUpperCase() === "VTI"
      ? { ticker: "VTI", name: "Vanguard Total Stock Market ETF", vehicle: "ETF", category: "US Equity Large Blend", benchmark: "SPY" }
      : undefined),
  getMergedUniverse: jest.fn(async () => ([
    { ticker: "VTI", name: "Vanguard Total Stock Market ETF", vehicle: "ETF", category: "US Equity Large Blend", benchmark: "SPY" },
    { ticker: "VFIAX", name: "Vanguard 500 Index Fund Admiral Shares", vehicle: "Mutual Fund", category: "US Equity Large Blend", benchmark: "SPY" },
  ])),
}));

import {
  perfFromQuote, boundedPerformance, buildFirmInventory, addFirmFundToInventory, NOT_CONNECTED,
} from "@/lib/firmInventory";
import { lastCompletedReviews, FirmReviewError } from "@/lib/firmReviews";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// A minimal thenable Supabase query-chain mock: every builder method returns the
// same object; awaiting it resolves the table's configured { data, error }.
function makeSb(byTable: Record<string, { data: unknown; error: unknown }>) {
  const chain = (result: { data: unknown; error: unknown }) => {
    const p: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "in", "order", "limit", "update", "delete", "insert", "single"]) p[m] = () => p;
    (p as { then: unknown }).then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
    return p;
  };
  return { from: (t: string) => chain(byTable[t] ?? { data: [], error: null }) } as never;
}

// ── Performance mappers (missing → Unavailable, never 0) ──────────────────────

describe("performance mapping", () => {
  test("missing quote → Unavailable (null), not 0%", () => {
    expect(perfFromQuote(null)).toEqual({ recentReturn: null, spark: null });
  });
  test("recent return and sparkline can be unavailable independently", () => {
    expect(perfFromQuote({ change1m: 0.0231, spark6m: Array(20).fill(1) })).toEqual({ recentReturn: 0.0231, spark: expect.any(Array) });
    expect(perfFromQuote({ change1m: 0.02 }).spark).toBeNull();                 // no spark → null (not [])
    expect(perfFromQuote({ spark6m: Array(20).fill(1) }).recentReturn).toBeNull(); // no return → null
    expect(perfFromQuote({ change1m: Number.NaN, spark6m: Array(20).fill(1) }).recentReturn).toBeNull();
  });
});

describe("bounded performance enrichment", () => {
  const quote = async (t: string) => {
    if (t === "BAD") throw new Error("provider down");
    return { change1m: 0.01, spark6m: Array(12).fill(1) };
  };
  test("only the firm's own tickers are enriched (bounded)", async () => {
    const out = await boundedPerformance(["vti", "spy"], new Set(["VTI"]), quote);
    expect(Object.keys(out)).toEqual(["VTI"]);   // SPY not in firm inventory → excluded
  });
  test("a partial provider failure yields Unavailable for that row, batch still succeeds", async () => {
    const out = await boundedPerformance(["VTI", "BAD"], new Set(["VTI", "BAD"]), quote);
    expect(out.VTI.recentReturn).toBe(0.01);
    expect(out.BAD).toEqual({ recentReturn: null, spark: null });
  });
  test("enrichment is capped", async () => {
    const many = Array.from({ length: 500 }, (_, i) => `T${i}`);
    const out = await boundedPerformance(many, new Set(many), quote, 50);
    expect(Object.keys(out).length).toBe(50);
  });
});

// ── Last review derivation ────────────────────────────────────────────────────

describe("last completed review derivation", () => {
  test("newest completed_date per fund; only completed reviews count", async () => {
    const sb = makeSb({ fund_reviews: { data: [
      { firm_fund_id: "A", completed_date: "2026-05-01" },
      { firm_fund_id: "A", completed_date: "2026-03-01" },
      { firm_fund_id: "B", completed_date: "2026-04-01" },
    ], error: null } });
    const map = await lastCompletedReviews(sb, "firm1");
    expect(map).toEqual({ A: "2026-05-01", B: "2026-04-01" });
  });
});

// ── Inventory composition ─────────────────────────────────────────────────────

describe("buildFirmInventory", () => {
  const sb = makeSb({
    firm_funds: { data: [
      { id: "f1", firm_id: "firm1", normalized_ticker: "VTI", status: "approved", fund_role: "Core US equity", approval_rationale: null, next_review_date: "2026-09-01" },
      { id: "f2", firm_id: "firm1", normalized_ticker: "VFIAX", status: "retired", fund_role: null, approval_rationale: null, next_review_date: null },
    ], error: null },
    fund_reviews: { data: [{ firm_fund_id: "f1", completed_date: "2026-06-15" }], error: null },
  });

  test("joins canonical identity, derives last review, keeps retired funds", async () => {
    const inv = await buildFirmInventory(sb, "firm1");
    const vti = inv.find((r) => r.ticker === "VTI")!;
    expect(vti.name).toBe("Vanguard Total Stock Market ETF"); // canonical identity resolved
    expect(vti.vehicle).toBe("ETF");
    expect(vti.lastCompletedReview).toBe("2026-06-15");        // derived
    const retired = inv.find((r) => r.ticker === "VFIAX")!;
    expect(retired.status).toBe("retired");                    // retired remains visible
    expect(retired.lastCompletedReview).toBeNull();            // no completed review → null, not fabricated
  });

  test("models and alerts are explicitly not connected (never a fabricated 0)", async () => {
    const inv = await buildFirmInventory(sb, "firm1");
    expect(NOT_CONNECTED.connected).toBe(false);
    for (const r of inv) {
      expect(r.models.connected).toBe(false);
      expect(r.alerts.connected).toBe(false);
      expect(r.models).not.toHaveProperty("count");
    }
  });
});

// ── Canonical add validation ──────────────────────────────────────────────────

describe("addFirmFundToInventory", () => {
  test("rejects a ticker not in the merged universe (never guesses / no Expansion)", async () => {
    const sb = makeSb({});
    await expect(addFirmFundToInventory(sb, "firm1", "u1", { ticker: "zzbogus" }))
      .rejects.toMatchObject({ code: "not_in_universe" });
  });
  test("normalizes uppercase and creates for an in-universe ticker", async () => {
    const sb = makeSb({ firm_funds: { data: { id: "f9", firm_id: "firm1", normalized_ticker: "VTI", status: "candidate", fund_role: null, approval_rationale: null, next_review_date: null }, error: null } });
    const row = await addFirmFundToInventory(sb, "firm1", "u1", { ticker: " vti " });
    expect(row.normalized_ticker).toBe("VTI");
  });
  test("surfaces a duplicate firm+ticker as a typed duplicate error", async () => {
    const sb = makeSb({ firm_funds: { data: null, error: { code: "23505", message: "duplicate key" } } });
    await expect(addFirmFundToInventory(sb, "firm1", "u1", { ticker: "VTI" }))
      .rejects.toMatchObject({ code: "duplicate" });
  });
  test("invalid ticker shape is a typed invalid_ticker error", async () => {
    await expect(addFirmFundToInventory(makeSb({}), "firm1", "u1", { ticker: "has space" }))
      .rejects.toBeInstanceOf(FirmReviewError);
  });
});

// ── API routes: firm isolation + firm-owned-only updates ──────────────────────

describe("firm-funds API routes", () => {
  const route = read("src/app/api/firm-funds/route.ts");
  const perfRoute = read("src/app/api/firm-funds/performance/route.ts");

  test("firm is resolved server-side; the browser cannot supply/override firm_id", () => {
    expect(route).toContain("requireFirmContext");
    expect(route).toContain("ctx.firm.id");
    expect(route).not.toContain("firm_id");            // never read from the request body
    expect(perfRoute).toContain("requireFirmContext");
    expect(perfRoute).not.toContain("firm_id");
  });
  test("list/add/update use the server-only firmReviews/firmInventory layer", () => {
    expect(route).toContain("buildFirmInventory");
    expect(route).toContain("addFirmFundToInventory");
    expect(route).toContain("firmFundUpdate");
  });
  test("update touches ONLY firm-owned fields — never canonical identity/ticker", () => {
    const upd = route.slice(route.indexOf('case "update"'), route.indexOf('default:'));
    for (const f of ["status", "fundRole", "approvalRationale", "nextReviewDate"]) expect(upd).toContain(`patch.${f}`);
    for (const banned of ["name", "category", "benchmark", "vehicle", "ticker"]) expect(upd).not.toContain(`patch.${banned}`);
  });
  test("typed errors map to explicit statuses (422 not-in-universe, 409 duplicate)", () => {
    expect(route).toMatch(/not_in_universe[\s\S]*422|422[\s\S]*not_in_universe/);
    expect(route).toMatch(/duplicate[\s\S]*409|409[\s\S]*duplicate/);
  });
  test("performance route is bounded to the firm's holdings and returns no raw provider shape/token", () => {
    expect(perfRoute).toContain("boundedPerformance");
    expect(perfRoute).toContain("firmFundsList");
    expect(perfRoute).not.toMatch(/TIINGO|token/i);
  });
});

// ── UI: contextual nav, honest data, no client provider access ────────────────

describe("Firm Funds inventory UI", () => {
  const ui = read("src/components/FirmFundsTab.tsx");
  const shell = read("src/components/AppShell.tsx");

  test("clicking a ticker opens the existing contextual Analysis (no new primary nav, no AnalysisTab dup)", () => {
    expect(ui).toContain("onAnalyze");
    expect(shell).toContain("onAnalyze={(t) => goAnalyze(t, true)}");
    expect(ui).not.toContain("AnalysisTab");   // does not duplicate the workspace
  });
  test("no synthetic inventory data (no random, no hardcoded fund arrays)", () => {
    expect(ui).not.toMatch(/Math\.random/);
    expect(ui).not.toMatch(/mockFunds|sampleFunds|demoFunds|fakeFunds/i);
  });
  test("missing performance renders Unavailable, not 0%", () => {
    expect(ui).toContain("Unavailable");
    expect(ui).toContain("Not connected"); // explicit models/alerts state
  });
  test("client bundle has no Tiingo/provider/service-role access", () => {
    for (const banned of ["market-data/tiingo", "TIINGO", "SERVICE_ROLE", "getMarketQuote"]) {
      expect(ui).not.toContain(banned);
    }
  });
});

// ── Server-only modules ────────────────────────────────────────────────────────

describe("server-only modules", () => {
  test("firmInventory is server-only + provider-neutral (quote is injected)", () => {
    const src = read("src/lib/firmInventory.ts");
    expect(src).not.toMatch(/^["']use client["']/m);
    expect(src).not.toContain("NEXT_PUBLIC");
    expect(src).not.toContain("SERVICE_ROLE");
    expect(src).not.toMatch(/from ["']@\/lib\/market-data/); // no direct provider import
  });
});
