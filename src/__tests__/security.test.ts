/**
 * Authorization-boundary checks that can run without a live database:
 *  1. The migration enables RLS + policies on every user-data table and grants
 *     nothing to anon.
 *  2. The service-role key never leaks into client-side code.
 *  3. Signup provisioning + audit triggers exist in the migration.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const MIGRATION = fs.readFileSync(
  path.join(ROOT, "supabase/migrations/20260716120000_auth_saved_work.sql"), "utf8").toLowerCase();

const USER_TABLES = [
  "profiles", "firms", "firm_members", "watchlists", "watchlist_items",
  "saved_comparisons", "saved_portfolios", "saved_model_scenarios",
  "user_preferences", "audit_log",
];

describe("migration: RLS is the authorization boundary", () => {
  test.each(USER_TABLES)("RLS enabled on %s", (t) => {
    expect(MIGRATION).toContain(`alter table ${t}`.toLowerCase());
    expect(MIGRATION).toMatch(new RegExp(`alter table ${t}\\s+enable row level security`));
  });

  test.each(USER_TABLES)("at least one policy exists for %s", (t) => {
    expect(MIGRATION).toMatch(new RegExp(`create policy \\w+ on ${t} `));
  });

  test("no policy or grant targets the anon role", () => {
    expect(MIGRATION).not.toMatch(/to anon\b/);
    expect(MIGRATION).not.toMatch(/grant .* to anon/);
  });

  test("firm-scoped tables authorize via firm membership", () => {
    for (const t of ["saved_comparisons", "saved_portfolios", "saved_model_scenarios", "watchlists"]) {
      const policy = MIGRATION.slice(MIGRATION.indexOf(`create policy ${t.slice(0, 12)}`));
      expect(MIGRATION).toMatch(new RegExp(`create policy \\w+ on ${t} for all to authenticated\\s+using \\(is_firm_member`));
      expect(policy).toBeTruthy();
    }
  });

  test("profiles and preferences are restricted to the owning user", () => {
    expect(MIGRATION).toMatch(/create policy profiles_select on profiles for select to authenticated using \(id = auth\.uid\(\)\)/);
    expect(MIGRATION).toMatch(/create policy user_preferences_all on user_preferences for all to authenticated\s+using \(user_id = auth\.uid\(\)\)/);
  });

  test("audit_log: readable by firm members, no client write policy", () => {
    expect(MIGRATION).toMatch(/create policy audit_log_select on audit_log for select/);
    // no insert/update/delete policy on audit_log — writes happen via
    // security-definer triggers only
    expect(MIGRATION).not.toMatch(/create policy \w+ on audit_log for (all|insert|update|delete)/);
  });

  test("signup provisioning trigger creates profile + firm + owner membership", () => {
    expect(MIGRATION).toContain("create trigger on_auth_user_created");
    expect(MIGRATION).toContain("insert into profiles");
    expect(MIGRATION).toContain("insert into firms");
    expect(MIGRATION).toMatch(/insert into firm_members \(firm_id, user_id, role\) values \(new_firm, (new|u)\.id, 'owner'\)/);
  });

  test("audit triggers cover all saved-work tables", () => {
    for (const t of ["saved_comparisons", "saved_portfolios", "saved_model_scenarios", "watchlist_items"]) {
      expect(MIGRATION).toMatch(new RegExp(`create trigger audit_${t} after insert`));
    }
  });
});

describe("service-role key never reaches the browser", () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
    });

  test("no client component references the service-role key or admin client", () => {
    const files = [...walk(path.join(ROOT, "src/components")), ...walk(path.join(ROOT, "src/app"))];
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      const isClient = src.trimStart().startsWith('"use client"') || src.trimStart().startsWith("'use client'");
      if (isClient && (src.includes("SUPABASE_SERVICE_ROLE_KEY") || src.includes("getSupabaseAdmin"))) {
        offenders.push(path.relative(ROOT, f));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("service-role env var is not NEXT_PUBLIC (would be inlined into the bundle)", () => {
    const files = walk(path.join(ROOT, "src")).filter((f) => !f.includes("__tests__"));
    const needle = "NEXT_PUBLIC_" + "SUPABASE_SERVICE_ROLE";
    for (const f of files) {
      expect(fs.readFileSync(f, "utf8")).not.toContain(needle);
    }
  });
});
