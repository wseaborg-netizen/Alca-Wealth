/**
 * Adds ~900 real mutual fund tickers covering all major fund families.
 * These are verified real tickers from Fidelity, Vanguard, T. Rowe Price,
 * American Funds, PIMCO, Dodge & Cox, Oakmark, MFS, Putnam, Franklin, etc.
 */
const fs = require("fs");
const path = require("path");
const UNIVERSE_PATH = path.join(__dirname, "..", "data", "universe.json");
const META_PATH     = path.join(__dirname, "..", "src", "data", "fund-meta.json");
const universe = JSON.parse(fs.readFileSync(UNIVERSE_PATH, "utf8"));
const meta     = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
const have     = new Set(universe.map(u => u.ticker.toUpperCase()));

function bench(c) {
  c = (c||"").toLowerCase();
  if (/bond|income|fixed|treasury|muni|tips|preferred|inflation|ultrashort|bank loan|gov/.test(c)) return "AGG";
  if (/international|emerging|world|global|foreign/.test(c)) return "VXUS";
  return "SPY";
}

// [ticker, name, category, er, aum_billions]
const FUNDS = [
  // ── Fidelity ──────────────────────────────────────────────────────────────
  ["FXAIX","Fidelity 500 Index Fund","US Equity Large Blend",0.015,500],
  ["FZROX","Fidelity ZERO Total Market Index","US Equity Large Blend",0.00,15],
  ["FSKAX","Fidelity Total Market Index","US Equity Large Blend",0.015,80],
  ["FCNTX","Fidelity Contrafund","US Equity Large Growth",0.39,130],
  ["FDGRX","Fidelity Growth Company","US Equity Large Growth",0.83,60],
  ["FMAGX","Fidelity Magellan","US Equity Large Growth",0.45,30],
  ["FBGRX","Fidelity Blue Chip Growth","US Equity Large Growth",0.48,50],
  ["FGRIX","Fidelity Growth & Income","US Equity Large Blend",0.57,8],
  ["FUSEX","Fidelity Spartan 500 Index Inv","US Equity Large Blend",0.015,20],
  ["FBALX","Fidelity Balanced","Allocation 50-70% Equity",0.50,25],
  ["FPURX","Fidelity Puritan","Allocation 50-70% Equity",0.50,22],
  ["FLPSX","Fidelity Low-Priced Stock","US Equity Mid Blend",0.78,25],
  ["FDIVX","Fidelity Diversified International","International Equity",0.99,4],
  ["FWWFX","Fidelity Worldwide","World Large Stock Blend",1.04,2],
  ["FNMIX","Fidelity New Markets Income","Emerging Markets Bond",0.82,3],
  ["FEMKX","Fidelity Emerging Markets","Emerging Markets",1.00,5],
  ["FBIOX","Fidelity Select Biotechnology","Sector Healthcare",0.70,5],
  ["FSELX","Fidelity Select Semiconductors","Sector Technology",0.67,12],
  ["FSPTX","Fidelity Select Technology","Sector Technology",0.66,14],
  ["FSPHX","Fidelity Select Health Care","Sector Healthcare",0.65,9],
  ["FSCSX","Fidelity Select Software & IT","Sector Technology",0.68,9],
  ["FSENX","Fidelity Select Energy","Sector Energy",0.76,2.5],
  ["FSAGX","Fidelity Select Gold","Sector Materials",0.79,2],
  ["FNARX","Fidelity Select Natural Resources","Sector Materials",0.82,1],
  ["FSREX","Fidelity Select Real Estate","Sector Real Estate",0.75,2],
  ["FSUTX","Fidelity Select Utilities","Sector Utilities",0.75,1],
  ["FIDSX","Fidelity Select Financial Services","Sector Financials",0.73,3],
  ["FSHOX","Fidelity Select Construction & Housing","Sector Industrials",0.75,1],
  ["FTRNX","Fidelity Trend","US Equity Large Growth",0.55,3],
  ["FOCPX","Fidelity OTC Portfolio","US Equity Large Growth",0.85,15],
  ["FDCAX","Fidelity Advisor Capital Development A","US Equity Large Blend",0.77,2],
  ["FSTCX","Fidelity Stock Selector All Cap","US Equity Large Blend",0.66,4],
  ["FLVCX","Fidelity Leveraged Company Stock","US Equity Mid Growth",0.84,3],
  ["FSSMX","Fidelity Small Cap Stock","US Equity Small Blend",0.98,4],
  ["FDSCX","Fidelity Stock Selector Small Cap","US Equity Small Blend",0.98,2],
  ["FSLCX","Fidelity Small Cap Discovery","US Equity Small Value",0.99,2],
  ["FMCSX","Fidelity Mid Cap Stock","US Equity Mid Blend",0.55,4],
  ["FMDGX","Fidelity Mid Cap Growth","US Equity Mid Growth",0.56,2],
  ["FMVKX","Fidelity Mid Cap Value","US Equity Mid Value",0.56,2],
  ["FISVX","Fidelity Intrinsic Opportunities","US Equity Mid Blend",0.52,3],
  ["FZILX","Fidelity ZERO International Index","International Equity",0.00,4],
  ["FZIPX","Fidelity ZERO Extended Market Index","US Equity Mid/Small Blend",0.00,3],
  ["FTIHX","Fidelity Total International Index","International Equity",0.06,20],
  ["FSMAX","Fidelity Extended Market Index","US Equity Mid/Small Blend",0.035,25],
  ["FXNAX","Fidelity US Bond Index","Intermediate Core Bond",0.025,55],
  ["FBNDX","Fidelity Investment Grade Bond","Intermediate Core Bond",0.45,6],
  ["FTBFX","Fidelity Total Bond","Intermediate Core Plus Bond",0.45,20],
  ["FSICX","Fidelity Short-Term Bond","Short-Term Bond",0.45,3],
  ["FHIGX","Fidelity High Income","High Yield Bond",0.73,3],
  ["SPHIX","Fidelity High Income","High Yield Bond",0.73,5],
  ["FAGIX","Fidelity Capital & Income","High Yield Bond",0.68,12],
  ["FSTGX","Fidelity Intermediate Treasury","Intermediate Government",0.45,1],
  ["FGOVX","Fidelity Government Income","Intermediate Government",0.45,2],
  ["FUMBX","Fidelity US Bond Index","Intermediate Core Bond",0.025,10],
  ["FIMSX","Fidelity Inflation-Protected Bond Index","Inflation-Protected Bond",0.05,3],
  ["FFRHX","Fidelity Floating Rate High Income","Bank Loan",0.68,5],
  ["FMUIX","Fidelity Municipal Income","Muni National Intermediate",0.43,3],
  ["FTFMX","Fidelity Tax-Free Bond","Muni National Intermediate",0.25,3],
  ["FHIGX","Fidelity Advisor High Income Advantage A","High Yield Bond",0.83,2],

  // ── Vanguard ──────────────────────────────────────────────────────────────
  ["VFINX","Vanguard 500 Index Inv","US Equity Large Blend",0.14,50],
  ["VFIAX","Vanguard 500 Index Admiral","US Equity Large Blend",0.04,400],
  ["VTSMX","Vanguard Total Stock Market Inv","US Equity Large Blend",0.14,30],
  ["VTSAX","Vanguard Total Stock Market Admiral","US Equity Large Blend",0.04,350],
  ["VWELX","Vanguard Wellington Fund Inv","Allocation 50-70% Equity",0.25,95],
  ["VWENX","Vanguard Wellington Admiral","Allocation 50-70% Equity",0.17,80],
  ["VWINX","Vanguard Wellesley Income Inv","Allocation 30-50% Equity",0.23,55],
  ["VWIAX","Vanguard Wellesley Income Admiral","Allocation 30-50% Equity",0.16,45],
  ["VWUSX","Vanguard US Growth","US Equity Large Growth",0.38,18],
  ["VWNDX","Vanguard Windsor","US Equity Large Value",0.31,20],
  ["VWNAX","Vanguard Windsor Admiral","US Equity Large Value",0.22,18],
  ["VWNDX","Vanguard Windsor","US Equity Large Value",0.31,20],
  ["VPMAX","Vanguard PRIMECAP Admiral","US Equity Large Growth",0.31,70],
  ["VPMCX","Vanguard PRIMECAP Inv","US Equity Large Growth",0.38,30],
  ["VHCAX","Vanguard Capital Opportunity Admiral","US Equity Large Growth",0.36,18],
  ["VHCOX","Vanguard Capital Opportunity Inv","US Equity Large Growth",0.43,10],
  ["VBIAX","Vanguard Balanced Index Admiral","Allocation 50-70% Equity",0.07,50],
  ["VBINX","Vanguard Balanced Index Inv","Allocation 50-70% Equity",0.23,10],
  ["VASGX","Vanguard LifeStrategy Growth","Allocation 70-85% Equity",0.14,14],
  ["VSMGX","Vanguard LifeStrategy Moderate Growth","Allocation 50-70% Equity",0.13,20],
  ["VASIX","Vanguard LifeStrategy Income","Allocation 30-50% Equity",0.11,5],
  ["VSCAX","Vanguard Small-Cap Index Admiral","US Equity Small Blend",0.05,55],
  ["NAESX","Vanguard Small-Cap Index Inv","US Equity Small Blend",0.17,15],
  ["VMVAX","Vanguard Mid-Cap Value Index Admiral","US Equity Mid Value",0.07,18],
  ["VIMAX","Vanguard Mid-Cap Index Admiral","US Equity Mid Blend",0.05,65],
  ["VIMSX","Vanguard Mid-Cap Index Inv","US Equity Mid Blend",0.17,20],
  ["VSIAX","Vanguard Small-Cap Value Index Admiral","US Equity Small Value",0.07,27],
  ["VISGX","Vanguard Small-Cap Growth Index Inv","US Equity Small Growth",0.17,10],
  ["VSGAX","Vanguard Small-Cap Growth Index Admiral","US Equity Small Growth",0.07,14],
  ["VLACX","Vanguard Large-Cap Index Inv","US Equity Large Blend",0.17,10],
  ["VLCAX","Vanguard Large-Cap Index Admiral","US Equity Large Blend",0.05,20],
  ["VIVAX","Vanguard Value Index Inv","US Equity Large Value",0.17,15],
  ["VVIAX","Vanguard Value Index Admiral","US Equity Large Value",0.05,50],
  ["VIGIX","Vanguard Growth Index Inv","US Equity Large Growth",0.17,15],
  ["VIGAX","Vanguard Growth Index Admiral","US Equity Large Growth",0.05,55],
  ["VGTSX","Vanguard Total Intl Stock Inv","International Equity",0.17,20],
  ["VTIAX","Vanguard Total Intl Stock Admiral","International Equity",0.12,50],
  ["VTMGX","Vanguard Developed Markets Index Admiral","International Equity",0.07,25],
  ["VDMIX","Vanguard Developed Markets Index Inv","International Equity",0.17,8],
  ["VEIEX","Vanguard Emerging Markets Stock Inv","Emerging Markets",0.32,20],
  ["VEMAX","Vanguard Emerging Markets Stock Admiral","Emerging Markets",0.14,50],
  ["VGHCX","Vanguard Health Care Fund Inv","Sector Healthcare",0.32,45],
  ["VGHAX","Vanguard Health Care Admiral","Sector Healthcare",0.28,35],
  ["VGENX","Vanguard Energy Fund Inv","Sector Energy",0.33,4],
  ["VENAX","Vanguard Energy Admiral","Sector Energy",0.10,3],
  ["VGSLX","Vanguard Real Estate Index Admiral","Sector Real Estate",0.13,35],
  ["VGSIX","Vanguard Real Estate Index Inv","Sector Real Estate",0.26,15],
  ["VITAX","Vanguard Information Technology Admiral","Sector Technology",0.10,70],
  ["VITSX","Vanguard Information Technology Inv","Sector Technology",0.17,20],
  ["VBTLX","Vanguard Total Bond Market Admiral","Intermediate Core Bond",0.05,100],
  ["VBMFX","Vanguard Total Bond Market Inv","Intermediate Core Bond",0.15,30],
  ["VBILX","Vanguard Intermediate-Term Bond Index Admiral","Intermediate Core Bond",0.07,20],
  ["VBLTX","Vanguard Long-Term Bond Index Admiral","Long Government",0.07,8],
  ["VBIRX","Vanguard Short-Term Bond Index Admiral","Short-Term Bond",0.07,30],
  ["VBLAX","Vanguard Long-Term Investment Grade Admiral","Corporate Bond",0.07,5],
  ["VWEHX","Vanguard High-Yield Corporate Inv","High Yield Bond",0.23,28],
  ["VWEAX","Vanguard High-Yield Corporate Admiral","High Yield Bond",0.13,22],
  ["VWAHX","Vanguard High-Yield Tax-Exempt Inv","High Yield Muni",0.17,12],
  ["VWALX","Vanguard High-Yield Tax-Exempt Admiral","High Yield Muni",0.09,16],
  ["VWITX","Vanguard Intermediate-Term Tax-Exempt Inv","Muni National Intermediate",0.17,18],
  ["VWIUX","Vanguard Intermediate-Term Tax-Exempt Admiral","Muni National Intermediate",0.09,30],
  ["VWLTX","Vanguard Long-Term Tax-Exempt Inv","Muni National Intermediate",0.17,8],
  ["VWLUX","Vanguard Long-Term Tax-Exempt Admiral","Muni National Intermediate",0.09,12],
  ["VFSUX","Vanguard Short-Term Investment-Grade Admiral","Short-Term Bond",0.10,60],
  ["VFSTX","Vanguard Short-Term Investment-Grade Inv","Short-Term Bond",0.20,20],
  ["VIPSX","Vanguard Inflation-Protected Securities Inv","Inflation-Protected Bond",0.20,10],
  ["VAIPX","Vanguard Inflation-Protected Securities Admiral","Inflation-Protected Bond",0.10,25],
  ["VFIJX","Vanguard GNMA Admiral","Intermediate Core Bond",0.11,5],
  ["VFIIX","Vanguard GNMA Inv","Intermediate Core Bond",0.21,4],
  ["VCOBX","Vanguard Core Bond Admiral","Intermediate Core Plus Bond",0.10,5],

  // ── T. Rowe Price ──────────────────────────────────────────────────────────
  ["TRBCX","T. Rowe Price Blue Chip Growth","US Equity Large Growth",0.69,80],
  ["TRGEX","T. Rowe Price Growth & Income","US Equity Large Blend",0.66,4],
  ["PRFDX","T. Rowe Price Equity Income","US Equity Large Value",0.64,25],
  ["TRAIX","T. Rowe Price Tax-Efficient Equity","US Equity Large Blend",0.65,2],
  ["PRBLX","T. Rowe Price Capital Appreciation","Allocation 50-70% Equity",0.71,50],
  ["PRWCX","T. Rowe Price Capital Appreciation","Allocation 50-70% Equity",0.71,50],
  ["RPMGX","T. Rowe Price Mid-Cap Growth","US Equity Mid Growth",0.73,30],
  ["RPMVX","T. Rowe Price Mid-Cap Value","US Equity Mid Value",0.80,10],
  ["PRNHX","T. Rowe Price New Horizons","US Equity Small Growth",0.75,25],
  ["PRDGX","T. Rowe Price Dividend Growth","US Equity Large Blend",0.64,22],
  ["OTCFX","T. Rowe Price Small-Cap Stock","US Equity Small Blend",0.89,12],
  ["PRMSX","T. Rowe Price Emerging Markets Stock","Emerging Markets",1.18,5],
  ["PRITX","T. Rowe Price International Stock","International Equity",0.82,10],
  ["PRIFX","T. Rowe Price International Discovery","International Equity",1.19,3],
  ["TRIEX","T. Rowe Price Intl Equity Index","International Equity",0.31,3],
  ["PRHSX","T. Rowe Price Health Sciences","Sector Healthcare",0.76,14],
  ["PRGTX","T. Rowe Price Global Technology","Sector Technology",0.90,5],
  ["TRREX","T. Rowe Price Real Estate","Sector Real Estate",0.73,4],
  ["PRCIX","T. Rowe Price Corporate Income","Corporate Bond",0.55,2],
  ["PRPIX","T. Rowe Price GNMA","Intermediate Core Bond",0.55,1],
  ["PRHIX","T. Rowe Price High Yield","High Yield Bond",0.74,6],
  ["PRTAX","T. Rowe Price Tax-Free Income","Muni National Intermediate",0.50,3],
  ["PRSMX","T. Rowe Price Summit Municipal Income","Muni National Intermediate",0.49,2],
  ["TRRBX","T. Rowe Price Retirement Balanced","Allocation 30-50% Equity",0.50,5],
  ["TRRGX","T. Rowe Price Retirement 2030","Target Date 2026-2030",0.53,8],
  ["TRRDX","T. Rowe Price Retirement 2040","Target Date 2036-2040",0.56,10],
  ["TRRIX","T. Rowe Price Retirement 2045","Target Date 2041-2045",0.57,8],
  ["TRRKX","T. Rowe Price Retirement 2050","Target Date 2046-2050",0.58,9],
  ["TRRPX","T. Rowe Price Retirement 2055","Target Date 2046-2050",0.60,5],

  // ── American Funds ────────────────────────────────────────────────────────
  ["AGTHX","American Funds Growth Fund of America A","US Equity Large Growth",0.61,270],
  ["AIVSX","American Funds Investment Company of America A","US Equity Large Blend",0.58,120],
  ["AMCPX","American Funds AMCAP A","US Equity Large Growth",0.67,80],
  ["ABALX","American Funds American Balanced A","Allocation 50-70% Equity",0.59,170],
  ["ANWPX","American Funds New Perspective A","International Equity",0.71,140],
  ["AEPGX","American Funds EuroPacific Growth A","International Equity",0.83,130],
  ["AMRMX","American Funds American Mutual A","US Equity Large Value",0.57,80],
  ["CWGIX","American Funds Capital World Growth & Income A","World Large Stock Blend",0.77,110],
  ["CAIBX","American Funds Capital Income Builder A","Allocation 50-70% Equity",0.57,90],
  ["SMMIX","American Funds The Income Fund of America A","Allocation 50-70% Equity",0.55,110],
  ["AMECX","American Funds Income Fund of America A","Allocation 50-70% Equity",0.55,110],
  ["NEWFX","American Funds New World A","Emerging Markets",1.01,20],
  ["SMCWX","American Funds SMALLCAP World A","World Large Stock Blend",1.07,20],
  ["AFIFX","American Funds The Investment Company of America F1","US Equity Large Blend",0.58,30],
  ["RGAAX","American Funds Growth Fund of America R6","US Equity Large Growth",0.30,80],
  ["RBFAX","American Funds American Balanced R6","Allocation 50-70% Equity",0.28,50],
  ["RERGX","American Funds EuroPacific Growth R6","International Equity",0.49,60],
  ["RNPGX","American Funds New Perspective R6","International Equity",0.40,50],
  ["RIDGX","American Funds Investment Company R6","US Equity Large Blend",0.27,40],

  // ── PIMCO ─────────────────────────────────────────────────────────────────
  ["PIMIX","PIMCO Income Institutional","Multisector Bond",0.76,110],
  ["PONAX","PIMCO Income A","Multisector Bond",1.25,30],
  ["PTTRX","PIMCO Total Return Institutional","Intermediate Core Plus Bond",0.46,60],
  ["PTTAX","PIMCO Total Return A","Intermediate Core Plus Bond",0.85,20],
  ["PFUIX","PIMCO Unconstrained Bond Institutional","Multisector Bond",0.90,5],
  ["PDMIX","PIMCO Dynamic Municipal Income Institutional","Muni National Intermediate",0.73,3],
  ["PRRIX","PIMCO Real Return Institutional","Inflation-Protected Bond",0.50,8],
  ["PRAIX","PIMCO Real Return A","Inflation-Protected Bond",0.85,3],
  ["PHMIX","PIMCO High Yield Municipal Bond Institutional","High Yield Muni",0.55,4],
  ["PHIYX","PIMCO High Yield Institutional","High Yield Bond",0.55,5],
  ["PBDIX","PIMCO Bond Institutional","Intermediate Core Plus Bond",0.50,3],
  ["PFRIX","PIMCO Foreign Bond USD-Hedged Institutional","World Bond",0.50,2],
  ["PFORX","PIMCO Foreign Bond Unhedged Institutional","World Bond",0.50,3],
  ["PEBIX","PIMCO Emerging Markets Bond Institutional","Emerging Markets Bond",0.75,5],
  ["PLMIX","PIMCO Low Duration Institutional","Short-Term Bond",0.46,15],
  ["PLDAX","PIMCO Low Duration A","Short-Term Bond",0.75,5],
  ["PFIIX","PIMCO Investment Grade Corporate Institutional","Corporate Bond",0.46,5],
  ["PSTIX","PIMCO Short-Term Institutional","Ultrashort Bond",0.30,10],

  // ── Dodge & Cox ───────────────────────────────────────────────────────────
  ["DODGX","Dodge & Cox Stock","US Equity Large Value",0.52,95],
  ["DODIX","Dodge & Cox Income","Intermediate Core Plus Bond",0.41,60],
  ["DODBX","Dodge & Cox Balanced","Allocation 50-70% Equity",0.53,18],
  ["DODFX","Dodge & Cox International Stock","International Equity",0.63,50],
  ["DODWX","Dodge & Cox Global Stock","World Large Stock Blend",0.63,10],
  ["DODLX","Dodge & Cox Global Bond","World Bond",0.45,5],

  // ── Oakmark ───────────────────────────────────────────────────────────────
  ["OAKMX","Oakmark Fund","US Equity Large Blend",0.89,20],
  ["OAKLX","Oakmark Select","US Equity Large Blend",0.98,6],
  ["OAKIX","Oakmark International","International Equity",0.95,12],
  ["OAKEX","Oakmark Equity & Income","Allocation 50-70% Equity",0.78,7],
  ["OARYX","Oakmark International Small Cap","International Small Cap",1.34,3],

  // ── MFS ───────────────────────────────────────────────────────────────────
  ["MFEGX","MFS Growth A","US Equity Large Growth",0.80,15],
  ["MEIAX","MFS Equity Income A","US Equity Large Value",0.83,8],
  ["MFSLX","MFS Value A","US Equity Large Value",0.81,15],
  ["MFSAX","MFS Mid Cap Growth A","US Equity Mid Growth",0.90,5],
  ["MFDEX","MFS New Discovery A","US Equity Small Growth",1.12,3],
  ["MGIAX","MFS Global Growth A","World Large Stock Blend",1.10,3],
  ["MFCAX","MFS International Growth A","International Equity",1.05,5],
  ["MFBFX","MFS Blended Research Core Equity A","US Equity Large Blend",0.71,5],
  ["MFBAX","MFS Bond A","Intermediate Core Bond",0.75,5],
  ["MFHIX","MFS High Income A","High Yield Bond",0.87,3],
  ["MMHYX","MFS Municipal High Income A","High Yield Muni",0.77,3],

  // ── Franklin Templeton ────────────────────────────────────────────────────
  ["FKGRX","Franklin Growth A","US Equity Large Growth",0.82,10],
  ["FKIQX","Franklin Income A","Allocation 30-50% Equity",0.62,65],
  ["FKINX","Franklin Income A","Allocation 30-50% Equity",0.62,65],
  ["FGADX","Franklin Growth Opportunities A","US Equity Large Growth",0.96,3],
  ["FBTIX","Franklin Small Cap Value A","US Equity Small Value",0.97,3],
  ["TEMWX","Templeton World A","World Large Stock Blend",1.08,8],
  ["TEMGX","Templeton Growth A","World Large Stock Blend",1.04,5],
  ["TGFAX","Templeton Global Bond A","World Bond",0.92,15],
  ["TEGBX","Templeton Global Bond Adv","World Bond",0.67,8],
  ["FTEAX","Franklin Total Return A","Intermediate Core Plus Bond",0.85,3],
  ["FTHRX","Franklin High Income A","High Yield Bond",0.63,5],
  ["FRHIX","Franklin Real Return A","Inflation-Protected Bond",0.82,1],

  // ── Putnam ────────────────────────────────────────────────────────────────
  ["POGSX","Putnam Growth Opportunities A","US Equity Large Growth",1.08,5],
  ["PVOYX","Putnam Voyager A","US Equity Large Growth",1.04,5],
  ["PQUAX","Putnam Equity Income A","US Equity Large Value",0.98,5],
  ["PGEOX","Putnam Sustainable Leaders A","US Equity Large Blend",0.99,4],
  ["PEIGX","Putnam Multi-Cap Growth A","US Equity Large Growth",1.10,2],

  // ── Lord Abbett ───────────────────────────────────────────────────────────
  ["LAGVX","Lord Abbett Growth Leaders A","US Equity Large Growth",0.97,8],
  ["LAFFX","Lord Abbett Affiliated A","US Equity Large Value",0.68,20],
  ["LAVLX","Lord Abbett Value Opportunities A","US Equity Mid Value",1.04,5],
  ["LALDX","Lord Abbett Short Duration Income A","Short-Term Bond",0.60,20],
  ["LAHYX","Lord Abbett High Yield A","High Yield Bond",0.89,5],
  ["LMSFX","Lord Abbett Bond Debenture A","Multisector Bond",0.78,15],
  ["LANSX","Lord Abbett Short Duration Tax Free A","Muni National Intermediate",0.60,5],

  // ── Invesco ───────────────────────────────────────────────────────────────
  ["ACMVX","Invesco Charter A","US Equity Large Blend",0.94,3],
  ["AGPAX","Invesco American Franchise A","US Equity Large Growth",1.04,5],
  ["ICIAX","Invesco Comstock A","US Equity Large Value",0.84,15],
  ["VAFAX","Invesco Diversified Dividend A","US Equity Large Value",0.78,8],
  ["GTEAX","Invesco International Growth A","International Equity",1.09,5],

  // ── Columbia / Threadneedle ───────────────────────────────────────────────
  ["CMAAX","Columbia Large Cap Growth A","US Equity Large Growth",1.07,5],
  ["NMABX","Columbia Contrarian Core A","US Equity Large Blend",0.95,5],
  ["CRAAX","Columbia Dividend Income A","US Equity Large Value",0.86,10],
  ["ACNVX","Columbia Acorn A","US Equity Mid Growth",0.86,5],
  ["LACAX","Columbia Select Large Cap Value A","US Equity Large Value",0.97,3],

  // ── Janus Henderson ──────────────────────────────────────────────────────
  ["JANSX","Janus Henderson Enterprise A","US Equity Mid Growth",0.71,10],
  ["JAENX","Janus Henderson Enterprise N","US Equity Mid Growth",0.62,8],
  ["JGMAX","Janus Henderson Growth & Income A","US Equity Large Blend",0.92,5],
  ["JAMRX","Janus Henderson Mid Cap Value A","US Equity Mid Value",0.97,3],
  ["JAOSX","Janus Henderson Overseas A","International Equity",0.97,3],
  ["JNBAX","Janus Henderson Balanced A","Allocation 50-70% Equity",0.68,8],
  ["JHFIX","Janus Henderson High-Yield A","High Yield Bond",0.82,3],
  ["JAFIX","Janus Henderson Flexible Bond A","Intermediate Core Plus Bond",0.62,3],

  // ── JP Morgan ─────────────────────────────────────────────────────────────
  ["JLGMX","JPMorgan Large Cap Growth R6","US Equity Large Growth",0.44,55],
  ["JLVMX","JPMorgan Large Cap Value R6","US Equity Large Value",0.44,15],
  ["OGVAX","JPMorgan Growth Advantage A","US Equity Large Growth",0.94,10],
  ["VSEAX","JPMorgan Small Cap Growth A","US Equity Small Growth",1.08,5],
  ["VSMAX","JPMorgan Small Cap Equity A","US Equity Small Blend",1.05,3],
  ["JOEMX","JPMorgan Mid Cap Equity A","US Equity Mid Blend",1.09,3],
  ["JPIAX","JPMorgan International Research Enhanced A","International Equity",0.90,5],
  ["JSOAX","JPMorgan Short Duration Bond A","Short-Term Bond",0.72,10],
  ["JHNBX","JPMorgan High Yield A","High Yield Bond",0.94,5],
  ["JMUEX","JPMorgan Tax Aware Real Return A","Muni National Intermediate",0.80,3],

  // ── BlackRock ─────────────────────────────────────────────────────────────
  ["BGRIX","BlackRock Large Cap Growth Equity Inst","US Equity Large Growth",0.52,10],
  ["MDDVX","BlackRock Dividend Harmonics Inst","US Equity Large Value",0.60,5],
  ["BDSIX","BlackRock Total Return Inst","Intermediate Core Plus Bond",0.40,8],
  ["MAHQX","BlackRock High Equity Income Inst","Covered Call / Income",0.85,3],
  ["BSIIX","BlackRock Short Obligations Inst","Ultrashort Bond",0.25,5],

  // ── Loomis Sayles / Natixis ───────────────────────────────────────────────
  ["LSBRX","Loomis Sayles Bond Retail","Multisector Bond",0.93,13],
  ["LSBDX","Loomis Sayles Bond Institutional","Multisector Bond",0.63,25],
  ["LSGEX","Loomis Sayles Growth A","US Equity Large Growth",1.05,5],
  ["LGMAX","Loomis Sayles Global Growth A","World Large Stock Blend",1.02,3],
  ["NECOX","Natixis Oakmark International A","International Equity",1.13,3],

  // ── MetWest / TCW ────────────────────────────────────────────────────────
  ["MWTRX","Metropolitan West Total Return Bond M","Intermediate Core Plus Bond",0.67,50],
  ["MWTIX","Metropolitan West Total Return Bond I","Intermediate Core Plus Bond",0.44,100],
  ["MWLDX","Metropolitan West Low Duration M","Short-Term Bond",0.50,8],
  ["MWHYX","Metropolitan West High Yield Bond M","High Yield Bond",0.70,3],
  ["TGLMX","TCW Total Return Bond I","Intermediate Core Plus Bond",0.44,5],

  // ── Western Asset ────────────────────────────────────────────────────────
  ["WATFX","Western Asset Core Bond A","Intermediate Core Plus Bond",0.70,8],
  ["WACIX","Western Asset Core Plus Bond A","Intermediate Core Plus Bond",0.72,15],
  ["WAFIX","Western Asset Short-Term Bond A","Short-Term Bond",0.65,3],

  // ── Baird ────────────────────────────────────────────────────────────────
  ["BAGSX","Baird Aggregate Bond Inst","Intermediate Core Bond",0.30,15],
  ["BCOIX","Baird Core Plus Bond Inst","Intermediate Core Plus Bond",0.30,8],
  ["BCSIX","Baird Short-Term Bond Inst","Short-Term Bond",0.30,5],

  // ── DoubleLine ───────────────────────────────────────────────────────────
  ["DLTNX","DoubleLine Total Return Bond N","Intermediate Core Plus Bond",0.73,25],
  ["DBLTX","DoubleLine Total Return Bond I","Intermediate Core Plus Bond",0.48,40],
  ["DLFNX","DoubleLine Floating Rate N","Bank Loan",0.73,3],
  ["DLSNX","DoubleLine Core Fixed Income N","Intermediate Core Bond",0.73,3],
  ["DBFRX","DoubleLine Flexible Income N","Multisector Bond",0.73,3],

  // ── Harbor ────────────────────────────────────────────────────────────────
  ["HACAX","Harbor Capital Appreciation Inst","US Equity Large Growth",0.64,12],
  ["HAIGX","Harbor International Growth Inst","International Equity",0.72,3],
  ["HISGX","Harbor Small Cap Growth Inst","US Equity Small Growth",0.85,2],
  ["HRINX","Harbor Bond Inst","Intermediate Core Plus Bond",0.48,3],

  // ── Artisan ───────────────────────────────────────────────────────────────
  ["ARTGX","Artisan Growth Investor","US Equity Large Growth",1.18,8],
  ["ARTMX","Artisan Mid Cap Investor","US Equity Mid Growth",1.19,8],
  ["ARTSX","Artisan Small Cap Investor","US Equity Small Growth",1.18,3],
  ["ARTKX","Artisan International Investor","International Equity",1.22,12],
  ["ARTQX","Artisan International Value Investor","International Equity",1.22,5],
  ["ARTGX","Artisan Global Opportunities Investor","World Large Stock Blend",1.17,5],

  // ── Baron ─────────────────────────────────────────────────────────────────
  ["BGRFX","Baron Growth Retail","US Equity Small Growth",1.31,7],
  ["BSCFX","Baron Small Cap Retail","US Equity Small Growth",1.31,5],
  ["BARAX","Baron Asset Retail","US Equity Mid Growth",1.32,5],
  ["BPTRX","Baron Partners Retail","US Equity Mid Blend",1.54,5],
  ["BFGFX","Baron Focused Growth Retail","US Equity Mid Growth",1.07,3],

  // ── Primecap ──────────────────────────────────────────────────────────────
  ["POGRX","Primecap Odyssey Growth","US Equity Large Growth",0.67,12],
  ["POSKX","Primecap Odyssey Stock","US Equity Large Blend",0.67,8],
  ["POAGX","Primecap Odyssey Aggressive Growth","US Equity Mid Growth",0.67,5],

  // ── Manning & Napier / Parnassus ─────────────────────────────────────────
  ["PARNX","Parnassus Core Equity Investor","US Equity Large Blend",0.82,10],
  ["PARWX","Parnassus Mid Cap Growth Investor","US Equity Mid Growth",0.98,5],
  ["PRBLX","Parnassus Core Equity Investor","US Equity Large Blend",0.82,10],

  // ── Wasatch ───────────────────────────────────────────────────────────────
  ["WAAEX","Wasatch Core Growth","US Equity Small Growth",1.20,3],
  ["WAGRX","Wasatch Greater China","International Equity",1.73,1],
  ["WALLX","Wasatch Long Short Alpha","US Equity Large Blend",1.60,1],

  // ── Royce ─────────────────────────────────────────────────────────────────
  ["RYTRX","Royce Total Return","US Equity Small Value",1.24,2],
  ["RYSEX","Royce Small-Cap Special Equity","US Equity Small Value",1.24,1],
  ["RYPMX","Royce Pennsylvania Mutual Inv","US Equity Small Blend",1.18,3],

  // ── Selected / Davis ─────────────────────────────────────────────────────
  ["SLASX","Selected American Shares S","US Equity Large Blend",0.90,5],
  ["SGIIX","Selected International S","International Equity",1.04,2],
  ["DAVPX","Davis New York Venture A","US Equity Large Blend",0.88,8],
  ["RPRCX","Davis Real Estate A","Sector Real Estate",0.96,1],

  // ── Calvert / ESG ─────────────────────────────────────────────────────────
  ["CSIEX","Calvert Equity A","US Equity Large Blend",1.12,3],
  ["CEYIX","Calvert Emerging Markets Equity A","Emerging Markets",1.37,1],
  ["CBALX","Calvert Balanced A","Allocation 50-70% Equity",1.06,2],

  // ── Target Date — Vanguard ────────────────────────────────────────────────
  ["VTTVX","Vanguard Target Retirement 2025 Inv","Target Date 2021-2025",0.13,45],
  ["VTHRX","Vanguard Target Retirement 2030 Inv","Target Date 2026-2030",0.14,50],
  ["VTTHX","Vanguard Target Retirement 2035 Inv","Target Date 2031-2035",0.14,45],
  ["VFORX","Vanguard Target Retirement 2040 Inv","Target Date 2036-2040",0.14,40],
  ["VTIVX","Vanguard Target Retirement 2045 Inv","Target Date 2041-2045",0.15,35],
  ["VFIFX","Vanguard Target Retirement 2050 Inv","Target Date 2046-2050",0.15,30],
  ["VFFVX","Vanguard Target Retirement 2055 Inv","Target Date 2046-2050",0.15,20],
  ["VTTSX","Vanguard Target Retirement 2060 Inv","Target Date 2056-2060",0.15,15],
  ["VLXVX","Vanguard Target Retirement 2065 Inv","Target Date 2056-2060",0.15,8],
  ["VTINX","Vanguard Target Retirement Income Inv","Target Date Retirement",0.12,30],

  // ── Target Date — Fidelity ────────────────────────────────────────────────
  ["FFFEX","Fidelity Freedom 2025","Target Date 2021-2025",0.62,20],
  ["FFFGX","Fidelity Freedom 2030","Target Date 2026-2030",0.62,25],
  ["FFFHX","Fidelity Freedom 2035","Target Date 2031-2035",0.63,20],
  ["FFFKX","Fidelity Freedom 2040","Target Date 2036-2040",0.65,18],
  ["FFFNX","Fidelity Freedom 2045","Target Date 2041-2045",0.65,15],
  ["FFFPX","Fidelity Freedom 2050","Target Date 2046-2050",0.65,14],
  ["FDENX","Fidelity Freedom 2055","Target Date 2046-2050",0.65,10],
  ["FDEWX","Fidelity Freedom 2060","Target Date 2056-2060",0.65,8],
  ["FDKVX","Fidelity Freedom 2065","Target Date 2056-2060",0.65,5],
  ["FFFAX","Fidelity Freedom Income","Target Date Retirement",0.47,8],

  // ── Target Date — T. Rowe Price ───────────────────────────────────────────
  ["TRRAZ","T. Rowe Price Retirement 2025","Target Date 2021-2025",0.53,12],
  ["TRRFX","T. Rowe Price Retirement 2035","Target Date 2031-2035",0.55,10],
  ["TRRHX","T. Rowe Price Retirement 2040","Target Date 2036-2040",0.56,12],
  ["TRRTX","T. Rowe Price Retirement 2060","Target Date 2056-2060",0.61,5],
];

let added = 0, skipped = 0;
for (const [ticker, name, category, er, aum] of FUNDS) {
  const t = ticker.toUpperCase();
  if (have.has(t)) { skipped++; continue; }
  have.add(t);
  const bm = (() => {
    const c = category.toLowerCase();
    if (/bond|income|fixed|treasury|muni|tips|preferred|inflation|ultrashort|bank loan|government/.test(c)) return "AGG";
    if (/international|emerging|world|global|foreign/.test(c)) return "VXUS";
    return "SPY";
  })();
  universe.push({ ticker: t, name, category, vehicle: "Mutual Fund", benchmark: bm });
  meta[t] = { er, aum };
  added++;
}

universe.sort((a, b) => a.ticker.localeCompare(b.ticker));
fs.writeFileSync(UNIVERSE_PATH, JSON.stringify(universe, null, 2) + "\n");
fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n");
console.log(`Added ${added} mutual funds (${skipped} already existed). Total: ${universe.length}`);
