/**
 * Heuristic pros/cons rundown for a single fund — pure & reusable.
 * All kpi values + expenseRatio are in PERCENT units.
 */
import type { FundRecord } from "./funds";

export interface FundAnalysis {
  pros: string[];
  cons: string[];
  bottomLine: string;
  net: number;
}

export function analyzeFund(f: FundRecord): FundAnalysis {
  const k = f.kpi;
  const pros: string[] = [];
  const cons: string[] = [];
  const er = f.expenseRatio;

  // Cost
  if (er != null) {
    if (er <= 0.20) pros.push(`Low cost — a ${er.toFixed(2)}% expense ratio leaves more return for the client.`);
    else if (er > 0.75) cons.push(`Expensive — a ${er.toFixed(2)}% expense ratio is a meaningful drag over time.`);
  }
  // Risk-adjusted return
  if (k.sharpe3y != null) {
    if (k.sharpe3y >= 1) pros.push(`Strong risk-adjusted returns — 3-yr Sharpe of ${k.sharpe3y.toFixed(2)}.`);
    else if (k.sharpe3y < 0.4) cons.push(`Weak risk-adjusted returns — 3-yr Sharpe of only ${k.sharpe3y.toFixed(2)}.`);
  }
  // Alpha vs benchmark
  if (k.alpha3y != null) {
    if (k.alpha3y > 0.5) pros.push(`Adds value vs its benchmark — +${k.alpha3y.toFixed(2)}% annualized alpha (3y).`);
    else if (k.alpha3y < -0.5) cons.push(`Trails its benchmark — ${k.alpha3y.toFixed(2)}% annualized alpha (3y).`);
  }
  // Downside / drawdown
  if (k.maxDrawdown3y != null) {
    if (k.maxDrawdown3y > -12) pros.push(`Holds up in selloffs — worst 3-yr drawdown of just ${k.maxDrawdown3y.toFixed(1)}%.`);
    else if (k.maxDrawdown3y < -28) cons.push(`Deep drawdowns — fell ${k.maxDrawdown3y.toFixed(1)}% at its 3-yr worst.`);
  }
  if (k.downsideCapture3y != null) {
    if (k.downsideCapture3y < 90) pros.push(`Defensive — captures only ${k.downsideCapture3y.toFixed(0)}% of market losses.`);
    else if (k.downsideCapture3y > 110) cons.push(`Falls harder than the market — ${k.downsideCapture3y.toFixed(0)}% downside capture.`);
  }
  // Income
  if (k.ttmYield != null) {
    if (k.ttmYield >= 2.5) pros.push(`Meaningful income — ${k.ttmYield.toFixed(2)}% trailing 12-mo yield.`);
    else if (k.ttmYield < 0.5) cons.push(`Little income — ${k.ttmYield.toFixed(2)}% yield; total return depends on price.`);
  }
  // Volatility
  if (k.beta3y != null && k.beta3y > 1.2) cons.push(`Higher volatility — a beta of ${k.beta3y.toFixed(2)} vs the market.`);
  // Track record
  if (f.fundAge != null) {
    if (f.fundAge >= 12) pros.push(`Long track record — ${f.fundAge.toFixed(0)} years of history.`);
    else if (f.fundAge < 3) cons.push(`Short track record — only ${f.fundAge.toFixed(1)} years of history.`);
  }
  // Recent performance
  if (k.return3y != null && k.return3y >= 12) pros.push(`Strong recent performance — ${k.return3y.toFixed(1)}% annualized over 3 years.`);
  // Consistency
  if (k.battingAvg3y != null && k.battingAvg3y >= 55) pros.push(`Consistent — beat its benchmark in ${k.battingAvg3y.toFixed(0)}% of months.`);

  const net = pros.length - cons.length;
  let bottomLine: string;
  if (net >= 2) {
    bottomLine = `${f.ticker} screens as a strong option in its category on this data. Confirm the details in your firm's system before acting.`;
  } else if (net <= -2) {
    bottomLine = `${f.ticker} shows several weak spots on this data — scrutinize it closely or compare alternatives before recommending.`;
  } else {
    bottomLine = `${f.ticker} is a mixed picture — its strengths and trade-offs roughly balance. Compare it against peers to decide.`;
  }

  return { pros: pros.slice(0, 6), cons: cons.slice(0, 6), bottomLine, net };
}
