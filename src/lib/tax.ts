/**
 * Heuristic tax-efficiency scoring for a fund — pure, reusable across the app.
 * Values (expenseRatio, ttmYield) are in PERCENT units.
 */
/** Minimal fields needed to score tax efficiency (FundRecord satisfies this). */
export interface TaxInput {
  category: string;
  name: string;
  vehicle: string;
  expenseRatio: number | null;
  kpi: { ttmYield: number | null };
}

export interface TaxResult {
  score: number;          // 0–100
  rating: "A" | "B" | "C" | "D";
  ratingLabel: string;
  dragEstimate: string;
  accountRec: string;
  accountDetail: string;
  reasons: string[];
}

export function computeTaxEfficiency(fund: TaxInput): TaxResult {
  const cat = (fund.category ?? "").toLowerCase();
  const name = (fund.name ?? "").toLowerCase();
  const isETF = fund.vehicle === "ETF";
  const er = fund.expenseRatio ?? 0;
  const yield_ = fund.kpi.ttmYield ?? 0;

  let score = 50;
  const reasons: string[] = [];

  if (cat.includes("muni")) {
    score = 90;
    reasons.push("Municipal bonds produce federally tax-exempt income — highly efficient for taxable accounts.");
  } else if (cat.includes("bond") || cat.includes("fixed") || cat.includes("income") || cat.includes("treasury") || cat.includes("credit")) {
    score -= 25;
    reasons.push("Fixed income generates ordinary income taxed at full marginal rates.");
  } else if (cat.includes("high yield")) {
    score -= 30;
    reasons.push("High-yield bonds produce ordinary income with high distribution frequency.");
  } else if (cat.includes("real estate") || cat.includes("reit")) {
    score -= 20;
    reasons.push("REITs distribute most income as ordinary dividends, limiting tax efficiency.");
  } else if (cat.includes("commodity") || cat.includes("alternative")) {
    score -= 10;
    reasons.push("Alternatives/commodities may generate short-term gains and complex tax treatment.");
  }

  if (isETF) {
    score += 15;
    reasons.push("ETF structure allows in-kind creations/redemptions, minimizing capital gain distributions.");
  } else {
    score -= 5;
    reasons.push("Mutual fund structure may trigger taxable capital gain distributions to all shareholders.");
  }

  if (er <= 0.1) {
    score += 10;
    reasons.push("Very low expense ratio indicates passive management and low portfolio turnover.");
  } else if (er > 0.6) {
    score -= 12;
    reasons.push("Higher expense ratio suggests active management with potentially higher turnover.");
  }

  if (yield_ > 5) {
    score -= 15;
    reasons.push(`High yield (${yield_.toFixed(1)}%) means frequent large distributions taxable in the year received.`);
  } else if (yield_ > 3) {
    score -= 8;
    reasons.push(`Moderate yield (${yield_.toFixed(1)}%) creates regular taxable distributions.`);
  } else if (yield_ < 1 && yield_ >= 0) {
    score += 8;
    reasons.push("Low yield means fewer taxable distributions — gains deferred until sale.");
  }

  if (name.includes("tax-managed") || name.includes("tax managed")) {
    score += 15;
    reasons.push("Explicitly tax-managed strategy — designed to minimize shareholder tax burden.");
  }
  if (name.includes("growth") && isETF && er < 0.2) {
    score += 5;
    reasons.push("Growth-oriented ETF typically has lower yield and defers return as capital gains.");
  }
  if (cat.includes("covered call") || name.includes("premium income") || name.includes("equity premium")) {
    score -= 20;
    reasons.push("Options premium income from covered-call strategies is taxed as short-term gains or ordinary income.");
  }

  score = Math.max(0, Math.min(100, score));
  const rating: TaxResult["rating"] = score >= 75 ? "A" : score >= 55 ? "B" : score >= 35 ? "C" : "D";

  const labels = { A: "High Efficiency", B: "Moderate Efficiency", C: "Low Efficiency", D: "Tax-Inefficient" };
  const drags = { A: "~0.1–0.3%/yr", B: "~0.3–0.6%/yr", C: "~0.6–1.0%/yr", D: ">1.0%/yr" };
  const recs = {
    A: "Taxable Account OK",
    B: "Either — slight preference for tax-advantaged",
    C: "Prefer Tax-Advantaged (IRA/401k)",
    D: "Tax-Advantaged Account (IRA/401k/529)",
  };
  const details = {
    A: "Suitable for taxable brokerage accounts. Tax drag is minimal.",
    B: "Can be held in taxable accounts but benefits from tax-sheltered placement.",
    C: "Best placed in an IRA or 401k to defer or eliminate taxes on distributions.",
    D: "Should be in a tax-sheltered account. High distributions or turnover erode after-tax returns.",
  };

  return {
    score, rating,
    ratingLabel: labels[rating],
    dragEstimate: drags[rating],
    accountRec: recs[rating],
    accountDetail: details[rating],
    reasons: reasons.filter(Boolean).slice(0, 3),
  };
}
