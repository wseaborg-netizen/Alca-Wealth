/* Second expansion batch — more real funds/ETFs (deduped). */
const fs = require("fs");
const path = require("path");
const UNIVERSE_PATH = path.join(__dirname, "..", "data", "universe.json");
const META_PATH = path.join(__dirname, "..", "src", "data", "fund-meta.json");
const universe = JSON.parse(fs.readFileSync(UNIVERSE_PATH, "utf8"));
const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
function benchFor(c) {
  c = c.toLowerCase();
  if (/bond|income|fixed|treasury|muni|tips|preferred|loan|mbs/.test(c)) return "AGG";
  if (/international|emerging|world|global|intl|china|japan|europe|pacific|country/.test(c)) return "VXUS";
  return "SPY";
}
const ADD = [
  // Mid/small-cap & broad
  ["IJH", "iShares Core S&P Mid-Cap ETF", "US Equity Mid Blend", "ETF", 0.05, 90],
  ["IJR", "iShares Core S&P Small-Cap ETF", "US Equity Small Blend", "ETF", 0.06, 80],
  ["VOE", "Vanguard Mid-Cap Value ETF", "US Equity Mid Value", "ETF", 0.07, 17],
  ["VOT", "Vanguard Mid-Cap Growth ETF", "US Equity Mid Growth", "ETF", 0.07, 16],
  ["VBR", "Vanguard Small-Cap Value ETF", "US Equity Small Value", "ETF", 0.07, 27],
  ["VBK", "Vanguard Small-Cap Growth ETF", "US Equity Small Growth", "ETF", 0.07, 16],
  ["IWP", "iShares Russell Mid-Cap Growth ETF", "US Equity Mid Growth", "ETF", 0.23, 16],
  ["IWS", "iShares Russell Mid-Cap Value ETF", "US Equity Mid Value", "ETF", 0.23, 14],
  ["IWN", "iShares Russell 2000 Value ETF", "US Equity Small Value", "ETF", 0.24, 12],
  ["IWO", "iShares Russell 2000 Growth ETF", "US Equity Small Growth", "ETF", 0.24, 11],
  ["IWR", "iShares Russell Mid-Cap ETF", "US Equity Mid Blend", "ETF", 0.19, 38],
  ["MDYG", "SPDR S&P 400 Mid Cap Growth ETF", "US Equity Mid Growth", "ETF", 0.15, 2.5],
  ["MDYV", "SPDR S&P 400 Mid Cap Value ETF", "US Equity Mid Value", "ETF", 0.15, 2.7],
  ["SLYG", "SPDR S&P 600 Small Cap Growth ETF", "US Equity Small Growth", "ETF", 0.15, 2.6],
  ["SLYV", "SPDR S&P 600 Small Cap Value ETF", "US Equity Small Value", "ETF", 0.15, 4.5],
  ["PRF", "Invesco FTSE RAFI US 1000 ETF", "US Equity Large Value", "ETF", 0.39, 6],
  ["RPV", "Invesco S&P 500 Pure Value ETF", "US Equity Large Value", "ETF", 0.35, 3],
  ["RPG", "Invesco S&P 500 Pure Growth ETF", "US Equity Large Growth", "ETF", 0.35, 3],
  ["FNDX", "Schwab Fundamental US Large Company ETF", "US Equity Large Value", "ETF", 0.25, 14],
  ["FNDA", "Schwab Fundamental US Small Company ETF", "US Equity Small Value", "ETF", 0.25, 7],
  // Industry / thematic
  ["XBI", "SPDR S&P Biotech ETF", "Sector / Thematic", "ETF", 0.35, 8],
  ["IBB", "iShares Biotechnology ETF", "Sector / Thematic", "ETF", 0.45, 7],
  ["IHI", "iShares US Medical Devices ETF", "Sector / Thematic", "ETF", 0.40, 5],
  ["ITB", "iShares US Home Construction ETF", "Sector / Thematic", "ETF", 0.40, 2.5],
  ["XHB", "SPDR S&P Homebuilders ETF", "Sector / Thematic", "ETF", 0.35, 2],
  ["KRE", "SPDR S&P Regional Banking ETF", "Sector / Thematic", "ETF", 0.35, 4],
  ["KBE", "SPDR S&P Bank ETF", "Sector / Thematic", "ETF", 0.35, 2],
  ["IYR", "iShares US Real Estate ETF", "Sector / Thematic", "ETF", 0.39, 3],
  ["IGV", "iShares Expanded Tech-Software ETF", "Sector / Thematic", "ETF", 0.41, 9],
  ["IYW", "iShares US Technology ETF", "Sector / Thematic", "ETF", 0.40, 18],
  ["PAVE", "Global X US Infrastructure Development ETF", "Sector / Thematic", "ETF", 0.47, 8],
  ["GDX", "VanEck Gold Miners ETF", "Sector / Thematic", "ETF", 0.51, 14],
  ["GDXJ", "VanEck Junior Gold Miners ETF", "Sector / Thematic", "ETF", 0.52, 5],
  ["URA", "Global X Uranium ETF", "Sector / Thematic", "ETF", 0.69, 3],
  ["COPX", "Global X Copper Miners ETF", "Sector / Thematic", "ETF", 0.65, 2],
  ["AMLP", "Alerian MLP ETF", "Sector / Thematic", "ETF", 0.85, 9],
  ["IDRV", "iShares Self-Driving EV & Tech ETF", "Sector / Thematic", "ETF", 0.47, 0.4],
  ["AIQ", "Global X Artificial Intelligence & Tech ETF", "Sector / Thematic", "ETF", 0.68, 2.5],
  ["WCLD", "WisdomTree Cloud Computing ETF", "Sector / Thematic", "ETF", 0.45, 0.6],
  ["IPAY", "Amplify Digital Payments ETF", "Sector / Thematic", "ETF", 0.75, 0.5],
  // International
  ["EWS", "iShares MSCI Singapore ETF", "International Equity", "ETF", 0.50, 0.6],
  ["EWH", "iShares MSCI Hong Kong ETF", "International Equity", "ETF", 0.50, 0.6],
  ["EWP", "iShares MSCI Spain ETF", "International Equity", "ETF", 0.50, 0.6],
  ["EWQ", "iShares MSCI France ETF", "International Equity", "ETF", 0.50, 0.7],
  ["EWI", "iShares MSCI Italy ETF", "International Equity", "ETF", 0.50, 0.5],
  ["EWL", "iShares MSCI Switzerland ETF", "International Equity", "ETF", 0.50, 1.4],
  ["EWN", "iShares MSCI Netherlands ETF", "International Equity", "ETF", 0.50, 0.3],
  ["EWD", "iShares MSCI Sweden ETF", "International Equity", "ETF", 0.53, 0.3],
  ["EZA", "iShares MSCI South Africa ETF", "International Equity", "ETF", 0.59, 0.4],
  ["TUR", "iShares MSCI Turkey ETF", "International Equity", "ETF", 0.59, 0.3],
  ["THD", "iShares MSCI Thailand ETF", "International Equity", "ETF", 0.59, 0.2],
  ["EIDO", "iShares MSCI Indonesia ETF", "International Equity", "ETF", 0.57, 0.5],
  ["ARGT", "Global X MSCI Argentina ETF", "International Equity", "ETF", 0.59, 0.7],
  ["GREK", "Global X MSCI Greece ETF", "International Equity", "ETF", 0.58, 0.3],
  ["EPOL", "iShares MSCI Poland ETF", "International Equity", "ETF", 0.59, 0.4],
  ["EWW", "iShares MSCI Mexico ETF", "International Equity", "ETF", 0.50, 1.5],
  ["EPI", "WisdomTree India Earnings ETF", "International Equity", "ETF", 0.85, 3.5],
  ["FXI", "iShares China Large-Cap ETF", "International Equity", "ETF", 0.74, 5],
  ["VWO", "Vanguard FTSE Emerging Markets ETF", "International Equity", "ETF", 0.08, 80],
  ["DGS", "WisdomTree Emerging Markets SmallCap Dividend ETF", "International Equity", "ETF", 0.58, 2],
  ["DLS", "WisdomTree International SmallCap Dividend ETF", "International Equity", "ETF", 0.58, 2],
  // Bonds (credit, HY, muni state)
  ["JNK", "SPDR Bloomberg High Yield Bond ETF", "High Yield Bond", "ETF", 0.40, 8],
  ["USHY", "iShares Broad USD High Yield Corporate Bond ETF", "High Yield Bond", "ETF", 0.08, 16],
  ["ANGL", "VanEck Fallen Angel High Yield Bond ETF", "High Yield Bond", "ETF", 0.25, 3],
  ["SPSB", "SPDR Portfolio Short Term Corporate Bond ETF", "Short-Term Bond", "ETF", 0.04, 8],
  ["IGSB", "iShares 1-5 Year Investment Grade Corporate Bond ETF", "Short-Term Bond", "ETF", 0.04, 22],
  ["IGIB", "iShares 5-10 Year Investment Grade Corporate Bond ETF", "Corporate Bond", "ETF", 0.04, 13],
  ["SPIB", "SPDR Portfolio Intermediate Term Corporate Bond ETF", "Corporate Bond", "ETF", 0.04, 8],
  ["SPLB", "SPDR Portfolio Long Term Corporate Bond ETF", "Corporate Bond", "ETF", 0.04, 1],
  ["VWOB", "Vanguard Emerging Markets Government Bond ETF", "Emerging Markets Bond", "ETF", 0.20, 3],
  ["PCY", "Invesco Emerging Markets Sovereign Debt ETF", "Emerging Markets Bond", "ETF", 0.50, 2],
  ["BWX", "SPDR Bloomberg International Treasury Bond ETF", "World Bond", "ETF", 0.35, 1.5],
  ["VWEHX", "Vanguard High-Yield Corporate Fund", "High Yield Bond", "Mutual Fund", 0.23, 28],
  ["VWALX", "Vanguard High-Yield Tax-Exempt Fund Admiral", "High Yield Muni", "Mutual Fund", 0.09, 16],
  ["VBTLX", "Vanguard Total Bond Market Index Admiral", "Intermediate Core Bond", "Mutual Fund", 0.05, 100],
  ["VFSUX", "Vanguard Short-Term Investment-Grade Admiral", "Short-Term Bond", "Mutual Fund", 0.10, 60],
  ["CMF", "iShares California Muni Bond ETF", "Muni National Intermediate", "ETF", 0.08, 2.5],
  ["NYF", "iShares New York Muni Bond ETF", "Muni National Intermediate", "ETF", 0.25, 0.8],
  ["SHM", "SPDR Nuveen Bloomberg Short Term Muni Bond ETF", "Muni National Intermediate", "ETF", 0.20, 4],
  ["HYD", "VanEck High Yield Muni ETF", "High Yield Muni", "ETF", 0.32, 3],
  // Fidelity / Vanguard sector mutual funds
  ["FSELX", "Fidelity Select Semiconductors", "Sector / Thematic", "Mutual Fund", 0.67, 12],
  ["FSPHX", "Fidelity Select Health Care", "Sector / Thematic", "Mutual Fund", 0.65, 9],
  ["FSPTX", "Fidelity Select Technology", "Sector / Thematic", "Mutual Fund", 0.66, 14],
  ["FBIOX", "Fidelity Select Biotechnology", "Sector / Thematic", "Mutual Fund", 0.70, 5],
  ["FSCSX", "Fidelity Select Software & IT Services", "Sector / Thematic", "Mutual Fund", 0.68, 9],
  ["FSENX", "Fidelity Select Energy", "Sector / Thematic", "Mutual Fund", 0.76, 2.5],
  ["FSAGX", "Fidelity Select Gold", "Sector / Thematic", "Mutual Fund", 0.79, 2],
  ["VGHCX", "Vanguard Health Care Fund", "Sector / Thematic", "Mutual Fund", 0.32, 45],
  ["VGENX", "Vanguard Energy Fund", "Sector / Thematic", "Mutual Fund", 0.33, 4],
  ["VGSLX", "Vanguard Real Estate Index Admiral", "Sector / Thematic", "Mutual Fund", 0.13, 35],
  ["VITAX", "Vanguard Information Technology Index Admiral", "Sector / Thematic", "Mutual Fund", 0.10, 70],
  // More active equity MFs
  ["VWUSX", "Vanguard US Growth Fund", "US Equity Large Growth", "Mutual Fund", 0.38, 18],
  ["VWNDX", "Vanguard Windsor Fund", "US Equity Large Value", "Mutual Fund", 0.31, 20],
  ["VPMAX", "Vanguard PRIMECAP Admiral", "US Equity Large Growth", "Mutual Fund", 0.31, 70],
  ["VHCAX", "Vanguard Capital Opportunity Admiral", "US Equity Large Growth", "Mutual Fund", 0.36, 18],
  ["RPMGX", "T. Rowe Price Mid-Cap Growth", "US Equity Mid Growth", "Mutual Fund", 0.73, 30],
  ["PRNHX", "T. Rowe Price New Horizons", "US Equity Small Growth", "Mutual Fund", 0.75, 25],
  ["PRDGX", "T. Rowe Price Dividend Growth", "US Equity Large Blend", "Mutual Fund", 0.64, 22],
  ["OTCFX", "T. Rowe Price Small-Cap Stock", "US Equity Small Blend", "Mutual Fund", 0.89, 12],
  ["PRMSX", "T. Rowe Price Emerging Markets Stock", "International Equity", "Mutual Fund", 1.18, 5],
  ["ANWPX", "American Funds New Perspective A", "International Equity", "Mutual Fund", 0.71, 140],
  ["AEPGX", "American Funds EuroPacific Growth A", "International Equity", "Mutual Fund", 0.83, 130],
  ["AMCPX", "American Funds AMCAP A", "US Equity Large Growth", "Mutual Fund", 0.67, 80],
  ["AIVSX", "American Funds Investment Company of America A", "US Equity Large Blend", "Mutual Fund", 0.58, 120],
  ["AGTHX", "American Funds Growth Fund of America A", "US Equity Large Growth", "Mutual Fund", 0.61, 270],
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
