/**
 * Pull all US ETFs from NASDAQ's public screener API (free, no key needed).
 * Adds every ETF not already in universe.json.
 */
const fs   = require("fs");
const path = require("path");

const UNIVERSE_PATH = path.join(__dirname, "..", "data", "universe.json");
const META_PATH     = path.join(__dirname, "..", "src", "data", "fund-meta.json");

const universe = JSON.parse(fs.readFileSync(UNIVERSE_PATH, "utf8"));
const meta     = JSON.parse(fs.readFileSync(META_PATH,     "utf8"));
const have     = new Set(universe.map(u => u.ticker.toUpperCase()));

// ── Category guesser from ETF name ───────────────────────────────────────────
function guessCategory(name = "") {
  const n = name.toLowerCase();
  // Bond / fixed income
  if (/treasury|t-bill|t-bond|government bond/.test(n))        return "Intermediate Government";
  if (/high.?yield|junk bond/.test(n))                          return "High Yield Bond";
  if (/muni|municipal|tax.?exempt/.test(n))                     return "Muni National Intermediate";
  if (/corp.*bond|bond.*corp|investment.?grade/.test(n))        return "Corporate Bond";
  if (/emerging.*bond|bond.*emerging|em.*debt/.test(n))         return "Emerging Markets Bond";
  if (/inflation|tips|i-bond/.test(n))                          return "Inflation-Protected Bond";
  if (/short.?term.*bond|ultra.?short|floating rate/.test(n))   return "Short-Term Bond";
  if (/bond|fixed.?income|income etf|debt/.test(n))             return "Intermediate Core Bond";
  // International equity
  if (/china|chinese/.test(n))                                  return "International Equity";
  if (/japan|japanese/.test(n))                                 return "International Equity";
  if (/europe|european|eurozone/.test(n))                       return "International Equity";
  if (/emerging market|em equity/.test(n))                      return "Emerging Markets";
  if (/international|global|world|foreign|eafe|intl/.test(n))  return "International Equity";
  // Sector
  if (/tech|software|semiconductor|ai |artificial intel/.test(n)) return "Sector Technology";
  if (/health|biotech|pharma|medical|genomic/.test(n))          return "Sector Healthcare";
  if (/energy|oil|gas|clean energy|solar|wind/.test(n))         return "Sector Energy";
  if (/financ|bank|insurance/.test(n))                          return "Sector Financials";
  if (/real estate|reit/.test(n))                               return "Sector Real Estate";
  if (/consumer disc|retail|e-commerce/.test(n))                return "Sector Consumer Discretionary";
  if (/consumer stap|food|beverage/.test(n))                    return "Sector Consumer Staples";
  if (/industrial|aerospace|defense/.test(n))                   return "Sector Industrials";
  if (/material|mining|metal|gold|silver|copper/.test(n))       return "Sector Materials";
  if (/util|electric|water/.test(n))                            return "Sector Utilities";
  if (/communicat|telecom|media/.test(n))                       return "Sector Communication Services";
  if (/infrastructure/.test(n))                                 return "Sector Industrials";
  // Factor / style
  if (/dividend|high yield equity|income equity/.test(n))       return "US Equity Large Value";
  if (/value/.test(n))                                          return "US Equity Large Value";
  if (/growth/.test(n))                                         return "US Equity Large Growth";
  if (/small.?cap|small cap/.test(n))                           return "US Equity Small Blend";
  if (/mid.?cap|mid cap/.test(n))                               return "US Equity Mid Blend";
  if (/momentum|quality|factor|multi.?factor/.test(n))          return "US Equity Large Blend";
  // Thematic
  if (/cannabis|marijuana/.test(n))                             return "Sector / Thematic";
  if (/crypto|bitcoin|ethereum|blockchain/.test(n))             return "Sector / Thematic";
  if (/esg|sustainable|responsible/.test(n))                    return "US Equity Large Blend";
  if (/covered call|buy.?write|option/.test(n))                 return "Covered Call / Income";
  if (/commodity|commodities/.test(n))                          return "Commodities";
  if (/preferred/.test(n))                                      return "Preferred Stock";
  if (/leverage|2x|3x|bull|bear|inverse|short/.test(n))        return "Leveraged / Inverse";
  // Allocation
  if (/balanced|allocation|multi.?asset/.test(n))               return "Allocation 50-70% Equity";
  // Default
  return "US Equity Large Blend";
}

function benchFor(cat = "") {
  const c = cat.toLowerCase();
  if (/bond|income|fixed|treasury|muni|tips|preferred|inflation|ultrashort/.test(c)) return "AGG";
  if (/international|emerging|world|global|foreign/.test(c))                          return "VXUS";
  return "SPY";
}

async function main() {
  console.log("Fetching ETF list from NASDAQ...");

  const res = await fetch("https://api.nasdaq.com/api/screener/etf?limit=5000&offset=0&download=true", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "Accept": "application/json",
      "Referer": "https://www.nasdaq.com/etf/screener"
    }
  });

  if (!res.ok) { console.error("Fetch failed:", res.status); process.exit(1); }
  const data = await res.json();
  const rows = data?.data?.data?.rows ?? [];
  console.log(`  Got ${rows.length} ETFs from NASDAQ`);

  let added = 0, skipped = 0;

  for (const row of rows) {
    const ticker = (row.symbol || "").trim().toUpperCase();

    // Skip bad tickers
    if (!ticker) { skipped++; continue; }
    if (ticker.includes(".") || ticker.includes("/")) { skipped++; continue; }
    if (ticker.length > 5) { skipped++; continue; }

    // Skip if already in universe
    if (have.has(ticker)) { skipped++; continue; }

    const name     = (row.companyName || ticker).trim();
    const category = guessCategory(name);

    // Skip leveraged/inverse — not useful for advisor research tool
    if (category === "Leveraged / Inverse") { skipped++; continue; }

    have.add(ticker);
    universe.push({
      ticker,
      name,
      category,
      vehicle: "ETF",
      benchmark: benchFor(category),
    });
    // No ER/AUM from this source — will be enriched by FMP later
    added++;
  }

  // Sort and save
  universe.sort((a, b) => a.ticker.localeCompare(b.ticker));
  fs.writeFileSync(UNIVERSE_PATH, JSON.stringify(universe, null, 2) + "\n");
  fs.writeFileSync(META_PATH,     JSON.stringify(meta,     null, 2) + "\n");

  console.log(`\n✅ Done!`);
  console.log(`   Added:   ${added} new ETFs`);
  console.log(`   Skipped: ${skipped} (already in universe or filtered)`);
  console.log(`   Total:   ${universe.length} funds`);

  // Category breakdown
  const cats = {};
  universe.forEach(f => { cats[f.category] = (cats[f.category]||0)+1; });
  console.log("\nTop categories:");
  Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,20)
    .forEach(([k,v]) => console.log(`  ${String(v).padStart(4)}  ${k}`));
}

main().catch(console.error);
