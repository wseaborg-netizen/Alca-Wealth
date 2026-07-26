/**
 * Phase 2B — Firm Funds + Fund Reviews data foundation.
 *
 * Pure-logic assertions on the repository validators plus source scans of the
 * migration confirming the database-level constraints, indexes, RLS, and the
 * same-firm composite relationship. No live database is required (matching the
 * project's offline migration-scan convention).
 */
import * as fs from "fs";
import * as path from "path";
import {
  FIRM_FUND_STATUSES, REVIEW_STATUSES, REVIEW_DECISIONS,
  normalizeCanonicalTicker, assertReviewStatus, assertReviewDecision,
  assertCompletedHasDecision, assertReviewDateOrder, FirmReviewError,
} from "@/lib/firmReviews";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const MIG = read("supabase/migrations/20260726120000_firm_funds_reviews.sql");
// DDL with SQL line-comments removed — hygiene scans must inspect real schema,
// not the explanatory prose (which legitimately says "no alerts/monitoring").
const MIG_CODE = MIG.replace(/--[^\n]*/g, "");
const REPO = read("src/lib/firmReviews.ts");

// ── Allowed value sets ────────────────────────────────────────────────────────

describe("allowed statuses and decisions", () => {
  test("review workflow statuses are exactly open/in_review/completed/cancelled", () => {
    expect([...REVIEW_STATUSES]).toEqual(["open", "in_review", "completed", "cancelled"]);
    // and enforced in the DB
    for (const s of REVIEW_STATUSES) expect(MIG).toContain(`'${s}'`);
    expect(MIG).toContain("status in ('open', 'in_review', 'completed', 'cancelled')");
  });

  test("firm fund statuses are exactly approved/watch/candidate/restricted/retired", () => {
    expect([...FIRM_FUND_STATUSES]).toEqual(["approved", "watch", "candidate", "restricted", "retired"]);
    expect(MIG).toContain("status in ('approved', 'watch', 'candidate', 'restricted', 'retired')");
  });

  test("review decisions are exactly keep/watch/replace/restrict/retire", () => {
    expect([...REVIEW_DECISIONS]).toEqual(["keep", "watch", "replace", "restrict", "retire"]);
    expect(MIG).toContain("decision in ('keep', 'watch', 'replace', 'restrict', 'retire')");
  });
});

// ── Validators ────────────────────────────────────────────────────────────────

describe("status and decision validation", () => {
  test("rejects unknown status / decision with typed errors", () => {
    expect(() => assertReviewStatus("bogus")).toThrow(FirmReviewError);
    expect(() => assertReviewDecision("sell")).toThrow(FirmReviewError);
    expect(assertReviewStatus("in_review")).toBe("in_review");
    expect(assertReviewDecision("replace")).toBe("replace");
  });
});

describe("completed reviews require a decision", () => {
  test("completed without decision throws; with decision passes; non-completed is free", () => {
    expect(() => assertCompletedHasDecision("completed", null)).toThrow(/final decision/i);
    expect(() => assertCompletedHasDecision("completed", "keep")).not.toThrow();
    expect(() => assertCompletedHasDecision("open", null)).not.toThrow();
  });
  test("enforced at the database level too", () => {
    expect(MIG).toContain("fund_reviews_completed_decision");
    expect(MIG).toContain("status <> 'completed' or decision is not null");
  });
});

describe("review date ordering", () => {
  test("next_review_date < completed_date throws; equal/after/nulls pass", () => {
    expect(() => assertReviewDateOrder("2026-03-10", "2026-03-01")).toThrow(/earlier/i);
    expect(() => assertReviewDateOrder("2026-03-10", "2026-03-10")).not.toThrow();
    expect(() => assertReviewDateOrder("2026-03-10", "2026-04-01")).not.toThrow();
    expect(() => assertReviewDateOrder(null, "2026-01-01")).not.toThrow();
    expect(() => assertReviewDateOrder("2026-01-01", null)).not.toThrow();
  });
  test("enforced at the database level too", () => {
    expect(MIG).toContain("fund_reviews_next_after_completed");
    expect(MIG).toContain("next_review_date is null or completed_date is null or next_review_date >= completed_date");
  });
});

describe("uppercase normalized ticker storage", () => {
  test("normalizer uppercases and trims; rejects junk with a typed error", () => {
    expect(normalizeCanonicalTicker(" vti ")).toBe("VTI");
    expect(normalizeCanonicalTicker("brk.b")).toBe("BRK.B");
    expect(() => normalizeCanonicalTicker("has space")).toThrow(FirmReviewError);
  });
  test("enforced by DB CHECK on every canonical-ticker column", () => {
    const checks = MIG.match(/normalized_ticker = upper\(normalized_ticker\)/g) ?? [];
    expect(checks.length).toBeGreaterThanOrEqual(2); // firm_funds + review_candidates
  });
});

// ── Database-level integrity (migration scan) ─────────────────────────────────

describe("firm isolation + RLS", () => {
  test("all four tables enable RLS", () => {
    for (const t of ["firm_funds", "fund_reviews", "review_candidates", "review_evidence"]) {
      expect(MIG).toMatch(new RegExp(`alter table ${t}\\s+enable row level security`));
    }
  });
  test("firm-scoped tables use the existing is_firm_member membership check", () => {
    expect(MIG).toContain("is_firm_member(firm_id)");
    // child tables scope through the parent review's firm
    expect(MIG).toContain("is_firm_member(r.firm_id)");
  });
  test("explicit SELECT/INSERT/UPDATE/DELETE policies exist for each table", () => {
    for (const t of ["firm_funds", "fund_reviews", "review_candidates", "review_evidence"]) {
      for (const verb of ["select", "insert", "update", "delete"]) {
        expect(MIG).toContain(`create policy ${t}_${verb} on ${t} for ${verb}`);
      }
    }
  });
});

describe("database-level same-firm review ownership", () => {
  test("composite FK forces a review's firm to own its firm_fund", () => {
    expect(MIG).toContain("unique (firm_id, id)"); // FK target on firm_funds (+ fund_reviews)
    expect(MIG).toMatch(/foreign key \(firm_id, firm_fund_id\) references firm_funds\(firm_id, id\)/);
  });
});

describe("same-firm user integrity (composite FKs to firm_members)", () => {
  test("created_by / assigned_reviewer / author must belong to the owning firm", () => {
    expect(MIG).toMatch(/foreign key \(firm_id, created_by\) references firm_members\(firm_id, user_id\)/);
    expect(MIG).toMatch(/foreign key \(firm_id, assigned_reviewer\) references firm_members\(firm_id, user_id\)/);
    expect(MIG).toMatch(/foreign key \(firm_id, author\) references firm_members\(firm_id, user_id\)/);
  });
  test("those attribution columns remain nullable", () => {
    expect(MIG).toMatch(/created_by\s+uuid references auth\.users\(id\) on delete set null/);
    expect(MIG).toMatch(/assigned_reviewer\s+uuid references auth\.users\(id\) on delete set null/);
    expect(MIG).toMatch(/author\s+uuid references auth\.users\(id\) on delete set null/);
  });
});

describe("review-history preservation", () => {
  test("a firm_fund with reviews cannot be deleted — the FK does not cascade", () => {
    expect(MIG).toContain("foreign key (firm_id, firm_fund_id) references firm_funds(firm_id, id) on delete no action");
    expect(MIG).not.toMatch(/references firm_funds\(firm_id, id\) on delete cascade/);
  });
});

describe("manual migration safety", () => {
  test("wrapped in a single transaction", () => {
    expect(MIG_CODE.trimStart().startsWith("begin;")).toBe(true);
    expect(MIG_CODE.trimEnd().endsWith("commit;")).toBe(true);
  });
});

describe("uniqueness + selection constraints", () => {
  test("duplicate firm-fund prevention (unique firm + ticker)", () => {
    expect(MIG).toMatch(/firm_funds[\s\S]*?unique \(firm_id, normalized_ticker\)/);
  });
  test("duplicate candidate prevention (unique ticker per review)", () => {
    expect(MIG).toMatch(/review_candidates[\s\S]*?unique \(review_id, normalized_ticker\)/);
  });
  test("at most one selected candidate per review (partial unique index)", () => {
    expect(MIG).toContain("create unique index if not exists review_candidates_one_selected");
    expect(MIG).toMatch(/on review_candidates\(review_id\) where selected/);
  });
});

describe("indexes for inventory, queues, next-review, candidates", () => {
  test("required indexes are present", () => {
    for (const idx of [
      "firm_funds_firm_idx", "firm_funds_next_review_idx",
      "fund_reviews_firm_status_idx", "fund_reviews_next_review_idx",
      "review_candidates_review_idx",
    ]) expect(MIG).toContain(idx);
  });
});

describe("candidate/evidence association", () => {
  test("candidates and evidence FK to their review and cascade with it", () => {
    // candidates: simple FK to the review PK
    expect(MIG).toMatch(/review_candidates[\s\S]*?review_id\s+uuid not null references fund_reviews\(id\) on delete cascade/);
    // evidence: composite same-firm FK to the review, cascading with it
    expect(MIG).toMatch(/foreign key \(firm_id, review_id\) references fund_reviews\(firm_id, id\) on delete cascade/);
  });
  test("reviewGet composes the review with its candidates and evidence", () => {
    expect(REPO).toContain("review_candidates");
    expect(REPO).toContain("review_evidence");
    expect(REPO).toMatch(/candidates:[\s\S]*?evidence:/);
  });
});

// ── Data-model hygiene ────────────────────────────────────────────────────────

describe("no duplicated canonical metadata", () => {
  test("firm_funds / fund_reviews store identity only — no name/category/benchmark/vehicle", () => {
    const funds = MIG_CODE.slice(MIG_CODE.indexOf("create table if not exists firm_funds"), MIG_CODE.indexOf("create table if not exists fund_reviews"));
    for (const banned of ["fund_name", "category", "benchmark", "vehicle", "expense_ratio", "aum"]) {
      expect(funds).not.toContain(banned);
    }
  });
});

describe("no monitoring, alerts, or client-workflow fields", () => {
  test("migration introduces no monitoring/alert/client columns or tables", () => {
    for (const banned of ["last_checked_at", "last_success_at", "alert", "cik", "monitored", "client_id", "account_number", "candidate_status"]) {
      expect(MIG_CODE).not.toContain(banned);
    }
  });
  test("no review_model_impacts table is created", () => {
    expect(MIG_CODE).not.toContain("review_model_impacts");
  });
});

// ── Server-only repository ─────────────────────────────────────────────────────

describe("repository is server-only + provider-neutral", () => {
  test("no client directive, no browser/service-role/provider access", () => {
    expect(REPO).not.toMatch(/^["']use client["']/m);
    expect(REPO).not.toContain("createBrowserClient");
    expect(REPO).not.toContain("SERVICE_ROLE");
    expect(REPO).not.toContain("NEXT_PUBLIC");
    // provider-neutral: no Tiingo/FMP/analytics coupling
    expect(REPO).not.toMatch(/tiingo|fmp/i);
  });
  test("last review is derived, not duplicated onto firm_funds", () => {
    const funds = MIG_CODE.slice(MIG_CODE.indexOf("create table if not exists firm_funds"), MIG_CODE.indexOf("create table if not exists fund_reviews"));
    expect(funds).not.toContain("last_review");
    expect(funds).not.toContain("last_reviewed_at");
  });
});
