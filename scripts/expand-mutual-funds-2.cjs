/**
 * Second batch of mutual funds — American Funds share classes, TIAA, Schwab,
 * Dimensional, Calamos, Nuveen, Eaton Vance, Manning & Napier, Legg Mason,
 * Virtus, Federated, First Eagle, Gabelli, Hennessy, etc.
 */
const fs = require("fs");
const path = require("path");
const UNIVERSE_PATH = path.join(__dirname, "..", "data", "universe.json");
const META_PATH     = path.join(__dirname, "..", "src", "data", "fund-meta.json");
const universe = JSON.parse(fs.readFileSync(UNIVERSE_PATH, "utf8"));
const meta     = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
const have     = new Set(universe.map(u => u.ticker.toUpperCase()));

function benchFor(c) {
  c = (c||"").toLowerCase();
  if (/bond|income|fixed|treasury|muni|tips|preferred|inflation|ultrashort|bank loan|gov|debt/.test(c)) return "AGG";
  if (/international|emerging|world|global|foreign/.test(c)) return "VXUS";
  return "SPY";
}

// [ticker, name, category, er, aum_B]
const FUNDS = [
  // ── Dimensional Fund Advisors (DFA) ──────────────────────────────────────
  ["DFUSX","DFA US Core Equity 1 Inst","US Equity Large Blend",0.12,30],
  ["DFEOX","DFA US Core Equity 2 Inst","US Equity Large Blend",0.22,20],
  ["DFQTX","DFA US Large Company Inst","US Equity Large Blend",0.08,25],
  ["DFLVX","DFA US Large Cap Value Inst","US Equity Large Value",0.22,35],
  ["DFSVX","DFA US Small Cap Value Inst","US Equity Small Value",0.52,18],
  ["DFSCX","DFA US Small Cap Inst","US Equity Small Blend",0.37,18],
  ["DFCEX","DFA US Core Equity 1","US Equity Large Blend",0.19,10],
  ["DFIEX","DFA International Core Equity Inst","International Equity",0.30,20],
  ["DFIVX","DFA International Value Inst","International Equity",0.36,12],
  ["DFISX","DFA International Small Cap Inst","International Small Cap",0.54,8],
  ["DFEMX","DFA Emerging Markets Core Equity Inst","Emerging Markets",0.43,12],
  ["DFEVX","DFA Emerging Markets Value Inst","Emerging Markets",0.50,8],
  ["DFIHX","DFA Inflation-Protected Securities Inst","Inflation-Protected Bond",0.11,5],
  ["DFTSX","DFA Five-Year Global Fixed Income Inst","Intermediate Core Bond",0.22,8],
  ["DFFVX","DFA Two-Year Global Fixed Income Inst","Short-Term Bond",0.17,12],
  ["DFCFX","DFA Commodity Strategy Inst","Commodities",0.22,2],
  ["DFMEX","DFA US Micro Cap Inst","US Equity Small Blend",0.52,8],
  ["DFMVX","DFA US Small Cap Value Inst","US Equity Small Value",0.52,10],
  ["DFBLX","DFA US Large Cap Growth Inst","US Equity Large Growth",0.20,8],
  ["DFGBX","DFA Global Bond Inst","World Bond",0.20,3],

  // ── TIAA / Nuveen ────────────────────────────────────────────────────────
  ["TIINX","TIAA-CREF International Equity Inst","International Equity",0.45,5],
  ["TRIEX","TIAA-CREF International Equity Ret","International Equity",0.60,3],
  ["TLGRX","TIAA-CREF Large-Cap Growth Index Retail","US Equity Large Growth",0.55,3],
  ["TRGRX","TIAA-CREF Large-Cap Growth Index Ret","US Equity Large Growth",0.26,5],
  ["TILIX","TIAA-CREF Large-Cap Index Inst","US Equity Large Blend",0.05,10],
  ["TCIEX","TIAA-CREF Emerging Markets Equity Inst","Emerging Markets",0.68,4],
  ["TIBIX","TIAA-CREF Bond Plus Inst","Intermediate Core Plus Bond",0.35,5],
  ["TIORX","TIAA-CREF Real Estate Securities Ret","Sector Real Estate",0.73,2],
  ["TIRIX","TIAA-CREF Real Estate Securities Inst","Sector Real Estate",0.53,3],
  ["TILTX","TIAA-CREF Lifecycle 2030 Inst","Target Date 2026-2030",0.35,5],
  ["TLFTX","TIAA-CREF Lifecycle 2040 Inst","Target Date 2036-2040",0.38,5],
  ["TLLTX","TIAA-CREF Lifecycle 2050 Inst","Target Date 2046-2050",0.39,4],
  ["TSITX","TIAA-CREF Social Choice Stock Inst","US Equity Large Blend",0.19,8],
  ["NTINX","Nuveen NWQ International Value A","International Equity",1.24,2],
  ["NUVBX","Nuveen Strategic Income A","Multisector Bond",0.89,3],
  ["FLMBX","Nuveen Floating Rate Income A","Bank Loan",0.93,3],
  ["FJSIX","Nuveen High Yield Municipal Bond A","High Yield Muni",0.82,5],
  ["NMANX","Nuveen All-American Municipal Bond A","Muni National Intermediate",0.73,5],

  // ── Schwab Funds ─────────────────────────────────────────────────────────
  ["SWPPX","Schwab S&P 500 Index Fund","US Equity Large Blend",0.02,70],
  ["SWTSX","Schwab Total Stock Market Index","US Equity Large Blend",0.03,25],
  ["SWISX","Schwab International Index Fund","International Equity",0.06,15],
  ["SWSSX","Schwab Small-Cap Index Fund","US Equity Small Blend",0.04,10],
  ["SWLSX","Schwab Large-Cap Value Index","US Equity Large Value",0.05,5],
  ["SWLGX","Schwab Large-Cap Growth Index","US Equity Large Growth",0.05,5],
  ["SWEMX","Schwab Emerging Markets Equity ETF","Emerging Markets",0.11,5],
  ["SWBDX","Schwab Total Bond Market Fund","Intermediate Core Bond",0.03,12],
  ["SWYGX","Schwab Target 2030 Fund","Target Date 2026-2030",0.08,3],
  ["SWYRX","Schwab Target 2040 Fund","Target Date 2036-2040",0.08,3],
  ["SWYOX","Schwab Target 2050 Fund","Target Date 2046-2050",0.08,3],
  ["SWVXX","Schwab Value Advantage Money Fund","Ultrashort Bond",0.34,200],
  ["SNOXX","Schwab Government Money Fund","Ultrashort Bond",0.34,50],

  // ── Calamos ───────────────────────────────────────────────────────────────
  ["CGRIX","Calamos Growth & Income A","Allocation 50-70% Equity",1.08,5],
  ["CVGRX","Calamos Growth A","US Equity Large Growth",1.15,3],
  ["CVSIX","Calamos Convertible A","Convertible Bond",1.08,2],
  ["CAGEX","Calamos Global Equity A","World Large Stock Blend",1.35,1],
  ["CAHEX","Calamos Hedged Equity A","US Equity Large Blend",1.05,2],

  // ── Eaton Vance / Morgan Stanley ──────────────────────────────────────────
  ["EVTMX","Eaton Vance Large-Cap Value A","US Equity Large Value",0.94,3],
  ["EIGMX","Eaton Vance Emerging Markets Local Income A","Emerging Markets Bond",1.07,1],
  ["EMIAX","Eaton Vance International Equity A","International Equity",1.08,2],
  ["EIBAX","Eaton Vance Income Fund of Boston A","Multisector Bond",0.97,3],
  ["EVHMX","Eaton Vance High Income Opportunities A","High Yield Bond",0.95,2],
  ["MSEGX","Morgan Stanley Growth A","US Equity Large Growth",0.97,10],
  ["MSIQX","Morgan Stanley Institutional Growth I","US Equity Large Growth",0.52,15],
  ["MSEQX","Morgan Stanley Institutional Equity I","US Equity Large Blend",0.55,5],
  ["MSINX","Morgan Stanley Institutional Income I","Multisector Bond",0.55,3],
  ["MSUEX","Morgan Stanley US Real Estate I","Sector Real Estate",0.85,2],

  // ── Legg Mason / Western Asset / ClearBridge ─────────────────────────────
  ["LMNYX","ClearBridge Large Cap Growth A","US Equity Large Growth",0.98,8],
  ["LMVEX","ClearBridge Value A","US Equity Large Value",0.95,5],
  ["LMDVX","ClearBridge Dividend Strategy A","US Equity Large Value",0.94,8],
  ["SOPVX","ClearBridge Small Cap Value A","US Equity Small Value",1.14,2],
  ["LMIGX","ClearBridge International Growth A","International Equity",1.05,3],
  ["SBOAX","ClearBridge Aggressive Growth A","US Equity Large Growth",1.07,3],

  // ── Virtus / Allianz ─────────────────────────────────────────────────────
  ["VADAX","Virtus Duff & Phelps Real Asset A","Allocation 50-70% Equity",1.17,2],
  ["PHOAX","Virtus KAR Small-Cap Growth A","US Equity Small Growth",1.42,2],
  ["PHSKX","Virtus KAR Small-Cap Core A","US Equity Small Blend",1.38,1],
  ["AGNDX","Virtus Newfleet Multi-Sector Int Bond A","Multisector Bond",0.97,2],
  ["SFHYX","Virtus Seix High Income A","High Yield Bond",0.97,2],
  ["PAUAX","Allianz NFJ Dividend Value A","US Equity Large Value",0.94,4],
  ["PQINX","Allianz NFJ International Value A","International Equity",1.15,2],
  ["ANIAX","Allianz NFJ Small Cap Value A","US Equity Small Value",1.04,2],

  // ── Federated Hermes ─────────────────────────────────────────────────────
  ["FIISX","Federated Hermes MDT Small Cap Core Inst","US Equity Small Blend",0.89,2],
  ["FMDIX","Federated Hermes MDT Large Cap Value Inst","US Equity Large Value",0.63,3],
  ["FMGIX","Federated Hermes MDT Large Cap Growth Inst","US Equity Large Growth",0.63,3],
  ["FGINX","Federated Hermes Government Income Trust Inst","Intermediate Government",0.46,2],
  ["FHTIX","Federated Hermes Total Return Bond Inst","Intermediate Core Bond",0.40,3],
  ["FHIIX","Federated Hermes High Income Bond Inst","High Yield Bond",0.56,2],
  ["FMMAX","Federated Hermes Prime Money Market Inst","Ultrashort Bond",0.20,80],
  ["FKMXX","Federated Hermes Government Obligations Inst","Ultrashort Bond",0.20,50],

  // ── First Eagle / Mutual Series ───────────────────────────────────────────
  ["SGIIX","First Eagle Global A","World Large Stock Blend",1.13,20],
  ["FEAIX","First Eagle Gold A","Sector Materials",1.17,2],
  ["SGENX","First Eagle Global I","World Large Stock Blend",0.88,30],
  ["EAGLX","First Eagle US Value A","US Equity Large Blend",0.99,4],
  ["TESIX","Franklin Mutual Shares A","US Equity Large Value",0.99,5],
  ["TEQIX","Franklin Mutual European A","International Equity",1.27,2],
  ["MQIFX","Franklin Mutual Quest A","Allocation 50-70% Equity",1.05,2],

  // ── Gabelli ───────────────────────────────────────────────────────────────
  ["GABAX","Gabelli Asset A","US Equity Large Blend",1.40,3],
  ["GAVAX","Gabelli Value 25 A","US Equity Large Value",1.40,1],
  ["GARBX","Gabelli Small Cap Growth A","US Equity Small Growth",1.40,1],
  ["GAGCX","Gabelli Global Content & Connectivity A","Sector Communication Services",1.40,1],

  // ── Hennessy ─────────────────────────────────────────────────────────────
  ["HNFPX","Hennessy Focus Institutional","US Equity Mid Blend",0.85,2],
  ["HNLJX","Hennessy Japan Institutional","International Equity",1.23,1],
  ["HFCSX","Hennessy Cornerstone Mid Cap 30 Inst","US Equity Mid Blend",0.90,1],

  // ── Manning & Napier ─────────────────────────────────────────────────────
  ["EXDAX","Manning & Napier Dividend Focus A","US Equity Large Value",0.94,2],
  ["MNBAX","Manning & Napier World Opportunities A","World Large Stock Blend",1.06,2],
  ["MNATX","Manning & Napier Core Bond A","Intermediate Core Bond",0.55,1],

  // ── Voya ─────────────────────────────────────────────────────────────────
  ["IICAX","Voya Large-Cap Growth A","US Equity Large Growth",0.99,3],
  ["IPIAX","Voya Large-Cap Value A","US Equity Large Value",0.96,3],
  ["ISIAX","Voya MidCap Opportunities A","US Equity Mid Growth",1.10,2],
  ["ISAAX","Voya Small Company A","US Equity Small Blend",1.13,1],
  ["IIGAX","Voya International Growth A","International Equity",1.11,2],
  ["IICOX","Voya Core Bond A","Intermediate Core Bond",0.80,2],
  ["IIHHX","Voya High Yield Bond A","High Yield Bond",0.90,2],

  // ── Principal ────────────────────────────────────────────────────────────
  ["PLRIX","Principal LargeCap Growth I Inst","US Equity Large Growth",0.62,5],
  ["PVLIX","Principal LargeCap Value III Inst","US Equity Large Value",0.65,4],
  ["PMDIX","Principal MidCap S&P 400 Index Inst","US Equity Mid Blend",0.11,5],
  ["PSIIX","Principal SmallCap S&P 600 Index Inst","US Equity Small Blend",0.12,3],
  ["PLGIX","Principal International Equity Index Inst","International Equity",0.12,5],
  ["PCBIX","Principal Core Plus Bond Inst","Intermediate Core Plus Bond",0.44,4],
  ["PIGIX","Principal High Yield Inst","High Yield Bond",0.56,3],
  ["PTIIX","Principal Total Return 2030 Inst","Target Date 2026-2030",0.37,3],

  // ── Sun Life / MFS ────────────────────────────────────────────────────────
  ["MFSVX","MFS Core Equity A","US Equity Large Blend",0.79,5],
  ["MRFAX","MFS Research Fund A","US Equity Large Blend",0.77,4],
  ["MFNEX","MFS New England A","US Equity Large Blend",0.78,3],
  ["MSIFX","MFS International Diversification A","International Equity",1.10,3],
  ["MGIIX","MFS Global Growth I","World Large Stock Blend",0.82,2],
  ["MMOAX","MFS Moderate Allocation A","Allocation 50-70% Equity",0.85,4],
  ["MAAGX","MFS Aggressive Growth Allocation A","Allocation 85%+ Equity",0.86,3],
  ["MCOBX","MFS Conservative Allocation A","Allocation 30-50% Equity",0.85,3],
  ["MFIOX","MFS Income A","Allocation 30-50% Equity",0.84,2],
  ["MFBIX","MFS Blended Research Bond A","Intermediate Core Bond",0.52,2],

  // ── Oppenheimer / Invesco ─────────────────────────────────────────────────
  ["OPGIX","Invesco International Growth A","International Equity",1.09,5],
  ["RAAAX","Invesco Balanced-Risk Allocation A","Allocation 50-70% Equity",1.13,3],
  ["RAIAX","Invesco Real Assets A","Allocation 50-70% Equity",1.13,2],
  ["OPIAX","Invesco Dividend Income A","US Equity Large Value",0.70,4],
  ["OPPAX","Invesco Low Volatility Equity Yield A","US Equity Large Value",0.73,3],
  ["OEMAX","Invesco Emerging Markets All Cap A","Emerging Markets",1.22,2],

  // ── Wells Fargo Asset Mgmt (Allspring) ────────────────────────────────────
  ["SGRKX","Allspring Growth Fund Admin","US Equity Large Growth",0.87,3],
  ["SGRFX","Allspring Large Cap Growth A","US Equity Large Growth",0.93,3],
  ["NVDAX","Allspring Discovery A","US Equity Small Growth",1.13,2],
  ["SGVAX","Allspring Value A","US Equity Large Value",0.87,3],
  ["SADAX","Allspring C&B Large Cap Value A","US Equity Large Value",0.94,2],
  ["SADIX","Allspring Diversified Income Builder A","Multisector Bond",0.88,2],
  ["MSSDX","Allspring Multi-Sector Income A","Multisector Bond",0.98,2],

  // ── Pacific Funds / Pacific Life ─────────────────────────────────────────
  ["PLSAX","Pacific Funds Small-Cap A","US Equity Small Blend",1.22,1],
  ["PLGWX","Pacific Funds Growth A","US Equity Large Growth",1.15,1],
  ["PLHYX","Pacific Funds High Income A","High Yield Bond",0.97,1],

  // ── American Century ─────────────────────────────────────────────────────
  ["TWCIX","American Century Investments Ultra Investor","US Equity Large Growth",0.99,10],
  ["TWCGX","American Century Large Company Growth Investor","US Equity Large Growth",0.99,5],
  ["TWCVX","American Century Value Investor","US Equity Large Value",0.99,3],
  ["TWEIX","American Century Equity Income Investor","US Equity Large Value",0.95,8],
  ["TWSMX","American Century Small Cap Growth Investor","US Equity Small Growth",1.14,3],
  ["ACSQX","American Century Small Cap Value Investor","US Equity Small Value",1.26,2],
  ["ACIIX","American Century International Growth Investor","International Equity",1.18,3],
  ["TWBIX","American Century Bond Investor","Intermediate Core Bond",0.59,3],
  ["ACBVX","American Century Core Plus Investor","Intermediate Core Plus Bond",0.59,2],
  ["TWUSX","American Century US Growth Investor","US Equity Large Growth",0.97,4],
  ["TWSDX","American Century Sustainable Equity Investor","US Equity Large Blend",0.99,2],
  ["ARYVX","American Century One Choice 2030 Investor","Target Date 2026-2030",0.55,2],
  ["ARTWX","American Century One Choice 2040 Investor","Target Date 2036-2040",0.57,2],
  ["ARFVX","American Century One Choice 2050 Investor","Target Date 2046-2050",0.58,2],

  // ── Dreyfus / BNY Mellon ─────────────────────────────────────────────────
  ["DRGVX","BNY Mellon Growth A","US Equity Large Growth",1.00,3],
  ["MIDAX","BNY Mellon Mid Cap Index A","US Equity Mid Blend",0.49,2],
  ["BTMAX","BNY Mellon Total Market Index A","US Equity Large Blend",0.49,3],
  ["DRLEX","BNY Mellon International Equity A","International Equity",1.17,2],
  ["DRBAX","BNY Mellon Bond Market Index A","Intermediate Core Bond",0.52,2],

  // ── SEI ───────────────────────────────────────────────────────────────────
  ["SEISX","SEI Large Cap Index A","US Equity Large Blend",0.19,5],
  ["SEIMX","SEI Mid Cap Index A","US Equity Mid Blend",0.24,2],
  ["SCSSX","SEI Small Cap Index A","US Equity Small Blend",0.27,2],
  ["SEITX","SEI International Equity A","International Equity",0.70,3],
  ["SEIBX","SEI Core Fixed Income A","Intermediate Core Bond",0.30,3],

  // ── Vanguard Institutional / Additional ───────────────────────────────────
  ["VINIX","Vanguard Institutional Index Inst","US Equity Large Blend",0.035,200],
  ["VIIIX","Vanguard Institutional Index Inst Plus","US Equity Large Blend",0.02,300],
  ["VSMPX","Vanguard Total Stock Market Inst Plus","US Equity Large Blend",0.02,200],
  ["VEMPX","Vanguard Extended Market Inst Plus","US Equity Mid/Small Blend",0.03,50],
  ["VTPSX","Vanguard Total Intl Stock Inst Plus","International Equity",0.07,50],
  ["VEXRX","Vanguard Explorer Admiral","US Equity Small Growth",0.30,5],
  ["VEXPX","Vanguard Explorer Inv","US Equity Small Growth",0.43,3],
  ["VSEQX","Vanguard Strategic Equity","US Equity Mid Blend",0.17,5],
  ["VQNPX","Vanguard Growth & Income","US Equity Large Blend",0.31,5],
  ["VBTIX","Vanguard Total Bond Market Inst","Intermediate Core Bond",0.035,80],
  ["VBTIX","Vanguard Total Bond Market Inst Plus","Intermediate Core Bond",0.02,120],
  ["VIPIX","Vanguard Inflation-Protected Inst Plus","Inflation-Protected Bond",0.07,10],
  ["VCITX","Vanguard CA Intermediate-Term Tax-Exempt","Muni National Intermediate",0.09,6],
  ["VCAIX","Vanguard CA Intermediate Tax-Exempt Inv","Muni National Intermediate",0.17,4],
  ["VNJUX","Vanguard NJ Long-Term Tax-Exempt Admiral","Muni National Intermediate",0.09,2],
  ["VPATX","Vanguard PA Long-Term Tax-Exempt Inv","Muni National Intermediate",0.17,2],
  ["VNYUX","Vanguard NY Long-Term Tax-Exempt Admiral","Muni National Intermediate",0.09,3],
  ["VNYTX","Vanguard NY Long-Term Tax-Exempt Inv","Muni National Intermediate",0.17,2],
  ["VMLTX","Vanguard Limited-Term Tax-Exempt Inv","Muni National Intermediate",0.17,5],
  ["VMLUX","Vanguard Limited-Term Tax-Exempt Admiral","Muni National Intermediate",0.09,8],
  ["VFSTX","Vanguard Short-Term Invst-Grade Inv","Short-Term Bond",0.20,15],
  ["VCORX","Vanguard Core Bond Admiral","Intermediate Core Plus Bond",0.10,5],
  ["VCSH","Vanguard Corporate Bond Short-Term","Short-Term Bond",0.04,3],

  // ── Fidelity Additional ───────────────────────────────────────────────────
  ["FDVLX","Fidelity Value","US Equity Large Value",0.53,5],
  ["FDGFX","Fidelity Growth Discovery","US Equity Large Growth",0.82,4],
  ["FSLBX","Fidelity Large Cap Value Enhanced Index","US Equity Large Value",0.39,3],
  ["FMILX","Fidelity Mid Cap Enhanced Index","US Equity Mid Blend",0.59,2],
  ["FCPVX","Fidelity Small Cap Value","US Equity Small Value",1.01,2],
  ["FSAGX","Fidelity Select Gold Portfolio","Sector Materials",0.79,2],
  ["FSCHX","Fidelity Select Chemicals","Sector Materials",0.74,1],
  ["FSDAX","Fidelity Select Defense & Aerospace","Sector Industrials",0.70,2],
  ["FSESX","Fidelity Select Consumer Staples","Sector Consumer Staples",0.72,1],
  ["FSCPX","Fidelity Select Consumer Discretionary","Sector Consumer Discretionary",0.73,2],
  ["FSVLX","Fidelity Select Value","US Equity Large Value",0.72,2],
  ["FDCIX","Fidelity Advisor Diversified International A","International Equity",1.03,2],
  ["FEMKX","Fidelity Emerging Markets K","Emerging Markets",0.75,3],
  ["FNSTX","Fidelity Intermediate Bond","Intermediate Core Bond",0.30,4],
  ["FSHBX","Fidelity Short-Term Treasury Bond Index","Short-Term Bond",0.03,5],
  ["FLTPX","Fidelity Long-Term Treasury Bond Index","Long Government",0.03,3],
  ["FSIQX","Fidelity Investment Grade Securitized","Intermediate Core Bond",0.25,3],
  ["FIPDX","Fidelity Inflation-Protected Bond Index","Inflation-Protected Bond",0.05,5],
  ["FJRLX","Fidelity Advisor Total Bond A","Intermediate Core Plus Bond",0.62,3],
  ["FRIFX","Fidelity Real Estate Income","Sector Real Estate",0.76,2],

  // ── T. Rowe Price Additional ──────────────────────────────────────────────
  ["PRSCX","T. Rowe Price Small-Cap Value","US Equity Small Value",0.89,8],
  ["TRSAX","T. Rowe Price Small-Cap Growth A","US Equity Small Growth",0.98,5],
  ["PRCOX","T. Rowe Price Communications & Technology","Sector Technology",0.79,3],
  ["TRMCX","T. Rowe Price Mid-Cap Growth","US Equity Mid Growth",0.73,20],
  ["TRASX","T. Rowe Price Total Return","Intermediate Core Plus Bond",0.50,5],
  ["TRPBX","T. Rowe Price US Bond Enhanced Index","Intermediate Core Bond",0.20,3],
  ["TRUSX","T. Rowe Price US Large-Cap Core","US Equity Large Blend",0.52,5],
  ["TRQIX","T. Rowe Price QM US Small & Mid-Cap Core Eq","US Equity Mid Blend",0.60,3],

  // ── Columbia Additional ───────────────────────────────────────────────────
  ["CMDZX","Columbia Dividend Opportunity A","US Equity Large Value",0.87,5],
  ["CMUAX","Columbia Multisector Municipal Income A","Muni National Intermediate",0.88,2],
  ["CBSAX","Columbia Small Cap Growth A","US Equity Small Growth",1.08,2],
  ["CSMAX","Columbia Small Cap Value A","US Equity Small Value",1.04,2],
  ["CMGZX","Columbia Mid Cap Growth A","US Equity Mid Growth",0.91,3],
  ["CMVAX","Columbia Mid Cap Value A","US Equity Mid Value",0.97,2],
  ["CLMAX","Columbia Contrarian Europe A","International Equity",1.06,1],
  ["CEZAX","Columbia Emerging Markets Bond A","Emerging Markets Bond",1.00,1],
  ["CBUAX","Columbia Total Return Bond A","Intermediate Core Plus Bond",0.85,3],

  // ── Invesco Additional ────────────────────────────────────────────────────
  ["ACBAX","Invesco Equally-Weighted S&P 500 A","US Equity Large Blend",0.54,5],
  ["AWSAX","Invesco Small Cap Value A","US Equity Small Value",1.12,2],
  ["AWSHX","Invesco American Value A","US Equity Large Value",0.82,3],
  ["GGVAX","Invesco Growth & Income A","US Equity Large Blend",0.86,4],
  ["OIBAX","Invesco International Select Equity A","International Equity",1.12,2],
  ["AGLAX","Invesco EQV European Equity A","International Equity",1.31,2],
  ["ACFAX","Invesco Corporate Bond A","Corporate Bond",0.87,3],
  ["AIPSX","Invesco Inflation Protected Securities A","Inflation-Protected Bond",0.58,2],

  // ── Transamerica ─────────────────────────────────────────────────────────
  ["TGFQX","Transamerica Large Cap Value A","US Equity Large Value",0.92,2],
  ["TAAAX","Transamerica Asset Allocation Growth A","Allocation 70-85% Equity",1.15,2],
  ["TABAX","Transamerica Asset Allocation Moderate A","Allocation 50-70% Equity",1.10,3],
  ["TACAX","Transamerica Asset Allocation Conservative A","Allocation 30-50% Equity",1.05,2],
  ["TAHAX","Transamerica High Yield A","High Yield Bond",0.97,2],

  // ── Hartford Funds ────────────────────────────────────────────────────────
  ["HGVAX","Hartford Growth Opportunities A","US Equity Large Growth",1.04,4],
  ["HCVAX","Hartford Capital Appreciation A","US Equity Large Blend",0.97,5],
  ["HTVAX","Hartford Value A","US Equity Large Value",0.92,3],
  ["HAIGX","Hartford International Opportunities A","International Equity",1.11,2],
  ["HTBAX","Hartford Total Return Bond A","Intermediate Core Plus Bond",0.77,3],
  ["HYHAX","Hartford High Yield A","High Yield Bond",0.99,2],
  ["HAFAX","Hartford Floating Rate A","Bank Loan",0.89,2],

  // ── Advisor Class shares (different share classes for key funds) ──────────
  ["AGTHX","American Funds Growth Fund of America A","US Equity Large Growth",0.61,270],
  ["GFAFX","American Funds Growth Fund of America F2","US Equity Large Growth",0.37,60],
  ["ANETX","American Funds New Economy A","US Equity Large Growth",0.76,30],
  ["AMPFX","American Funds AMCAP F2","US Equity Large Growth",0.42,20],
  ["AAEPX","American Funds EuroPacific Growth F2","International Equity",0.51,40],
  ["ABNPX","American Funds New Perspective F2","International Equity",0.45,40],
  ["ABNDX","American Funds Bond Fund of America A","Intermediate Core Bond",0.62,50],
  ["ABNFX","American Funds Bond Fund of America F2","Intermediate Core Bond",0.37,20],
  ["AHIFX","American Funds American High-Income Trust F2","High Yield Bond",0.39,18],
  ["AHITX","American Funds American High-Income Trust A","High Yield Bond",0.65,30],
  ["ABAFX","American Funds American Balanced F2","Allocation 50-70% Equity",0.32,60],
  ["AWSFX","American Funds Washington Mutual A","US Equity Large Value",0.59,90],
  ["AWSHX","American Funds Washington Mutual F2","US Equity Large Value",0.34,40],
  ["ACMSX","American Funds Capital World Bd & Income F2","World Bond",0.47,20],
  ["CWBFX","American Funds Capital World Bond A","World Bond",0.90,10],
  ["GLTEX","American Funds Tax-Exempt Bond A","Muni National Intermediate",0.52,15],
  ["TFEBX","American Funds Tax-Exempt Bond F2","Muni National Intermediate",0.27,8],
  ["AMHIX","American Funds American High-Income Muni A","High Yield Muni",0.64,10],
  ["ABHFX","American Funds Intm Bd Fund America F2","Intermediate Core Bond",0.28,8],
  ["AIBFX","American Funds Intm Bd Fund America A","Intermediate Core Bond",0.60,10],
];

let added = 0, skipped = 0;
for (const [ticker, name, category, er, aum] of FUNDS) {
  const t = ticker.toUpperCase();
  if (have.has(t)) { skipped++; continue; }
  have.add(t);
  universe.push({ ticker: t, name, category, vehicle: "Mutual Fund", benchmark: benchFor(category) });
  meta[t] = { er, aum };
  added++;
}

universe.sort((a, b) => a.ticker.localeCompare(b.ticker));
fs.writeFileSync(UNIVERSE_PATH, JSON.stringify(universe, null, 2) + "\n");
fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n");
console.log(`Added ${added} (${skipped} dupes). Total: ${universe.length}`);
