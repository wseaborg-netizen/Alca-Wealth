#!/usr/bin/env node
/**
 * Fund universe refresh — regenerates data/universe.json from FMP, offline.
 *
 * Run:  node scripts/refresh-universe.mjs            (writes files)
 *       node scripts/refresh-universe.mjs --dry-run  (report only, no writes)
 *
 * Why offline: the app must never enumerate thousands of funds at runtime. This
 * script snapshots the universe to disk; the app then makes per-ticker API calls
 * only when a user actually selects/searches/analyzes a fund.
 *
 * ── FMP endpoints used ───────────────────────────────────────────────────────
 *   /stable/company-screener?isEtf=true    → ETFs
 *   /stable/company-screener?isFund=true   → mutual funds
 * Both return: symbol, companyName, exchange, exchangeShortName, marketCap,
 * sector, industry, isEtf, isFund, isActivelyTrading, country.
 * (There is no mutual-fund-list endpoint on Starter — the v3 one is legacy/403,
 * and /stable/etf-list returns symbol+name only, with no exchange or status.)
 *
 * ── Merge policy ─────────────────────────────────────────────────────────────
 * UNION, never replace. Existing curated entries always win on `category`,
 * `benchmark`, `name`, and `vehicle` — FMP does not supply Morningstar-style
 * categories, so hand-curated classification is never overwritten. Existing
 * tickers are kept even when absent from FMP (e.g. ACBAX), because the runtime
 * Tiingo fallback covers those. FMP only *adds* funds and *enriches* metadata
 * fields it owns (exchange, active, marketCap).
 *
 * Expense ratios live in src/data/fund-meta.json and are untouched by this
 * script — FMP Starter does not expose expense ratio at all.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UNIVERSE_PATH = join(ROOT, "data", "universe.json");
const LEGACY_PATH   = join(ROOT, "data", "universe.legacy.json");
const EXCLUDED_PATH = join(ROOT, "data", "universe-excluded.json");
const META_PATH     = join(ROOT, "src", "data", "fund-meta.json");

const DRY_RUN = process.argv.includes("--dry-run");

// ── Key resolution (env, then .env.local) ─────────────────────────────────────
function fmpKey() {
  if (process.env.FMP_API_KEY) return process.env.FMP_API_KEY;
  const envFile = join(ROOT, ".env.local");
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, "utf8").match(/^FMP_API_KEY=(.*)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("FMP_API_KEY not set (env or .env.local)");
}

// ── Classification ────────────────────────────────────────────────────────────
// FMP gives no fund category (sector/industry are always "Financial Services /
// Asset Management" for funds), so new funds are classified from their name into
// the EXISTING category vocabulary. Anything unmatched becomes "Other" rather
// than being force-fit into a real category.
const has = (s, ...w) => w.some((x) => s.includes(x));

function classify(rawName) {
  const n = rawName.toLowerCase();

  // Target date — bucket by the 4-digit year. Covers issuer brand names that
  // don't say "target": Fidelity "Freedom", BlackRock "LifePath", JPMorgan
  // "SmartRetirement", plus plain "Retirement 20xx".
  if (has(n, "target", "freedom", "lifepath", "smartretirement") || /retirement 20\d\d/.test(n)) {
    const y = n.match(/\b(20\d{2})\b/);
    if (y) {
      const yr = +y[1];
      if (yr <= 2025) return "Target Date 2021-2025";
      if (yr <= 2030) return "Target Date 2026-2030";
      if (yr <= 2035) return "Target Date 2031-2035";
      if (yr <= 2040) return "Target Date 2036-2040";
      if (yr <= 2045) return "Target Date 2041-2045";
      if (yr <= 2050) return "Target Date 2046-2050";
      return "Target Date 2056-2060";
    }
    return "Target Date Retirement"; // dated brand, no year → the in-retirement vintage
  }

  // Dividend / equity-income → large value (Morningstar's usual home). Guarded so
  // international/global dividend funds fall through to the intl branch below.
  if (has(n, "dividend", "equity income", "equity-income")
      && !has(n, "international", "global", "world", "emerging", "ex-us", "ex us", "eafe"))
    return "US Equity Large Value";

  // Alternatives / defined-outcome strategies — pulled out before the size/style
  // grid so names like "...Large Cap ... Event Driven" don't land in Large Blend.
  if (has(n, "event driven", "market neutral", "long/short", "long short", "absolute return",
    "managed futures", "merger arb", "defined outcome", "buffer", "hedged equity"))
    return "Sector / Thematic";

  // Fixed income (most specific first). bondish includes the debt-instrument
  // words that stand in for "bond": corporate, GNMA, mortgage, duration.
  const bondish = has(n, "bond", "fixed income", "aggregate", "debt", "credit", "treasury",
    "income fund", "corporate", "gnma", "mortgage", "duration", "securitized");
  if (has(n, "muni", "municipal")) return has(n, "high yield", "high-yield") ? "High Yield Muni" : "Muni National Intermediate";
  if (has(n, "inflation", "tips", "real return")) return "Inflation-Protected Bond";
  if (has(n, "convertible")) return "Convertible Bond";
  if (has(n, "bank loan", "senior loan", "floating rate", "leveraged loan")) return "Bank Loan";
  if (has(n, "preferred")) return "Preferred Stock";
  if (bondish && has(n, "emerging")) return "Emerging Markets Bond";
  if (bondish && has(n, "global", "world", "international")) return "World Bond";
  if (bondish && has(n, "high yield", "high-yield")) return "High Yield Bond";
  if (bondish && has(n, "ultra short", "ultrashort")) return "Ultrashort Bond";
  if (bondish && has(n, "short-term", "short term", "short duration", "low duration", "limited term")) return "Short-Term Bond";
  if (bondish && has(n, "multisector", "multi-sector")) return "Multisector Bond";
  if (bondish && has(n, "core plus")) return "Intermediate Core Plus Bond";
  if (bondish && has(n, "long") && has(n, "government", "treasury")) return "Long Government";
  if (bondish && has(n, "government", "treasury", "gnma", "mortgage")) return "Intermediate Government";
  if (bondish && has(n, "corporate", "investment grade")) return "Corporate Bond";
  if (bondish) return "Intermediate Core Bond";

  // Income / options overlay
  if (has(n, "covered call", "buywrite", "buy-write", "premium income", "option income")) return "Covered Call / Income";

  // Real assets
  if (has(n, "real estate", "reit")) return "Sector Real Estate";
  if (has(n, "commodit", "gold", "silver", "crude", "natural gas", "precious metal")) return "Commodities";

  // Sectors
  if (has(n, "technology", "semiconductor", "software", "internet")) return "Sector Technology";
  if (has(n, "energy", "oil")) return "Sector Energy";
  if (has(n, "health", "biotech", "pharma", "medical")) return "Sector Healthcare";
  if (has(n, "financial", "bank", "insurance")) return "Sector Financials";
  if (has(n, "industrial", "aerospace", "defense", "transport")) return "Sector Industrials";
  if (has(n, "material", "mining", "chemical")) return "Sector Materials";
  if (has(n, "utilit")) return "Sector Utilities";
  if (has(n, "consumer discretionary", "retail")) return "Sector Consumer Discretionary";
  if (has(n, "consumer staple")) return "Sector Consumer Staples";
  if (has(n, "communication", "telecom", "media")) return "Sector Communication Services";

  // Allocation
  if (has(n, "allocation", "balanced", "moderate growth", "conservative growth")) return "Allocation 50-70% Equity";

  // International equity
  if (has(n, "emerging")) return "Emerging Markets";
  if (has(n, "international small", "intl small")) return "International Small Cap";
  if (has(n, "world", "global")) return "World Large Stock Blend";
  if (has(n, "international", "ex-us", "ex us", "foreign", "europe", "pacific", "asia", "japan", "china", "india", "latin america", "eafe"))
    return "International Equity";

  // US equity by size + style
  const size = has(n, "small cap", "smallcap", "small-cap", " small ") ? "Small"
    : has(n, "mid cap", "midcap", "mid-cap", " mid ") ? "Mid"
    : has(n, "large cap", "largecap", "large-cap", "s&p 500", "500 index", "total stock", "total market", "large") ? "Large"
    : null;
  const style = has(n, "value") ? "Value" : has(n, "growth") ? "Growth" : has(n, "blend", "index", "core", "total") ? "Blend" : null;
  if (size && style) return `US Equity ${size} ${style}`;
  if (size) return `US Equity ${size} Blend`;
  if (style) return `US Equity Large ${style}`; // growth/value with no cap word → large (the common default)

  if (has(n, "thematic", "innovation", "disrupt")) return "Sector / Thematic";

  return "Other";
}

const BOND_CATS = new Set([
  "Intermediate Core Bond", "Intermediate Core Plus Bond", "Corporate Bond", "High Yield Bond",
  "Short-Term Bond", "Ultrashort Bond", "World Bond", "Emerging Markets Bond", "Multisector Bond",
  "Inflation-Protected Bond", "Intermediate Government", "Long Government", "Bank Loan",
  "Convertible Bond", "Muni National Intermediate", "High Yield Muni", "Preferred Stock",
]);
const INTL_CATS = new Set([
  "International Equity", "Emerging Markets", "World Large Stock Blend", "International Small Cap",
]);

function benchmarkFor(category) {
  if (BOND_CATS.has(category)) return "AGG";
  if (INTL_CATS.has(category)) return "VXUS";
  return "SPY";
}

// ── Issuer / family (FMP doesn't supply it; derive only from known brands) ─────
const FAMILIES = [
  "Vanguard", "Fidelity", "iShares", "SPDR", "Schwab", "Invesco", "American Funds", "T. Rowe Price",
  "JPMorgan", "BlackRock", "PIMCO", "Franklin", "Dimensional", "First Trust", "ProShares",
  "Direxion", "VanEck", "WisdomTree", "Global X", "Janus Henderson", "Columbia", "Nuveen",
  "MFS", "John Hancock", "Putnam", "Lord Abbett", "Goldman Sachs", "Morgan Stanley", "Hartford",
  "Principal", "Northern", "TIAA", "Voya", "AllianceBernstein", "Federated", "Eaton Vance",
  "Neuberger Berman", "Delaware", "Pacer", "Amplify", "Roundhill", "Innovator", "Alger", "Calamos",
];
function familyFor(name) {
  return FAMILIES.find((f) => name.toLowerCase().startsWith(f.toLowerCase())) ?? null;
}

// ── Quality filters ───────────────────────────────────────────────────────────
const US_EXCHANGES = new Set(["NASDAQ", "NYSE", "AMEX"]);
const SYMBOL_RE = /^[A-Z]{1,6}$/; // our data endpoints break on dots/dashes/carets

/**
 * Leveraged / inverse / single-stock / ETN products (TQQQ, SQQQ, SOXL, UPRO,
 * NVDL, 3X Bull/Bear, FNGU…). These are short-horizon trading vehicles, not
 * portfolio building blocks — an advisor's Discover/Replace/Recommend universe
 * must never surface them as fund candidates. Excluded by name pattern.
 *
 * The "short" rule is deliberately narrow so real products survive:
 * "Short-Term Bond", "Enhanced Short Maturity", "Ultrashort", "Long/Short Equity".
 */
function isLeveragedOrInverse(name) {
  const n = name.toLowerCase();
  if (/\b\d+(\.\d+)?x\b/.test(n)) return true;          // 2x, 3x, 1.5x
  if (/\bultra(pro)?\b/.test(n)) return true;           // Ultra / UltraPro
  if (/\bbull\b|\bbear\b/.test(n)) return true;         // Daily … Bull/Bear
  if (/\binverse\b|\bleverage/.test(n)) return true;    // inverse / leveraged / Leverage Shares
  if (/\betns?\b/.test(n)) return true;                 // exchange-traded notes
  if (/\btradr\b/.test(n)) return true;
  if (/\bshort\b/.test(n) && !/short[- ]term|short duration|short maturity|ultrashort|ultra short|long\s*\/?\s*short/.test(n)) return true;
  return false;
}

/** Returns an exclusion reason, or null if the record is usable. */
function exclusionReason(rec) {
  if (!rec.symbol || !rec.symbol.trim()) return "missing_ticker";
  if (!SYMBOL_RE.test(rec.symbol)) return "unusable_symbol";
  if (!rec.companyName || !rec.companyName.trim()) return "blank_name";
  if (!US_EXCHANGES.has(rec.exchangeShortName)) return "non_us_exchange";
  if (rec.isActivelyTrading === false) return "inactive";
  if (isLeveragedOrInverse(rec.companyName)) return "leveraged_inverse";
  return null;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function screener(key, param) {
  const url = `https://financialmodelingprep.com/stable/company-screener?${param}=true&limit=100000&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`screener ${param} → HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error(`screener ${param} → ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const key = fmpKey();

  const existing = JSON.parse(readFileSync(UNIVERSE_PATH, "utf8"));
  const meta = JSON.parse(readFileSync(META_PATH, "utf8"));
  const metaTickers = new Set(Object.keys(meta).filter((k) => !k.startsWith("_")));

  console.log("Fetching FMP screener (ETFs + mutual funds)…");
  const [etfs, funds] = await Promise.all([screener(key, "isEtf"), screener(key, "isFund")]);
  console.log(`  FMP: ${etfs.length} ETFs, ${funds.length} mutual funds`);

  const excluded = [];
  const byTicker = new Map();

  // 1. Existing curated entries seed the map and always win on curated fields.
  for (const e of existing) {
    byTicker.set(e.ticker, { ...e, source: e.source ?? "curated" });
  }
  const existingCount = byTicker.size;

  // 2. Layer FMP records on top: add new, enrich existing (never overwrite curated).
  let added = 0, enriched = 0;
  const consider = [
    ...etfs.map((r) => ({ ...r, vehicle: "ETF" })),
    ...funds.map((r) => ({ ...r, vehicle: "Mutual Fund" })),
  ];

  for (const rec of consider) {
    const reason = exclusionReason(rec);
    if (reason) {
      // Never exclude a ticker we already curate — keep it, just don't enrich.
      if (!byTicker.has(rec.symbol)) {
        excluded.push({ ticker: rec.symbol ?? null, name: rec.companyName ?? null, vehicle: rec.vehicle, exchange: rec.exchangeShortName ?? null, reason });
      }
      continue;
    }

    const prior = byTicker.get(rec.symbol);
    if (prior) {
      // Enrich FMP-owned fields. Curated classification is never touched — but
      // entries WE auto-classified (source "FMP") are re-run through the current
      // classifier, so improvements to the rules take effect on regeneration
      // instead of the first run's categories being frozen forever.
      const reclass = prior.source === "FMP";
      const category = reclass ? classify(rec.companyName) : prior.category;
      byTicker.set(rec.symbol, {
        ...prior,
        category,
        benchmark: reclass ? benchmarkFor(category) : prior.benchmark,
        exchange: rec.exchangeShortName,
        active: rec.isActivelyTrading !== false,
        source: prior.source === "curated" ? "curated+FMP" : prior.source,
        ...(prior.family ? {} : { family: familyFor(rec.companyName) ?? undefined }),
      });
      enriched++;
    } else {
      const category = classify(rec.companyName);
      byTicker.set(rec.symbol, {
        ticker: rec.symbol,
        name: rec.companyName.trim(),
        category,
        vehicle: rec.vehicle,
        benchmark: benchmarkFor(category),
        exchange: rec.exchangeShortName,
        active: rec.isActivelyTrading !== false,
        family: familyFor(rec.companyName) ?? undefined,
        source: "FMP",
      });
      added++;
    }
  }

  // 3. Deduplicate (Map already guarantees unique tickers) + final sanity sweep.
  const merged = [...byTicker.values()]
    .filter((u) => {
      if (!u.ticker || !u.name || !u.name.trim()) {
        excluded.push({ ticker: u.ticker ?? null, name: u.name ?? null, reason: "blank_after_merge" });
        return false;
      }
      return true;
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  // Strip undefined keys so the JSON stays clean.
  const clean = merged.map((u) => Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)));

  // ── Report ──────────────────────────────────────────────────────────────────
  const etfCount = clean.filter((u) => u.vehicle === "ETF").length;
  const mfCount  = clean.filter((u) => u.vehicle === "Mutual Fund").length;
  const otherCat = clean.filter((u) => u.category === "Other").length;
  const withMeta = clean.filter((u) => metaTickers.has(u.ticker)).length;
  const byReason = excluded.reduce((a, e) => ((a[e.reason] = (a[e.reason] ?? 0) + 1), a), {});

  console.log("\n── Universe refresh summary ──");
  console.log(`  old universe:      ${existingCount}`);
  console.log(`  new universe:      ${clean.length}   (+${clean.length - existingCount})`);
  console.log(`    ETFs:            ${etfCount}`);
  console.log(`    Mutual funds:    ${mfCount}`);
  console.log(`  added from FMP:    ${added}`);
  console.log(`  enriched existing: ${enriched}`);
  console.log(`  static ER coverage:${withMeta} tickers have fund-meta entries`);
  console.log(`  category "Other":  ${otherCat}`);
  console.log(`  excluded:          ${excluded.length}`, byReason);

  if (DRY_RUN) {
    console.log("\n--dry-run: no files written.");
    return;
  }

  // Back up the pre-refresh universe once, so a regeneration is always reversible.
  if (!existsSync(LEGACY_PATH)) {
    writeFileSync(LEGACY_PATH, JSON.stringify(existing, null, 2));
    console.log(`\n  backup written → ${LEGACY_PATH}`);
  }
  // universe.json is generated and shipped to the client via /api/universe —
  // write it compact (saves ~0.5MB over pretty-printing). The exclusion report
  // is for humans, so it stays readable.
  writeFileSync(UNIVERSE_PATH, JSON.stringify(clean));
  writeFileSync(EXCLUDED_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), byReason, records: excluded }, null, 2));
  console.log(`  universe written → ${UNIVERSE_PATH}`);
  console.log(`  exclusions       → ${EXCLUDED_PATH}`);
}

main().catch((e) => { console.error("refresh-universe failed:", e.message); process.exit(1); });
