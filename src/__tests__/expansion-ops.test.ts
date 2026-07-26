/**
 * Expansion Operations Center — lifecycle helpers + routes + UI wiring.
 * Pure helpers are unit-tested; routes/server/UI are source-scanned. No network.
 */
import * as fs from "fs";
import * as path from "path";
import {
  opsBucket, issueLabel, failureLabel, confidenceOf, REVIEW_STATUSES, FAILED_STATUSES, TAXONOMY_OPTIONS,
} from "@/lib/expansionOps";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── Lifecycle buckets ─────────────────────────────────────────────────────────

describe("fund lifecycle → operator buckets", () => {
  test("every status maps to exactly one bucket (never undefined)", () => {
    const all = ["added_to_universe", "approved", "already_available", "unsupported",
      "pending", "classification_failed", "needs_classification", "ready_for_review",
      "failed_validation", "provider_supported", "rejected"];
    const allowed = new Set(["verified", "review", "failed", "duplicate", "unsupported"]);
    for (const s of all) expect(allowed.has(opsBucket(s))).toBe(true);
    expect(opsBucket("added_to_universe")).toBe("verified");
    expect(opsBucket("already_available")).toBe("duplicate");
    expect(opsBucket("unsupported")).toBe("unsupported");
    expect(opsBucket("pending")).toBe("failed");
    expect(opsBucket("needs_classification")).toBe("review");
  });

  test("review vs failed statuses are disjoint", () => {
    for (const s of REVIEW_STATUSES) expect(FAILED_STATUSES).not.toContain(s);
  });

  test("issue + failure labels are specific (not just 'Needs Review')", () => {
    expect(issueLabel("failed_validation", null)).toBe("Invalid Taxonomy Value");
    expect(issueLabel("needs_classification", "no classification rule matched the fund name")).toBe("Unknown Classification");
    expect(issueLabel("needs_classification", "market cap not determinable")).toBe("Missing Category");
    expect(failureLabel("unsupported", "not found or not supported")).toBe("Ticker Not Found");
    expect(failureLabel("unsupported", "unusable")).toBe("Unsupported Security");
    expect(failureLabel("pending", "provider did not respond")).toBe("Provider Error");
    expect(failureLabel("classification_failed", null)).toBe("Classifier Error");
  });

  test("confidence is a proxy, never a fabricated score", () => {
    expect(confidenceOf("added_to_universe", null)).toBe("High");
    expect(confidenceOf("needs_classification", null)).toBe("Low");
    expect(confidenceOf("failed_validation", null)).toBe("Invalid");
  });

  test("edit dropdowns come from the controlled taxonomy", () => {
    expect(TAXONOMY_OPTIONS.asset_class).toContain("Equity");
    expect(TAXONOMY_OPTIONS.primary_category.length).toBeGreaterThan(10);
    expect(TAXONOMY_OPTIONS.management_style).toContain("Passive");
  });
});

// ── Routes (auth-gated) ───────────────────────────────────────────────────────

describe("expansion ops routes", () => {
  const routes = ["import", "queue", "action"];
  test("all require a firm session (401 signed out)", () => {
    for (const r of routes) {
      const src = read(`src/app/api/expansion/${r}/route.ts`);
      expect(src).toContain("requireFirmContext");
      expect(src).toMatch(/status: 401/);
    }
  });
  test("action route handles the full review + failed workflow", () => {
    const src = read("src/app/api/expansion/action/route.ts");
    for (const a of ["approve", "editApprove", "delete", "deleteAllReview", "retry", "deleteAllFailed"]) {
      expect(src).toContain(`"${a}"`);
    }
  });
});

// ── Server: only verified funds enter the universe, no fake data ───────────────

describe("expansion server orchestration", () => {
  const src = read("src/lib/expansionServer.ts");
  test("reuses the real classifier/provider pipeline (no fabricated classification)", () => {
    expect(src).toContain("evaluateFundRequest");
    expect(src).toContain("classifyFund");
    expect(src).toContain("checkFundSupport");
  });
  test("approve requires real inferred fields — no blank/faked insert", () => {
    expect(src).toMatch(/No suggested classification to approve/);
    expect(src).toContain("dynamicFundInsert");
    expect(src).toContain("dynamicFundByTicker");   // dedupe → no duplicate fund
  });
  test("edit & approve validates against the taxonomy before inserting", () => {
    expect(src).toContain("validateFields");
    expect(src).toMatch(/Invalid taxonomy value/);
  });
  test("verified inserts always set verified=true via dynamicFundInsert", () => {
    expect(read("src/lib/db.ts")).toMatch(/dynamicFundInsert[\s\S]*?verified: true/);
  });
});

// ── UI: three-tab ops console ─────────────────────────────────────────────────

describe("Expansion ops console UI", () => {
  const tab = read("src/components/ExpansionTab.tsx");
  test("has the three operational tabs", () => {
    for (const t of ["Add Funds", "Review Queue", "Failed Imports"]) expect(tab).toContain(t);
  });
  test("bulk actions + confirmations are present", () => {
    for (const b of ["Approve Selected", "Delete Selected", "Delete All Review", "Retry Selected", "Delete All Failed"]) {
      expect(tab).toContain(b);
    }
    expect(tab).toContain("cannot be undone");        // delete-all confirm copy
    expect(tab).toContain("Save &amp; Approve");       // edit & approve (JSX entity)
  });
  test("propagates verified funds live (no fabricated analytics)", () => {
    expect(tab).toContain("refreshMergedUniverse");
    expect(tab).not.toMatch(/\bfake|mock(ed)? (score|return|risk)/i);
  });
});
