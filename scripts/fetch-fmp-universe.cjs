/**
 * Fetch full ETF + Mutual Fund universe from FMP free tier.
 * Runs once to populate universe.json and fund-meta.json.
 * Uses only the /stable/etf/list and /stable/mutual-fund/list endpoints
 * which are available on the free plan.
 */
const fs   = require("fs");
const path = require("path");

const API_KEY      = "F4G49DwbZjVaAxJNchWVC3nRh8pMzrXq";
const UNIVERSE_PATH = path.join(__dirname, "..", "data", "universe.json");
const META_PATH     = path.join(__dirname, "..", "src", "data", "fund-meta.json");

const universe = JSON.parse(fs.readFileSync(UNIVERSE_PATH, "utf8"));
const meta     = JSON.parse(fs.readFileSync(META_PATH,     "utf8"));

const have = new Set(universe.map(u => u.ticker.toUpperCase()));

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function benchFor(category = "") {
  const c = category.toLowerCase();
  if (/bond|income|fixed|treasury|muni|tips|preferred|loan|duration|inflation/.test(c)) return "AGG";
  if (/international|emerging|world|global|foreign|china|japan|europe|pacific/.test(c))  return "VXUS";
  return "SPY";
}

function normalizeCategory(raw = "") {
  if (!raw) return "US Equity Large Blend";
  const r = raw.trim();
  // Pass through already-clean Morningstar-style categories
  if (r.length > 0) return r;
  return "US Equity Large Blend";
}

// ── Fetch with retry ─────────────────────────────────────────────────────────

async function fetchJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { console.log("  rate limit — waiting 10s"); await sleep(10000); continue; }
      if (!res.ok) { console.log(`  HTTP ${res.status} for ${url}`); return null; }
      return await res.json();
    } catch (e) {
      console.log(`  fetch error: ${e.message}`);
      if (i < retries - 1) await sleep(2000);
    }
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let added = 0;

  // ── 1. ETF list ─────────────────────────────────────────────────────────
  console.log("\nFetching ETF list from FMP...");
  const etfList = await fetchJSON(
    `https://financialmodelingprep.com/stable/etf/list?apikey=${API_KEY}`
  );

  if (etfList && Array.isArray(etfList)) {
    console.log(`  Got ${etfList.length} ETFs from FMP`);
    for (const etf of etfList) {
      const ticker = (etf.symbol || etf.ticker || "").toUpperCase().trim();
      if (!ticker || ticker.includes(".") || ticker.includes("-") || ticker.length > 6) continue;
      if (have.has(ticker)) continue;
      // Only US-listed ETFs (exchange filter)
      const exchange = (etf.exchange || etf.exchangeShortName || "").toUpperCase();
      if (!["NYSE", "NASDAQ", "AMEX", "NYSEARCA", "BATS", ""].includes(exchange) && exchange !== "") continue;

      const name     = etf.name || etf.companyName || ticker;
      const category = normalizeCategory(etf.assetClass || etf.sector || etf.category || "");
      const er       = parseFloat(etf.expenseRatio || etf.annualHoldingsTurnover || 0) || null;
      const aum      = parseFloat(etf.aum || etf.totalAssets || 0) || null;

      have.add(ticker);
      universe.push({ ticker, name, category, vehicle: "ETF", benchmark: benchFor(category) });
      if (er || aum) meta[ticker] = { er: er ?? 0, aum: aum ? aum / 1e9 : 0 };
      added++;
    }
    console.log(`  Added ${added} new ETFs`);
  } else {
    console.log("  ETF list fetch failed or returned unexpected format");
  }

  // ── 2. Mutual fund list ──────────────────────────────────────────────────
  console.log("\nFetching Mutual Fund list from FMP...");
  const mfList = await fetchJSON(
    `https://financialmodelingprep.com/stable/mutual-fund/list?apikey=${API_KEY}`
  );

  let mfAdded = 0;
  if (mfList && Array.isArray(mfList)) {
    console.log(`  Got ${mfList.length} mutual funds from FMP`);
    for (const mf of mfList) {
      const ticker = (mf.symbol || mf.ticker || "").toUpperCase().trim();
      if (!ticker || ticker.length > 6) continue;
      if (have.has(ticker)) continue;

      const name     = mf.name || mf.companyName || ticker;
      const category = normalizeCategory(mf.assetClass || mf.category || mf.sector || "");
      const er       = parseFloat(mf.expenseRatio || 0) || null;
      const aum      = parseFloat(mf.aum || mf.totalAssets || 0) || null;

      have.add(ticker);
      universe.push({ ticker, name, category, vehicle: "Mutual Fund", benchmark: benchFor(category) });
      if (er || aum) meta[ticker] = { er: er ?? 0, aum: aum ? aum / 1e9 : 0 };
      mfAdded++;
      added++;
    }
    console.log(`  Added ${mfAdded} new mutual funds`);
  } else {
    console.log("  Mutual fund list unavailable on free tier — ETFs only");
  }

  // ── 3. Save ──────────────────────────────────────────────────────────────
  universe.sort((a, b) => a.ticker.localeCompare(b.ticker));
  fs.writeFileSync(UNIVERSE_PATH, JSON.stringify(universe, null, 2) + "\n");
  fs.writeFileSync(META_PATH,     JSON.stringify(meta,     null, 2) + "\n");

  console.log(`\n✅ Done. Added ${added} new funds.`);
  console.log(`   Universe now: ${universe.length} total funds`);
  console.log(`   Meta entries: ${Object.keys(meta).length}`);

  // Category breakdown
  const cats = {};
  universe.forEach(f => { cats[f.category] = (cats[f.category]||0)+1; });
  console.log("\nTop categories:");
  Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,v])=>console.log(`  ${v}  ${k}`));
}

main().catch(console.error);
