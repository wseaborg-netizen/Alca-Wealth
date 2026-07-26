/**
 * System Health — internal diagnostics.
 * Network is isolated (getFund mocked) so these run deterministically offline.
 * Covers: normalized shape, per-check isolation, allowed statuses, signed-out
 * saved-list safety, no-shell build check, auth-gated route, and no
 * service-role key in the client Settings component.
 */
import * as fs from "fs";
import * as path from "path";

// Isolate the provider layer: the probe fetch must never hit the network here.
jest.mock("@/lib/funds", () => ({
  getFund: jest.fn(async () => { throw new Error("network isolated in test"); }),
  inferVehicle: () => "ETF",
  getRecommendFund: jest.fn(),
}));

import { runSystemHealth, type HealthCheckResult, type HealthAuthContext } from "@/lib/health";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const ALLOWED = new Set(["healthy", "warning", "error"]);
const EXPECTED_KEYS = ["fundUniverse", "marketData", "scoringEngine", "savedLists", "fundRequests", "secAlerts", "portfolioBuilder", "apiRoutes", "appBuild"];

function assertNormalized(c: HealthCheckResult) {
  expect(typeof c.key).toBe("string");
  expect(typeof c.label).toBe("string");
  expect(ALLOWED.has(c.status)).toBe(true);
  expect(typeof c.summary).toBe("string");
  expect(() => new Date(c.checkedAt).toISOString()).not.toThrow();
  expect(Number.isNaN(new Date(c.checkedAt).getTime())).toBe(false);
}

describe("runSystemHealth: normalized, safe, isolated", () => {
  test("returns all checks, all normalized with only allowed statuses", async () => {
    const health = await runSystemHealth({ signedIn: false });
    expect(health.checks.map((c) => c.key)).toEqual(EXPECTED_KEYS);
    for (const c of health.checks) assertNormalized(c);
    expect(ALLOWED.has(health.overall)).toBe(true);
    expect(() => new Date(health.generatedAt).toISOString()).not.toThrow();
  });

  test("fund universe check is healthy (data loads without a network)", async () => {
    const { checks } = await runSystemHealth({ signedIn: false });
    const u = checks.find((c) => c.key === "fundUniverse")!;
    expect(u.status).not.toBe("error");
    const d = u.details as { staticFunds: number; mergedFunds: number };
    expect(d.staticFunds).toBeGreaterThan(0);
    expect(d.mergedFunds).toBeGreaterThanOrEqual(d.staticFunds);
  });

  test("Market Data (Tiingo) check degrades to error (not a crash) when the probe fails", async () => {
    const md = (await runSystemHealth({ signedIn: false })).checks.find((c) => c.key === "marketData")!;
    expect(md.status).toBe("error");
    expect(md.summary).toBeTruthy();
  });

  test("a single failing check is isolated — the others still return", async () => {
    const ctx: HealthAuthContext = {
      signedIn: true,
      listsGetAll: async () => { throw new Error("boom — simulated DB failure"); },
    };
    const health = await runSystemHealth(ctx);
    expect(health.checks).toHaveLength(EXPECTED_KEYS.length);
    const saved = health.checks.find((c) => c.key === "savedLists")!;
    expect(saved.status).toBe("error");
    // The raw error text is never surfaced to the client.
    expect(JSON.stringify(saved)).not.toContain("boom");
    expect(JSON.stringify(saved)).not.toContain("simulated DB failure");
    // Other checks are unaffected and still normalized.
    for (const c of health.checks) assertNormalized(c);
    expect(health.overall).toBe("error");
  });

  test("signed-out saved-lists check exposes no list data", async () => {
    const saved = (await runSystemHealth({ signedIn: false })).checks.find((c) => c.key === "savedLists")!;
    expect(saved.status).toBe("warning");
    const blob = JSON.stringify(saved.details ?? {}).toLowerCase();
    expect(blob).toContain("\"signedin\":false".toLowerCase());
    for (const banned of ["ticker", "note", "fund_name", "watchlist_item"]) {
      expect(blob).not.toContain(banned);
    }
  });

  test("fund-requests check is informational — healthy on a normal backlog, warns only when stuck", async () => {
    const counts = (o: Partial<{ pending: number; readyForReview: number; unsupported: number; total: number; needsClassification: number; addedToUniverse: number; failedValidation: number; classificationFailed: number }>) =>
      ({ pending: 0, readyForReview: 0, unsupported: 0, total: 0, needsClassification: 0, addedToUniverse: 0, failedValidation: 0, classificationFailed: 0, ...o });

    const healthyCtx: HealthAuthContext = {
      signedIn: true,
      fundRequestCounts: async () => counts({ readyForReview: 3, unsupported: 1, addedToUniverse: 2, total: 6 }),
    };
    const ok = (await runSystemHealth(healthyCtx)).checks.find((c) => c.key === "fundRequests")!;
    expect(ok.status).toBe("healthy");
    expect((ok.details as { addedToUniverse: number }).addedToUniverse).toBe(2);

    const stuckCtx: HealthAuthContext = {
      signedIn: true,
      fundRequestCounts: async () => counts({ pending: 2, total: 2 }),
    };
    const stuck = (await runSystemHealth(stuckCtx)).checks.find((c) => c.key === "fundRequests")!;
    expect(stuck.status).toBe("warning");
    expect(stuck.summary.toLowerCase()).toMatch(/stuck|retry/);
  });

  test("SEC monitoring check: red without a User-Agent, healthy/warning with one", async () => {
    const saved = process.env.SEC_USER_AGENT;
    const savedContact = process.env.SEC_CONTACT_EMAIL;
    try {
      delete process.env.SEC_USER_AGENT; delete process.env.SEC_CONTACT_EMAIL;
      const noUa = (await runSystemHealth({ signedIn: false })).checks.find((c) => c.key === "secAlerts")!;
      expect(noUa.status).toBe("error");

      process.env.SEC_USER_AGENT = "Alca Wealth test@example.com";
      const withUa = (await runSystemHealth({
        signedIn: true,
        monitoringCounts: async () => ({ monitored: 3, unresolvedCik: 0, alerts: 0 }),
      })).checks.find((c) => c.key === "secAlerts")!;
      expect(withUa.status).toBe("healthy");                 // no alerts is NOT an error

      const unresolved = (await runSystemHealth({
        signedIn: true,
        monitoringCounts: async () => ({ monitored: 3, unresolvedCik: 2, alerts: 0 }),
      })).checks.find((c) => c.key === "secAlerts")!;
      expect(unresolved.status).toBe("warning");             // unresolved CIK is yellow, not red
    } finally {
      if (saved === undefined) delete process.env.SEC_USER_AGENT; else process.env.SEC_USER_AGENT = saved;
      if (savedContact === undefined) delete process.env.SEC_CONTACT_EMAIL; else process.env.SEC_CONTACT_EMAIL = savedContact;
    }
  });

  test("signed-out fund-requests check exposes no request data", async () => {
    const fr = (await runSystemHealth({ signedIn: false })).checks.find((c) => c.key === "fundRequests")!;
    expect(fr.status).toBe("warning");
    expect(JSON.stringify(fr.details)).not.toMatch(/ticker|fund_name/i);
  });

  test("signed-in saved-lists check reports counts only, never contents", async () => {
    const ctx: HealthAuthContext = {
      signedIn: true,
      listsGetAll: async () => [
        { name: "", type: "watchlist", itemCount: 3 },
        { name: "", type: "common", itemCount: 5 },
      ],
    };
    const saved = (await runSystemHealth(ctx)).checks.find((c) => c.key === "savedLists")!;
    expect(saved.status).toBe("healthy");
    const d = saved.details as { listCount: number; hasWatchlist: boolean; hasCommon: boolean };
    expect(d.listCount).toBe(2);
    expect(d.hasWatchlist).toBe(true);
    expect(d.hasCommon).toBe(true);
    // No ticker/name/note field ever leaves the check.
    expect(JSON.stringify(saved.details)).not.toMatch(/ticker|note|fund_name/i);
  });
});

describe("build check never shells out", () => {
  test("health module imports no process-spawning APIs", () => {
    const src = read("src/lib/health.ts");
    for (const banned of ["child_process", "execSync", "spawnSync", "spawn(", "exec("]) {
      expect(src).not.toContain(banned);
    }
  });

  test("build check surfaces metadata, not build execution", async () => {
    const build = (await runSystemHealth({ signedIn: false })).checks.find((c) => c.key === "appBuild")!;
    expect(ALLOWED.has(build.status)).toBe(true);
    expect(build.summary.toLowerCase()).toMatch(/build/);
  });
});

describe("route + client-component security", () => {
  test("/api/health/system requires auth and returns 401 when signed out", () => {
    const src = read("src/app/api/health/system/route.ts");
    expect(src).toContain("getSessionUser");
    expect(src).toContain("status: 401");
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|getSupabaseAdmin/);
  });

  test("the client Settings component never imports the service-role key or the server health module", () => {
    const src = read("src/components/SettingsTab.tsx");
    expect(src).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(src).not.toContain("getSupabaseAdmin");
    expect(src).not.toMatch(/from ["']@\/lib\/health["']/); // reads over the API, not the server module
    expect(src).not.toMatch(/from ["']@\/lib\/db["']/);
  });

  test("Settings renders the System Health section and a Refresh Health control", () => {
    const src = read("src/components/SettingsTab.tsx");
    expect(src).toContain("System Health");
    expect(src).toContain("Refresh Health");
    expect(src).toContain("SystemHealthSection");
    expect(src).toContain("/api/health/system");
  });
});
