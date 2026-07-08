/**
 * Portfolio construction + asset-location engine (pure functions).
 *
 * 1. targetSleeves(client)  -> asset-class sleeves with weights + a recommended
 *    fund for each (ETF or mutual-fund variant), driven by risk / horizon / age /
 *    goal.
 * 2. placeAssets(client, sleeves) -> which fund goes in which account, using the
 *    standard asset-location rules:
 *      - tax-inefficient (bonds, TIPS)  -> Traditional / tax-deferred
 *      - highest-growth (equity)        -> Roth (tax-free growth)
 *      - tax-efficient (index equity)   -> Taxable
 *    Plus a muni swap for taxable bonds when the client is in a high bracket.
 */
import type { Client, AccountType } from "./client";
import { ACCOUNT_LABELS } from "./client";

// "Both" = no vehicle constraint: seed with the ETF share class, but the
// data-driven selector may pick either an ETF or a mutual fund per sleeve.
export type Vehicle = "ETF" | "Mutual Fund" | "Both";
export type TaxClass = "efficient" | "neutral" | "inefficient";

export interface FundPick {
  ticker: string;
  name: string;
  vehicle: string;
}

interface FundSpec {
  etf: FundPick;
  mf: FundPick;
  taxClass: TaxClass;
  growth: number;        // 0..1 relative growth potential (Roth priority)
  muniEtf?: FundPick;
  muniMf?: FundPick;
}

// Curated low-cost core funds per sleeve (ETF + mutual-fund equivalents).
const FUNDS: Record<string, FundSpec> = {
  usEquity: {
    etf: { ticker: "VTI", name: "Vanguard Total Stock Market ETF", vehicle: "ETF" },
    mf:  { ticker: "VTSAX", name: "Vanguard Total Stock Market Index Admiral", vehicle: "Mutual Fund" },
    taxClass: "efficient", growth: 0.95,
  },
  usSmid: {
    etf: { ticker: "VB", name: "Vanguard Small-Cap ETF", vehicle: "ETF" },
    mf:  { ticker: "VSMAX", name: "Vanguard Small-Cap Index Admiral", vehicle: "Mutual Fund" },
    taxClass: "efficient", growth: 1.0,
  },
  intl: {
    etf: { ticker: "VEA", name: "Vanguard FTSE Developed Markets ETF", vehicle: "ETF" },
    mf:  { ticker: "VTMGX", name: "Vanguard Developed Markets Index Admiral", vehicle: "Mutual Fund" },
    taxClass: "efficient", growth: 0.8,
  },
  emerging: {
    etf: { ticker: "VWO", name: "Vanguard FTSE Emerging Markets ETF", vehicle: "ETF" },
    mf:  { ticker: "VEMAX", name: "Vanguard Emerging Markets Stock Index Admiral", vehicle: "Mutual Fund" },
    taxClass: "neutral", growth: 1.0,
  },
  coreBond: {
    etf: { ticker: "BND", name: "Vanguard Total Bond Market ETF", vehicle: "ETF" },
    mf:  { ticker: "VBTLX", name: "Vanguard Total Bond Market Index Admiral", vehicle: "Mutual Fund" },
    taxClass: "inefficient", growth: 0.2,
    muniEtf: { ticker: "VTEB", name: "Vanguard Tax-Exempt Bond ETF", vehicle: "ETF" },
    muniMf:  { ticker: "VWIUX", name: "Vanguard Interm-Term Tax-Exempt Admiral", vehicle: "Mutual Fund" },
  },
  shortBond: {
    etf: { ticker: "BSV", name: "Vanguard Short-Term Bond ETF", vehicle: "ETF" },
    mf:  { ticker: "VBIRX", name: "Vanguard Short-Term Bond Index Admiral", vehicle: "Mutual Fund" },
    taxClass: "inefficient", growth: 0.15,
  },
  tips: {
    etf: { ticker: "VTIP", name: "Vanguard Short-Term Inflation-Protected Securities ETF", vehicle: "ETF" },
    mf:  { ticker: "VTAPX", name: "Vanguard Short-Term Infl-Prot Sec Idx Admiral", vehicle: "Mutual Fund" },
    taxClass: "inefficient", growth: 0.15,
  },
};

const CASH_FUND: FundPick = { ticker: "SGOV", name: "iShares 0-3 Month Treasury Bond ETF", vehicle: "ETF" };

export interface Sleeve {
  key: string;
  label: string;
  assetClass: "equity" | "fixed" | "cash";
  category: string;   // universe category this sleeve screens within
  taxClass: TaxClass;
  growth: number;
  weight: number;     // 0..1 of total portfolio
  fund: FundPick;
  reason?: string;    // why this fund was selected (filled by data-driven selection)
}

// Which universe category each sleeve screens within (for data-driven selection).
const SLEEVE_CATEGORY: Record<string, string> = {
  us: "US Equity Large Blend", smid: "US Equity Small Blend", intl: "International Equity",
  em: "Emerging Markets", core: "Intermediate Core Bond", short: "Short-Term Bond",
  tips: "Inflation-Protected Bond", cash: "Ultrashort Bond",
};

/** Linear-interpolate a continuous risk value (1-5) through named control points. */
function lerpTable(risk: number, points: [number, number][]): number {
  const r = Math.max(points[0][0], Math.min(points[points.length - 1][0], risk));
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    if (r >= x0 && r <= x1) return x1 === x0 ? y0 : y0 + (y1 - y0) * (r - x0) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

/** Equity fraction from risk, adjusted for horizon, age and goal. */
export function equityFraction(client: Client): number {
  let eq = lerpTable(client.risk, [[1, 0.30], [2, 0.45], [3, 0.60], [4, 0.75], [5, 0.88]]);
  const h = client.horizonYears;
  if (h != null) {
    if (h < 5) eq -= 0.15;
    else if (h <= 10) eq -= 0.05;
    else if (h > 20) eq += 0.05;
  }
  const age = client.age;
  if (age != null) {
    if (age >= 75) eq -= 0.15;
    else if (age >= 65) eq -= 0.10;
  }
  if (client.goal === "income") eq -= 0.06;
  else if (client.goal === "growth") eq += 0.06;
  return Math.max(0.15, Math.min(0.92, eq));
}

// opts.intlShare (0-1) is an optional advisor override for the TOTAL international
// weight of the equity sleeve (developed + emerging). Omitting it reproduces the
// original allocation exactly - existing callers are unaffected.
export function targetSleeves(client: Client, vehicle: Vehicle, opts?: { intlShare?: number }): Sleeve[] {
  const eq = equityFraction(client);
  const cash = lerpTable(client.risk, [[1, 0.05], [2, 0]]);
  const bond = Math.max(0, 1 - eq - cash);
  const pick = (k: string): FundPick => (vehicle === "Mutual Fund" ? FUNDS[k].mf : FUNDS[k].etf);

  const sleeves: Sleeve[] = [];
  const add = (key: string, label: string, assetClass: Sleeve["assetClass"], fundKey: string, weight: number) => {
    if (weight <= 0.001) return;
    const f = FUNDS[fundKey];
    sleeves.push({ key, label, assetClass, category: SLEEVE_CATEGORY[key] ?? "US Equity Large Blend",
      taxClass: f.taxClass, growth: f.growth, weight, fund: pick(fundKey) });
  };

  // ── Equity split ── (ramps smoothly between risk 2-3 and 3-4 rather than snapping)
  const emergingBase = lerpTable(client.risk, [[2, 0], [3, 0.12]]);
  const intlDevBase = 0.26;
  const intlTotalDefault = intlDevBase + emergingBase;
  // Advisor override rescales developed + emerging proportionally to hit the target total intl weight.
  const intlTotal = opts?.intlShare != null ? Math.max(0, Math.min(0.9, opts.intlShare)) : intlTotalDefault;
  const emergingShare = intlTotalDefault > 0 ? intlTotal * (emergingBase / intlTotalDefault) : 0;
  const intlShare = intlTotal - emergingShare;
  const usShare = 1 - intlShare - emergingShare;
  const smidShare = lerpTable(client.risk, [[3, 0], [4, 0.20]]); // small/mid tilt for aggressive
  add("us", "US Equity", "equity", "usEquity", eq * usShare * (1 - smidShare));
  add("smid", "US Small / Mid Cap", "equity", "usSmid", eq * usShare * smidShare);
  add("intl", "International Developed", "equity", "intl", eq * intlShare);
  add("em", "Emerging Markets", "equity", "emerging", eq * emergingShare);

  // ── Fixed income split ──
  const core = lerpTable(client.risk, [[1, 0.50], [2, 0.50], [3, 0.70], [4, 0.85], [5, 0.85]]);
  const short = lerpTable(client.risk, [[1, 0.35], [2, 0.35], [3, 0.15], [4, 0], [5, 0]]);
  const tips = 0.15;
  add("core", "Core Bond", "fixed", "coreBond", bond * core);
  add("short", "Short-Term Bond", "fixed", "shortBond", bond * short);
  add("tips", "Inflation-Protected (TIPS)", "fixed", "tips", bond * tips);

  // ── Cash ──
  if (cash > 0) {
    sleeves.push({ key: "cash", label: "Cash / Money Market", assetClass: "cash", category: SLEEVE_CATEGORY.cash,
      taxClass: "efficient", growth: 0, weight: cash, fund: CASH_FUND });
  }

  // Normalize to sum to 1 (guard rounding)
  const tot = sleeves.reduce((s, x) => s + x.weight, 0) || 1;
  return sleeves.map((s) => ({ ...s, weight: s.weight / tot }));
}

export interface PlacedLot {
  ticker: string;
  name: string;
  label: string;      // sleeve label
  amount: number;
  taxClass: TaxClass;
  note?: string;
}

export interface AccountPlan {
  type: AccountType;
  label: string;
  balance: number;
  lots: PlacedLot[];
}

export interface PlacementResult {
  plans: AccountPlan[];
  insights: string[];
}

/** Place the sleeves into the client's accounts per asset-location rules. */
export function placeAssets(client: Client, sleeves: Sleeve[], vehicle: Vehicle): PlacementResult {
  const total = client.accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const insights: string[] = [];

  const plans: AccountPlan[] = client.accounts
    .filter((a) => a.balance > 0)
    .map((a) => ({ type: a.type, label: ACCOUNT_LABELS[a.type], balance: a.balance, lots: [] as PlacedLot[] }));

  if (total <= 0 || plans.length === 0) {
    return { plans, insights: ["Enter account balances to generate the asset-location plan."] };
  }

  const lots = sleeves.map((s) => ({ ...s, remaining: s.weight * total }));
  const capOf = (p: AccountPlan) => p.balance - p.lots.reduce((s, l) => s + l.amount, 0);
  const fill = (p: AccountPlan, order: typeof lots) => {
    for (const sl of order) {
      const c = capOf(p);
      if (c <= 0.5) break;
      if (sl.remaining <= 0.5) continue;
      const amt = Math.min(c, sl.remaining);
      p.lots.push({ ticker: sl.fund.ticker, name: sl.fund.name, label: sl.label, amount: amt, taxClass: sl.taxClass });
      sl.remaining -= amt;
    }
  };

  const rank: Record<TaxClass, number> = { inefficient: 0, neutral: 1, efficient: 2 };
  const trad = plans.find((p) => p.type === "traditional");
  const roth = plans.find((p) => p.type === "roth");
  const tax = plans.find((p) => p.type === "taxable");

  if (trad) fill(trad, [...lots].sort((a, b) => rank[a.taxClass] - rank[b.taxClass])); // inefficient first
  if (roth) fill(roth, [...lots].sort((a, b) => b.growth - a.growth));                 // growth first
  if (tax) fill(tax, [...lots].sort((a, b) => rank[b.taxClass] - rank[a.taxClass]));   // efficient first
  for (const p of plans) fill(p, lots); // sweep any remainder

  // Muni swap: taxable core bond -> municipal for high brackets
  const highBracket = (client.taxBracket ?? 0) >= 32;
  if (tax && highBracket) {
    // Use the actually-selected core-bond fund (data-driven selection may differ from the seed).
    const coreSleeve = sleeves.find((s) => s.key === "core");
    const coreTicker = coreSleeve?.fund.ticker ?? (vehicle === "Mutual Fund" ? FUNDS.coreBond.mf.ticker : FUNDS.coreBond.etf.ticker);
    const muni = vehicle === "Mutual Fund" ? FUNDS.coreBond.muniMf! : FUNDS.coreBond.muniEtf!;
    let swapped = false;
    tax.lots = tax.lots.map((l) => {
      if (l.ticker === coreTicker) {
        swapped = true;
        return { ...l, ticker: muni.ticker, name: muni.name,
          note: "Muni swap - tax-exempt income for a high-bracket taxable account." };
      }
      return l;
    });
    if (swapped) insights.push(`High bracket (${client.taxBracket}%): taxable core bond swapped to ${muni.ticker} (municipal, federally tax-exempt income).`);
  }

  if (trad && tax) insights.push("Tax-inefficient sleeves (bonds, TIPS) are placed in the Traditional / tax-deferred account; broad index equity sits in the Taxable account.");
  if (roth) insights.push("Highest-growth sleeves are placed in the Roth so future appreciation is tax-free.");
  if (!trad && !roth) insights.push("No tax-advantaged accounts entered - everything lands in Taxable. Add IRA/401(k) or Roth balances to enable asset location.");

  return { plans, insights };
}

/** Roll sleeves up into headline asset-class weights (for the allocation donut). */
export function assetClassMix(sleeves: Sleeve[]): { equity: number; fixed: number; cash: number } {
  const mix = { equity: 0, fixed: 0, cash: 0 };
  for (const s of sleeves) mix[s.assetClass] += s.weight;
  return mix;
}
