/**
 * Architecture: auth-aware routing (public site vs workspace) + live merged-
 * universe propagation. Pure logic is unit-tested; wiring is source-scanned.
 */
import * as fs from "fs";
import * as path from "path";
import { resolveInitialTab, isAuthed } from "@/lib/authView";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// ── Auth view resolution ──────────────────────────────────────────────────────

describe("initial view resolution", () => {
  test("signed-in opens the workspace (Advisor Overview); anonymous gets the homepage", () => {
    expect(resolveInitialTab("full")).toBe("dashboard");
    expect(resolveInitialTab("preview")).toBe("dashboard");
    expect(resolveInitialTab("none")).toBe("home");
  });
  test("isAuthed", () => {
    expect(isAuthed("full")).toBe(true);
    expect(isAuthed("preview")).toBe(true);
    expect(isAuthed("none")).toBe(false);
  });
});

// ── Server-side routing / session detection ───────────────────────────────────

describe("root route + public pages", () => {
  test("root page is a SERVER component that detects the session before render", () => {
    const page = read("src/app/page.tsx");
    expect(page).not.toMatch(/^["']use client["']/m);          // server component
    expect(page).toContain("export default async function Page");
    expect(page).toContain("getSessionUser");                   // server session read
    expect(page).toContain("resolveInitialTab");                // no client redirect flash
    expect(page).toContain("lynx_preview");                     // preview cookie honored
  });

  test("RootClient seeds AppShell with the resolved tab (no /api/auth flash)", () => {
    const rc = read("src/components/RootClient.tsx");
    expect(rc).toContain("initialTab={initialTab}");
    expect(read("src/components/AppShell.tsx")).toContain("initialTab");
  });

  test("public pages swap Sign in → Return to Workspace when authenticated", () => {
    const mp = read("src/app/(marketing)/MarketingPage.tsx");
    expect(mp).toContain("Return to Workspace");
    expect(mp).toContain("authed");
    for (const p of ["about", "security", "contact"]) {
      const src = read(`src/app/${p}/page.tsx`);
      expect(src).toContain("getServerAuthMode");
      expect(src).toContain("authed={authed}");
    }
  });

  test("workspace nav exposes About ALCA (opens the public site, stays signed in)", () => {
    expect(read("src/components/TopNav.tsx")).toContain("About ALCA");
  });
});

// ── Live merged-universe propagation ──────────────────────────────────────────

describe("merged universe is the single source of truth", () => {
  test("candidate-pool routes read the merged loader with no static UNIVERSE value import", () => {
    const poolRoutes = [
      "src/app/api/screen/route.ts", "src/app/api/recommend/route.ts",
      "src/app/api/recommend/from-fund/route.ts", "src/app/api/replace/route.ts",
      "src/app/api/portfolio/select/route.ts", "src/app/api/compare/route.ts",
    ];
    for (const r of poolRoutes) {
      const src = read(r);
      expect(src).toContain("getMergedUniverse");
      expect(src).not.toMatch(/import\s*\{[^}]*\bUNIVERSE\b[^}]*\}\s*from\s*["']@\/lib\/universe["']/);
    }
    // Fund lookup does static-first then a merged fallback (perf + freshness).
    expect(read("src/app/api/funds/[ticker]/route.ts")).toContain("findMergedFund");
  });

  test("the canonical client hook overlays dynamic funds onto the static base", () => {
    const uc = read("src/lib/universeClient.ts");
    expect(uc).toContain("UNIVERSE");                 // starts from the static base (no flash)
    expect(uc).toContain("/api/universe");            // overlays the server-merged set
    expect(uc).toContain("export function useMergedUniverse");
    expect(uc).toContain("refreshMergedUniverse");    // invalidation after adding a fund
  });

  test("Research/Screen Funds count is live (no static UNIVERSE.length count)", () => {
    const st = read("src/components/ScreenTab.tsx");
    expect(st).toContain("useMergedUniverse");
    expect(st).toContain("universeCount");
    expect(st).not.toMatch(/from\s+["']@\/lib\/universe["']/);   // static value import removed
  });

  test("client universe consumers all use the merged hook", () => {
    for (const c of ["src/components/Hubs.tsx", "src/components/model/shared.tsx", "src/components/model/PortfolioProjection.tsx"]) {
      expect(read(c)).toContain("useMergedUniverse");
    }
    // Expansion invalidates the shared cache when a fund is added.
    expect(read("src/components/ExpansionTab.tsx")).toContain("refreshMergedUniverse");
  });

  test("the merged loader is verified-only and deduped (excludes unverified)", () => {
    const server = read("src/lib/universeServer.ts");
    expect(server).toContain("dynamicFundsListVerified");   // verified rows only
    expect(server).toContain("staticTickers");              // dedupe; static wins
    const db = read("src/lib/db.ts");
    expect(db).toMatch(/dynamicFundsListVerified[\s\S]*?\.eq\("verified", true\)/);
  });
});
