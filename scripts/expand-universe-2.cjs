/* Adds a batch of real funds/ETFs to the universe (deduped by ticker). */
const fs = require("fs");
const path = require("path");

const UNIVERSE_PATH = path.join(__dirname, "..", "data", "universe.json");
const META_PATH = path.join(__dirname, "..", "src", "data", "fund-meta.json");

const universe = JSON.parse(fs.readFileSync(UNIVERSE_PATH, "utf8"));
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));

function benchFor(category) {
  const c = category.toLowerCase();
  if (/bond|income|fixed|treasury|muni|tips|preferred|loan|mbs/.test(c)) return "AGG";
  if (/international|emerging|world|global|intl|china|japan|europe|pacific|country|asia|latin/.test(c)) return "VXUS";
  return "SPY";
}

// [ticker, name, category, vehicle, er(%), aum($B)]
const ADD = [
  // Thematic / sector ETFs
  ["SMH", "VanEck Semiconductor ETF", "Sector / Thematic", "ETF", 0.35, 22],
  ["SOXX", "iShares Semiconductor ETF", "Sector / Thematic", "ETF", 0.35, 13],
  ["BOTZ", "Global X Robotics & AI ETF", "Sector / Thematic", "ETF", 0.68, 2.6],
  ["ROBO", "ROBO Global Robotics & Automation ETF", "Sector / Thematic", "ETF", 0.95, 1.1],
  ["CIBR", "First Trust NASDAQ Cybersecurity ETF", "Sector / Thematic", "ETF", 0.59, 7.4],
  ["HACK", "ETFMG Prime Cyber Security ETF", "Sector / Thematic", "ETF", 0.60, 1.6],
  ["SKYY", "First Trust Cloud Computing ETF", "Sector / Thematic", "ETF", 0.60, 3.0],
  ["FINX", "Global X FinTech ETF", "Sector / Thematic", "ETF", 0.68, 0.4],
  ["ICLN", "iShares Global Clean Energy ETF", "Sector / Thematic", "ETF", 0.41, 2.4],
  ["TAN", "Invesco Solar ETF", "Sector / Thematic", "ETF", 0.69, 1.0],
  ["LIT", "Global X Lithium & Battery Tech ETF", "Sector / Thematic", "ETF", 0.75, 1.2],
  ["JETS", "U.S. Global Jets ETF", "Sector / Thematic", "ETF", 0.60, 1.0],
  ["KWEB", "KraneShares CSI China Internet ETF", "International Equity", "ETF", 0.70, 5.7],
  ["ESPO", "VanEck Video Gaming & eSports ETF", "Sector / Thematic", "ETF", 0.55, 0.3],
  ["ARKK", "ARK Innovation ETF", "Sector / Thematic", "ETF", 0.75, 6.0],
  ["ARKG", "ARK Genomic Revolution ETF", "Sector / Thematic", "ETF", 0.75, 1.6],
  ["ARKW", "ARK Next Generation Internet ETF", "Sector / Thematic", "ETF", 0.83, 1.5],
  ["BLOK", "Amplify Transformational Data Sharing ETF", "Sector / Thematic", "ETF", 0.76, 1.1],
  ["VGT", "Vanguard Information Technology ETF", "Sector / Thematic", "ETF", 0.10, 73],
  ["VHT", "Vanguard Health Care ETF", "Sector / Thematic", "ETF", 0.10, 18],
  ["VFH", "Vanguard Financials ETF", "Sector / Thematic", "ETF", 0.10, 11],
  ["VDE", "Vanguard Energy ETF", "Sector / Thematic", "ETF", 0.10, 8],
  ["VIS", "Vanguard Industrials ETF", "Sector / Thematic", "ETF", 0.10, 5],
  ["VPU", "Vanguard Utilities ETF", "Sector / Thematic", "ETF", 0.10, 7],
  ["VCR", "Vanguard Consumer Discretionary ETF", "Sector / Thematic", "ETF", 0.10, 6],
  ["VDC", "Vanguard Consumer Staples ETF", "Sector / Thematic", "ETF", 0.10, 7],
  ["VOX", "Vanguard Communication Services ETF", "Sector / Thematic", "ETF", 0.10, 4],
  ["VAW", "Vanguard Materials ETF", "Sector / Thematic", "ETF", 0.10, 4],
  // Dividend / factor
  ["NOBL", "ProShares S&P 500 Dividend Aristocrats ETF", "US Equity Large Blend", "ETF", 0.35, 12],
  ["DGRW", "WisdomTree US Quality Dividend Growth ETF", "US Equity Large Blend", "ETF", 0.28, 13],
  ["SDY", "SPDR S&P Dividend ETF", "US Equity Large Value", "ETF", 0.35, 20],
  ["DVY", "iShares Select Dividend ETF", "US Equity Large Value", "ETF", 0.38, 19],
  ["HDV", "iShares Core High Dividend ETF", "US Equity Large Value", "ETF", 0.08, 10],
  ["FDVV", "Fidelity High Dividend ETF", "US Equity Large Value", "ETF", 0.16, 3.5],
  ["RDVY", "First Trust Rising Dividend Achievers ETF", "US Equity Large Blend", "ETF", 0.49, 12],
  ["SPLV", "Invesco S&P 500 Low Volatility ETF", "US Equity Large Blend", "ETF", 0.25, 8],
  ["QUAL", "iShares MSCI USA Quality Factor ETF", "US Equity Large Blend", "ETF", 0.15, 45],
  ["MTUM", "iShares MSCI USA Momentum Factor ETF", "US Equity Large Blend", "ETF", 0.15, 13],
  ["VLUE", "iShares MSCI USA Value Factor ETF", "US Equity Large Value", "ETF", 0.15, 7],
  ["SPYG", "SPDR Portfolio S&P 500 Growth ETF", "US Equity Large Growth", "ETF", 0.04, 30],
  ["SPYV", "SPDR Portfolio S&P 500 Value ETF", "US Equity Large Value", "ETF", 0.04, 25],
  ["MGK", "Vanguard Mega Cap Growth ETF", "US Equity Large Growth", "ETF", 0.07, 22],
  ["SCHG", "Schwab US Large-Cap Growth ETF", "US Equity Large Growth", "ETF", 0.04, 35],
  ["SCHV", "Schwab US Large-Cap Value ETF", "US Equity Large Value", "ETF", 0.04, 12],
  ["IWF", "iShares Russell 1000 Growth ETF", "US Equity Large Growth", "ETF", 0.19, 100],
  ["IWD", "iShares Russell 1000 Value ETF", "US Equity Large Value", "ETF", 0.19, 60],
  // International single-country / regional
  ["EWJ", "iShares MSCI Japan ETF", "International Equity", "ETF", 0.50, 14],
  ["EWG", "iShares MSCI Germany ETF", "International Equity", "ETF", 0.50, 2.5],
  ["EWU", "iShares MSCI United Kingdom ETF", "International Equity", "ETF", 0.50, 2.8],
  ["EWA", "iShares MSCI Australia ETF", "International Equity", "ETF", 0.50, 1.6],
  ["EWC", "iShares MSCI Canada ETF", "International Equity", "ETF", 0.50, 3.6],
  ["EWW", "iShares MSCI Mexico ETF", "International Equity", "ETF", 0.50, 1.5],
  ["EWY", "iShares MSCI South Korea ETF", "International Equity", "ETF", 0.59, 3.8],
  ["EWT", "iShares MSCI Taiwan ETF", "International Equity", "ETF", 0.59, 5.0],
  ["INDA", "iShares MSCI India ETF", "International Equity", "ETF", 0.62, 9.5],
  ["MCHI", "iShares MSCI China ETF", "International Equity", "ETF", 0.59, 6.2],
  ["EWZ", "iShares MSCI Brazil ETF", "International Equity", "ETF", 0.59, 4.5],
  ["VEA", "Vanguard FTSE Developed Markets ETF", "International Equity", "ETF", 0.05, 130],
  ["IEFA", "iShares Core MSCI EAFE ETF", "International Equity", "ETF", 0.07, 110],
  ["IEMG", "iShares Core MSCI Emerging Markets ETF", "International Equity", "ETF", 0.09, 80],
  ["SCHF", "Schwab International Equity ETF", "International Equity", "ETF", 0.06, 35],
  ["SCHE", "Schwab Emerging Markets Equity ETF", "International Equity", "ETF", 0.11, 10],
  ["EFV", "iShares MSCI EAFE Value ETF", "International Equity", "ETF", 0.34, 18],
  ["EFG", "iShares MSCI EAFE Growth ETF", "International Equity", "ETF", 0.36, 13],
  ["IQLT", "iShares MSCI Intl Quality Factor ETF", "International Equity", "ETF", 0.30, 7],
  // Bonds
  ["BND", "Vanguard Total Bond Market ETF", "Intermediate Core Bond", "ETF", 0.03, 110],
  ["BNDX", "Vanguard Total International Bond ETF", "World Bond", "ETF", 0.07, 55],
  ["BIV", "Vanguard Intermediate-Term Bond ETF", "Intermediate Core Bond", "ETF", 0.04, 15],
  ["BSV", "Vanguard Short-Term Bond ETF", "Short-Term Bond", "ETF", 0.04, 33],
  ["BLV", "Vanguard Long-Term Bond ETF", "Long Government", "ETF", 0.04, 6],
  ["VCIT", "Vanguard Intermediate-Term Corporate Bond ETF", "Corporate Bond", "ETF", 0.04, 48],
  ["VCSH", "Vanguard Short-Term Corporate Bond ETF", "Short-Term Bond", "ETF", 0.04, 33],
  ["VGIT", "Vanguard Intermediate-Term Treasury ETF", "Intermediate Government", "ETF", 0.04, 28],
  ["VGSH", "Vanguard Short-Term Treasury ETF", "Short-Term Bond", "ETF", 0.04, 25],
  ["VGLT", "Vanguard Long-Term Treasury ETF", "Long Government", "ETF", 0.04, 12],
  ["GOVT", "iShares US Treasury Bond ETF", "Intermediate Government", "ETF", 0.05, 28],
  ["IEF", "iShares 7-10 Year Treasury Bond ETF", "Intermediate Government", "ETF", 0.15, 33],
  ["SHY", "iShares 1-3 Year Treasury Bond ETF", "Short-Term Bond", "ETF", 0.15, 25],
  ["TIP", "iShares TIPS Bond ETF", "Inflation-Protected Bond", "ETF", 0.19, 14],
  ["VTIP", "Vanguard Short-Term Inflation-Protected ETF", "Inflation-Protected Bond", "ETF", 0.04, 13],
  ["SCHP", "Schwab US TIPS ETF", "Inflation-Protected Bond", "ETF", 0.03, 10],
  ["MUB", "iShares National Muni Bond ETF", "Muni National Intermediate", "ETF", 0.07, 38],
  ["VTEB", "Vanguard Tax-Exempt Bond ETF", "Muni National Intermediate", "ETF", 0.05, 35],
  ["SGOV", "iShares 0-3 Month Treasury Bond ETF", "Ultrashort Bond", "ETF", 0.09, 25],
  ["BIL", "SPDR Bloomberg 1-3 Month T-Bill ETF", "Ultrashort Bond", "ETF", 0.14, 35],
  ["USFR", "WisdomTree Floating Rate Treasury ETF", "Ultrashort Bond", "ETF", 0.15, 18],
  ["FLOT", "iShares Floating Rate Bond ETF", "Ultrashort Bond", "ETF", 0.15, 8],
  ["VMBS", "Vanguard Mortgage-Backed Securities ETF", "Intermediate Core Bond", "ETF", 0.04, 18],
  ["EMB", "iShares JP Morgan USD Emerging Markets Bond ETF", "Emerging Markets Bond", "ETF", 0.39, 14],
  // Income / covered call
  ["JEPI", "JPMorgan Equity Premium Income ETF", "Covered Call / Income", "ETF", 0.35, 35],
  ["JEPQ", "JPMorgan Nasdaq Equity Premium Income ETF", "Covered Call / Income", "ETF", 0.35, 18],
  ["DIVO", "Amplify CWP Enhanced Dividend Income ETF", "Covered Call / Income", "ETF", 0.56, 3.5],
  // Commodities / alts
  ["SLV", "iShares Silver Trust", "Commodities", "ETF", 0.50, 13],
  ["IAU", "iShares Gold Trust", "Commodities", "ETF", 0.25, 30],
  ["GLDM", "SPDR Gold MiniShares Trust", "Commodities", "ETF", 0.10, 8],
  ["PDBC", "Invesco Optimum Yield Diversified Commodity ETF", "Commodities", "ETF", 0.59, 5],
  ["DBA", "Invesco DB Agriculture Fund", "Commodities", "ETF", 0.91, 1.0],
  // Allocation
  ["AOA", "iShares Core Aggressive Allocation ETF", "Allocation / Balanced", "ETF", 0.15, 2.0],
  ["AOR", "iShares Core Growth Allocation ETF", "Allocation / Balanced", "ETF", 0.15, 2.2],
  ["AOM", "iShares Core Moderate Allocation ETF", "Allocation / Balanced", "ETF", 0.15, 1.6],
  ["AOK", "iShares Core Conservative Allocation ETF", "Allocation / Balanced", "ETF", 0.15, 0.9],
  // Active mutual funds
  ["VWELX", "Vanguard Wellington Fund", "Allocation / Balanced", "Mutual Fund", 0.26, 110],
  ["VWINX", "Vanguard Wellesley Income Fund", "Allocation / Balanced", "Mutual Fund", 0.23, 70],
  ["VFIAX", "Vanguard 500 Index Admiral", "US Equity Large Blend", "Mutual Fund", 0.04, 450],
  ["VTSAX", "Vanguard Total Stock Market Index Admiral", "US Equity Large Blend", "Mutual Fund", 0.04, 400],
  ["VTIAX", "Vanguard Total International Stock Index Admiral", "International Equity", "Mutual Fund", 0.09, 80],
  ["FCNTX", "Fidelity Contrafund", "US Equity Large Growth", "Mutual Fund", 0.39, 120],
  ["FBGRX", "Fidelity Blue Chip Growth", "US Equity Large Growth", "Mutual Fund", 0.48, 60],
  ["FLPSX", "Fidelity Low-Priced Stock", "US Equity Mid Blend", "Mutual Fund", 0.52, 25],
  ["FBALX", "Fidelity Balanced Fund", "Allocation / Balanced", "Mutual Fund", 0.47, 40],
  ["DODGX", "Dodge & Cox Stock Fund", "US Equity Large Value", "Mutual Fund", 0.51, 95],
  ["DODIX", "Dodge & Cox Income Fund", "Intermediate Core Plus Bond", "Mutual Fund", 0.41, 75],
  ["DODFX", "Dodge & Cox International Stock", "International Equity", "Mutual Fund", 0.62, 30],
  ["PRGFX", "T. Rowe Price Growth Stock", "US Equity Large Growth", "Mutual Fund", 0.64, 55],
  ["PRWCX", "T. Rowe Price Capital Appreciation", "Allocation / Balanced", "Mutual Fund", 0.69, 65],
  ["TRBCX", "T. Rowe Price Blue Chip Growth", "US Equity Large Growth", "Mutual Fund", 0.69, 60],
  ["PIMIX", "PIMCO Income Fund Institutional", "Multisector Bond", "Mutual Fund", 0.62, 130],
  ["PTTAX", "PIMCO Total Return Fund A", "Intermediate Core Plus Bond", "Mutual Fund", 0.81, 55],
];

const have = new Set(universe.map((u) => u.ticker.toUpperCase()));
let added = 0;
for (const [ticker, name, category, vehicle, er, aum] of ADD) {
  const t = ticker.toUpperCase();
  if (have.has(t)) continue;
  have.add(t);
  universe.push({ ticker: t, name, category, vehicle, benchmark: benchFor(category) });
  meta[t] = { er, aum };
  added++;
}

universe.sort((a, b) => a.ticker.localeCompare(b.ticker));
fs.writeFileSync(UNIVERSE_PATH, JSON.stringify(universe, null, 2) + "\n");
fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n");
console.log(`Added ${added} new funds. Universe now: ${universe.length} funds, meta: ${Object.keys(meta).length - 1} entries.`);
