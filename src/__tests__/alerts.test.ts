/**
 * Advisor Hub — SEC monitoring + alerts. Pure helpers unit-tested; migration,
 * routes, monitoring logic, and UI wiring source-scanned. No live SEC/DB.
 */
import * as fs from "fs";
import * as path from "path";
import {
  formSummary, formSeverity, secDedupeKey, filingAlertTitle, entityTypeForForm, RELEVANT_FORMS,
} from "@/lib/alerts";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── Alert helpers ─────────────────────────────────────────────────────────────

describe("alert helpers (factual, generic — no claims)", () => {
  test("form summaries are generic and factual", () => {
    expect(formSummary("N-PORT")).toBe("New fund portfolio report filed.");
    expect(formSummary("10-Q")).toBe("New quarterly report filed.");
    expect(formSummary("DEF 14A")).toBe("New proxy filing.");
    expect(formSummary("ZZZ")).toBe("New SEC filing.");
    // Never claims a change occurred.
    for (const f of RELEVANT_FORMS) {
      expect(formSummary(f).toLowerCase()).not.toMatch(/manager|expense ratio|strategy chang|holdings chang|risk chang/);
    }
  });
  test("severity is informational in phase 1", () => {
    expect(formSeverity("N-PORT")).toBe("info");
    expect(formSeverity("8-K")).toBe("info");
  });
  test("dedupe key is stable per cik+accession", () => {
    expect(secDedupeKey("0000102909", "0001-23")).toBe("sec:0000102909:0001-23");
  });
  test("title + entity type", () => {
    expect(filingAlertTitle("VTI", "N-PORT")).toBe("VTI — N-PORT filing");
    expect(entityTypeForForm("N-CEN")).toBe("fund");
    expect(entityTypeForForm("10-K")).toBe("company");
  });
  test("relevant forms cover the required fund + company set", () => {
    for (const f of ["N-PORT", "N-CEN", "N-CSR", "N-1A", "497", "N-PX", "10-K", "10-Q", "8-K", "DEF 14A", "S-1", "4"]) {
      expect(RELEVANT_FORMS).toContain(f);
    }
  });
});

// ── Migration ─────────────────────────────────────────────────────────────────

describe("alerts migration", () => {
  const mig = read("supabase/migrations/20260723000000_advisor_alerts.sql").toLowerCase();
  test("creates the three tables with RLS + INSERT-capable policies", () => {
    for (const t of ["monitored_entities", "sec_filings", "advisor_alerts"]) {
      expect(mig).toContain(`create table if not exists ${t}`);
      expect(mig).toMatch(new RegExp(`alter table ${t}\\s+enable row level security`));
    }
    // firm-scoped tables use FOR ALL (covers INSERT WITH CHECK) so upserts work
    expect(mig).toMatch(/create policy monitored_entities_all on monitored_entities for all to authenticated/);
    expect(mig).toMatch(/create policy advisor_alerts_all on advisor_alerts for all to authenticated/);
    expect(mig).toContain("is_firm_member(firm_id)");
    // sec_filings has an explicit insert policy
    expect(mig).toMatch(/create policy sec_filings_insert on sec_filings for insert to authenticated/);
    // dedupe + uniqueness
    expect(mig).toContain("unique (cik, accession_number)");
    expect(mig).toContain("advisor_alerts_dedupe_uniq");
    expect(mig).not.toMatch(/to anon\b/);
  });
});

// ── Monitoring logic (no fake alerts) ─────────────────────────────────────────

describe("SEC monitoring service", () => {
  const src = read("src/lib/monitoring.ts");
  test("alerts are created only for NEW filings actually returned by SEC", () => {
    expect(src).toContain("getFundFilings");           // real SEC fetch (reused)
    expect(src).toContain("if (!isNew) continue");     // no duplicate alert for known filing
    expect(src).toContain("secDedupeKey");             // deduped
  });
  test("fails safely when SEC_USER_AGENT is missing (never anonymous)", () => {
    expect(src).toContain("secUserAgentConfigured");
    expect(src).toMatch(/SEC_USER_AGENT is not configured/);
  });
  test("no buy/sell/recommendation or change-claim language in the SEC alert surfaces", () => {
    // Scoped to the alert/monitoring output (DashboardTab has a legacy
    // "recommendation" ROUTE name unrelated to alert language).
    for (const p of ["src/lib/monitoring.ts", "src/lib/alerts.ts", "src/components/AlertsTab.tsx"]) {
      const s = read(p);
      expect(s).not.toMatch(/\bbuy\b|\bsell\b|recommend|should invest|manager changed|expense ratio changed/i);
    }
  });
});

// ── Routes + security ─────────────────────────────────────────────────────────

describe("alerts + monitoring + overview routes", () => {
  const routes: Record<string, string> = {
    alerts: "src/app/api/alerts/route.ts",
    read: "src/app/api/alerts/[id]/read/route.ts",
    archive: "src/app/api/alerts/[id]/archive/route.ts",
    refresh: "src/app/api/monitoring/sec/refresh/route.ts",
    overview: "src/app/api/advisor-overview/route.ts",
  };
  test("all are auth-gated (require a firm session)", () => {
    for (const p of Object.values(routes)) {
      const s = read(p);
      expect(s).toContain("requireFirmContext");
      expect(s).toMatch(/status: 401/);
    }
  });
  test("SEC refresh is server-side, UA-guarded (503), never client SEC", () => {
    const s = read(routes.refresh);
    expect(s).toContain("secUserAgentConfigured");
    expect(s).toContain("status: 503");
    expect(s).not.toMatch(/data\.sec\.gov/); // route delegates to the server lib
  });
  test("no client-side SEC calls or key exposure in the Alerts page", () => {
    const s = read("src/components/AlertsTab.tsx");
    expect(s).not.toMatch(/data\.sec\.gov|sec\.gov\/cgi-bin|SEC_USER_AGENT|SUPABASE_SERVICE_ROLE_KEY/);
    expect(s).toContain("/api/monitoring/sec/refresh"); // goes through the server route
  });
});

// ── Advisor Hub UI wiring ─────────────────────────────────────────────────────

describe("Advisor Hub + top-right wiring", () => {
  test("top-right shows profile name + Personal Workspace (not email workspace)", () => {
    const nav = read("src/components/TopNav.tsx");
    expect(nav).toContain("Personal Workspace");
    expect(nav).toContain("accountName");
    expect(nav).not.toMatch(/\{authUser\}\s*Workspace|\$\{authUser\}\s*Workspace/);
  });
  test("Advisor Overview dashboard: reference sections + real routes", () => {
    const d = read("src/components/DashboardTab.tsx");
    expect(d).toContain("command center");
    expect(d).toContain("/api/advisor-overview");
    expect(d).toContain("/api/firm-funds");
    for (const section of ["Top Performers", "Worst Performers", "Held Fund Intelligence", "Market Pulse", "Watchlist Momentum", "Attention &amp; Alerts"]) expect(d).toContain(section);
    // Real firm-scoped data; no fabricated numbers.
    expect(d).toContain("reviewWorkflow");
    expect(d).not.toMatch(/Math\.random|faker/i);
    expect(d).not.toContain("Daily Desk");
  });
  test("Alerts page is mounted under Tools and reachable", () => {
    const shell = read("src/components/AppShell.tsx");
    expect(shell).toContain("AlertsTab");
    expect(shell).toContain('"Alerts"');
  });
});
