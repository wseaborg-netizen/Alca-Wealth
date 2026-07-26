/**
 * Canonical Tiingo provider foundation — fixture-based unit tests.
 *
 * NO network: `fetch` is dependency-injected with a fake that returns synthetic
 * fixtures and records the request (URL + Authorization header). No real token
 * appears in any fixture. Covers normalization, availability, provenance,
 * every error class + retryability, token resolution, and token isolation.
 */
import {
  createTiingoProvider,
  resolveTiingoToken,
  isResolvedToken,
  isRetryable,
  categorizeStatus,
  type TokenContext,
} from "@/lib/market-data";

// ── Fake transport ──────────────────────────────────────────────────────────
type FakeResp = { status: number; body?: unknown; jsonThrows?: boolean };
interface Recorder { calls: { url: string; authHeader?: string }[] }

function fakeFetch(rec: Recorder, respond: (url: string) => FakeResp): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    rec.calls.push({ url, authHeader: headers.Authorization });
    const r = respond(url);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => {
        if (r.jsonThrows) throw new Error("bad json");
        return r.body;
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const INTERNAL: TokenContext = { kind: "internal" };
const NOW = () => new Date("2026-07-25T00:00:00.000Z");
const TEST_TOKEN = "TEST_TIINGO_TOKEN_placeholder";
const withToken = () => ({ token: TEST_TOKEN, contextKind: "internal" as const });

function providerReturning(respond: (url: string) => FakeResp) {
  const rec: Recorder = { calls: [] };
  return { rec, provider: createTiingoProvider({ resolveToken: withToken, fetchImpl: fakeFetch(rec, respond), now: NOW }) };
}

// ── Fixtures (synthetic; shapes mirror observed live Tiingo responses) ────────
// Observed live: /tiingo/daily/{symbol} returns ticker/name/description/
// startDate/endDate/exchangeCode and NO assetType — so securityType is "unknown".
const META_FIXTURE = {
  ticker: "VTI", name: "Vanguard Total Stock Market Index Fund ETF Shares",
  description: "…", startDate: "2001-05-31", endDate: "2026-07-24", exchangeCode: "NYSE ARCA",
};
const META_MF = {
  ticker: "VFIAX", name: "Vanguard 500 Index Fund Admiral Shares",
  description: "…", startDate: "2000-11-13", endDate: "2026-07-24", exchangeCode: "NASDAQ",
};
// Hypothetical shape IF a future Tiingo field/endpoint supplies asset type.
const META_TYPED_ETF = { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", assetType: "ETF", startDate: "1993-01-29" };
const META_TYPED_MF = { ticker: "VFIAX", name: "Vanguard 500 Admiral", assetType: "Mutual Fund", startDate: "2000-11-13" };
const META_MINIMAL = { ticker: "ZZZZ" };
const DUP_ROWS = [
  { date: "2026-07-22T00:00:00.000Z", close: 100, adjClose: 99, open: 98, high: 101, low: 97, volume: 1000 },
  { date: "2026-07-22T00:00:00.000Z", close: 200, adjClose: 199, open: 198, high: 201, low: 197, volume: 2000 }, // duplicate date, later value wins
  { date: "2026-07-21T00:00:00.000Z", close: 90, adjClose: 89, open: 88, high: 91, low: 87, volume: 900 }, // out of order → must sort ascending
];
const MISSING_ADJ_ROWS = [
  { date: "2026-07-23T00:00:00.000Z", close: 50, open: 49, high: 51, low: 48, volume: 500 }, // no adjClose field
];
const PRICE_ROWS = [
  { date: "2026-07-22T00:00:00.000Z", close: 100, adjClose: 99, open: 98, high: 101, low: 97, volume: 1000, divCash: 0, splitFactor: 1 },
  { date: "2026-07-23T00:00:00.000Z", close: 102, adjClose: 101, open: 100, high: 103, low: 99, volume: 1100, divCash: 0.5, splitFactor: 1 },
  { date: "2026-07-24T00:00:00.000Z", close: 52, adjClose: 51.5, open: 51, high: 53, low: 50, volume: 1200, divCash: 0, splitFactor: 2 },
];
const NAV_ROWS = [
  { date: "2026-07-23T00:00:00.000Z", close: 25.5, adjClose: 25.5, open: null, high: null, low: null, volume: null, divCash: 0, splitFactor: 1 },
  { date: "2026-07-24T00:00:00.000Z", close: 25.7, adjClose: 25.7, open: null, high: null, low: null, volume: null, divCash: 0, splitFactor: 1 },
];

// ── Security metadata ─────────────────────────────────────────────────────────
describe("security metadata normalization", () => {
  test("valid metadata → normalized; AUM unavailable; coverage start NOT inception", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: META_FIXTURE }));
    const r = await provider.getSecurityMetadata("vti", INTERNAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.symbol).toBe("VTI");
    expect(r.data.displayName).toBe("Vanguard Total Stock Market Index Fund ETF Shares");
    expect(r.data.securityType).toBe("unknown"); // Tiingo metadata has no assetType field
    expect(r.data.coverageStartDate).toBe("2001-05-31");
    expect(r.data.aum).toEqual({ status: "unavailable", reason: "not_supported_by_provider" });
    expect(r.data.provenance.source).toBe("tiingo");
    expect(r.data.provenance.fetchedAt).toBe("2026-07-25T00:00:00.000Z");
    // Never surface an "inception" concept from provider coverage start.
    expect(Object.keys(r.data)).not.toContain("inceptionDate");
    expect(JSON.stringify(r.data).toLowerCase()).not.toContain("inception");
  });

  test("missing optional metadata → nulls + unknown type, not fabricated", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: META_MINIMAL }));
    const r = await provider.getSecurityMetadata("ZZZZ", INTERNAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.displayName).toBeNull();
    expect(r.data.securityType).toBe("unknown");
    expect(r.data.coverageStartDate).toBeNull();
    expect(r.data.aum.status).toBe("unavailable"); // AUM always explicitly unavailable
  });
});

// ── Price / NAV history ─────────────────────────────────────────────────────
describe("price / NAV history normalization", () => {
  test("adjusted price history → sorted bars, adjClose, availability + freshness", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: PRICE_ROWS }));
    const r = await provider.getPriceHistory("VTI", INTERNAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.kind).toBe("price");
    expect(r.data.bars).toHaveLength(3);
    expect(r.data.bars[0].date).toBe("2026-07-22");
    expect(r.data.bars[2].adjClose).toBe(51.5);
    expect(r.data.availability).toEqual({ status: "available", count: 3 });
    expect(r.data.freshness.asOf).toBe("2026-07-24");
    expect(r.data.freshness.observedAt).toBe("2026-07-25T00:00:00.000Z");
  });

  test("mutual-fund NAV history → kind nav, close carries NAV, no volume", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: NAV_ROWS }));
    const r = await provider.getPriceHistory("VFIAX", INTERNAL, { kind: "nav" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.kind).toBe("nav");
    expect(r.data.bars[1].close).toBe(25.7);
    expect(r.data.bars[0].volume).toBeNull();
  });

  test("empty history → availability empty, no fabricated bars, asOf null", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: [] }));
    const r = await provider.getPriceHistory("NEW", INTERNAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.bars).toHaveLength(0);
    expect(r.data.availability).toEqual({ status: "empty" });
    expect(r.data.freshness.asOf).toBeNull();
  });
});

// ── Distributions + splits ───────────────────────────────────────────────────
describe("distributions and splits", () => {
  test("distributions → only divCash>0 rows with ex-dates", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: PRICE_ROWS }));
    const r = await provider.getDistributions("VTI", INTERNAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.distributions).toEqual([{ exDate: "2026-07-23", amount: 0.5 }]);
    expect(r.data.availability).toEqual({ status: "available", count: 1 });
  });

  test("splits → only splitFactor≠1 rows (no estimation)", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: PRICE_ROWS }));
    const r = await provider.getSplits("VTI", INTERNAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.splits).toEqual([{ date: "2026-07-24", factor: 2 }]);
  });

  test("no corporate actions → empty, not error", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: NAV_ROWS }));
    const r = await provider.getSplits("VFIAX", INTERNAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.splits).toHaveLength(0);
    expect(r.data.availability).toEqual({ status: "empty" });
  });
});

// ── Errors + retryability ─────────────────────────────────────────────────────
describe("normalized errors", () => {
  test("metadata array body → malformed (non-retryable)", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: [1, 2, 3] }));
    const r = await provider.getSecurityMetadata("VTI", INTERNAL);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.category).toBe("malformed");
    expect(r.error.retryable).toBe(false);
  });

  test("prices object body → malformed", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: { detail: "x" } }));
    const r = await provider.getPriceHistory("VTI", INTERNAL);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.category).toBe("malformed");
  });

  test("invalid JSON body → malformed", async () => {
    const { provider } = providerReturning(() => ({ status: 200, jsonThrows: true }));
    const r = await provider.getPriceHistory("VTI", INTERNAL);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.category).toBe("malformed");
  });

  test("unauthorized (401) → non-retryable with status", async () => {
    const { provider } = providerReturning(() => ({ status: 401, body: { detail: "invalid token" } }));
    const r = await provider.getSecurityMetadata("VTI", INTERNAL);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.category).toBe("unauthorized");
    expect(r.error.retryable).toBe(false);
    expect(r.error.status).toBe(401);
  });

  test("rate limited (429) → retryable", async () => {
    const { provider } = providerReturning(() => ({ status: 429 }));
    const r = await provider.getPriceHistory("VTI", INTERNAL);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.category).toBe("rate_limited");
    expect(r.error.retryable).toBe(true);
  });

  test("server error (500) → retryable", async () => {
    const { provider } = providerReturning(() => ({ status: 500 }));
    const r = await provider.getPriceHistory("VTI", INTERNAL);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.category).toBe("server_error");
    expect(r.error.retryable).toBe(true);
  });

  test("invalid symbol → invalid_symbol, no request made", async () => {
    const { provider, rec } = providerReturning(() => ({ status: 200, body: META_FIXTURE }));
    const r = await provider.getSecurityMetadata("bad symbol!!", INTERNAL);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.category).toBe("invalid_symbol");
    expect(rec.calls).toHaveLength(0);
  });

  test("retryable vs non-retryable classification", () => {
    for (const c of ["rate_limited", "server_error", "timeout", "network"] as const) expect(isRetryable(c)).toBe(true);
    for (const c of ["unauthorized", "not_found", "malformed", "no_token", "invalid_symbol"] as const) expect(isRetryable(c)).toBe(false);
    expect(categorizeStatus(403)).toBe("unauthorized");
    expect(categorizeStatus(404)).toBe("not_found");
    expect(categorizeStatus(429)).toBe("rate_limited");
    expect(categorizeStatus(503)).toBe("server_error");
  });
});

// ── Token resolution ──────────────────────────────────────────────────────────
describe("server-only token resolution", () => {
  test("internal resolves from server env", () => {
    const r = resolveTiingoToken({ kind: "internal" }, { TIINGO_API_KEY: "internal-xyz" });
    expect(isResolvedToken(r)).toBe(true);
    if (isResolvedToken(r)) { expect(r.contextKind).toBe("internal"); expect(r.token).toBe("internal-xyz"); }
  });

  test("internal without env fails closed (no_token)", () => {
    const r = resolveTiingoToken({ kind: "internal" }, {});
    expect(isResolvedToken(r)).toBe(false);
    if (!isResolvedToken(r)) expect(r.category).toBe("no_token");
  });

  test("external with firm token resolves to that token", () => {
    const r = resolveTiingoToken({ kind: "external", firmToken: "firm-abc" }, { TIINGO_API_KEY: "internal-xyz" });
    expect(isResolvedToken(r)).toBe(true);
    if (isResolvedToken(r)) { expect(r.contextKind).toBe("external"); expect(r.token).toBe("firm-abc"); }
  });

  test("external WITHOUT firm token fails closed and NEVER uses the internal token", () => {
    const r = resolveTiingoToken({ kind: "external", firmToken: null }, { TIINGO_API_KEY: "internal-xyz" });
    expect(isResolvedToken(r)).toBe(false);
    if (!isResolvedToken(r)) {
      expect(r.category).toBe("no_token");
      expect(JSON.stringify(r)).not.toContain("internal-xyz");
    }
  });

  test("provider in external context without a firm token fails closed before any request", async () => {
    const rec: Recorder = { calls: [] };
    const provider = createTiingoProvider({ fetchImpl: fakeFetch(rec, () => ({ status: 200, body: META_FIXTURE })), now: NOW });
    const r = await provider.getSecurityMetadata("VTI", { kind: "external", firmToken: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.category).toBe("no_token");
    expect(rec.calls).toHaveLength(0);
  });
});

// ── Token isolation ────────────────────────────────────────────────────────────
describe("token isolation", () => {
  const SECRET = "SUPER_SECRET_TIINGO_TOKEN_123";
  const secretResolver = () => ({ token: SECRET, contextKind: "internal" as const });

  test("token goes in the Authorization header, never the URL; absent from success output", async () => {
    const rec: Recorder = { calls: [] };
    const provider = createTiingoProvider({ resolveToken: secretResolver, fetchImpl: fakeFetch(rec, () => ({ status: 200, body: META_FIXTURE })), now: NOW });
    const r = await provider.getSecurityMetadata("VTI", INTERNAL);
    expect(rec.calls[0].authHeader).toBe(`Token ${SECRET}`);
    expect(rec.calls[0].url).not.toContain(SECRET);
    expect(rec.calls[0].url).not.toContain("token=");
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });

  test("token absent from error output", async () => {
    const rec: Recorder = { calls: [] };
    const provider = createTiingoProvider({ resolveToken: secretResolver, fetchImpl: fakeFetch(rec, () => ({ status: 401, body: { detail: "nope" } })), now: NOW });
    const r = await provider.getSecurityMetadata("VTI", INTERNAL);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(SECRET);
  });
});

// ── Stage 2: realistic shapes, dedup, missing values, timeout, retries ────────
describe("Stage 2 capability behavior", () => {
  test("realistic mutual-fund metadata → unknown type, coverage start, AUM unavailable", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: META_MF }));
    const r = await provider.getSecurityMetadata("VFIAX", INTERNAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.displayName).toBe("Vanguard 500 Index Fund Admiral Shares");
    expect(r.data.securityType).toBe("unknown");
    expect(r.data.coverageStartDate).toBe("2000-11-13");
    expect(r.data.aum).toEqual({ status: "unavailable", reason: "not_supported_by_provider" });
  });

  test("securityType maps only when a real assetType field is present", async () => {
    const etf = providerReturning(() => ({ status: 200, body: META_TYPED_ETF }));
    const mf = providerReturning(() => ({ status: 200, body: META_TYPED_MF }));
    const re = await etf.provider.getSecurityMetadata("SPY", INTERNAL);
    const rm = await mf.provider.getSecurityMetadata("VFIAX", INTERNAL);
    expect(re.ok && re.data.securityType).toBe("etf");
    expect(rm.ok && rm.data.securityType).toBe("mutual_fund");
  });

  test("duplicate dates de-duplicated (last wins) and sorted ascending", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: DUP_ROWS }));
    const r = await provider.getPriceHistory("VTI", INTERNAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.bars.map((b) => b.date)).toEqual(["2026-07-21", "2026-07-22"]);
    const dup = r.data.bars.find((b) => b.date === "2026-07-22");
    expect(dup?.close).toBe(200); // later duplicate wins
    expect(r.data.availability).toEqual({ status: "available", count: 2 });
  });

  test("missing adjusted values → adjClose null, not fabricated", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: MISSING_ADJ_ROWS }));
    const r = await provider.getPriceHistory("VTI", INTERNAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.bars[0].close).toBe(50);
    expect(r.data.bars[0].adjClose).toBeNull();
  });

  test("insufficient history (1 bar) → insufficient availability", async () => {
    const { provider } = providerReturning(() => ({ status: 200, body: MISSING_ADJ_ROWS }));
    const r = await provider.getPriceHistory("VTI", INTERNAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.availability).toEqual({ status: "insufficient", count: 1 });
  });

  test("timeout (AbortError) → normalized timeout error (retryable)", async () => {
    const abortingFetch = (async () => {
      const e = new Error("aborted"); e.name = "AbortError"; throw e;
    }) as unknown as typeof fetch;
    const provider = createTiingoProvider({ resolveToken: withToken, fetchImpl: abortingFetch, now: NOW, maxRetries: 0, sleep: async () => {} });
    const r = await provider.getPriceHistory("VTI", INTERNAL);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.category).toBe("timeout");
    expect(r.error.retryable).toBe(true);
  });

  test("bounded retries: retryable error retried up to maxRetries, then returned", async () => {
    let calls = 0;
    const flaky = (async () => { calls += 1; return { ok: false, status: 503, json: async () => ({}) } as unknown as Response; }) as unknown as typeof fetch;
    const provider = createTiingoProvider({ resolveToken: withToken, fetchImpl: flaky, now: NOW, maxRetries: 2, sleep: async () => {} });
    const r = await provider.getPriceHistory("VTI", INTERNAL);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.category).toBe("server_error");
    expect(calls).toBe(3); // initial + 2 retries
  });

  test("bounded retries: eventual success after transient failures", async () => {
    let calls = 0;
    const recovering = (async () => {
      calls += 1;
      if (calls < 2) return { ok: false, status: 429, json: async () => ({}) } as unknown as Response;
      return { ok: true, status: 200, json: async () => PRICE_ROWS } as unknown as Response;
    }) as unknown as typeof fetch;
    const provider = createTiingoProvider({ resolveToken: withToken, fetchImpl: recovering, now: NOW, maxRetries: 3, sleep: async () => {} });
    const r = await provider.getPriceHistory("VTI", INTERNAL);
    expect(r.ok).toBe(true);
    expect(calls).toBe(2);
  });

  test("no retry for non-retryable errors (401 tried once)", async () => {
    let calls = 0;
    const unauth = (async () => { calls += 1; return { ok: false, status: 401, json: async () => ({}) } as unknown as Response; }) as unknown as typeof fetch;
    const provider = createTiingoProvider({ resolveToken: withToken, fetchImpl: unauth, now: NOW, maxRetries: 3, sleep: async () => {} });
    const r = await provider.getSecurityMetadata("VTI", INTERNAL);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.category).toBe("unauthorized");
    expect(calls).toBe(1); // never retried
  });
});

// ── No import-time side effects ───────────────────────────────────────────────
test("creating the provider makes no request until a method is called", () => {
  const rec: Recorder = { calls: [] };
  createTiingoProvider({ resolveToken: withToken, fetchImpl: fakeFetch(rec, () => ({ status: 200, body: {} })), now: NOW });
  expect(rec.calls).toHaveLength(0);
});
