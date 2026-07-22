/**
 * Model engine — transparent, deterministic scenario projection.
 *
 * Everything here is an ILLUSTRATIVE, assumption-based estimate — not a
 * forecast, probability band, or guarantee.
 *
 * Methodology (v2):
 * - Three explicit, editable annual-return assumptions drive three paths:
 *   Downside, Base, and Upside. They are independent assumption inputs —
 *   NOT derived from volatility, and NOT confidence intervals.
 * - All return assumptions are NET OF FUND EXPENSES. Historical returns are
 *   computed from adjusted price history, which is already net of a fund's
 *   expense ratio, so a historical initialization needs no adjustment and
 *   expenses are never double-counted. The expense ratio remains visible as
 *   a portfolio FACT and drives an "estimated embedded expenses" figure.
 * - Volatility is carried as a historical/assumed RISK METRIC for display
 *   and never adjusts a projected return path.
 * - Deterministic monthly compounding; contributions/withdrawals monthly;
 *   inflation deflates for the inflation-adjusted view; depletion detected
 *   per path. No randomness: results are reproducible and testable.
 */

// ── Assumptions ───────────────────────────────────────────────────────────────

export interface ModelAssumptions {
  years: number;               // projection horizon (years)
  initial: number;             // starting value ($)
  monthlyContribution: number; // $ added each month
  monthlyWithdrawal: number;   // $ removed each month
  /** Annual return assumptions, % per year, NET of fund expenses. */
  downReturn: number;          // Downside Path assumption
  baseReturn: number;          // Base Path assumption
  upReturn: number;            // Upside Path assumption
  /** Historical or assumed annualized volatility, % — a risk metric shown for
      context. It does NOT feed the path math. */
  annualVol: number;
  inflation: number;           // % annual (inflation-adjusted view)
  /** Fund expense ratio, % annual — a portfolio fact. Return assumptions are
      already net of it; used only for the estimated-embedded-expenses figure. */
  expenseRatio: number;
  // ── Stress inputs ──
  initialShockPct?: number;    // % one-time decline in value (market-decline stress)
  shockYear?: number;          // 1-based year the decline hits (default 1 = immediate)
  phase1?: { months: number; annualReturn: number }; // low-return opening phase (net %)
}

/** Default percentage-point spread used to initialize Downside/Upside around
    the Base assumption. Purely a starting point — all three are editable. */
export const DEFAULT_PATH_SPREAD = 2;

/** Build down/base/up assumptions from a single base return (± spread). */
export function spreadReturns(base: number, spread: number = DEFAULT_PATH_SPREAD) {
  return {
    downReturn: +(base - spread).toFixed(2),
    baseReturn: +base.toFixed(2),
    upReturn: +(base + spread).toFixed(2),
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

export const RETURN_BOUNDS = { min: -30, max: 30 };

/** Human-readable problems with a set of path-return assumptions. */
export function validateReturns(a: Pick<ModelAssumptions, "downReturn" | "baseReturn" | "upReturn">): string[] {
  const errs: string[] = [];
  const fields: [string, number][] = [
    ["Downside return", a.downReturn], ["Base return", a.baseReturn], ["Upside return", a.upReturn]];
  for (const [label, v] of fields) {
    if (!Number.isFinite(v)) errs.push(`${label} is not a number.`);
    else if (v < RETURN_BOUNDS.min || v > RETURN_BOUNDS.max)
      errs.push(`${label} must be between ${RETURN_BOUNDS.min}% and ${RETURN_BOUNDS.max}% per year.`);
  }
  if (Number.isFinite(a.downReturn) && Number.isFinite(a.baseReturn) && a.downReturn > a.baseReturn)
    errs.push("Downside return is above the base return — downside should be ≤ base.");
  if (Number.isFinite(a.baseReturn) && Number.isFinite(a.upReturn) && a.baseReturn > a.upReturn)
    errs.push("Upside return is below the base return — upside should be ≥ base.");
  return errs;
}

export interface HoldingInput { ticker: string; weight: number }

/** Allocation tolerance: weights may differ from 100% by this much (rounding). */
export const WEIGHT_TOLERANCE = 0.5;

/** Validate a set of holdings before running/deriving. `known` = valid tickers
    (uppercase); pass undefined to skip ticker-existence checks. */
export function validateHoldings(holdings: HoldingInput[], known?: Set<string>): string[] {
  const errs: string[] = [];
  const rows = holdings.filter((h) => h.ticker.trim() || h.weight > 0);
  if (!rows.length) { errs.push("Add at least one holding with a ticker and weight."); return errs; }
  for (const h of rows) {
    if (!h.ticker.trim()) { errs.push("A holding is missing its ticker."); continue; }
    if (known && !known.has(h.ticker.trim().toUpperCase()))
      errs.push(`"${h.ticker.trim().toUpperCase()}" is not in the fund universe — pick a ticker from the suggestions.`);
    if (!Number.isFinite(h.weight) || h.weight < 0)
      errs.push(`${h.ticker.trim().toUpperCase()}: weight must be a number ≥ 0.`);
  }
  const total = rows.reduce((s, h) => s + (Number.isFinite(h.weight) ? h.weight : 0), 0);
  if (Math.abs(total - 100) > WEIGHT_TOLERANCE)
    errs.push(`Weights total ${total.toFixed(1)}% — they must total 100% (±${WEIGHT_TOLERANCE}%). Use “Normalize weights” or adjust manually.`);
  return errs;
}

// ── Projection ────────────────────────────────────────────────────────────────

export interface ModelPoint {
  month: number;      // 0..years*12
  down: number;       // Downside Path, nominal $
  base: number;       // Base Path, nominal $
  up: number;         // Upside Path, nominal $
  baseReal: number;   // Base Path, inflation-adjusted $
  contributed: number; // cumulative contributions to date ($)
}

export interface ModelResult {
  points: ModelPoint[];
  ending: {
    down: number; base: number; up: number;
    downReal: number; baseReal: number; upReal: number;
  };
  /** First month a path hits $0, if any (undefined = lasts the horizon). */
  depletionMonth: { down?: number; base?: number; up?: number };
  totals: { contributed: number; withdrawn: number; feesApprox: number };
  assumptions: ModelAssumptions;
}

const clampMoney = (v: number) => (v < 0.005 ? 0 : v);

/** Annual % → equivalent monthly rate. */
export function monthlyRate(annualPct: number): number {
  const a = annualPct / 100;
  // Guard: an annual loss ≥ 100% floors at total loss for the year.
  if (a <= -1) return -1;
  return Math.pow(1 + a, 1 / 12) - 1;
}

function runPath(a: ModelAssumptions, netAnnualReturnPct: number,
  onFee?: (fee: number) => void): { values: number[]; depletion?: number } {
  const months = Math.max(1, Math.round(a.years * 12));
  // Returns are already net of fund expenses — compound at the stated rate.
  const rBase = monthlyRate(netAnnualReturnPct);
  // phase1.annualReturn states the BASE path's return during the phase; the
  // other paths shift by the same delta so "each path −N points" stays exact.
  const phase1Delta = a.phase1 ? a.phase1.annualReturn - a.baseReturn : 0;
  const rPhase1 = monthlyRate(netAnnualReturnPct + phase1Delta);
  // Estimated fund expenses embedded in the net return (informational only).
  const feeMonthly = Math.max(0, a.expenseRatio) / 100 / 12;
  const shockMonth = a.initialShockPct
    ? Math.max(0, (Math.min(Math.max(1, Math.round(a.shockYear ?? 1)), Math.max(1, Math.round(a.years))) - 1) * 12)
    : -1;

  let v = a.initial;
  if (shockMonth === 0) v *= 1 - (a.initialShockPct ?? 0) / 100;
  const values: number[] = [v];
  let depletion: number | undefined;

  for (let m = 1; m <= months; m++) {
    const r = a.phase1 && m <= a.phase1.months ? rPhase1 : rBase;
    onFee?.(v * feeMonthly);
    v = v * (1 + r) + a.monthlyContribution - a.monthlyWithdrawal;
    if (m === shockMonth) v *= 1 - (a.initialShockPct ?? 0) / 100;
    v = clampMoney(v);
    if (v === 0 && depletion === undefined && a.monthlyWithdrawal > 0) depletion = m;
    values.push(v);
    if (v === 0 && a.monthlyContribution === 0) {
      // Depleted with no inflows: stays at zero — fill and stop early.
      for (let k = m + 1; k <= months; k++) values.push(0);
      break;
    }
  }
  return { values, depletion };
}

/** Run the three-path deterministic projection (Downside / Base / Upside). */
export function projectPaths(a: ModelAssumptions): ModelResult {
  let fees = 0;
  const base = runPath(a, a.baseReturn, (f) => { fees += f; });
  const down = runPath(a, a.downReturn);
  const up = runPath(a, a.upReturn);

  const months = Math.max(base.values.length, down.values.length, up.values.length) - 1;
  const infMonthly = Math.pow(1 + a.inflation / 100, 1 / 12);
  const points: ModelPoint[] = [];
  for (let m = 0; m <= months; m++) {
    const deflator = Math.pow(infMonthly, m);
    points.push({
      month: m,
      down: down.values[m] ?? 0,
      base: base.values[m] ?? 0,
      up: up.values[m] ?? 0,
      baseReal: (base.values[m] ?? 0) / deflator,
      contributed: a.monthlyContribution * m,
    });
  }
  const last = points[points.length - 1];
  const deflator = Math.pow(infMonthly, months);
  return {
    points,
    ending: {
      down: last.down, base: last.base, up: last.up,
      downReal: last.down / deflator, baseReal: last.baseReal, upReal: last.up / deflator,
    },
    depletionMonth: { down: down.depletion, base: base.depletion, up: up.depletion },
    totals: {
      contributed: a.monthlyContribution * months,
      withdrawn: a.monthlyWithdrawal * months, // intended withdrawals; actual may be lower if depleted
      feesApprox: fees,
    },
    assumptions: a,
  };
}

// ── Stress presets — explicit assumption changes, not crisis replays ──────────

export interface StressPreset {
  id: string;
  label: string;
  desc: string;
  /** Exact assumption change, e.g. "Value −30% one time". */
  change: string;
  /** When the stress occurs, e.g. "Start of the selected shock year". */
  timing: string;
  /** How long it lasts, e.g. "Instant" or "Entire horizon". */
  duration: string;
  kind: "one-time shock" | "recurring assumption";
  /** True when the stress changes only the displayed risk metric, not the
      deterministic paths (e.g. higher volatility). */
  riskMetricOnly?: boolean;
  apply: (a: ModelAssumptions) => ModelAssumptions;
}

export const STRESS_PRESETS: StressPreset[] = [
  { id: "decline", label: "Market decline", desc: "A one-time 30% decline in portfolio value.",
    change: "Portfolio value −30%, one time", timing: "Start of the selected shock year (default: immediately)",
    duration: "Instant — normal assumptions apply afterward", kind: "one-time shock",
    apply: (a) => ({ ...a, initialShockPct: 30, shockYear: a.shockYear ?? 1 }) },
  { id: "inflation", label: "Higher inflation", desc: "Inflation runs 2 percentage points above the base assumption.",
    change: "Inflation +2 percentage points", timing: "From the start", duration: "Entire horizon",
    kind: "recurring assumption",
    apply: (a) => ({ ...a, inflation: a.inflation + 2 }) },
  { id: "lowreturn", label: "Lower return", desc: "All three return assumptions reduced by 2 percentage points.",
    change: "Downside / Base / Upside returns −2 percentage points", timing: "From the start",
    duration: "Entire horizon", kind: "recurring assumption",
    apply: (a) => ({ ...a, downReturn: a.downReturn - 2, baseReturn: a.baseReturn - 2, upReturn: a.upReturn - 2 }) },
  { id: "withdrawals", label: "Increased withdrawals", desc: "Monthly withdrawals 25% higher than planned.",
    change: "Monthly withdrawal ×1.25", timing: "From the start", duration: "Entire horizon",
    kind: "recurring assumption",
    apply: (a) => ({ ...a, monthlyWithdrawal: a.monthlyWithdrawal * 1.25 }) },
  { id: "volatility", label: "Higher volatility", desc: "The volatility risk metric is 50% higher. This changes displayed risk context only — deterministic paths are driven by the return assumptions, so the modeled ending value is unchanged.",
    change: "Volatility metric ×1.5 (risk context only — no return change)", timing: "From the start",
    duration: "Entire horizon", kind: "recurring assumption", riskMetricOnly: true,
    apply: (a) => ({ ...a, annualVol: a.annualVol * 1.5 }) },
  { id: "lostdecade", label: "Extended low-return period", desc: "The first 10 years earn 3 percentage points below each path's return; normal assumptions resume in year 11.",
    change: "Returns −3 percentage points during the affected period", timing: "Years 1–10",
    duration: "10 years, then normal assumptions resume", kind: "recurring assumption",
    apply: (a) => ({ ...a, phase1: { months: 120, annualReturn: a.baseReturn - 3 } }) },
];

// ── Scenario difference summary (pure, testable) ──────────────────────────────

export interface ScenarioLike { name: string; a: ModelAssumptions }

export interface ScenarioDiffLine { label: string; delta: string }

const signed = (v: number, unit: string, digits = 2) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}${unit}`;
const signedMoney = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmtMoney(Math.abs(v))}`;

/** What changed between two scenarios (B vs A) — assumption + outcome deltas. */
export function scenarioDiff(a: ScenarioLike, b: ScenarioLike, ra: ModelResult, rb: ModelResult): ScenarioDiffLine[] {
  const lines: ScenarioDiffLine[] = [];
  const push = (label: string, d: number, fmt: (v: number) => string) => { if (Math.abs(d) > 1e-9) lines.push({ label, delta: fmt(d) }); };
  push("Base return", b.a.baseReturn - a.a.baseReturn, (v) => signed(v, " pt"));
  push("Downside return", b.a.downReturn - a.a.downReturn, (v) => signed(v, " pt"));
  push("Upside return", b.a.upReturn - a.a.upReturn, (v) => signed(v, " pt"));
  push("Volatility (risk metric)", b.a.annualVol - a.a.annualVol, (v) => signed(v, " pt", 1));
  push("Expenses", b.a.expenseRatio - a.a.expenseRatio, (v) => signed(v, " pt"));
  push("Monthly contribution", b.a.monthlyContribution - a.a.monthlyContribution, signedMoney);
  push("Monthly withdrawal", b.a.monthlyWithdrawal - a.a.monthlyWithdrawal, signedMoney);
  push("Inflation", b.a.inflation - a.a.inflation, (v) => signed(v, " pt", 1));
  push("Starting value", b.a.initial - a.a.initial, signedMoney);
  push("Horizon", b.a.years - a.a.years, (v) => signed(v, " yr", 0));
  // Outcome deltas always shown
  lines.push({ label: "Ending value (base)", delta: signedMoney(rb.ending.base - ra.ending.base) });
  lines.push({ label: "Ending value (downside)", delta: signedMoney(rb.ending.down - ra.ending.down) });
  return lines;
}

// ── Saved scenarios — localStorage persistence with versioned migration ───────

export const SCENARIO_VERSION = 2;

export interface SavedScenario {
  id: string;
  name: string;
  tool: "fund-benchmark" | "projection" | "scenarios" | "stress";
  subject: string;          // e.g. "VTI vs SPY" or "3-fund portfolio"
  assumptions: ModelAssumptions;
  extra?: Record<string, unknown>; // tool-specific state (tickers, weights, benchmark…)
  savedAt: number;
  version: number;
  /** Set when the scenario was auto-migrated from an older format. */
  migrated?: boolean;
}

/** v1 shape: single annualReturn (gross) with the engine subtracting expenses,
    and volatility implicitly defining the conservative/optimistic paths. */
interface LegacyAssumptionsV1 {
  years: number; initial: number; monthlyContribution: number; monthlyWithdrawal: number;
  annualReturn: number; annualVol: number; inflation: number; expenseRatio: number;
  initialShockPct?: number; phase1?: { months: number; annualReturn: number };
}

function isLegacyAssumptions(a: unknown): a is LegacyAssumptionsV1 {
  return !!a && typeof a === "object" && "annualReturn" in a && !("baseReturn" in a);
}

/** Migrate a v1 scenario in place: the old engine compounded at
    (annualReturn − expenseRatio), so the equivalent net base return preserves
    the old base-path result exactly. Downside/Upside get the transparent
    default spread; volatility is kept as the risk metric it now is. */
export function migrateScenario(raw: unknown): SavedScenario | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (!s.id || !s.assumptions) return null;
  if (!isLegacyAssumptions(s.assumptions)) {
    const out = raw as SavedScenario;
    return { ...out, version: out.version ?? SCENARIO_VERSION };
  }
  const old = s.assumptions;
  const netBase = +(old.annualReturn - old.expenseRatio).toFixed(2);
  const a: ModelAssumptions = {
    years: old.years, initial: old.initial,
    monthlyContribution: old.monthlyContribution, monthlyWithdrawal: old.monthlyWithdrawal,
    ...spreadReturns(netBase),
    annualVol: old.annualVol, inflation: old.inflation, expenseRatio: old.expenseRatio,
    initialShockPct: old.initialShockPct, phase1: old.phase1,
  };
  return {
    id: String(s.id), name: String(s.name ?? "Untitled scenario"),
    tool: (s.tool as SavedScenario["tool"]) ?? "projection",
    subject: String(s.subject ?? ""), assumptions: a,
    extra: s.extra as Record<string, unknown> | undefined,
    savedAt: Number(s.savedAt ?? Date.now()), version: SCENARIO_VERSION, migrated: true,
  };
}

const STORE_KEY = "alca-model-scenarios";

export function loadScenarios(): SavedScenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    if (!Array.isArray(list)) return [];
    return list.map(migrateScenario).filter((s): s is SavedScenario => s !== null);
  } catch { return []; }
}

export function saveScenario(s: Omit<SavedScenario, "id" | "savedAt" | "version">): SavedScenario {
  const full: SavedScenario = {
    ...s, id: `sc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    savedAt: Date.now(), version: SCENARIO_VERSION,
  };
  const list = [full, ...loadScenarios()].slice(0, 50);
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* storage full/blocked */ }
  return full;
}

export function deleteScenario(id: string): SavedScenario[] {
  const list = loadScenarios().filter((s) => s.id !== id);
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  return list;
}

// ── Formatting helpers shared by Model views ─────────────────────────────────

/** Compact currency: $950, $12,400 → $12.4K? No — full below $100K, then $250K / $2.5M. */
export const fmtMoney = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e5) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
};

/** Axis-tick currency: always abbreviated ($0, $500, $10K, $250K, $2.5M). */
export const fmtMoneyAxis = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1e6) return `${sign}$${+(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs)}`;
};

export const fmtMoneyFull = (v: number) => `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`;
