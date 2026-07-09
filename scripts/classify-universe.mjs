#!/usr/bin/env node
/**
 * Rule-based classifier for the NEW FMP fund universe.
 *
 * Input : data/new_universe.json      ({ funds: [{ ticker, fund_name, issuer, fund_type }] })
 * Output: data/classified_universe.json    (high-confidence, verified: true)
 *         data/classification_review.json   (unclear — verified: false + reason)
 *
 * Rules only. No AI, no network calls, no guessing. If the fund name does not
 * clearly determine a category, the fund is sent to review with a reason and a
 * best-effort suggestion (never written as verified). The old universe file is
 * not read, merged, or modified.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IN = join(ROOT, "data", "new_universe.json");
const OUT_OK = join(ROOT, "data", "classified_universe.json");
const OUT_REVIEW = join(ROOT, "data", "classification_review.json");
const OVERRIDES = join(ROOT, "data", "classification_overrides.json");

const has = (n, ...subs) => subs.some((s) => n.includes(s));

// Management style (taxonomy: Active | Passive | Index | Enhanced Index):
//   Active         — explicitly actively managed
//   Enhanced Index — systematic / factor strategies with active tilts
//   Index          — explicitly tracks a named index
//   Passive        — passive (ETF) but not explicitly an index fund
function mgmtStyle(n, fund_type) {
  if (has(n, "actively managed", "active management", "active etf", "active exchange")) return "Active";
  if (has(n, "enhanced index", "strategic beta", "smart beta", "multifactor", "multi-factor", "factor",
           "fundamental index", "research affiliates", "rafi", "systematic", "dimensional", "avantis", "dfa "))
    return "Enhanced Index";
  if (has(n, "index", "s&p 500", "s&p", "russell", "msci", "nasdaq-100", "nasdaq 100", "dow jones",
           "ftse", "crsp", "bloomberg", "500 index", " idx"))
    return "Index";
  return fund_type === "ETF" ? "Passive" : "Active";
}

function styleOf(n) {
  if (has(n, "growth")) return "Growth";
  if (has(n, "value")) return "Value";
  return null;
}
function capOf(n) {
  if (has(n, "small cap", "small-cap", "smallcap", "russell 2000", "s&p 600")) return "Small";
  if (has(n, "mid cap", "mid-cap", "midcap", "s&p 400", "russell mid")) return "Mid";
  if (has(n, "large cap", "large-cap", "largecap", "s&p 500", "500 index", "russell 1000", "total stock", "total market", "mega cap", "mega-cap", "large company", "blue chip")) return "Large";
  return null;
}

/**
 * Returns { fields, confidence } for a confident classification,
 * or { reason, suggestion } when the fund should go to review.
 */
function classify(fund) {
  const n = (fund.fund_name || "").toLowerCase();
  const ft = fund.fund_type;
  const mgmt = mgmtStyle(n, ft);

  const bondFields = (primary, benchmark, role = "Income") => ({
    asset_class: "Fixed Income", primary_category: primary, region: has(n, "global", "world", "international") ? "Global" : "US",
    market_cap: null, style: null, style_box: null, management_style: mgmt,
    portfolio_role: role, investment_focus: "Bond", benchmark_category: benchmark,
  });
  const equityFields = (cap, style, region, primary, benchmark, focus) => ({
    asset_class: "Equity", primary_category: primary, region,
    market_cap: cap, style, style_box: cap && style ? `${cap} ${style}` : null, management_style: mgmt,
    portfolio_role: (cap === "Large" && style === "Blend" && region === "US") ? "Core" : "Satellite",
    investment_focus: focus, benchmark_category: benchmark,
  });
  const allocationFields = (primary, region) => ({
    asset_class: "Allocation", primary_category: primary, region, market_cap: null, style: null, style_box: null,
    management_style: mgmt, portfolio_role: "Core", investment_focus: "Multi-Asset", benchmark_category: primary,
  });

  // ── Known named funds (specific, well-documented Morningstar categories — the
  //    same specific-name approach as the Wellington/Wellesley rules) ──
  const KNOWN = [
    [["growth fund of america"], equityFields("Large", "Growth", "US", "US Large Growth", "US Large Cap", "Growth")],
    [["fundamental investors"], equityFields("Large", "Blend", "US", "US Large Blend", "US Large Cap", "Broad Market")],
    [["investment company of america", "invmt co of amer"], equityFields("Large", "Blend", "US", "US Large Blend", "US Large Cap", "Broad Market")],
    [["washington mutual"], equityFields("Large", "Value", "US", "US Large Value", "US Large Cap", "Value")],
    [["american mutual"], equityFields("Large", "Value", "US", "US Large Value", "US Large Cap", "Value")],
    [["amcap"], equityFields("Large", "Growth", "US", "US Large Growth", "US Large Cap", "Growth")],
    [["new perspective"], equityFields("Large", "Growth", "Global", "Global Large Stock", "Global Equity", "Growth")],
    [["europacific", "eupac"], equityFields("Large", "Growth", "International Developed", "Foreign Large Growth", "International Developed", "Growth")],
    [["contrafund"], equityFields("Large", "Growth", "US", "US Large Growth", "US Large Cap", "Growth")],
    [["growth company"], equityFields("Large", "Growth", "US", "US Large Growth", "US Large Cap", "Growth")],
    [["growth stock"], equityFields("Large", "Growth", "US", "US Large Growth", "US Large Cap", "Growth")],
    [["fidelity fund"], equityFields("Large", "Blend", "US", "US Large Blend", "US Large Cap", "Broad Market")],
    [["dodge & cox stock", "dodge and cox stock"], equityFields("Large", "Value", "US", "US Large Value", "US Large Cap", "Value")],
    [["dodge & cox income", "dodge and cox income"], bondFields("Intermediate Core Bond", "US Aggregate Bond")],
    [["pimco total return", "pimco income"], bondFields("Intermediate Core-Plus Bond", "US Aggregate Bond")],
    [["puritan"], allocationFields("Moderate Allocation", "US")],
    // Distinctive equity-fund name patterns whose cap/style aren't in generic words.
    [["targeted value"], equityFields("Small", "Value", "US", "US Small Value", "US Small Cap", "Value")],
    [["selected value"], equityFields("Mid", "Value", "US", "US Mid Value", "US Mid Cap", "Value")],
    [["new horizons"], equityFields("Small", "Growth", "US", "US Small Growth", "US Small Cap", "Growth")],
    [["baron growth"], equityFields("Mid", "Growth", "US", "US Mid Growth", "US Mid Cap", "Growth")],
  ];
  for (const [subs, fields] of KNOWN) if (has(n, ...subs)) return { confidence: "high", fields };

  // ── Cash / money market (BEFORE bonds: "government money market" must not fall into Government Bond) ──
  if (has(n, "money market", "cash reserves", "treasury cash", "government cash"))
    return { confidence: "high", fields: { asset_class: "Cash", primary_category: "Money Market", region: "US", market_cap: null, style: null, style_box: null, management_style: mgmt, portfolio_role: "Defensive", investment_focus: "Money Market", benchmark_category: "Cash / Money Market" } };

  // ── Fixed income (unambiguous keywords first) ──
  if (has(n, "tips", "inflation-protected", "inflation protected"))
    return { confidence: "high", fields: bondFields(has(n, "short") ? "Short-Term Inflation-Protected Bond" : "Inflation-Protected Bond", "Inflation-Protected") };
  if (has(n, "municipal", "muni ", "tax-exempt", "tax exempt"))
    return { confidence: "high", fields: bondFields("Municipal Bond", "Municipal Bond") };
  // Very-short government (T-Bills) — cash-like, defensive
  if (has(n, "t-bill", "t bill", "treasury bill", "1-3 month", "0-3 month"))
    return { confidence: "high", fields: bondFields("Government Bond", "US Treasury", "Defensive") };
  if (has(n, "treasury", "government bond", "gnma", "u.s. government", "government income", "government securities"))
    return { confidence: "high", fields: bondFields("Government Bond", "US Treasury") };
  // Ultra-short / short-maturity — defensive, cash-like short bonds (before corporate,
  // so "Short-Term Investment-Grade" lands in Short-Term rather than Corporate).
  if (has(n, "ultra-short", "ultra short", "ultrashort", "short maturity", "enhanced short"))
    return { confidence: "high", fields: bondFields("Short-Term Bond", "US Aggregate Bond", "Defensive") };
  if (has(n, "conservative income", "short-term investment", "short term investment", "1-5 year", "1-5yr", "1-3 year", "limited duration", "limited-term")
      || (has(n, "short-term", "short term", "short duration", "low duration", "limited term") && has(n, "bond", "income", "fixed", "investment")))
    return { confidence: "high", fields: bondFields("Short-Term Bond", "US Aggregate Bond") };
  if (has(n, "high yield", "high-yield") && has(n, "bond", "income", "credit"))
    return { confidence: "high", fields: bondFields("High Yield Bond", "High Yield Bond") };
  if (has(n, "bank loan", "senior loan", "floating rate", "leveraged loan"))
    return { confidence: "high", fields: bondFields("Bank Loan", "High Yield Bond") };
  if (has(n, "corporate bond", "investment grade"))
    return { confidence: "high", fields: bondFields("Corporate Bond", "US Corporate Bond") };
  if (has(n, "core plus", "core-plus", "total return bond", "total return bd", "total return fund"))
    return { confidence: "high", fields: bondFields("Intermediate Core-Plus Bond", "US Aggregate Bond") };
  if (has(n, "world bond", "global bond", "international bond", "global fixed"))
    return { confidence: "high", fields: bondFields("World Bond", "US Aggregate Bond") };
  // Long-Term Bond (duration Long / high credit) — reusable rule; no override for BLV/VBLAX.
  if (has(n, "long-term bond", "long term bond"))
    return { confidence: "high", fields: {
      asset_class: "Fixed Income", primary_category: "Long-Term Bond", region: "US",
      market_cap: "Not Applicable", style: "Not Applicable", style_box: "Not Applicable",
      management_style: has(n, "actively managed", "active management") ? "Active" : "Index",
      portfolio_role: "Income", investment_focus: "Bond", benchmark_category: "US Aggregate Bond",
    } };
  if (has(n, "total bond", "aggregate bond", "core bond", "bond fund", "fixed income", "intermediate bond", "bond index", "u.s. bond", "us bond"))
    return { confidence: "high", fields: bondFields("Intermediate Core Bond", "US Aggregate Bond") };

  // ── Real estate ──
  if (has(n, "real estate", "reit"))
    return { confidence: "high", fields: { asset_class: "Equity", primary_category: "Real Estate", region: has(n, "global", "international", "world") ? "Global" : "US", market_cap: null, style: null, style_box: null, management_style: mgmt, portfolio_role: "Diversifier", investment_focus: "Real Estate", benchmark_category: "Real Estate" } };

  // ── Commodities ──
  if (has(n, "commodit", "gold", "silver", "precious metal", "db commodity", "natural resources"))
    return { confidence: "high", fields: { asset_class: "Alternative", primary_category: "Commodities Broad Basket", region: "Global", market_cap: null, style: null, style_box: null, management_style: mgmt, portfolio_role: "Inflation Hedge", investment_focus: "Other", benchmark_category: "Commodities" } };

  // ── Allocation / balanced / target date (multi-asset) ──
  if (has(n, "target date", "target retirement", "retirement 20", "lifepath", "freedom 20"))
    return { confidence: "high", fields: { asset_class: "Allocation", primary_category: "Target Date", region: "Global", market_cap: null, style: null, style_box: null, management_style: mgmt, portfolio_role: "Core", investment_focus: "Multi-Asset", benchmark_category: "Moderate Allocation" } };
  if (has(n, "balanced", "allocation", "wellington", "wellesley", "income fund of america", "capital appreciation", "asset allocation")) {
    const tilt = has(n, "conservative", "income") ? "Conservative Allocation" : has(n, "aggressive", "growth") ? "Aggressive Allocation" : "Moderate Allocation";
    return { confidence: "high", fields: { asset_class: "Allocation", primary_category: tilt, region: has(n, "global", "international", "world") ? "Global" : "US", market_cap: null, style: null, style_box: null, management_style: mgmt, portfolio_role: "Core", investment_focus: "Multi-Asset", benchmark_category: tilt } };
  }

  // ── Sector equity ──
  const SECTORS = [["technology", "Technology"], ["semiconductor", "Technology"], ["software", "Technology"], ["health", "Healthcare"], ["biotech", "Healthcare"], ["pharma", "Healthcare"], ["financial", "Financials"], ["bank", "Financials"], ["energy", "Other"], ["utilit", "Other"], ["industrial", "Other"], ["material", "Other"], ["consumer", "Other"], ["communication", "Other"]];
  for (const [kw, focus] of SECTORS) {
    if (has(n, kw)) return { confidence: "high", fields: { asset_class: "Equity", primary_category: "Sector Equity", region: "US", market_cap: null, style: null, style_box: null, management_style: mgmt, portfolio_role: "Satellite", investment_focus: focus, benchmark_category: "US Large Cap" } };
  }

  // ── International / foreign equity ──
  if (has(n, "emerging market", "emerging markets"))
    return { confidence: "high", fields: { asset_class: "Equity", primary_category: "Diversified Emerging Markets", region: "Emerging Markets", market_cap: null, style: null, style_box: null, management_style: mgmt, portfolio_role: "Satellite", investment_focus: "Broad Market", benchmark_category: "Emerging Markets" } };
  if (has(n, "international", "developed", "eafe", "foreign", "overseas", "ex-us", "ex us", "non-us", "world ex", "europe", "pacific", "asia", "japan")) {
    const st = styleOf(n) ?? "Blend";
    const cap = has(n, "small", "mid") ? "Small/Mid" : "Large";
    const primary = cap === "Small/Mid" ? `Foreign Small/Mid ${st}` : `Foreign Large ${st}`;
    return { confidence: "high", fields: { asset_class: "Equity", primary_category: primary, region: "International Developed", market_cap: cap === "Large" ? "Large" : null, style: st, style_box: cap === "Large" ? `Large ${st}` : null, management_style: mgmt, portfolio_role: "Satellite", investment_focus: st === "Blend" ? "Broad Market" : st, benchmark_category: "International Developed" } };
  }
  if (has(n, "acwi", "all country world", "all-country world", "all world", "all-world", "all equity markets", "all-equity", "global", "world")) {
    const st = styleOf(n) ?? "Blend";
    return { confidence: "high", fields: equityFields("Large", st, "Global", "Global Large Stock", "Global Equity", st === "Blend" ? "Broad Market" : st) };
  }

  // ── US equity ──
  if (has(n, "dividend", "equity income", "equity-income"))
    return { confidence: "high", fields: equityFields("Large", "Value", "US", "US Large Value", "US Large Cap", "Dividend") };

  // Broad / total US market → Large Blend
  if (has(n, "total stock market", "total u.s. stock", "total us stock", "broad market", "total equity", "composite stock", "s&p 1500", "1500 composite")
      || (has(n, "u.s. equity", "us equity") && !styleOf(n)))
    return { confidence: "high", fields: equityFields("Large", "Blend", "US", "US Large Blend", "US Large Cap", "Broad Market") };
  // Nasdaq-100 → US Large Growth
  if (has(n, "nasdaq 100", "nasdaq-100", "nasdaq100", "qqq trust"))
    return { confidence: "high", fields: equityFields("Large", "Growth", "US", "US Large Growth", "US Large Cap", "Growth") };
  // MSCI USA / minimum-volatility factor → US Large Blend (defensive)
  if (has(n, "min vol", "minimum volatility", "msci usa")) {
    const f = equityFields("Large", "Blend", "US", "US Large Blend", "US Large Cap", "Broad Market"); f.portfolio_role = "Defensive";
    return { confidence: "high", fields: f };
  }

  const cap = capOf(n);
  const style = styleOf(n);
  if (cap) {
    const st = style ?? "Blend";
    return { confidence: "high", fields: equityFields(cap, st, "US", `US ${cap} ${st}`, `US ${cap} Cap`, st === "Blend" ? "Broad Market" : st) };
  }

  // ── Style known, cap not stated ──
  // Index / ETF style products track large-cap style indices by convention → classify.
  // Actively-managed funds with only a style word (cap genuinely unknown) → review, no guess.
  if (style) {
    if (has(n, "index", "etf"))
      return { confidence: "high", fields: equityFields("Large", style, "US", `US Large ${style}`, "US Large Cap", style) };
    return { reason: `US-equity ${style} detected but market cap not determinable from the name`,
      suggestion: equityFields("Large", style, "US", `US Large ${style}`, "US Large Cap", style) };
  }
  return { reason: "no classification rule matched the fund name" };
}

// ── Run ──
if (!existsSync(IN)) {
  console.error(`Input not found: data/new_universe.json — run \`npm run universe:new\` first.`);
  process.exit(1);
}
const input = JSON.parse(readFileSync(IN, "utf8"));
const funds = Array.isArray(input) ? input : (input.funds ?? []);

// ── Manual overrides ──────────────────────────────────────────────────────────
// If a ticker appears here, its classification is used verbatim instead of the
// rules. Accepts an array of records (each with a `ticker`) OR an object keyed by
// ticker. The 5 review funds are NOT hardcoded in this script — they live only in
// data/classification_overrides.json.
function loadOverrides() {
  const map = new Map();
  if (!existsSync(OVERRIDES)) return map;
  let raw;
  try { raw = JSON.parse(readFileSync(OVERRIDES, "utf8")); } catch (e) {
    console.error(`classification_overrides.json is not valid JSON: ${e.message}`); process.exit(1);
  }
  const records = Array.isArray(raw)
    ? raw
    : Object.entries(raw).map(([ticker, v]) => ({ ticker, ...v }));
  for (const rec of records) {
    if (!rec || !rec.ticker) continue;
    map.set(String(rec.ticker).toUpperCase(), rec);
  }
  return map;
}
const overrides = loadOverrides();
const usedOverrides = new Set();

const classified = [];
const review = [];
for (const f of funds) {
  const base = { ticker: f.ticker, fund_name: f.fund_name, issuer: f.issuer ?? null, fund_type: f.fund_type ?? null };
  const ov = overrides.get(String(f.ticker).toUpperCase());
  if (ov) {
    // Override wins over the rules. Keep the FMP identity as the base, overlay
    // the manual classification, and mark its provenance.
    usedOverrides.add(String(f.ticker).toUpperCase());
    classified.push({ ...base, ...ov, ticker: base.ticker, classification_confidence: "manual", verified: ov.verified ?? true, source: ov.source ?? "manual-override" });
    continue;
  }
  const r = classify(f);
  if (r.fields && r.confidence === "high") {
    classified.push({ ...base, ...r.fields, classification_confidence: "high", verified: true, source: "rule-based" });
  } else {
    review.push({ ...base, ...(r.suggestion ?? {}), classification_confidence: "low", verified: false, review_reason: r.reason });
  }
}

// Overrides for tickers not present in new_universe.json (e.g. funds FMP can't
// find) are still honored — appended so nothing you manually classify is lost.
for (const [ticker, ov] of overrides) {
  if (usedOverrides.has(ticker)) continue;
  classified.push({ ticker, ...ov, classification_confidence: "manual", verified: ov.verified ?? true, source: ov.source ?? "manual-override" });
}

writeFileSync(OUT_OK, JSON.stringify({ generatedAt: new Date().toISOString(), count: classified.length, funds: classified }, null, 2) + "\n");
writeFileSync(OUT_REVIEW, JSON.stringify({ generatedAt: new Date().toISOString(), count: review.length, funds: review }, null, 2) + "\n");

console.log(`Classified ${funds.length} funds${overrides.size ? ` (${overrides.size} manual override${overrides.size > 1 ? "s" : ""})` : ""}:`);
console.log(`  ✓ ${classified.length} verified → data/classified_universe.json`);
console.log(`  ? ${review.length} need review → data/classification_review.json`);
