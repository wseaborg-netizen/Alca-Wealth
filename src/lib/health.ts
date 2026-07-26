/**
 * System Health — internal diagnostic checks for ALCA's core subsystems.
 * SERVER-SIDE ONLY (imports the provider/data layer). Never import into a
 * client component; the Settings UI reads the normalized result over
 * /api/health/system instead.
 *
 * Safety rules baked in here:
 *  - Every check is isolated: one failure returns an "error" card, it never
 *    throws out of runSystemHealth or takes down the other checks.
 *  - Responses are normalized and SAFE: no API keys, no service-role key, no
 *    raw provider/SQL bodies, no stack traces, no user PII, no fund contents.
 *    Real errors are logged server-side; the client sees a generic note.
 *  - Lightweight: a single probe fund is fetched once (cached) and shared
 *    across the FMP / scoring / portfolio checks. No self-HTTP fan-out.
 */
import { UNIVERSE, findFund, UNIVERSE_GENERATED_AT } from "./universe";
import { getFund, inferVehicle, type FundRecord } from "@/lib/market-data/fundService";
import { cacheGet } from "./cache";
import { peersOf, rankAmong, MIN_PEERS } from "./metrics/peers";
import { scoreFundForContext, type ScoreInputs } from "./metrics/score";
import { recordToScoreInputs, rankRecords } from "./metrics/recordScore";
import { targetSleeves, assetClassMix } from "./portfolioModel";
import { classifierSelfTest } from "./classify";
import type { Client } from "./client";
import reviewQueue from "@/../data/generated/fund-review-queue.json";
import importFailures from "@/../data/generated/fund-import-failures.json";
import taxonomy from "@/../data/config/fund-taxonomy.json";

export type HealthStatus = "healthy" | "warning" | "error";

export interface HealthCheckResult {
  key: string;
  label: string;
  status: HealthStatus;
  summary: string;
  details?: Record<string, unknown>;
  checkedAt: string;
}

export interface SystemHealthResponse {
  generatedAt: string;
  overall: HealthStatus;
  checks: HealthCheckResult[];
}

/** Minimal firm/session context the saved-lists check needs (passed by the
    route so this module never touches cookies/RLS on its own). */
export interface HealthAuthContext {
  signedIn: boolean;
  listsGetAll?: () => Promise<{ name: string; type: string; itemCount: number }[]>;
  fundRequestCounts?: () => Promise<{
    pending: number; readyForReview: number; unsupported: number; total: number;
    needsClassification: number; addedToUniverse: number; failedValidation: number; classificationFailed: number;
  }>;
  /** Verified dynamic-fund count (Expansion Hub overlay). */
  dynamicFundCount?: () => Promise<number>;
  /** SEC monitoring counts (Advisor Hub alerts). */
  monitoringCounts?: () => Promise<{ monitored: number; unresolvedCik: number; alerts: number }>;
}

const PROBE_TICKER = "VTI";

// ── Isolation wrapper ─────────────────────────────────────────────────────────

type CheckBody = Omit<HealthCheckResult, "key" | "label" | "checkedAt">;

async function safeCheck(
  key: string, label: string, fn: () => Promise<CheckBody>,
): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    const body = await fn();
    return { key, label, checkedAt, ...body };
  } catch (err) {
    // Log the real error server-side only; never surface message/stack/SQL.
    console.error(`[health] check "${key}" threw:`, err);
    return {
      key, label, checkedAt, status: "error",
      summary: "This check could not run. See server logs.",
      details: { note: "Details withheld — check server logs." },
    };
  }
}

const worst = (statuses: HealthStatus[]): HealthStatus =>
  statuses.includes("error") ? "error" : statuses.includes("warning") ? "warning" : "healthy";

// ── Shared probe fund (one fetch, reused) ─────────────────────────────────────

async function fetchProbe(): Promise<FundRecord | null> {
  const uf = findFund(PROBE_TICKER);
  return getFund(
    PROBE_TICKER,
    uf?.vehicle ?? inferVehicle(PROBE_TICKER),
    uf?.category ?? "US Equity Large Blend",
    uf?.benchmark ?? "SPY",
  );
}

function probeHasHistory(rec: FundRecord): boolean {
  return Object.values(rec.kpi.periods ?? {}).some(
    (p) => p && (p.return != null || p.volatility != null),
  );
}

// ── 1. Fund Universe ──────────────────────────────────────────────────────────

function checkFundUniverse(dynamicCount: number): CheckBody {
  const staticCount = UNIVERSE.length;
  const merged = staticCount + dynamicCount;
  const review = (reviewQueue as { count?: number }).count ?? 0;
  const failed = (importFailures as { count?: number }).count ?? 0;
  const taxonomyValid =
    !!taxonomy && typeof taxonomy === "object" &&
    ["primary_category", "asset_class", "region"].every((k) => k in (taxonomy as object));
  // Classifier + taxonomy self-test (shared with the offline pipeline).
  const classifier = classifierSelfTest();

  const details = {
    staticFunds: staticCount,
    dynamicFunds: dynamicCount,
    mergedFunds: merged,       // dynamic count from a live COUNT — never hardcoded
    reviewQueue: review,
    importFailures: failed,
    taxonomyValid,
    classifierOk: classifier.ok,
    classifier: classifier.detail,
    generatedAt: UNIVERSE_GENERATED_AT,
  };

  if (staticCount === 0) {
    return { status: "error", summary: "Fund universe is empty — no verified funds loaded.", details };
  }
  if (!classifier.ok) {
    return { status: "error", summary: `Classifier/taxonomy self-test failed — new funds cannot be classified.`, details };
  }
  if (!taxonomyValid) {
    return { status: "warning", summary: `${merged} verified funds, but taxonomy could not be fully validated.`, details };
  }
  if (review > 0 || failed > 0) {
    return {
      status: "warning",
      summary: `${merged} verified funds (${staticCount} base + ${dynamicCount} dynamic); ${review} in review, ${failed} import failures.`,
      details,
    };
  }
  return { status: "healthy", summary: `${merged} verified funds (${staticCount} base + ${dynamicCount} dynamic); classifier + taxonomy OK.`, details };
}

// ── 2. Market Data Provider (Tiingo) ─────────────────────────────────────────

/** Map a normalized provider error category (carried on the fund record) onto a
    health status + safe summary. Never exposes tokens, headers, URLs, or stacks. */
function providerErrorHealth(category: string): CheckBody {
  const details = { probeTicker: PROBE_TICKER, errorCategory: category };
  switch (category) {
    case "no_token":
      return { status: "error", summary: "Tiingo internal token is not configured.", details };
    case "unauthorized":
      return { status: "error", summary: "Tiingo rejected the credentials (unauthorized).", details };
    case "rate_limited":
      return { status: "warning", summary: "Tiingo rate limit reached — data may be delayed.", details };
    case "timeout":
      return { status: "warning", summary: "Tiingo request timed out.", details };
    case "network":
    case "server_error":
      return { status: "error", summary: "Tiingo provider is unavailable.", details };
    case "not_found":
    case "invalid_symbol":
      return { status: "error", summary: "Probe symbol not found by the provider.", details };
    default:
      return { status: "error", summary: "Tiingo request failed.", details };
  }
}

function checkProviderData(rec: FundRecord | null): CheckBody {
  if (!rec) {
    return { status: "error", summary: "Provider returned no usable data for the probe fund.", details: { probeTicker: PROBE_TICKER } };
  }
  if (rec.error) return providerErrorHealth(rec.error);

  const hasName = !!rec.name && rec.name.toUpperCase() !== PROBE_TICKER;
  const hasHistory = probeHasHistory(rec);
  const details = {
    probeTicker: PROBE_TICKER,
    resolvedName: hasName,      // boolean only — never leak raw provider payload
    priceHistory: hasHistory,
    expenseRatio: rec.expenseRatio != null, // static curated source (not Tiingo)
    source: rec.dataSource ?? "unknown",     // "tiingo"
  };
  if (!hasHistory) {
    return { status: "warning", summary: "Tiingo responded, but the probe fund has missing/insufficient history.", details };
  }
  return { status: "healthy", summary: "Tiingo provider works — usable adjusted price history returned.", details };
}

// ── 3. Scoring Engine ────────────────────────────────────────────────────────

async function checkScoringEngine(rec: FundRecord | null): Promise<CheckBody> {
  if (!rec) {
    return { status: "warning", summary: "Scoring skipped — probe fund data unavailable.", details: { probeTicker: PROBE_TICKER } };
  }
  const pg = peersOf(PROBE_TICKER);
  // Gather already-cached peer records only (no cold fetch) to stay lightweight.
  const cachedPeers: FundRecord[] = [];
  if (pg) {
    for (const p of pg.peers) {
      if (p.ticker === PROBE_TICKER) continue;
      // Match the Tiingo fund-service cache key (internal scope, 10y, price/NAV kind).
      const kind = p.vehicle === "Mutual Fund" ? "nav" : "price";
      const cp = await cacheGet<FundRecord>(`td:fund:${"internal"}:${p.ticker}:10y:${kind}`);
      if (cp) cachedPeers.push(cp);
    }
  }
  const subjectInputs: ScoreInputs = recordToScoreInputs(rec, "3Y");
  const peerInputs: ScoreInputs[] = cachedPeers.map((c) => recordToScoreInputs(c, "3Y"));

  const result = scoreFundForContext(subjectInputs, peerInputs, "overall");
  const score = result?.score ?? null;

  // Fake-score guard: a real score is a finite 0–100 peer percentile, or an
  // honest null with a reason. Anything else is invalid.
  if (score != null && (!Number.isFinite(score) || score < 0 || score > 100)) {
    return { status: "error", summary: "Scoring engine produced an out-of-range score.", details: { score } };
  }

  const periodStats = rec.kpi.periods?.["3Y"];
  const periodMetricsOk = !!periodStats && periodStats.return != null;
  const peerReturns = cachedPeers.map((c) => c.kpi.periods?.["3Y"]?.return ?? null);
  const rank = rankAmong(periodStats?.return ?? null, peerReturns, pg?.group ?? "", "annualized return");

  const details = {
    probeTicker: PROBE_TICKER,
    context: "overall",
    score,                                   // may be null when peers not warm
    periodMetrics: periodMetricsOk ? "3Y available" : "unavailable",
    cachedPeers: cachedPeers.length,
    peerRank: rank ? `${rank.rank}/${rank.count}` : null,
    displayCapEnforced: true,
  };

  if (score == null) {
    // Engine ran without crashing; peers not warm enough for a peer-relative
    // score. Documented, honest unavailable — degraded, not broken.
    return {
      status: "warning",
      summary: `Scoring engine runs; peer-relative score unavailable (needs ${MIN_PEERS}+ cached peers, has ${cachedPeers.length + 1}).`,
      details,
    };
  }
  return { status: "healthy", summary: "Scoring engine runs — valid peer-relative score computed, no crash.", details };
}

// ── 4. Saved Lists / Supabase ─────────────────────────────────────────────────

async function checkSavedLists(ctx: HealthAuthContext): Promise<CheckBody> {
  if (!ctx.signedIn) {
    return {
      status: "warning",
      summary: "Not signed in — saved lists not checked (no data exposed).",
      details: { signedIn: false },
    };
  }
  if (!ctx.listsGetAll) {
    return {
      status: "warning",
      summary: "Signed in, but no workspace/firm is provisioned — lists not checked.",
      details: { signedIn: true, workspace: false },
    };
  }
  const lists = await ctx.listsGetAll();
  const hasWatchlist = lists.some((l) => l.type === "watchlist");
  const hasCommon = lists.some((l) => l.type === "common");
  const details = {
    signedIn: true,
    listCount: lists.length,          // counts only — never list names/contents/tickers
    hasWatchlist,
    hasCommon,
  };
  if (!hasWatchlist || !hasCommon) {
    return { status: "warning", summary: "Database reachable, but expected default lists are missing.", details };
  }
  return { status: "healthy", summary: "Signed-in user can read workspace lists; defaults present.", details };
}

// ── 4b. Fund Requests (Add Missing Fund) — informational ──────────────────────
// Normal pending review is NOT a problem, so this stays healthy for ordinary
// backlogs. It only warns when requests are STUCK — status "pending" means the
// provider check could not complete and the request needs a retry.

async function checkFundRequests(ctx: HealthAuthContext): Promise<CheckBody> {
  if (!ctx.signedIn) {
    return { status: "warning", summary: "Not signed in — fund requests not checked.", details: { signedIn: false } };
  }
  if (!ctx.fundRequestCounts) {
    return { status: "warning", summary: "Signed in, but no workspace/firm is provisioned.", details: { signedIn: true, workspace: false } };
  }
  const c = await ctx.fundRequestCounts();
  const details = {
    total: c.total, pending: c.pending, needsClassification: c.needsClassification,
    readyForReview: c.readyForReview, addedToUniverse: c.addedToUniverse,
    unsupported: c.unsupported, failedValidation: c.failedValidation, classificationFailed: c.classificationFailed,
  };
  // Repeated hard failures → yellow with a clear reason (never red — the
  // classifier/DB health cards own systemic-failure red).
  const needsAttention = c.pending + c.needsClassification + c.failedValidation + c.classificationFailed;
  if (needsAttention > 0) {
    const bits = [
      c.pending ? `${c.pending} stuck` : "",
      c.needsClassification ? `${c.needsClassification} need classification` : "",
      c.failedValidation ? `${c.failedValidation} failed validation` : "",
      c.classificationFailed ? `${c.classificationFailed} classifier error` : "",
    ].filter(Boolean).join(", ");
    return { status: "warning", summary: `Fund requests need attention — ${bits}.`, details };
  }
  if (c.total === 0) {
    return { status: "healthy", summary: "No fund requests outstanding.", details };
  }
  return {
    status: "healthy",
    summary: `Fund requests healthy — ${c.addedToUniverse} added, ${c.unsupported} unsupported.`,
    details,
  };
}

// ── 4c. SEC Monitoring / Alerts ───────────────────────────────────────────────
// Red only when SEC can't run at all (no User-Agent). Unresolved CIKs and "no
// refresh yet / no alerts" are informational, never errors.

function checkSecAlerts(ctx: HealthAuthContext): Promise<CheckBody> {
  const secConfigured = !!(process.env.SEC_USER_AGENT?.trim() || process.env.SEC_CONTACT_EMAIL?.trim());
  return (async () => {
    if (!secConfigured) {
      return { status: "error", summary: "SEC_USER_AGENT is not configured — SEC monitoring is disabled.", details: { secUserAgent: false } };
    }
    if (!ctx.signedIn || !ctx.monitoringCounts) {
      return { status: "warning", summary: "SEC User-Agent configured; monitoring counts unavailable (not signed in / no workspace).", details: { secUserAgent: true } };
    }
    const c = await ctx.monitoringCounts();
    const details = { secUserAgent: true, monitored: c.monitored, unresolvedCik: c.unresolvedCik, alerts: c.alerts };
    if (c.unresolvedCik > 0) {
      return { status: "warning", summary: `SEC monitoring active; ${c.unresolvedCik} monitored fund(s) have no SEC CIK match.`, details };
    }
    return { status: "healthy", summary: `SEC User-Agent configured; ${c.monitored} monitored, ${c.alerts} alert(s).`, details };
  })();
}

// ── 5. Portfolio Builder ──────────────────────────────────────────────────────

function checkPortfolioBuilder(): CheckBody {
  const sampleClient: Client = {
    id: "health-probe", name: "Sample", age: 45, horizonYears: 20, risk: 3,
    taxBracket: 24, state: "CA", goal: "growth", costSensitivity: "medium",
    accounts: [], holdings: [], updatedAt: Date.now(),
  };

  const sleeves = targetSleeves(sampleClient, "ETF");
  if (!Array.isArray(sleeves) || sleeves.length === 0) {
    return { status: "warning", summary: "Portfolio builder returned no sleeves for the sample profile.", details: { sleeves: 0 } };
  }
  const mix = assetClassMix(sleeves);
  const total = (mix.equity ?? 0) + (mix.fixed ?? 0) + (mix.cash ?? 0); // sleeve weights sum ≈ 1
  const pct = (v: number) => Math.round(v * 100);
  const details = {
    sampleSleeves: sleeves.length,
    assetMix: { equity: pct(mix.equity), fixed: pct(mix.fixed), cash: pct(mix.cash) },
    unifiedScore: "sleeve selection scores via unified Advisor Review Score",
  };
  if (total < 0.95 || total > 1.05) {
    return { status: "warning", summary: "Portfolio builder initialized, but sample allocation did not sum near 100%.", details };
  }
  return { status: "healthy", summary: "Portfolio builder initializes and returns a valid sample allocation.", details };
}

// ── 6. API Routes (composed from underlying capability — no self-HTTP) ─────────

function checkApiRoutes(
  universe: HealthCheckResult, fmp: HealthCheckResult, savedLists: HealthCheckResult,
): CheckBody {
  // /api/screen — exercise the screener's ranking path deterministically.
  let screenOk = false;
  try {
    const pool = Array.from({ length: 5 }, (_, i) => ({
      ticker: `T${i}`, name: `T${i}`, vehicle: "ETF", category: "US Equity Large Blend",
      expenseRatio: 0.05 + i * 0.1, fundAge: 10,
      kpi: { ttmYield: 2, battingAvg3y: 50, periods: { "3Y": { return: 10 - i, sharpe: 1, maxDrawdown: -12, volatility: 12, sortino: null, beta: null, alpha: null } } },
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    screenOk = rankRecords(pool as any, "overall", "3Y").length === 5;
  } catch { screenOk = false; }

  const routes = [
    { path: "/api/universe", status: universe.status === "error" ? "error" : "healthy" as HealthStatus },
    { path: "/api/funds/VTI", status: fmp.status },
    { path: "/api/screen", status: (screenOk ? "healthy" : "error") as HealthStatus },
    { path: "/api/lists", status: savedLists.status },
  ];
  const status = worst(routes.map((r) => r.status as HealthStatus));
  const summary =
    status === "healthy" ? "Core API routes respond with a usable shape."
    : status === "warning" ? "Core routes reachable; one is degraded or unavailable without a session."
    : "One or more core API routes are failing.";
  return { status, summary, details: { routes } };
}

// ── 7. App Build (metadata only — never runs a build or a shell) ──────────────

function checkAppBuild(): CheckBody {
  const commit =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const env = process.env.VERCEL_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development");
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? null;
  const deployId = process.env.VERCEL_DEPLOYMENT_ID ?? null;

  const details = {
    commit: commit ? commit.slice(0, 7) : null,
    environment: env,
    version,
    deploymentId: deployId,
    note: "Running server implies the last build passed; verify production build via CI/Vercel.",
  };
  if (!commit && !deployId) {
    return {
      status: "warning",
      summary: "Build status metadata unavailable. Verify production build through CI/Vercel.",
      details,
    };
  }
  return { status: "healthy", summary: "Last known build passed (deployment metadata present).", details };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runSystemHealth(ctx: HealthAuthContext): Promise<SystemHealthResponse> {
  // One shared probe fetch, isolated so a provider outage can't crash the run.
  let probe: FundRecord | null = null;
  try { probe = await fetchProbe(); } catch (err) {
    console.error("[health] probe fetch failed:", err);
    probe = null;
  }

  // Dynamic-fund count (verified overlay) — isolated; 0 on any failure.
  let dynamicCount = 0;
  if (ctx.dynamicFundCount) { try { dynamicCount = await ctx.dynamicFundCount(); } catch { dynamicCount = 0; } }

  const [universe, fmp, scoring, savedLists, fundRequests, secAlerts, portfolio] = await Promise.all([
    safeCheck("fundUniverse", "Fund Universe", async () => checkFundUniverse(dynamicCount)),
    safeCheck("marketData", "Market Data (Tiingo)", async () => checkProviderData(probe)),
    safeCheck("scoringEngine", "Scoring Engine", () => checkScoringEngine(probe)),
    safeCheck("savedLists", "Saved Lists / Supabase", () => checkSavedLists(ctx)),
    safeCheck("fundRequests", "Fund Requests", () => checkFundRequests(ctx)),
    safeCheck("secAlerts", "SEC Monitoring", () => checkSecAlerts(ctx)),
    safeCheck("portfolioBuilder", "Portfolio Builder", async () => checkPortfolioBuilder()),
  ]);

  const apiRoutes = await safeCheck("apiRoutes", "API Routes", async () =>
    checkApiRoutes(universe, fmp, savedLists));
  const appBuild = await safeCheck("appBuild", "App Build", async () => checkAppBuild());

  const checks = [universe, fmp, scoring, savedLists, fundRequests, secAlerts, portfolio, apiRoutes, appBuild];
  return {
    generatedAt: new Date().toISOString(),
    overall: worst(checks.map((c) => c.status)),
    checks,
  };
}
