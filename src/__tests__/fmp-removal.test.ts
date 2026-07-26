/**
 * Stage 6 — FMP zero-residue guard. Offline source scans that fail if FMP is
 * ever reintroduced: no provider module, no fmp/funds runtime import, no FMP API
 * URL, no FMP env var, no legacy FMP-era cache key, no FMP provider type/function.
 *
 * The only permitted "fmp" residue is the schema-bound `fmp_supported` /
 * `fmp_payload_summary` (Postgres column + migration CHECK-constraint status
 * value) which cannot change without a database migration — asserted explicitly.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

/** All runtime source files (src/, excluding tests). */
function runtimeFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== "__tests__") walk(rel); }
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(rel);
    }
  };
  walk("src");
  return out;
}

describe("Stage 6: FMP is fully removed", () => {
  test("the dead provider modules and the FMP import script are deleted", () => {
    expect(exists("src/lib/fmp.ts")).toBe(false);
    expect(exists("src/lib/funds.ts")).toBe(false);
    expect(exists("scripts/import-funds-from-fmp.mjs")).toBe(false);
  });

  test("no runtime file imports fmp.ts or the legacy funds.ts", () => {
    for (const f of runtimeFiles()) {
      const src = read(f);
      expect(src).not.toMatch(/from\s+["'][^"']*\/fmp["']/);
      expect(src).not.toMatch(/from\s+["'][^"']*\/funds["']/); // legacy funds.ts (fundService is the replacement)
    }
  });

  test("no runtime file contains an FMP API URL, FMP env var, or FMP function/type name", () => {
    for (const f of runtimeFiles()) {
      const src = read(f);
      expect(src).not.toMatch(/financialmodelingprep/i);
      expect(src).not.toMatch(/FMP_API_KEY/);
      expect(src).not.toMatch(/fetchMarketQuoteFmp|fetchHistoryFmp|fetchFundSupport/);
      expect(src).not.toMatch(/Fmp(Historical|Dividend)Item/);
    }
  });

  test("no runtime file reads or writes a legacy FMP-era cache key", () => {
    for (const f of runtimeFiles()) {
      const src = read(f);
      expect(src).not.toMatch(/["'`]fund:rec:/);        // old rec-cache warm check
      expect(src).not.toMatch(/redis\.keys\(["']fund:\*/); // old cache-clear scan
      expect(src).not.toMatch(/redis\.keys\(["']bench:\*/);
    }
  });

  test("package.json has no FMP import script; the offline pipeline is classify/validate only", () => {
    const pkg = read("package.json");
    expect(pkg).not.toContain("funds:import");
    expect(pkg).not.toContain("funds:build");
    expect(pkg).not.toContain("import-funds-from-fmp");
  });

  test(".env.example references Tiingo, not FMP", () => {
    const env = read(".env.example");
    expect(env).not.toMatch(/FMP/);
    expect(env).toContain("TIINGO_API_KEY");
  });

  test("the ONLY residual `fmp` is the schema-bound status/column (migration-gated)", () => {
    // The fund_requests CHECK constraint hard-codes the status value 'fmp_supported'
    // and dynamic_funds has an `fmp_payload_summary` column — neither can change
    // without a Supabase migration (out of scope). Confirm no OTHER lowercase `fmp`.
    for (const f of runtimeFiles()) {
      const stripped = read(f)
        .replace(/fmp_supported/g, "")
        .replace(/fmpSupported/g, "")
        .replace(/fmp_payload_summary/g, "")
        .replace(/fmpPayloadSummary/g, "");
      expect(stripped).not.toMatch(/\bfmp\b/i);
    }
  });
});
