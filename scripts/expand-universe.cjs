/* One-off: expand the fund universe with well-known ETFs + mutual funds.
   Adds to data/universe.json and src/data/fund-meta.json, deduped by ticker. */
const fs = require("fs");
const path = require("path");

const UNI_PATH  = path.join(__dirname, "..", "data", "universe.json");
const META_PATH = path.join(__dirname, "..", "src", "data", "fund-meta.json");

const universe = JSON.parse(fs.readFileSync(UNI_PATH, "utf8"));
const meta     = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
const have = new Set(universe.map((f) => f.ticker));

function benchFor(cat) {
  const c = cat.toLowerCase();
  if (c.includes("bond") || c.includes("muni") || c.includes("treasury") || c.includes("government") ||
      c.includes("preferred") || c.includes("bank loan") || c.includes("inflation") ||
      c.includes("corporate") || c.includes("ultrashort")) return "AGG";
  if (c.includes("international") || c.includes("emerging") || c.includes("world") || c.includes("global")) return "VXUS";
  return "SPY";
}

// [ticker, name, category, vehicle, er(%), aum($B)]
const ADD = [
  // ── US Equity Large Blend ──
  ["SPLG","SPDR Portfolio S&P 500 ETF","US Equity Large Blend","ETF",0.02,45],
  ["SCHX","Schwab U.S. Large-Cap ETF","US Equity Large Blend","ETF",0.03,45],
  ["SCHK","Schwab 1000 Index ETF","US Equity Large Blend","ETF",0.05,35],
  ["VV","Vanguard Large-Cap ETF","US Equity Large Blend","ETF",0.04,35],
  ["OEF","iShares S&P 100 ETF","US Equity Large Blend","ETF",0.20,13],
  ["IWL","iShares Russell Top 200 ETF","US Equity Large Blend","ETF",0.15,6],
  ["DIA","SPDR Dow Jones Industrial Average ETF","US Equity Large Blend","ETF",0.16,38],
  ["FNILX","Fidelity ZERO Large Cap Index","US Equity Large Blend","Mutual Fund",0.00,22],
  ["VONE","Vanguard Russell 1000 ETF","US Equity Large Blend","ETF",0.07,5],
  ["SPTM","SPDR Portfolio S&P 1500 ETF","US Equity Large Blend","ETF",0.03,9],
  ["PRBLX","Parnassus Core Equity","US Equity Large Blend","Mutual Fund",0.81,30],
  ["DYNF","BlackRock U.S. Equity Factor Rotation ETF","US Equity Large Blend","ETF",0.30,12],
  ["OMFL","Invesco Russell 1000 Dynamic Multifactor ETF","US Equity Large Blend","ETF",0.29,5],
  ["SPLV","Invesco S&P 500 Low Volatility ETF","US Equity Large Blend","ETF",0.25,11],
  // ── US Equity Large Growth ──
  ["IWY","iShares Russell Top 200 Growth ETF","US Equity Large Growth","ETF",0.20,8],
  ["SPGP","Invesco S&P 500 GARP ETF","US Equity Large Growth","ETF",0.34,5],
  ["XLG","Invesco S&P 500 Top 50 ETF","US Equity Large Growth","ETF",0.20,6],
  ["VIGAX","Vanguard Growth Index Admiral","US Equity Large Growth","Mutual Fund",0.05,30],
  ["HACAX","Harbor Capital Appreciation","US Equity Large Growth","Mutual Fund",0.66,30],
  ["MFEGX","MFS Growth","US Equity Large Growth","Mutual Fund",0.45,20],
  ["FDSVX","Fidelity Growth Discovery","US Equity Large Growth","Mutual Fund",0.74,8],
  // ── US Equity Large Value ──
  ["IWX","iShares Russell Top 200 Value ETF","US Equity Large Value","ETF",0.20,3],
  ["VVIAX","Vanguard Value Index Admiral","US Equity Large Value","Mutual Fund",0.05,30],
  ["FLCOX","Fidelity Large Cap Value Index","US Equity Large Value","Mutual Fund",0.035,6],
  ["PRDGX","T. Rowe Price Dividend Growth","US Equity Large Value","Mutual Fund",0.64,25],
  ["VEIRX","Vanguard Equity Income Admiral","US Equity Large Value","Mutual Fund",0.18,55],
  ["SDOG","ALPS Sector Dividend Dogs ETF","US Equity Large Value","ETF",0.36,1],
  ["DHS","WisdomTree U.S. High Dividend ETF","US Equity Large Value","ETF",0.38,1],
  ["DLN","WisdomTree U.S. LargeCap Dividend ETF","US Equity Large Value","ETF",0.28,4],
  ["RDVY","First Trust Rising Dividend Achievers ETF","US Equity Large Value","ETF",0.49,12],
  ["FVD","First Trust Value Line Dividend ETF","US Equity Large Value","ETF",0.61,12],
  ["SPYD","SPDR Portfolio S&P 500 High Dividend ETF","US Equity Large Value","ETF",0.07,7],
  // ── US Equity Mid ──
  ["SCHM","Schwab U.S. Mid-Cap ETF","US Equity Mid Blend","ETF",0.04,11],
  ["VIMAX","Vanguard Mid-Cap Index Admiral","US Equity Mid Blend","Mutual Fund",0.05,60],
  ["IMCB","iShares Morningstar Mid-Cap ETF","US Equity Mid Blend","ETF",0.04,1],
  ["IMCG","iShares Morningstar Mid-Cap Growth ETF","US Equity Mid Growth","ETF",0.06,1],
  ["IWS","iShares Russell Mid-Cap Value ETF","US Equity Mid Value","ETF",0.23,14],
  ["IMCV","iShares Morningstar Mid-Cap Value ETF","US Equity Mid Value","ETF",0.06,1],
  ["DON","WisdomTree U.S. MidCap Dividend ETF","US Equity Mid Value","ETF",0.38,3],
  // ── US Equity Small ──
  ["VIOO","Vanguard S&P Small-Cap 600 ETF","US Equity Small Blend","ETF",0.10,3],
  ["VTWO","Vanguard Russell 2000 ETF","US Equity Small Blend","ETF",0.07,9],
  ["SLY","SPDR S&P 600 Small Cap ETF","US Equity Small Blend","ETF",0.15,2],
  ["FNDA","Schwab Fundamental U.S. Small Company ETF","US Equity Small Blend","ETF",0.25,7],
  ["VTWG","Vanguard Russell 2000 Growth ETF","US Equity Small Growth","ETF",0.15,1],
  ["SLYG","SPDR S&P 600 Small Cap Growth ETF","US Equity Small Growth","ETF",0.15,3],
  ["IJT","iShares S&P Small-Cap 600 Growth ETF","US Equity Small Growth","ETF",0.18,7],
  ["VTWV","Vanguard Russell 2000 Value ETF","US Equity Small Value","ETF",0.15,1],
  ["SLYV","SPDR S&P 600 Small Cap Value ETF","US Equity Small Value","ETF",0.15,4],
  ["IJS","iShares S&P Small-Cap 600 Value ETF","US Equity Small Value","ETF",0.18,8],
  // ── Sector: Technology ──
  ["FTEC","Fidelity MSCI Information Technology ETF","Sector Technology","ETF",0.084,10],
  ["IYW","iShares U.S. Technology ETF","Sector Technology","ETF",0.40,18],
  ["IGV","iShares Expanded Tech-Software ETF","Sector Technology","ETF",0.41,9],
  ["SOXQ","Invesco PHLX Semiconductor ETF","Sector Technology","ETF",0.19,1],
  // ── Sector: Healthcare ──
  ["IHI","iShares U.S. Medical Devices ETF","Sector Healthcare","ETF",0.40,6],
  ["IXJ","iShares Global Healthcare ETF","Sector Healthcare","ETF",0.41,4],
  ["IYH","iShares U.S. Healthcare ETF","Sector Healthcare","ETF",0.40,3],
  // ── Sector: Financials ──
  ["IYF","iShares U.S. Financials ETF","Sector Financials","ETF",0.40,2],
  ["KBE","SPDR S&P Bank ETF","Sector Financials","ETF",0.35,2],
  ["IAI","iShares U.S. Broker-Dealers ETF","Sector Financials","ETF",0.40,1],
  ["FNCL","Fidelity MSCI Financials ETF","Sector Financials","ETF",0.084,2],
  // ── Sector: Energy ──
  ["XOP","SPDR S&P Oil & Gas Exploration & Production ETF","Sector Energy","ETF",0.35,4],
  ["OIH","VanEck Oil Services ETF","Sector Energy","ETF",0.35,2],
  ["AMLP","Alerian MLP ETF","Sector Energy","ETF",0.85,8],
  ["IYE","iShares U.S. Energy ETF","Sector Energy","ETF",0.40,2],
  // ── Sector: Industrials ──
  ["IYJ","iShares U.S. Industrials ETF","Sector Industrials","ETF",0.40,2],
  ["FIDU","Fidelity MSCI Industrials ETF","Sector Industrials","ETF",0.084,1],
  // ── Sector: Materials ──
  ["VAW","Vanguard Materials ETF","Sector Materials","ETF",0.10,3],
  ["COPX","Global X Copper Miners ETF","Sector Materials","ETF",0.65,2],
  ["REMX","VanEck Rare Earth & Strategic Metals ETF","Sector Materials","ETF",0.53,1],
  ["SIL","Global X Silver Miners ETF","Sector Materials","ETF",0.65,1],
  // ── Sector: Utilities ──
  ["IDU","iShares U.S. Utilities ETF","Sector Utilities","ETF",0.40,1],
  ["FUTY","Fidelity MSCI Utilities ETF","Sector Utilities","ETF",0.084,1],
  // ── Sector: Real Estate ──
  ["SCHH","Schwab U.S. REIT ETF","Sector Real Estate","ETF",0.07,7],
  ["IYR","iShares U.S. Real Estate ETF","Sector Real Estate","ETF",0.40,3],
  ["USRT","iShares Core U.S. REIT ETF","Sector Real Estate","ETF",0.08,2],
  ["RWR","SPDR Dow Jones REIT ETF","Sector Real Estate","ETF",0.25,2],
  // ── Sector: Consumer ──
  ["FDIS","Fidelity MSCI Consumer Discretionary ETF","Sector Consumer Discretionary","ETF",0.084,1],
  ["IYC","iShares U.S. Consumer Discretionary ETF","Sector Consumer Discretionary","ETF",0.40,1],
  ["FSTA","Fidelity MSCI Consumer Staples ETF","Sector Consumer Staples","ETF",0.084,1],
  ["IYK","iShares U.S. Consumer Staples ETF","Sector Consumer Staples","ETF",0.40,1],
  ["KXI","iShares Global Consumer Staples ETF","Sector Consumer Staples","ETF",0.41,1],
  // ── Sector: Communication ──
  ["VOX","Vanguard Communication Services ETF","Sector Communication Services","ETF",0.10,4],
  ["FCOM","Fidelity MSCI Communication Services ETF","Sector Communication Services","ETF",0.084,1],
  ["IYZ","iShares U.S. Telecommunications ETF","Sector Communication Services","ETF",0.40,0.4],
  // ── International Equity ──
  ["SCHF","Schwab International Equity ETF","International Equity","ETF",0.06,30],
  ["VWILX","Vanguard International Growth Admiral","International Equity","Mutual Fund",0.32,50],
  ["VTMGX","Vanguard Developed Markets Index Admiral","International Equity","Mutual Fund",0.07,60],
  ["IEUR","iShares Core MSCI Europe ETF","International Equity","ETF",0.10,5],
  ["VGK","Vanguard FTSE Europe ETF","International Equity","ETF",0.09,18],
  ["EWJ","iShares MSCI Japan ETF","International Equity","ETF",0.50,12],
  ["VPL","Vanguard FTSE Pacific ETF","International Equity","ETF",0.08,5],
  ["HEFA","iShares Currency Hedged MSCI EAFE ETF","International Equity","ETF",0.35,3],
  ["IQLT","iShares MSCI Intl Quality Factor ETF","International Equity","ETF",0.30,5],
  ["EFAV","iShares MSCI EAFE Min Vol Factor ETF","International Equity","ETF",0.20,7],
  ["ACWI","iShares MSCI ACWI ETF","International Equity","ETF",0.32,18],
  ["AEPGX","American Funds EuroPacific Growth A","International Equity","Mutual Fund",0.81,140],
  ["VTRIX","Vanguard International Value","International Equity","Mutual Fund",0.38,12],
  ["FIGFX","Fidelity International Growth","International Equity","Mutual Fund",0.99,8],
  // ── Emerging Markets ──
  ["SCHE","Schwab Emerging Markets Equity ETF","Emerging Markets","ETF",0.11,12],
  ["EMXC","iShares MSCI Emerging Markets ex China ETF","Emerging Markets","ETF",0.25,12],
  ["FNDE","Schwab Fundamental Emerging Markets ETF","Emerging Markets","ETF",0.39,4],
  ["EEMV","iShares MSCI Emerging Markets Min Vol ETF","Emerging Markets","ETF",0.25,4],
  ["INDA","iShares MSCI India ETF","Emerging Markets","ETF",0.62,9],
  ["MCHI","iShares MSCI China ETF","Emerging Markets","ETF",0.58,5],
  ["FXI","iShares China Large-Cap ETF","Emerging Markets","ETF",0.74,5],
  ["EWZ","iShares MSCI Brazil ETF","Emerging Markets","ETF",0.58,4],
  // ── International Small Cap ──
  ["GWX","SPDR S&P International Small Cap ETF","International Small Cap","ETF",0.40,1],
  ["SCHC","Schwab International Small-Cap Equity ETF","International Small Cap","ETF",0.11,4],
  ["DLS","WisdomTree International SmallCap Dividend ETF","International Small Cap","ETF",0.58,2],
  // ── World ──
  ["URTH","iShares MSCI World ETF","World Large Stock Blend","ETF",0.24,3],
  ["SPGM","SPDR Portfolio MSCI Global Stock Market ETF","World Large Stock Blend","ETF",0.09,1],
  ["ANWPX","American Funds New Perspective A","World Large Stock Growth","Mutual Fund",0.41,140],
  // ── Fixed income: core ──
  ["FXNAX","Fidelity U.S. Bond Index","Intermediate Core Bond","Mutual Fund",0.025,60],
  ["SPAB","SPDR Portfolio Aggregate Bond ETF","Intermediate Core Bond","ETF",0.03,8],
  ["FTBFX","Fidelity Total Bond","Intermediate Core Plus Bond","Mutual Fund",0.45,40],
  // ── Short-term ──
  ["IGSB","iShares 1-5 Year IG Corporate Bond ETF","Short-Term Bond","ETF",0.04,22],
  ["SPSB","SPDR Portfolio Short Term Corporate Bond ETF","Short-Term Bond","ETF",0.04,8],
  ["BSV","Vanguard Short-Term Bond ETF","Short-Term Bond","ETF",0.04,40],
  ["VFSUX","Vanguard Short-Term Investment-Grade Admiral","Short-Term Bond","Mutual Fund",0.10,60],
  // ── Ultrashort ──
  ["ICSH","iShares Ultra Short-Term Bond ETF","Ultrashort Bond","ETF",0.08,7],
  ["SGOV","iShares 0-3 Month Treasury Bond ETF","Ultrashort Bond","ETF",0.09,30],
  ["BIL","SPDR Bloomberg 1-3 Month T-Bill ETF","Ultrashort Bond","ETF",0.1357,40],
  ["USFR","WisdomTree Floating Rate Treasury ETF","Ultrashort Bond","ETF",0.15,15],
  ["VUSB","Vanguard Ultra-Short Bond ETF","Ultrashort Bond","ETF",0.10,5],
  // ── Government ──
  ["EDV","Vanguard Extended Duration Treasury ETF","Long Government","ETF",0.06,3],
  ["ZROZ","PIMCO 25+ Year Zero Coupon U.S. Treasury ETF","Long Government","ETF",0.15,1],
  ["GOVT","iShares U.S. Treasury Bond ETF","Intermediate Government","ETF",0.05,25],
  ["SCHR","Schwab Intermediate-Term U.S. Treasury ETF","Intermediate Government","ETF",0.03,8],
  // ── Corporate ──
  ["SPLB","SPDR Portfolio Long Term Corporate Bond ETF","Corporate Bond","ETF",0.04,1],
  ["VTC","Vanguard Total Corporate Bond ETF","Corporate Bond","ETF",0.04,1],
  ["IGIB","iShares 5-10 Year IG Corporate Bond ETF","Corporate Bond","ETF",0.04,12],
  ["VWESX","Vanguard Long-Term Investment-Grade Admiral","Corporate Bond","Mutual Fund",0.12,16],
  ["VFIDX","Vanguard Intermediate-Term Investment-Grade Admiral","Corporate Bond","Mutual Fund",0.10,12],
  // ── High Yield ──
  ["USHY","iShares Broad USD High Yield Corporate Bond ETF","High Yield Bond","ETF",0.08,18],
  ["SHYG","iShares 0-5 Year High Yield Corporate Bond ETF","High Yield Bond","ETF",0.30,6],
  ["SJNK","SPDR Bloomberg Short Term High Yield Bond ETF","High Yield Bond","ETF",0.40,4],
  ["VWEHX","Vanguard High-Yield Corporate","High Yield Bond","Mutual Fund",0.23,25],
  // ── Bank Loan ──
  ["JAAA","Janus Henderson AAA CLO ETF","Bank Loan","ETF",0.21,20],
  ["FFRHX","Fidelity Floating Rate High Income","Bank Loan","Mutual Fund",0.68,10],
  // ── EM / World bond ──
  ["EMLC","VanEck J.P. Morgan EM Local Currency Bond ETF","Emerging Markets Bond","ETF",0.30,3],
  ["PCY","Invesco Emerging Markets Sovereign Debt ETF","Emerging Markets Bond","ETF",0.50,2],
  ["IGOV","iShares International Treasury Bond ETF","World Bond","ETF",0.35,1],
  ["BWX","SPDR Bloomberg International Treasury Bond ETF","World Bond","ETF",0.35,1],
  // ── TIPS ──
  ["SCHP","Schwab U.S. TIPS ETF","Inflation-Protected Bond","ETF",0.03,12],
  ["STIP","iShares 0-5 Year TIPS Bond ETF","Inflation-Protected Bond","ETF",0.03,12],
  ["VAIPX","Vanguard Inflation-Protected Securities Admiral","Inflation-Protected Bond","Mutual Fund",0.10,30],
  // ── Muni ──
  ["VWIUX","Vanguard Intermediate-Term Tax-Exempt Admiral","Muni National Intermediate","Mutual Fund",0.09,15],
  ["SUB","iShares Short-Term National Muni Bond ETF","Muni National Intermediate","ETF",0.07,9],
  ["FLTMX","Fidelity Intermediate Municipal Income","Muni National Intermediate","Mutual Fund",0.35,12],
  ["HYMU","BlackRock High Yield Muni ETF","High Yield Muni","ETF",0.35,1],
  ["VWAHX","Vanguard High-Yield Tax-Exempt","High Yield Muni","Mutual Fund",0.17,14],
  // ── Preferred ──
  ["PGX","Invesco Preferred ETF","Preferred Stock","ETF",0.50,4],
  ["VRP","Invesco Variable Rate Preferred ETF","Preferred Stock","ETF",0.50,2],
  ["FPE","First Trust Preferred Securities & Income ETF","Preferred Stock","ETF",0.84,5],
  // ── Allocation ──
  ["VGSTX","Vanguard STAR","Allocation 50-70% Equity","Mutual Fund",0.31,25],
  ["VWENX","Vanguard Wellington Admiral","Allocation 50-70% Equity","Mutual Fund",0.16,110],
  ["VWIAX","Vanguard Wellesley Income Admiral","Allocation 30-50% Equity","Mutual Fund",0.16,70],
  ["VTMFX","Vanguard Tax-Managed Balanced Admiral","Allocation 30-50% Equity","Mutual Fund",0.09,9],
  ["VASGX","Vanguard LifeStrategy Growth","Allocation 70-85% Equity","Mutual Fund",0.14,18],
  // ── Target date ──
  ["VTTVX","Vanguard Target Retirement 2025","Target Date 2021-2025","Mutual Fund",0.08,20],
  ["VFIFX","Vanguard Target Retirement 2050","Target Date 2046-2050","Mutual Fund",0.08,30],
  // ── Commodities ──
  ["SGOL","abrdn Physical Gold Shares ETF","Commodities","ETF",0.17,3],
  ["USO","United States Oil Fund","Commodities","ETF",0.60,1.5],
  ["UNG","United States Natural Gas Fund","Commodities","ETF",1.06,0.5],
  ["DJP","iPath Bloomberg Commodity Index ETN","Commodities","ETF",0.70,1],
  ["GSG","iShares S&P GSCI Commodity-Indexed Trust","Commodities","ETF",0.48,1],
  ["BCI","abrdn Bloomberg All Commodity Strategy ETF","Commodities","ETF",0.25,1],
  // ── Covered call / income ──
  ["QYLD","Global X NASDAQ 100 Covered Call ETF","Covered Call / Income","ETF",0.61,8],
  ["XYLD","Global X S&P 500 Covered Call ETF","Covered Call / Income","ETF",0.60,3],
  ["RYLD","Global X Russell 2000 Covered Call ETF","Covered Call / Income","ETF",0.60,1],
  ["SPYI","NEOS S&P 500 High Income ETF","Covered Call / Income","ETF",0.68,2],
];

let added = 0;
for (const [ticker, name, category, vehicle, er, aum] of ADD) {
  if (have.has(ticker)) continue;
  universe.push({ ticker, name, category, vehicle, benchmark: benchFor(category) });
  meta[ticker] = { er, aum };
  have.add(ticker);
  added++;
}

universe.sort((a, b) => a.ticker.localeCompare(b.ticker));
fs.writeFileSync(UNI_PATH, JSON.stringify(universe, null, 2) + "\n");
fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n");

console.log(`Added ${added} new funds.`);
console.log(`Universe now: ${universe.length} funds, meta: ${Object.keys(meta).filter((k) => k !== "_comment").length} entries.`);
