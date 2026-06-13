/**
 * Re-runs a much better category guesser over all existing universe entries
 * that are stuck in "US Equity Large Blend" default.
 */
const fs = require("fs");
const path = require("path");
const UNIVERSE_PATH = path.join(__dirname, "..", "data", "universe.json");
const universe = JSON.parse(fs.readFileSync(UNIVERSE_PATH, "utf8"));

function guessCategory(name = "", ticker = "") {
  const n = name.toLowerCase();
  const t = ticker.toLowerCase();

  // ── Leveraged / Inverse (filter these out of advisor tool) ──────────────
  if (/\b(2x|3x|ultra|leverage|bull|bear|inverse|short |daily)\b/.test(n)) return "Leveraged / Inverse";
  if (/^(spxu|spxs|sqqq|tqqq|upro|sds|spxl|udow|sdow|tna|tza|fas|faz|labu|labd)$/.test(t)) return "Leveraged / Inverse";

  // ── Fixed Income ─────────────────────────────────────────────────────────
  if (/\btips\b|inflation.?protect|i-bond/.test(n))                           return "Inflation-Protected Bond";
  if (/treasury.?bill|t-bill|\bsgov\b|\bbil\b|\bshy\b/.test(n+t))            return "Ultrashort Bond";
  if (/ultra.?short|floating.?rate|very short|overnight|money market/.test(n)) return "Ultrashort Bond";
  if (/short.?term.*(treas|gov)|1-3 year.*gov/.test(n))                       return "Intermediate Government";
  if (/short.?term.*(corp|bond|invest)|1-5 year.*corp/.test(n))               return "Short-Term Bond";
  if (/high.?yield|junk|below invest/.test(n))                                return "High Yield Bond";
  if (/muni|municipal|tax.?exempt|tax.?free/.test(n))                         return "Muni National Intermediate";
  if (/california.*muni|muni.*california/.test(n))                            return "Muni National Intermediate";
  if (/new york.*muni|muni.*new york/.test(n))                                return "Muni National Intermediate";
  if (/bank.?loan|senior.?loan|floating/.test(n))                             return "Bank Loan";
  if (/emerging.*bond|em.*bond|bond.*emerging|sovereign debt/.test(n))        return "Emerging Markets Bond";
  if (/international.*bond|global.*bond|world.*bond|foreign.*bond/.test(n))   return "World Bond";
  if (/long.?term.*(treas|gov)|20.?year|30.?year treas/.test(n))             return "Long Government";
  if (/corp.*bond|bond.*corp|investment.?grade.*corp|ig bond/.test(n))        return "Corporate Bond";
  if (/preferred.*income|preferred stock|hybrid/.test(n))                     return "Preferred Stock";
  if (/mortgage|mbs|agency/.test(n))                                          return "Intermediate Core Bond";
  if (/total.*bond|aggregate.*bond|core.*bond|broad.*bond/.test(n))           return "Intermediate Core Bond";
  if (/bond|fixed.?income|debt/.test(n))                                      return "Intermediate Core Bond";

  // ── Commodities / Real Assets ─────────────────────────────────────────────
  if (/^(gld|iau|sgol|gldm|aaau)$/.test(t) || /gold etf|physical gold/.test(n)) return "Commodities";
  if (/^(slv|sivr|pslv)$/.test(t) || /silver trust|physical silver/.test(n))    return "Commodities";
  if (/crude.?oil|natural gas|energy commodity|wti|brent/.test(n))            return "Commodities";
  if (/diversified.?commodit|broad.?commodit|bloomberg commodit/.test(n))     return "Commodities";
  if (/gold.?min|silver.?min|precious.?metal.?min/.test(n))                   return "Sector Materials";
  if (/commodit|futures/.test(n))                                              return "Commodities";

  // ── International Equity ──────────────────────────────────────────────────
  if (/\bemerging market|\bem equity|\bmsci em\b|developing world/.test(n))   return "Emerging Markets";
  if (/china|chinese|greater china|\bhong kong/.test(n))                      return "International Equity";
  if (/japan|japanese|nikkei|topix/.test(n))                                  return "International Equity";
  if (/india|indian subcontinent/.test(n))                                    return "International Equity";
  if (/korea|korean/.test(n))                                                 return "International Equity";
  if (/taiwan/.test(n))                                                       return "International Equity";
  if (/europe|european|eurozone|euro stoxx|germany|france|uk equity/.test(n)) return "International Equity";
  if (/latin america|brazil|mexico|chile|colombia/.test(n))                   return "International Equity";
  if (/africa|middle east|gulf|saudi|israel/.test(n))                         return "International Equity";
  if (/pacific|australia|new zealand|southeast asia/.test(n))                 return "International Equity";
  if (/canada|canadian/.test(n))                                              return "International Equity";
  if (/eafe|international|global equity|world equity|foreign equity|intl/.test(n)) return "International Equity";
  if (/acwi|all country world/.test(n))                                       return "World Large Stock Blend";

  // ── Sector ────────────────────────────────────────────────────────────────
  if (/semiconductor|chip|fabless/.test(n))                                   return "Sector Technology";
  if (/software|cloud|saas|internet|cyber|e-commerce|digital/.test(n))       return "Sector Technology";
  if (/artificial intel|\bai\b.*etf|machine learn|robotics/.test(n))          return "Sector Technology";
  if (/tech|technology|information tech/.test(n))                             return "Sector Technology";
  if (/biotech|genomic|gene|crispr|life science/.test(n))                     return "Sector Healthcare";
  if (/pharma|drug|medical device|health care|healthcare/.test(n))            return "Sector Healthcare";
  if (/hospital|health system/.test(n))                                       return "Sector Healthcare";
  if (/clean energy|solar|wind|renewable|hydrogen/.test(n))                   return "Sector Energy";
  if (/oil|gas|petroleum|mlp|pipeline|energy(?! storage)/.test(n))            return "Sector Energy";
  if (/uranium|nuclear/.test(n))                                              return "Sector Energy";
  if (/bank|banking|financial service|broker|insurance|fintech/.test(n))      return "Sector Financials";
  if (/real estate|reit|property|mortgage reit/.test(n))                      return "Sector Real Estate";
  if (/homebuil|construction|building/.test(n))                               return "Sector Industrials";
  if (/aerospace|defense|military/.test(n))                                   return "Sector Industrials";
  if (/transport|shipping|freight|rail|airline/.test(n))                      return "Sector Industrials";
  if (/infrastructure|industrial(?!s)/.test(n))                               return "Sector Industrials";
  if (/industrials/.test(n))                                                  return "Sector Industrials";
  if (/material|mining|copper|lithium|steel|chemical/.test(n))               return "Sector Materials";
  if (/gold miner|silver miner|metal miner/.test(n))                          return "Sector Materials";
  if (/consumer disc|retail|e-commerce|luxury|leisure/.test(n))              return "Sector Consumer Discretionary";
  if (/consumer stap|staples|food|beverage|household/.test(n))                return "Sector Consumer Staples";
  if (/utility|utilities|electric|water utility/.test(n))                    return "Sector Utilities";
  if (/telecom|communication service|media|entertainment/.test(n))            return "Sector Communication Services";
  if (/cannabis|marijuana/.test(n))                                           return "Sector / Thematic";
  if (/crypto|bitcoin|ethereum|blockchain|digital asset/.test(n))             return "Sector / Thematic";
  if (/space|drone|metaverse|gaming|esport/.test(n))                          return "Sector / Thematic";
  if (/esg|sustainable|responsible|clean|green(?! energy)|impact/.test(n))    return "US Equity Large Blend";
  if (/water|agriculture|timber|forest/.test(n))                              return "Sector / Thematic";

  // ── Covered Call / Income ──────────────────────────────────────────────────
  if (/covered.?call|buy.?write|option.*income|premium.*income/.test(n))     return "Covered Call / Income";

  // ── Allocation / Balanced ─────────────────────────────────────────────────
  if (/aggress.*alloc|85.*equity|90.*equity/.test(n))                         return "Allocation 85%+ Equity";
  if (/growth.*alloc|70.*equity|75.*equity/.test(n))                          return "Allocation 70-85% Equity";
  if (/moderate.*alloc|balanced|60.*equity/.test(n))                          return "Allocation 50-70% Equity";
  if (/conserv.*alloc|40.*equity/.test(n))                                    return "Allocation 30-50% Equity";
  if (/multi.?asset|target.*alloc/.test(n))                                   return "Allocation 50-70% Equity";

  // ── Target Date ───────────────────────────────────────────────────────────
  if (/target.*date|retirement.*2065|2065/.test(n))                           return "Target Date 2056-2060";
  if (/target.*date|retirement.*2060|2060/.test(n))                           return "Target Date 2056-2060";
  if (/target.*date|retirement.*2055|2055/.test(n))                           return "Target Date 2046-2050";
  if (/target.*date|retirement.*2050|2050/.test(n))                           return "Target Date 2046-2050";
  if (/target.*date|retirement.*2045|2045/.test(n))                           return "Target Date 2041-2045";
  if (/target.*date|retirement.*2040|2040/.test(n))                           return "Target Date 2036-2040";
  if (/target.*date|retirement.*2035|2035/.test(n))                           return "Target Date 2031-2035";
  if (/target.*date|retirement.*2030|2030/.test(n))                           return "Target Date 2026-2030";
  if (/target.*date|retirement.*2025|2025/.test(n))                           return "Target Date 2021-2025";
  if (/target.*date|target.?date|retirement income/.test(n))                  return "Target Date Retirement";

  // ── US Equity — Size ──────────────────────────────────────────────────────
  if (/\bmicro.?cap\b/.test(n))                                               return "US Equity Small Blend";
  if (/\bsmall.?cap\b.*value|\bsmall.?value\b/.test(n))                       return "US Equity Small Value";
  if (/\bsmall.?cap\b.*growth|\bsmall.?growth\b/.test(n))                     return "US Equity Small Growth";
  if (/\bsmall.?cap\b|\bsmall cap\b|\brussell 2000\b|\bs&p 600\b|\bsc \b/.test(n)) return "US Equity Small Blend";
  if (/\bmid.?cap\b.*value|\bmid.?value\b/.test(n))                           return "US Equity Mid Value";
  if (/\bmid.?cap\b.*growth|\bmid.?growth\b/.test(n))                         return "US Equity Mid Growth";
  if (/\bmid.?cap\b|\bmid cap\b|\brussell midcap\b|\bs&p 400\b|\bmc \b/.test(n)) return "US Equity Mid Blend";
  if (/\bsmid\b|small.?mid/.test(n))                                          return "US Equity Small Blend";

  // ── US Equity — Style ─────────────────────────────────────────────────────
  if (/large.?cap.*value|large.?value|\bdow jones\b.*value/.test(n))          return "US Equity Large Value";
  if (/large.?cap.*growth|large.?growth/.test(n))                             return "US Equity Large Growth";
  if (/\bdividend\b|\bhigh.?yield equity\b|\bhigh dividend\b/.test(n))        return "US Equity Large Value";
  if (/\bvalue\b/.test(n))                                                    return "US Equity Large Value";
  if (/\bgrowth\b/.test(n))                                                   return "US Equity Large Growth";
  if (/momentum|quality factor|low.?vol|min.?vol|factor/.test(n))             return "US Equity Large Blend";
  if (/s&p 500|sp500|spx |total (us |stock )?market|russell 1000|nasdaq.?100|dow jones/.test(n)) return "US Equity Large Blend";

  return "US Equity Large Blend";
}

function benchFor(cat = "") {
  const c = cat.toLowerCase();
  if (/bond|income|fixed|treasury|muni|tips|preferred|inflation|ultrashort|bank loan|government/.test(c)) return "AGG";
  if (/international|emerging|world|global|foreign/.test(c)) return "VXUS";
  return "SPY";
}

let fixed = 0, leveraged = 0;
const toRemove = new Set();

for (const fund of universe) {
  const newCat = guessCategory(fund.name, fund.ticker);
  if (newCat === "Leveraged / Inverse") {
    toRemove.add(fund.ticker);
    leveraged++;
    continue;
  }
  if (newCat !== fund.category) {
    fund.category = newCat;
    fund.benchmark = benchFor(newCat);
    fixed++;
  }
}

// Remove leveraged/inverse funds (not useful for advisor research)
const cleaned = universe.filter(f => !toRemove.has(f.ticker));
cleaned.sort((a, b) => a.ticker.localeCompare(b.ticker));

fs.writeFileSync(UNIVERSE_PATH, JSON.stringify(cleaned, null, 2) + "\n");

console.log(`Re-categorized: ${fixed} funds updated`);
console.log(`Removed:        ${leveraged} leveraged/inverse funds`);
console.log(`Total:          ${cleaned.length} funds`);

const cats = {};
cleaned.forEach(f => { cats[f.category] = (cats[f.category]||0)+1; });
console.log("\nTop categories after fix:");
Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,22)
  .forEach(([k,v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
