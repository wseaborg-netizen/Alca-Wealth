/**
 * Client profile model + local persistence.
 * A "client" captures everything the Portfolio Builder and Compare tools need
 * to construct and evaluate a recommendation. Stored in localStorage (device
 * local) - no client PII leaves the browser.
 */

// Continuous 1.0 (conservative) - 5.0 (aggressive). The slider rests anywhere;
// riskLabel() below buckets it to the nearest of the 5 named levels for display.
export type RiskLevel = number;
export type AccountType = "taxable" | "traditional" | "roth";
export type Goal = "income" | "balanced" | "growth";
export type CostSensitivity = "low" | "medium" | "high";

export interface ClientAccount {
  type: AccountType;
  balance: number;
}

export interface ClientHolding {
  ticker: string;
  value: number;
}

export interface Client {
  id: string;
  name: string;
  age: number | null;
  spouseAge?: number | null;  // optional - couples planning (drives horizon inference)
  horizonYears: number | null;
  risk: RiskLevel;            // 1 = conservative ... 5 = aggressive
  taxBracket: number | null;  // marginal rate, e.g. 32 (%)
  state: string;              // e.g. "CA" (used for muni suggestions)
  goal: Goal;
  costSensitivity: CostSensitivity;  // fee tolerance - drives fund selection + matching
  accounts: ClientAccount[];
  holdings: ClientHolding[];  // what they hold today (the "murder board" for this client)
  updatedAt: number;
}

export const RISK_LABELS: Record<number, string> = {
  1: "Conservative",
  2: "Moderately Conservative",
  3: "Moderate",
  4: "Moderately Aggressive",
  5: "Aggressive",
};

/** Bucket a continuous risk value to the nearest of the 5 named levels. */
export function riskLabel(risk: number): string {
  const bucket = Math.max(1, Math.min(5, Math.round(risk)));
  return RISK_LABELS[bucket];
}

export const ACCOUNT_LABELS: Record<AccountType, string> = {
  taxable: "Taxable Brokerage",
  traditional: "Traditional IRA / 401(k)",
  roth: "Roth IRA",
};

export const GOAL_LABELS: Record<Goal, string> = {
  income: "Income",
  balanced: "Balanced",
  growth: "Growth",
};

export const COST_LABELS: Record<CostSensitivity, string> = {
  low: "Low - open to premium/active funds",
  medium: "Medium - balance cost & quality",
  high: "High - prioritize low fees",
};

const KEY = "tool_clients_v1";

function uid(): string {
  return "c_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function newClient(): Client {
  return {
    id: uid(),
    name: "",
    age: null,
    horizonYears: null,
    risk: 3,
    taxBracket: null,
    state: "",
    goal: "balanced",
    costSensitivity: "medium",
    accounts: [
      { type: "taxable", balance: 0 },
      { type: "traditional", balance: 0 },
      { type: "roth", balance: 0 },
    ],
    holdings: [],
    updatedAt: Date.now(),
  };
}

export function loadClients(): Client[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Client[];
    if (!Array.isArray(list)) return [];
    // Backfill fields added after a client was first saved.
    return list.map((c) => ({ ...c, costSensitivity: c.costSensitivity ?? "medium" }));
  } catch {
    return [];
  }
}

export function saveClients(list: Client[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota or serialization error - non-fatal */
  }
}

export function upsertClient(c: Client): Client[] {
  const list = loadClients();
  const updated = { ...c, updatedAt: Date.now() };
  const i = list.findIndex((x) => x.id === c.id);
  const next = i >= 0 ? list.map((x) => (x.id === c.id ? updated : x)) : [...list, updated];
  saveClients(next);
  return next;
}

export function deleteClient(id: string): Client[] {
  const next = loadClients().filter((x) => x.id !== id);
  saveClients(next);
  return next;
}

/** Total investable assets across all of a client's accounts. */
export function totalAssets(c: Client): number {
  return c.accounts.reduce((s, a) => s + (a.balance || 0), 0);
}

/** Total value of current holdings (may differ from account balances). */
export function totalHoldings(c: Client): number {
  return c.holdings.reduce((s, h) => s + (h.value || 0), 0);
}
