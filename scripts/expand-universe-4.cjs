/* Expansion batch 4 — dividend, factor/smart-beta, allocation, bonds, international, active MFs */
const fs = require("fs");
const path = require("path");
const UNIVERSE_PATH = path.join(__dirname, "..", "data", "universe.json");
const META_PATH = path.join(__dirname, "..", "src", "data", "fund-meta.json");
const universe = JSON.parse(fs.readFileSync(UNIVERSE_PATH, "utf8"));
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

function benchFor(c) {
  c = c.toLowerCase();
  if (/bond|income|fixed|treasury|muni|tips|preferred|loan|mbs|duration|inflation/.test(c)) return "AGG";
  if (/international|emerging|world|global|intl|china|japan|europe|pacific|country|foreign/.test(c)) return "VXUS";
  if (/allocation|balanced|multi/.test(c)) return "SPY";
  return "SPY";
}

const ADD = [
  // ── Dividend / Income ETFs (huge advisor category, barely covered) ──────────
  ["SCHD",  "Schwab US Dividend Equity ETF",              "US Equity Large Value",        "ETF",         0.06,  65],
  ["VYM",   "Vanguard High Dividend Yield ETF",           "US Equity Large Value",        "ETF",         0.06,  60],
  ["DVY",   "iShares Select Dividend ETF",                "US Equity Large Value",        "ETF",         0.38,  19],
  ["SDY",   "SPDR S&P Dividend ETF",                      "US Equity Large Value",        "ETF",         0.35,  22],
  ["DGRO",  "iShares Core Dividend Growth ETF",           "US Equity Large Blend",        "ETF",         0.08,  26],
  ["NOBL",  "ProShares S&P 500 Dividend Aristocrats ETF", "US Equity Large Blend",        "ETF",         0.35,  12],
  ["HDV",   "iShares Core High Dividend ETF",             "US Equity Large Value",        "ETF",         0.08,   9],
  ["VIG",   "Vanguard Dividend Appreciation ETF",         "US Equity Large Blend",        "ETF",         0.06,  80],
  ["DGRW",  "WisdomTree US Quality Dividend Growth ETF",  "US Equity Large Blend",        "ETF",         0.28,  14],
  ["SPHD",  "Invesco S&P 500 High Dividend Low Vol ETF",  "US Equity Large Value",        "ETF",         0.30,   3],
  ["FDVV",  "Fidelity High Dividend ETF",                 "US Equity Large Value",        "ETF",         0.29,   3],
  ["VYMI",  "Vanguard International High Dividend Yield", "International Equity",         "ETF",         0.22,   6],
  ["PFF",   "iShares Preferred & Income Securities ETF",  "Preferred Stock",              "ETF",         0.46,  13],
  ["PGX",   "Invesco Preferred ETF",                      "Preferred Stock",              "ETF",         0.52,   5],
  ["PFFD",  "Global X US Preferred ETF",                  "Preferred Stock",              "ETF",         0.23,   2],

  // ── Factor / Smart-Beta ETFs ────────────────────────────────────────────────
  ["QUAL",  "iShares MSCI USA Quality Factor ETF",        "US Equity Large Blend",        "ETF",         0.15,  40],
  ["VLUE",  "iShares MSCI USA Value Factor ETF",          "US Equity Large Value",        "ETF",         0.15,   9],
  ["MTUM",  "iShares MSCI USA Momentum Factor ETF",       "US Equity Large Growth",       "ETF",         0.15,  15],
  ["USMV",  "iShares MSCI USA Min Vol Factor ETF",        "US Equity Large Blend",        "ETF",         0.15,  26],
  ["SIZE",  "iShares MSCI USA Size Factor ETF",           "US Equity Large Blend",        "ETF",         0.15,   0.5],
  ["LRGF",  "iShares US Equity Factor ETF",               "US Equity Large Blend",        "ETF",         0.08,   1],
  ["SMLF",  "iShares US Small Cap Equity Factor ETF",     "US Equity Small Blend",        "ETF",         0.12,   0.7],
  ["DSTL",  "Distillate US Fundamental Stability & Value","US Equity Large Blend",        "ETF",         0.39,   3],
  ["COWZ",  "Pacer US Cash Cows 100 ETF",                 "US Equity Large Value",        "ETF",         0.49,  26],
  ["CALF",  "Pacer US Small Cap Cash Cows 100 ETF",       "US Equity Small Value",        "ETF",         0.59,   4],
  ["EFAV",  "iShares MSCI EAFE Min Vol Factor ETF",       "International Equity",         "ETF",         0.20,  10],
  ["EEMV",  "iShares MSCI EM Min Vol Factor ETF",         "Emerging Markets",             "ETF",         0.25,   5],
  ["INTF",  "iShares MSCI Intl Equity Factor ETF",        "International Equity",         "ETF",         0.15,   1],
  ["QMOM",  "Alpha Architect US Quantitative Momentum ETF","US Equity Large Growth",      "ETF",         0.37,   0.8],
  ["QVAL",  "Alpha Architect US Quantitative Value ETF",  "US Equity Large Value",        "ETF",         0.37,   0.5],

  // ── International Developed (aggregate; single-country well-covered) ────────
  ["IEFA",  "iShares Core MSCI EAFE ETF",                 "International Equity",         "ETF",         0.07, 115],
  ["VEA",   "Vanguard FTSE Developed Markets ETF",        "International Equity",         "ETF",         0.05,  90],
  ["EFA",   "iShares MSCI EAFE ETF",                      "International Equity",         "ETF",         0.32,  50],
  ["SPDW",  "SPDR Portfolio Developed World ex-US ETF",   "International Equity",         "ETF",         0.04,  14],
  ["ACWI",  "iShares MSCI ACWI ETF",                      "World Large Stock Blend",      "ETF",         0.32,  22],
  ["ACWX",  "iShares MSCI ACWI ex US ETF",                "International Equity",         "ETF",         0.32,   4],
  ["VT",    "Vanguard Total World Stock ETF",             "World Large Stock Blend",      "ETF",         0.07,  45],
  ["VXUS",  "Vanguard Total International Stock ETF",     "International Equity",         "ETF",         0.07,  75],
  ["IXUS",  "iShares Core MSCI Total International",      "International Equity",         "ETF",         0.07,  35],

  // ── Balanced / Allocation funds ─────────────────────────────────────────────
  ["VBIAX", "Vanguard Balanced Index Admiral",            "Allocation 50-70% Equity",     "Mutual Fund", 0.07,  50],
  ["VWELX", "Vanguard Wellington Fund",                   "Allocation 50-70% Equity",     "Mutual Fund", 0.25,  95],
  ["VWINX", "Vanguard Wellesley Income Fund",             "Allocation 30-50% Equity",     "Mutual Fund", 0.23,  55],
  ["PRWCX", "T. Rowe Price Capital Appreciation Fund",    "Allocation 50-70% Equity",     "Mutual Fund", 0.71,  50],
  ["DODBX", "Dodge & Cox Balanced Fund",                  "Allocation 50-70% Equity",     "Mutual Fund", 0.53,  18],
  ["FBALX", "Fidelity Balanced Fund",                     "Allocation 50-70% Equity",     "Mutual Fund", 0.50,  25],
  ["FPURX", "Fidelity Puritan Fund",                      "Allocation 50-70% Equity",     "Mutual Fund", 0.50,  22],
  ["AOM",   "iShares Core Moderate Allocation ETF",       "Allocation 30-50% Equity",     "ETF",         0.15,   1.8],
  ["AOR",   "iShares Core Growth Allocation ETF",         "Allocation 50-70% Equity",     "ETF",         0.15,   2.2],
  ["AOA",   "iShares Core Aggressive Allocation ETF",     "Allocation 85%+ Equity",       "ETF",         0.15,   1.2],
  ["VASGX", "Vanguard LifeStrategy Growth Fund",          "Allocation 70-85% Equity",     "Mutual Fund", 0.14,  14],
  ["VSMGX", "Vanguard LifeStrategy Moderate Growth Fund", "Allocation 50-70% Equity",     "Mutual Fund", 0.13,  20],
  ["ABALX", "American Funds American Balanced A",         "Allocation 50-70% Equity",     "Mutual Fund", 0.59, 170],

  // ── Core Bond ETFs (gaps) ───────────────────────────────────────────────────
  ["BND",   "Vanguard Total Bond Market ETF",             "Intermediate Core Bond",       "ETF",         0.03, 120],
  ["BNDX",  "Vanguard Total International Bond ETF",      "World Bond",                   "ETF",         0.07,  60],
  ["BNDW",  "Vanguard Total World Bond ETF",              "World Bond",                   "ETF",         0.05,   4],
  ["VCSH",  "Vanguard Short-Term Corporate Bond ETF",     "Short-Term Bond",              "ETF",         0.04,  40],
  ["VCIT",  "Vanguard Intermediate-Term Corporate Bond",  "Corporate Bond",               "ETF",         0.04,  50],
  ["VCLT",  "Vanguard Long-Term Corporate Bond ETF",      "Corporate Bond",               "ETF",         0.04,   8],
  ["MUB",   "iShares National Muni Bond ETF",             "Muni National Intermediate",   "ETF",         0.05,  35],
  ["VTEB",  "Vanguard Tax-Exempt Bond ETF",               "Muni National Intermediate",   "ETF",         0.05,  35],
  ["FLRN",  "SPDR Bloomberg Investment Grade Floating",   "Ultrashort Bond",              "ETF",         0.15,   4],
  ["USFR",  "WisdomTree Floating Rate Treasury ETF",      "Ultrashort Bond",              "ETF",         0.15,  20],
  ["SGOV",  "iShares 0-3 Month Treasury Bond ETF",        "Ultrashort Bond",              "ETF",         0.09,  35],
  ["CSHI",  "NEOS Enhanced Income Cash Alternative ETF",  "Ultrashort Bond",              "ETF",         0.38,   1],

  // ── Active equity — Fidelity ────────────────────────────────────────────────
  ["FCNTX", "Fidelity Contrafund",                        "US Equity Large Growth",       "Mutual Fund", 0.39, 130],
  ["FDGRX", "Fidelity Growth Company Fund",               "US Equity Large Growth",       "Mutual Fund", 0.83,  60],
  ["FMAGX", "Fidelity Magellan Fund",                     "US Equity Large Growth",       "Mutual Fund", 0.45,  30],
  ["FXAIX", "Fidelity 500 Index Fund",                    "US Equity Large Blend",        "Mutual Fund", 0.015,500],
  ["FZROX", "Fidelity ZERO Total Market Index Fund",      "US Equity Large Blend",        "Mutual Fund", 0.00,  15],
  ["FSKAX", "Fidelity Total Market Index Fund",           "US Equity Large Blend",        "Mutual Fund", 0.015,100],
  ["FSMAX", "Fidelity Extended Market Index Fund",        "US Equity Mid/Small Blend",    "Mutual Fund", 0.035, 25],
  ["FTIHX", "Fidelity Total International Index Fund",    "International Equity",         "Mutual Fund", 0.06,  20],

  // ── Active equity — other families ─────────────────────────────────────────
  ["OAKMX", "Oakmark Fund",                               "US Equity Large Blend",        "Mutual Fund", 0.89,  20],
  ["DODGX", "Dodge & Cox Stock Fund",                     "US Equity Large Value",        "Mutual Fund", 0.52,  95],
  ["MWTIX", "Metropolitan West Total Return Bond I",      "Intermediate Core Plus Bond",  "Mutual Fund", 0.44,  50],
  ["PIMIX", "PIMCO Income Institutional",                 "Multisector Bond",             "Mutual Fund", 0.76, 110],
  ["PTTRX", "PIMCO Total Return Institutional",           "Intermediate Core Plus Bond",  "Mutual Fund", 0.46,  60],
  ["LSBRX", "Loomis Sayles Bond Retail",                  "Multisector Bond",             "Mutual Fund", 0.93,  13],
  ["DODLX", "Dodge & Cox Global Bond Fund",               "World Bond",                   "Mutual Fund", 0.45,   5],
  ["TRBCX", "T. Rowe Price Blue Chip Growth",             "US Equity Large Growth",       "Mutual Fund", 0.69,  80],
  ["PRHSX", "T. Rowe Price Health Sciences",              "Sector / Thematic",            "Mutual Fund", 0.76,  14],
  ["PRGTX", "T. Rowe Price Global Technology",            "Sector / Thematic",            "Mutual Fund", 0.90,   5],
  ["JLGMX", "JPMorgan Large Cap Growth R6",               "US Equity Large Growth",       "Mutual Fund", 0.44,  55],
  ["BFGFX", "Baron Focused Growth Fund",                  "US Equity Mid Growth",         "Mutual Fund", 1.07,   3],
  ["BRUFX", "Bruce Fund",                                 "Allocation 50-70% Equity",     "Mutual Fund", 0.59,   0.5],

  // ── Covered Call / Income (growing category) ────────────────────────────────
  ["JEPI",  "JPMorgan Equity Premium Income ETF",         "Covered Call / Income",        "ETF",         0.35,  36],
  ["JEPQ",  "JPMorgan Nasdaq Equity Premium Income ETF",  "Covered Call / Income",        "ETF",         0.35,  18],
  ["XYLD",  "Global X S&P 500 Covered Call ETF",          "Covered Call / Income",        "ETF",         0.60,   2.5],
  ["QYLD",  "Global X Nasdaq 100 Covered Call ETF",       "Covered Call / Income",        "ETF",         0.60,   7],
  ["RYLD",  "Global X Russell 2000 Covered Call ETF",     "Covered Call / Income",        "ETF",         0.60,   1.3],

  // ── Commodities / Real Assets (gap) ─────────────────────────────────────────
  ["GLD",   "SPDR Gold Shares",                           "Commodities",                  "ETF",         0.40,  65],
  ["IAU",   "iShares Gold Trust",                         "Commodities",                  "ETF",         0.25,  30],
  ["SLV",   "iShares Silver Trust",                       "Commodities",                  "ETF",         0.50,  11],
  ["PDBC",  "Invesco Optimum Yield Diversified Commodity","Commodities",                  "ETF",         0.59,   5],
  ["VNQ",   "Vanguard Real Estate ETF",                   "Sector Real Estate",           "ETF",         0.12,  35],
  ["VNQI",  "Vanguard Global ex-US Real Estate ETF",      "Sector Real Estate",           "ETF",         0.12,   5],
  ["SCHH",  "Schwab US REIT ETF",                         "Sector Real Estate",           "ETF",         0.07,   7],
];

const have = new Set(universe.map((u) => u.ticker.toUpperCase()));
let added = 0;
for (const [ticker, name, category, vehicle, er, aum] of ADD) {
  const t = ticker.toUpperCase();
  if (have.has(t)) { console.log(`  skip (exists): ${t}`); continue; }
  have.add(t);
  universe.push({ ticker: t, name, category, vehicle, benchmark: benchFor(category) });
  meta[t] = { er, aum };
  added++;
}
universe.sort((a, b) => a.ticker.localeCompare(b.ticker));
fs.writeFileSync(UNIVERSE_PATH, JSON.stringify(universe, null, 2) + "\n");
fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n");
console.log(`\nAdded ${added} new funds. Universe now: ${universe.length} funds.`);

// Print category breakdown
const cats = {};
universe.forEach(f => { cats[f.category] = (cats[f.category]||0)+1; });
console.log("\nCategory breakdown:");
Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([k,v])=>console.log(`  ${v}  ${k}`));
