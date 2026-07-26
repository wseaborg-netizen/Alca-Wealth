/**
 * MANUAL live Tiingo smoke validation — NOT part of the default Jest suite.
 *
 *   Run explicitly:  npx jest --config jest.smoke.config.ts
 *
 * - Requires TIINGO_API_KEY (loaded from the gitignored, server-only .env.local).
 * - Exercises the CANONICAL provider (src/lib/market-data) with header auth.
 * - Prints SANITIZED capability summaries only — never the token, headers, or
 *   authenticated URLs (the normalized types never contain a token).
 * - Enforces a hard request cap (<= 20) and uses a small fixed symbol set from
 *   ALCA's canonical universe. No loops, no imports, no Expansion, no writes to
 *   any runtime file or the fund universe.
 *
 * This file is deliberately outside src/__tests__/ so `npm test` never runs it.
 */
import * as fs from "fs";
import * as path from "path";
import { createTiingoProvider, type TokenContext } from "@/lib/market-data";

const MAX_REQUESTS = 20;
let requestCount = 0;
const INTERNAL: TokenContext = { kind: "internal" };
const provider = createTiingoProvider();

/** Load the server-only key from .env.local into process.env (never logged). */
function ensureKey(): boolean {
  if (process.env.TIINGO_API_KEY?.trim()) return true;
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, "..", ".env.local"), "utf8");
    const m = raw.match(/^TIINGO_API_KEY=(.+)$/m);
    if (m && m[1].trim()) {
      process.env.TIINGO_API_KEY = m[1].trim();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function budget(): void {
  requestCount += 1;
  if (requestCount > MAX_REQUESTS) throw new Error(`live request cap ${MAX_REQUESTS} exceeded`);
}

type AnyResult = { ok: boolean; error?: { category: string }; data?: unknown };
const cat = (r: AnyResult) => (r.ok ? null : r.error?.category ?? "unknown");

const RECENT = "2024-01-01";

describe("Tiingo live smoke (manual — bounded, sanitized)", () => {
  beforeAll(() => {
    if (!ensureKey()) throw new Error("TIINGO_API_KEY unavailable — add it to .env.local to run the smoke.");
  });

  it("ETF metadata (VTI)", async () => {
    budget();
    const r = await provider.getSecurityMetadata("VTI", INTERNAL);
    console.log("META VTI:", r.ok
      ? { symbol: r.data.symbol, hasName: !!r.data.displayName, securityType: r.data.securityType, coverageStartDate: r.data.coverageStartDate, aum: r.data.aum.status }
      : { error: cat(r) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.aum.status).toBe("unavailable");
    expect(Object.keys(r.data)).not.toContain("inceptionDate");
  });

  it("ETF adjusted price history (VTI)", async () => {
    budget();
    const r = await provider.getPriceHistory("VTI", INTERNAL, { startDate: RECENT });
    console.log("PRICES VTI:", r.ok
      ? { kind: r.data.kind, availability: r.data.availability, count: r.data.bars.length, first: r.data.bars[0]?.date, last: r.data.bars.at(-1)?.date, firstAdjClosePresent: r.data.bars[0] ? r.data.bars[0].adjClose !== null : null, asOf: r.data.freshness.asOf }
      : { error: cat(r) });
    expect(r.ok).toBe(true);
  });

  it("distributions (VTI)", async () => {
    budget();
    const r = await provider.getDistributions("VTI", INTERNAL, { startDate: RECENT });
    console.log("DIST VTI:", r.ok
      ? { count: r.data.distributions.length, availability: r.data.availability, sample: r.data.distributions.slice(-2) }
      : { error: cat(r) });
    expect(r.ok).toBe(true);
  });

  it("splits (VTI) — may be Unverified if no live event", async () => {
    budget();
    const r = await provider.getSplits("VTI", INTERNAL);
    console.log("SPLITS VTI:", r.ok
      ? { count: r.data.splits.length, availability: r.data.availability, sample: r.data.splits.slice(-2) }
      : { error: cat(r) });
    expect(r.ok).toBe(true);
  });

  it("mutual-fund metadata (VFIAX)", async () => {
    budget();
    const r = await provider.getSecurityMetadata("VFIAX", INTERNAL);
    console.log("META VFIAX:", r.ok
      ? { symbol: r.data.symbol, hasName: !!r.data.displayName, securityType: r.data.securityType, coverageStartDate: r.data.coverageStartDate, aum: r.data.aum.status }
      : { error: cat(r) });
    console.log("VFIAX metadata ok:", r.ok);
  });

  it("mutual-fund NAV history (VFIAX, kind=nav)", async () => {
    budget();
    const r = await provider.getPriceHistory("VFIAX", INTERNAL, { kind: "nav", startDate: RECENT });
    console.log("NAV VFIAX:", r.ok
      ? { kind: r.data.kind, availability: r.data.availability, count: r.data.bars.length, first: r.data.bars[0]?.date, last: r.data.bars.at(-1)?.date, firstClosePresent: r.data.bars[0] ? r.data.bars[0].close !== null : null }
      : { error: cat(r) });
    console.log("VFIAX NAV supported:", r.ok);
  });

  it("distributions on a monthly payer (BND)", async () => {
    budget();
    const r = await provider.getDistributions("BND", INTERNAL, { startDate: RECENT });
    console.log("DIST BND:", r.ok
      ? { count: r.data.distributions.length, availability: r.data.availability, sample: r.data.distributions.slice(-2) }
      : { error: cat(r) });
    expect(r.ok).toBe(true);
  });

  it("invalid symbol → normalized error, not fabricated data", async () => {
    budget();
    const r = await provider.getSecurityMetadata("ZZINVALIDXYZ", INTERNAL);
    console.log("META invalid:", { ok: r.ok, error: cat(r) });
    expect(r.ok).toBe(false);
  });

  it("stayed within the request cap", () => {
    console.log("TOTAL LIVE REQUESTS:", requestCount, "/", MAX_REQUESTS);
    expect(requestCount).toBeLessThanOrEqual(MAX_REQUESTS);
  });
});
