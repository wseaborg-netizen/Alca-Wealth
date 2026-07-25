import {
  padCik, filingUrl, parseAtomAccessions, FUND_FORMS, isValidTicker,
  categorizeStatus, isRetryable, retryAfterMs, computeScope, computeFreshness,
} from "@/lib/sec";
import fs from "fs";
import path from "path";

describe("SEC helpers", () => {
  test("padCik normalizes to 10 digits", () => {
    expect(padCik(36405)).toBe("0000036405");
    expect(padCik("36405")).toBe("0000036405");
    expect(padCik("0000036405")).toBe("0000036405");
    expect(padCik("CIK1234567890")).toBe("1234567890");
  });

  test("filingUrl builds the canonical archive URL", () => {
    expect(filingUrl("0000036405", "0000036405-25-000123", "form485b.htm"))
      .toBe("https://www.sec.gov/Archives/edgar/data/36405/000003640525000123/form485b.htm");
  });

  test("filingUrl cannot be steered off sec.gov by hostile input", () => {
    const evil = filingUrl("36405/../..@evil.com", "0000036405-25-000123", "https://evil.com/x");
    expect(new URL(evil).hostname).toBe("www.sec.gov");
    const evil2 = filingUrl("36405", "0000036405-25-000123?redirect=https://evil.com");
    expect(new URL(evil2).hostname).toBe("www.sec.gov");
    expect(evil2).not.toContain("evil.com");
  });

  test("ticker validation rejects malformed and oversized input", () => {
    for (const ok of ["VTI", "VFIAX", "BRK.B", "A", "QQQ1"]) expect(isValidTicker(ok)).toBe(true);
    for (const bad of ["", " ", "TOOLONGTICKER", "V TI", "V;TI", "../etc", "VTI%00", "S000002839&x=1"])
      expect(isValidTicker(bad)).toBe(false);
  });

  test("parseAtomAccessions extracts accession numbers from an EDGAR atom feed", () => {
    const xml = `
      <feed><entry>
        <content type="text/xml"><accession-number>0000036405-25-000123</accession-number></content>
        <id>urn:tag:sec.gov,2008:accession-number=0000036405-24-009999</id>
      </entry></feed>`;
    const set = parseAtomAccessions(xml);
    expect(set.has("0000036405-25-000123")).toBe(true);
    expect(set.has("0000036405-24-009999")).toBe(true);
  });

  test("fund form list covers the investment-company priority set", () => {
    for (const f of ["485BPOS", "485APOS", "N-1A", "497", "N-CSR", "N-CSRS", "N-PORT-P", "N-CEN"])
      expect(FUND_FORMS).toContain(f);
  });
});

describe("SEC error taxonomy & retries", () => {
  test("status categorization", () => {
    expect(categorizeStatus(403)).toBe("forbidden");
    expect(categorizeStatus(404)).toBe("not_found");
    expect(categorizeStatus(429)).toBe("rate_limited");
    expect(categorizeStatus(500)).toBe("server_error");
    expect(categorizeStatus(503)).toBe("server_error");
    expect(categorizeStatus(400)).toBe("bad_request");
  });

  test("only transient categories are retryable (no 400/403/404 retry loops)", () => {
    expect(isRetryable("rate_limited")).toBe(true);
    expect(isRetryable("server_error")).toBe(true);
    expect(isRetryable("timeout")).toBe(true);
    expect(isRetryable("network")).toBe(true);
    expect(isRetryable("forbidden")).toBe(false);
    expect(isRetryable("not_found")).toBe(false);
    expect(isRetryable("bad_request")).toBe(false);
    expect(isRetryable("misconfigured")).toBe(false);
  });

  test("Retry-After is honored and capped", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs("120")).toBe(5000); // capped for serverless budgets
    expect(retryAfterMs("nonsense")).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });
});

describe("scope & freshness", () => {
  const cls = new Set(["A-1"]), ser = new Set(["A-1", "B-2"]);
  test("exact class beats series beats registrant", () => {
    expect(computeScope("A-1", cls, ser)).toBe("exact_class");
    expect(computeScope("B-2", cls, ser)).toBe("exact_series");
    expect(computeScope("C-3", cls, ser)).toBe("registrant");
  });
  test("unconfirmed when scope feeds are unavailable", () => {
    expect(computeScope("A-1", null, null)).toBe("unconfirmed");
  });
  test("freshness buckets drive stale-while-revalidate", () => {
    const now = Date.now();
    expect(computeFreshness(now - 60_000, now)).toBe("fresh");
    expect(computeFreshness(now - 7 * 60 * 60 * 1000, now)).toBe("stale");
    expect(computeFreshness(null, now)).toBe("unknown");
  });
});

describe("security & runtime-independence guarantees", () => {
  const ROOT = path.join(__dirname, "..", "..");

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx|js|mjs|json)$/.test(f)) out.push(p);
    }
    return out;
  };

  test("the SEC contact email is never hardcoded in source", () => {
    // needles are assembled at runtime so this test file can't trip itself
    const needles = ["will" + "." + "seaborg", "icloud" + "." + "com"];
    const files = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts"))]
      .filter((f) => !f.endsWith("sec.test.ts"));
    for (const f of files) {
      const txt = fs.readFileSync(f, "utf8");
      for (const n of needles) expect(txt.includes(n)).toBe(false);
    }
  });

  test("no AI runtime dependencies (Anthropic / Claude / OpenAI / agents)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(" ").toLowerCase();
    for (const banned of ["anthropic", "claude", "openai", "langchain", "ai-sdk", "@ai-sdk"])
      expect(deps).not.toContain(banned);
  });

  test("SEC modules are server-only (no 'use client' directive)", () => {
    for (const f of ["sec.ts", "sec-store.ts", "sec-service.ts", "sec-health.ts"]) {
      const txt = fs.readFileSync(path.join(ROOT, "src", "lib", f), "utf8");
      expect(txt.includes("use client")).toBe(false);
    }
  });

  test("scheduled routes require CRON_SECRET authorization", () => {
    for (const f of ["cron/sec-refresh", "cron/sec-ticker-map", "sec/health"]) {
      const txt = fs.readFileSync(path.join(ROOT, "src", "app", "api", f, "route.ts"), "utf8");
      expect(txt).toContain("CRON_SECRET");
      expect(txt).toContain("401");
    }
  });

  test("public API route returns normalized fields only (no email, no raw SEC passthrough)", () => {
    const txt = fs.readFileSync(path.join(ROOT, "src", "app", "api", "sec", "fund", "[ticker]", "route.ts"), "utf8");
    expect(txt).not.toContain("SEC_CONTACT_EMAIL");
    expect(txt).not.toContain("User-Agent");
    expect(txt).toContain("coverageWarning");
    expect(txt).toContain("stale");
    expect(txt).toContain("lastSuccessfulSync");
  });
});
