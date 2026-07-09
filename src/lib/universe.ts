/**
 * THE fund universe — the single source of funds for the whole app.
 *
 * Loads data/classified_universe.json (clean universe v1) and exposes only the
 * VERIFIED funds. The old data/universe.json is no longer used anywhere.
 *
 * Each fund is normalized to the shape the existing routes/UI consume
 * ({ ticker, name, vehicle, category, benchmark }) while carrying the full
 * classification through. `category` is mapped from the new precise
 * primary_category onto the legacy category vocabulary the screener and
 * portfolio sleeves still match on — a compatibility shim so this change swaps
 * only the DATA SOURCE, not the portfolio/screen logic (that migration is later).
 */
import raw from "@/../data/classified_universe.json";

export interface UniverseFund {
  // Normalized (what current consumers use)
  ticker: string;
  name: string;
  vehicle: string;            // ETF | Mutual Fund
  category: string;           // legacy-vocabulary category (compat)
  benchmark: string;          // SPY | AGG | VXUS
  // Full classification passthrough
  fund_name: string;
  issuer: string | null;
  fund_type: string;
  asset_class: string;
  primary_category: string;
  region: string;
  market_cap: string | null;
  style: string | null;
  style_box: string | null;
  management_style: string;
  portfolio_role: string;
  investment_focus: string;
  benchmark_category: string;
  verified: boolean;
  source: string;
}

type RawFund = Record<string, unknown> & {
  ticker: string; fund_name: string; fund_type: string;
  asset_class: string; primary_category: string; region: string; verified: boolean;
};

// New precise primary_category → legacy category vocabulary used by the screener
// style box and the portfolio sleeves (SLEEVE_CATEGORY in portfolioModel.ts).
const CATEGORY_MAP: Record<string, string> = {
  "US Large Blend": "US Equity Large Blend",
  "US Large Growth": "US Equity Large Growth",
  "US Large Value": "US Equity Large Value",
  "US Mid Blend": "US Equity Mid Blend",
  "US Mid Growth": "US Equity Mid Growth",
  "US Mid Value": "US Equity Mid Value",
  "US Small Blend": "US Equity Small Blend",
  "US Small Growth": "US Equity Small Growth",
  "US Small Value": "US Equity Small Value",
  "Foreign Large Blend": "International Equity",
  "Foreign Large Growth": "International Equity",
  "Foreign Large Value": "International Equity",
  "Foreign Small/Mid Blend": "International Equity",
  "Foreign Small/Mid Growth": "International Equity",
  "Foreign Small/Mid Value": "International Equity",
  "Diversified Emerging Markets": "Emerging Markets",
  "Global Large Stock": "World Large Stock Blend",
  "Intermediate Core Bond": "Intermediate Core Bond",
  "Intermediate Core-Plus Bond": "Intermediate Core Plus Bond",
  "Short-Term Bond": "Short-Term Bond",
  "Short-Term Inflation-Protected Bond": "Inflation-Protected Bond",
  "Inflation-Protected Bond": "Inflation-Protected Bond",
  "Government Bond": "Intermediate Government",
  "Corporate Bond": "Corporate Bond",
  "High Yield Bond": "High Yield Bond",
  "World Bond": "World Bond",
  "Municipal Bond": "Muni National Intermediate",
  "Real Estate": "Sector Real Estate",
  "Sector Equity": "Sector / Thematic",
  "Commodities Broad Basket": "Commodities",
  "Moderate Allocation": "Allocation 50-70% Equity",
  "Conservative Allocation": "Allocation 30-50% Equity",
  "Aggressive Allocation": "Allocation 85%+ Equity",
  "Target Date": "Target Date Retirement",
  "Money Market": "Cash / Money Market",
  "Alternative": "Sector / Thematic",
};

// One of the three benchmark tickers the KPI engine supports (SPY/AGG/VXUS).
function benchTicker(f: RawFund): "SPY" | "AGG" | "VXUS" {
  const ac = String(f.asset_class);
  const region = String(f.region);
  if (ac === "Fixed Income" || ac === "Cash") return "AGG";
  if (region === "International Developed" || region === "Emerging Markets") return "VXUS";
  return "SPY";
}

const rawFunds = ((raw as { funds?: RawFund[] }).funds ?? []);

/** Verified-only fund universe. Every consumer of fund identity uses this. */
export const UNIVERSE: UniverseFund[] = rawFunds
  .filter((f) => f.verified === true)
  .map((f) => ({
    ...(f as unknown as UniverseFund),
    ticker: String(f.ticker).toUpperCase(),
    name: String(f.fund_name),
    vehicle: String(f.fund_type),
    category: CATEGORY_MAP[String(f.primary_category)] ?? String(f.primary_category),
    benchmark: benchTicker(f),
  }));

/** Case-insensitive lookup within the verified universe. */
export function findFund(ticker: string): UniverseFund | undefined {
  const t = ticker.toUpperCase();
  return UNIVERSE.find((f) => f.ticker === t);
}

/** Ticker → display name (verified universe only). */
export const NAME_BY_TICKER: Map<string, string> = new Map(UNIVERSE.map((f) => [f.ticker, f.name]));
