/**
 * Minimal signup profile + Advisor Overview personalization.
 * Pure helpers are unit-tested; routes/UI/migration are source-scanned.
 */
import * as fs from "fs";
import * as path from "path";
import {
  greetingName, resolveTimezone, isValidTimezone, profileComplete, DEFAULT_TIMEZONE,
} from "@/lib/profile";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── Name fallback ─────────────────────────────────────────────────────────────

describe("greetingName fallback chain", () => {
  test("prefers the first name", () => {
    expect(greetingName("Will", "will@alcawealth.com")).toBe("Will");
  });
  test("falls back to a capitalized email prefix", () => {
    expect(greetingName(null, "will@alcawealth.com")).toBe("Will");
    expect(greetingName("  ", "jsmith@x.com")).toBe("Jsmith");
  });
  test("falls back to Advisor when nothing is available", () => {
    expect(greetingName(null, null)).toBe("Advisor");
    expect(greetingName(undefined, undefined)).toBe("Advisor");
  });
});

// ── Timezone ──────────────────────────────────────────────────────────────────

describe("timezone resolution", () => {
  test("keeps a valid IANA zone", () => {
    expect(resolveTimezone("America/New_York")).toBe("America/New_York");
    expect(isValidTimezone("Europe/London")).toBe(true);
  });
  test("falls back to America/Chicago for invalid/missing", () => {
    expect(resolveTimezone("Not/AZone")).toBe(DEFAULT_TIMEZONE);
    expect(resolveTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
    expect(resolveTimezone("")).toBe(DEFAULT_TIMEZONE);
    expect(DEFAULT_TIMEZONE).toBe("America/Chicago");
  });
});

// ── Completeness ──────────────────────────────────────────────────────────────

describe("profileComplete", () => {
  test("requires both first and last name", () => {
    expect(profileComplete({ first_name: "Will", last_name: "S" })).toBe(true);
    expect(profileComplete({ first_name: "Will", last_name: null })).toBe(false);
    expect(profileComplete({ first_name: null, last_name: "S" })).toBe(false);
    expect(profileComplete(null)).toBe(false);
  });
});

// ── Migration ─────────────────────────────────────────────────────────────────

describe("profile migration", () => {
  const mig = read("supabase/migrations/20260721000000_profile_fields.sql").toLowerCase();
  test("adds the minimal fields (and NOT firm_name / role / position)", () => {
    for (const c of ["first_name", "last_name", "timezone", "onboarding_completed"]) {
      expect(mig).toContain(`add column if not exists ${c}`);
    }
    expect(mig).toContain("'america/chicago'");
    // No firm_name / role / position COLUMN is added (the header comment names
    // them only to document their intentional exclusion).
    expect(mig).not.toMatch(/add column[^;]*firm_name/);
    expect(mig).not.toMatch(/add column[^;]*\brole\b/);
    expect(mig).not.toMatch(/add column[^;]*\bposition\b/);
  });
  test("trigger seeds the profile from auth metadata", () => {
    expect(mig).toContain("raw_user_meta_data");
    expect(mig).toContain("first_name");
    expect(mig).toContain("handle_new_user");
  });
});

// ── Routes + UI wiring ────────────────────────────────────────────────────────

describe("profile API + signup + personalization wiring", () => {
  test("/api/profile is auth-gated (401 signed out) and validates names", () => {
    const src = read("src/app/api/profile/route.ts");
    expect(src).toContain("getSessionUser");
    expect(src).toContain("status: 401");
    expect(src).toContain("First and last name are required");
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|getSupabaseAdmin/);
  });

  test("signup collects name + timezone and passes them as auth metadata", () => {
    const form = read("src/app/login/AuthForm.tsx");
    expect(form).toContain("First name");
    expect(form).toContain("Last name");
    expect(form).toContain("Time zone");
    expect(form).toContain("detectBrowserTimezone");
    const auth = read("src/app/api/auth/route.ts");
    expect(auth).toContain("options: { data: data_meta }");
    expect(auth).toContain("first_name");
  });

  test("existing-user onboarding modal requires a name and is non-blocking", () => {
    const cp = read("src/components/CompleteProfile.tsx");
    expect(cp).toContain("Complete your profile");
    expect(cp).toContain("First and last name are required");
    expect(cp).toContain("Not now");                 // dismissable — never locks out
    expect(cp).toContain("profileComplete");
  });

  test("Advisor Overview shows the first name with the fallback chain", () => {
    const dash = read("src/components/DashboardTab.tsx");
    expect(dash).toContain("Welcome back,");
    expect(dash).toContain("greetingName");
    expect(dash).toContain("/api/profile");
  });

  test("Settings exposes an editable Profile section", () => {
    const s = read("src/components/SettingsTab.tsx");
    expect(s).toContain("ProfileSection");
    expect(s).toContain("Save profile");
  });

  test("no service-role key leaks into the client profile components", () => {
    for (const p of ["src/components/CompleteProfile.tsx", "src/app/login/AuthForm.tsx", "src/lib/profile.ts"]) {
      expect(read(p)).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|getSupabaseAdmin/);
    }
  });
});
