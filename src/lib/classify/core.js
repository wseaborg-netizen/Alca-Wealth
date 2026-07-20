/**
 * Fund classifier — CORE RULES (single source of truth).
 *
 * Plain CommonJS (no fs, no network, no Node-only deps) so BOTH the offline
 * pipeline (`scripts/classify-funds.mjs`, run under `node` — ESM importing this
 * CJS module via interop) and the runtime Expansion Hub (TypeScript, via
 * `src/lib/classify/index.ts`) import the exact same rules. Typed by core.d.ts.
 * Do NOT fork these rules or write a second/weaker classifier.
 *
 * classify(fund) → { confidence: "high", fields } for a confident match,
 *                  or { reason, suggestion? } when the fund should go to review.
 * validateFields(fields, taxonomy) → string[] of taxonomy violations (empty = ok).
 */

const has = (n, ...subs) => subs.some((s) => n.includes(s));

// Management style (taxonomy: Active | Passive | Index | Enhanced Index).
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

  // ── Known named funds ──
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
    [["targeted value"], equityFields("Small", "Value", "US", "US Small Value", "US Small Cap", "Value")],
    [["selected value"], equityFields("Mid", "Value", "US", "US Mid Value", "US Mid Cap", "Value")],
    [["new horizons"], equityFields("Small", "Growth", "US", "US Small Growth", "US Small Cap", "Growth")],
    [["baron growth"], equityFields("Mid", "Growth", "US", "US Mid Growth", "US Mid Cap", "Growth")],
  ];
  for (const [subs, fields] of KNOWN) if (has(n, ...subs)) return { confidence: "high", fields };

  // ── Cash / money market ──
  if (has(n, "money market", "cash reserves", "treasury cash", "government cash"))
    return { confidence: "high", fields: { asset_class: "Cash", primary_category: "Money Market", region: "US", market_cap: null, style: null, style_box: null, management_style: mgmt, portfolio_role: "Defensive", investment_focus: "Money Market", benchmark_category: "Cash / Money Market" } };

  // ── Fixed income ──
  if (has(n, "tips", "inflation-protected", "inflation protected"))
    return { confidence: "high", fields: bondFields(has(n, "short") ? "Short-Term Inflation-Protected Bond" : "Inflation-Protected Bond", "Inflation-Protected") };
  if (has(n, "municipal", "muni ", "tax-exempt", "tax exempt"))
    return { confidence: "high", fields: bondFields("Municipal Bond", "Municipal Bond") };
  if (has(n, "t-bill", "t bill", "treasury bill", "1-3 month", "0-3 month"))
    return { confidence: "high", fields: bondFields("Government Bond", "US Treasury", "Defensive") };
  if (has(n, "treasury", "government bond", "gnma", "u.s. government", "government income", "government securities"))
    return { confidence: "high", fields: bondFields("Government Bond", "US Treasury") };
  if (has(n, "mortgage-backed", "mortgage backed", "cmbs") || /\bmbs\b/.test(n))
    return { confidence: "high", fields: bondFields("Government Bond", "US Aggregate Bond") };
  if (has(n, "aaa clo"))
    return { confidence: "high", fields: bondFields("Short-Term Bond", "US Aggregate Bond", "Defensive") };
  if (has(n, "ultra-short", "ultra short", "ultrashort", "short maturity", "enhanced short"))
    return { confidence: "high", fields: bondFields("Short-Term Bond", "US Aggregate Bond", "Defensive") };
  if (has(n, "conservative income", "short-term investment", "short term investment", "1-5 year", "1-5yr", "1-3 year", "limited duration", "limited-term")
      || (has(n, "short-term", "short term", "short duration", "low duration", "limited term") && has(n, "bond", "income", "fixed", "investment")))
    return { confidence: "high", fields: bondFields("Short-Term Bond", "US Aggregate Bond") };
  if (has(n, "fallen angel"))
    return { confidence: "high", fields: bondFields("High Yield Bond", "High Yield Bond") };
  if (has(n, "high yield", "high-yield"))
    return { confidence: "high", fields: bondFields("High Yield Bond", "High Yield Bond") };
  if (has(n, "bank loan", "senior loan", "floating rate", "leveraged loan"))
    return { confidence: "high", fields: bondFields("Bank Loan", "High Yield Bond") };
  if (has(n, "corporate bond", "investment grade"))
    return { confidence: "high", fields: bondFields("Corporate Bond", "US Corporate Bond") };
  if (has(n, "core plus", "core-plus", "total return bond", "total return bd", "total return fund"))
    return { confidence: "high", fields: bondFields("Intermediate Core-Plus Bond", "US Aggregate Bond") };
  if (has(n, "world bond", "global bond", "international bond", "global fixed"))
    return { confidence: "high", fields: bondFields("World Bond", "US Aggregate Bond") };
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

  // ── Allocation / balanced / target date ──
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

  if (has(n, "total stock market", "total u.s. stock", "total us stock", "broad market", "total equity", "composite stock", "s&p 1500", "1500 composite")
      || (has(n, "u.s. equity", "us equity") && !styleOf(n)))
    return { confidence: "high", fields: equityFields("Large", "Blend", "US", "US Large Blend", "US Large Cap", "Broad Market") };
  if (has(n, "nasdaq 100", "nasdaq-100", "nasdaq100", "qqq trust"))
    return { confidence: "high", fields: equityFields("Large", "Growth", "US", "US Large Growth", "US Large Cap", "Growth") };
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
  if (style) {
    if (has(n, "index", "etf"))
      return { confidence: "high", fields: equityFields("Large", style, "US", `US Large ${style}`, "US Large Cap", style) };
    return { reason: `US-equity ${style} detected but market cap not determinable from the name`,
      suggestion: equityFields("Large", style, "US", `US Large ${style}`, "US Large Cap", style) };
  }
  return { reason: "no classification rule matched the fund name" };
}

/** Taxonomy fields that must be one of the controlled enum values. */
const ENUM_FIELDS = ["asset_class", "primary_category", "region", "management_style", "portfolio_role", "investment_focus", "benchmark_category"];
/** Fields that may be null but, when present, must be a controlled value. */
const NULLABLE_FIELDS = ["market_cap", "style", "style_box"];

/** Returns the list of taxonomy violations for a classified `fields` object
    (empty array = every value is a controlled taxonomy value). */
function validateFields(fields, taxonomy) {
  const bad = [];
  if (!taxonomy) return bad;
  for (const k of ENUM_FIELDS) if (!(taxonomy[k] ?? []).includes(fields[k])) bad.push(k);
  for (const k of NULLABLE_FIELDS) if (fields[k] != null && !(taxonomy[k] ?? []).includes(fields[k])) bad.push(k);
  return bad;
}

module.exports = { classify, validateFields, mgmtStyle, styleOf, capOf, ENUM_FIELDS, NULLABLE_FIELDS };
