/**
 * Merged fund universe — SERVER ONLY.
 *
 * The static `UNIVERSE` (src/lib/universe.ts) stays the synchronous base used by
 * client components and every existing import. This module adds the runtime
 * overlay: static base + VERIFIED dynamic funds (Supabase), merged server-side.
 *
 * Duplicate tickers prefer the static base record (the curated, validated one).
 * Reads use the cookie-session client so RLS applies; signed-out callers simply
 * get the static base (the dynamic query returns nothing), never an error.
 */
import { UNIVERSE, type UniverseFund } from "./universe";
import { createServerClient } from "./supabase";
import { dynamicFundsListVerified, dynamicFundByTicker, dynamicFundCount, type DynamicFundRow } from "./db";

type Supa = Awaited<ReturnType<typeof createServerClient>>;

/** Map a stored dynamic fund into the UniverseFund shape the app consumes. */
export function dynamicRowToUniverseFund(r: DynamicFundRow): UniverseFund {
  const bench = (r.benchmark === "AGG" || r.benchmark === "VXUS") ? r.benchmark : "SPY";
  return {
    ticker: r.normalized_ticker,
    name: r.fund_name,
    vehicle: r.vehicle ?? "ETF",
    category: r.category ?? r.primary_category ?? "Other",
    benchmark: bench,
    fund_name: r.fund_name,
    issuer: null,
    fund_type: r.vehicle ?? "ETF",
    asset_class: r.asset_class ?? "Other",
    primary_category: r.primary_category ?? "Other",
    region: r.region ?? "US",
    market_cap: r.market_cap,
    style: r.style,
    style_box: r.style_box,
    management_style: r.management_style ?? "Passive",
    portfolio_role: r.portfolio_role ?? "Satellite",
    investment_focus: r.investment_focus ?? "Broad Market",
    benchmark_category: r.benchmark_category ?? "US Large Cap",
    verified: true,
    source: "dynamic",
  };
}

async function client(sb?: Supa): Promise<Supa | null> {
  if (sb) return sb;
  try { return await createServerClient(); } catch { return null; }
}

/** Verified dynamic funds only (empty on any failure — never throws to callers). */
export async function getDynamicUniverse(sb?: Supa): Promise<UniverseFund[]> {
  const c = await client(sb);
  if (!c) return [];
  try {
    const rows = await dynamicFundsListVerified(c);
    return rows.map(dynamicRowToUniverseFund);
  } catch { return []; }
}

/** Static base + verified dynamic overlay (static wins on duplicate ticker). */
export async function getMergedUniverse(sb?: Supa): Promise<UniverseFund[]> {
  const dyn = await getDynamicUniverse(sb);
  if (dyn.length === 0) return UNIVERSE;
  const staticTickers = new Set(UNIVERSE.map((f) => f.ticker));
  const extra = dyn.filter((f) => !staticTickers.has(f.ticker));
  return extra.length ? [...UNIVERSE, ...extra] : UNIVERSE;
}

/** Static / dynamic / merged counts for Expansion + Health (dynamic count is a
    cheap COUNT, so this never pulls the full dynamic set just to size it). */
export async function getUniverseCounts(sb?: Supa): Promise<{ static: number; dynamic: number; merged: number }> {
  const c = await client(sb);
  let dynamic = 0;
  if (c) { try { dynamic = await dynamicFundCount(c); } catch { dynamic = 0; } }
  return { static: UNIVERSE.length, dynamic, merged: UNIVERSE.length + dynamic };
}

/** Find a fund in the merged universe — static first, then verified dynamic. */
export async function findMergedFund(ticker: string, sb?: Supa): Promise<UniverseFund | undefined> {
  const t = ticker.toUpperCase();
  const staticHit = UNIVERSE.find((f) => f.ticker === t);
  if (staticHit) return staticHit;
  const c = await client(sb);
  if (!c) return undefined;
  try {
    const row = await dynamicFundByTicker(c, t);
    return row && row.verified ? dynamicRowToUniverseFund(row) : undefined;
  } catch { return undefined; }
}
