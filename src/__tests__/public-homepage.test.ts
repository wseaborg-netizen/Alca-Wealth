/**
 * Public signed-out homepage — OFFLINE source-scan guarantees.
 *
 * Locks the approved hero words, CTA hierarchy, workflow content, and the
 * marketing-safety rules (no fake customer claims, no private API calls, no
 * authenticated firm data), plus the signed-out routing/auth invariants.
 */
import * as fs from "fs";
import * as path from "path";
import { resolveInitialTab, isAuthed } from "@/lib/authView";
import { SITE_TITLE, SITE_DESCRIPTION } from "@/lib/site";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const home = read("src/components/HomeTab.tsx");
const shell = read("src/components/AppShell.tsx");

describe("signed-out routing + auth invariants (unchanged)", () => {
  test("anonymous → public homepage; authenticated → app (dashboard)", () => {
    expect(resolveInitialTab("none")).toBe("home");
    expect(resolveInitialTab("full")).toBe("dashboard");
    expect(resolveInitialTab("preview")).toBe("dashboard");
    expect(isAuthed("none")).toBe(false);
  });
  test("public homepage renders; the authenticated TopNav never shows on the marketing home tab", () => {
    expect(shell).toContain("<HomeTab");
    expect(shell).toMatch(/tab !== "home" && tab !== "dashboard" && \(\s*<TopNav/);
    // Advisor Overview (private, fetches firm data) is not mounted for anonymous.
    expect(shell).toMatch(/authMode !== "none" && \([\s\S]*?<DashboardTab/);
    // HomeTab renders its own dark public header (no search / bell / workspace).
    expect(home).toContain("function PublicNav()");
  });
});

describe("navigation CTA hierarchy", () => {
  test("header exposes Sign In and Request a Demo", () => {
    expect(home).toContain("Sign In");
    expect(home).toContain("Request a Demo");
  });
  test("public header nav items match the reference (incl. Tools)", () => {
    for (const label of ["Home", "Firm Funds", "Discover", "Reviews", "About ALCA", "Tools"]) {
      expect(home).toContain(`label: "${label}"`);
    }
  });
  test("no signed-in app-header controls on the public homepage", () => {
    for (const banned of ["Search funds", "unreadCount", "Personal Workspace", "authWorkspace", "accountName", "onAlerts"]) {
      expect(home).not.toContain(banned);
    }
  });
  test("Request a Demo appears to the RIGHT of Sign In (source order)", () => {
    expect(home.indexOf("Sign In")).toBeLessThan(home.indexOf("Request a Demo"));
  });
  test("Sign In → /login, Request a Demo → /contact (existing routes)", () => {
    expect(home).toMatch(/login:\s*"\/login"/);
    expect(home).toMatch(/demo:\s*"\/contact"/);
    for (const p of ["src/app/login/page.tsx", "src/app/contact/page.tsx", "src/app/about/page.tsx", "src/app/security/page.tsx"]) {
      expect(fs.existsSync(path.join(ROOT, p))).toBe(true);
    }
  });
  test("mobile navigation also exposes Sign In and Request a Demo", () => {
    const menu = home.slice(home.indexOf("alca-mobile-menu"));
    expect(menu).toMatch(/href=\{LINK\.login\}/);
    expect(menu).toMatch(/href=\{LINK\.demo\}/);
  });
});

describe("hero", () => {
  test("headline is exactly Research. / Review. / Monitor.", () => {
    expect(home).toContain(">Research.<");
    expect(home).toContain(">Review.<");
    expect(home).toContain(">Monitor.<");
  });
  test("supporting copy is the approved sentence", () => {
    expect(home).toContain("ALCA helps advisory teams monitor funds, evaluate alternatives, and maintain a documented review process.");
  });
  test("the 'Clarity across your investment workflow.' line is removed", () => {
    expect(home).not.toContain("Clarity across your investment workflow.");
  });
  test("hero button pair is Sign In then Request a Demo", () => {
    const hero = home.slice(home.indexOf("function Hero()"));
    expect(hero.indexOf("Sign In")).toBeLessThan(hero.indexOf("Request a Demo"));
  });
  test("no rejected headlines or slogans", () => {
    for (const banned of ["Explore the Platform", "Explore ALCA Wealth", "Enter Platform", "Know which funds need attention",
      "A better operating system", "Institutional clarity", "Invest with conviction", "Research. Construct. Model."]) {
      expect(home).not.toContain(banned);
    }
  });
});

describe("workflow section", () => {
  test("exactly Firm Funds → Discover → Reviews", () => {
    const wf = home.slice(home.indexOf("function WorkflowSection()"), home.indexOf("function CapabilitiesSection()"));
    expect(wf).toContain("THE ALCA WORKFLOW");
    expect(wf).toContain("A clear path from research to decision.");
    expect(wf).toContain("Firm Funds");
    expect(wf).toContain("Discover");
    expect(wf).toContain("Reviews");
    // Portfolio/Models are NOT part of the primary homepage story.
    expect(wf).not.toContain("Portfolio");
    expect(wf).not.toMatch(/\bModels?\b/);
  });
});

describe("marketing safety", () => {
  test("no fake customer claims / testimonials / logos / ALCA-wide stats", () => {
    for (const banned of ["Trusted by", "testimonial", "642 funds monitored", "customers", "clients trust",
      "billions", "assets under", "leading firms", "Join leading", "Start free", "Get started", "No credit card"]) {
      expect(home.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
  test("product preview is explicitly illustrative and holds no real client data", () => {
    expect(home).toContain("Illustrative workspace");
    expect(home).toContain('role="img"');            // preview is one labelled image node, not SR noise
    // no unsupported security/compliance claims
    for (const banned of ["Bank-grade", "Enterprise Security", "Enterprise-grade", "audit-ready", "SEC-registered",
      "real-time alerts", "AI-powered", "regulatory compliance"]) {
      expect(home.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
  test("the public homepage makes NO API / fetch calls and touches no firm data", () => {
    expect(home).not.toMatch(/fetch\(/);
    expect(home).not.toContain("/api/");
    expect(home).not.toContain("firm_id");
  });
});

describe("accessibility", () => {
  test("exactly one <h1>", () => {
    expect((home.match(/<h1[\s>]/g) ?? []).length).toBe(1);
  });
  test("reduced-motion is respected", () => {
    expect(home).toContain("usePrefersReducedMotion");
    expect(home).toContain("prefers-reduced-motion");
  });
});

describe("metadata", () => {
  test("review-focused title + description; no unsupported claims", () => {
    expect(SITE_TITLE).toBe("ALCA Wealth | Fund Oversight and Review for Advisory Firms");
    expect(SITE_DESCRIPTION).toContain("documented review process");
  });
});
