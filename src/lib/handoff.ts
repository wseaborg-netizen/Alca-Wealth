/**
 * Workspace handoff — carries a portfolio reference from Portfolio into Model.
 *
 * A handoff is a lightweight, read-once snapshot (sessionStorage): the source
 * portfolio is referenced by its stable client id and summarized as tickers +
 * weights for modeling. Model never mutates the saved portfolio through this —
 * writing back requires an explicit "Save as New Portfolio" / "Update Original
 * Portfolio" action in the Model UI.
 */

export interface HandoffHolding { ticker: string; weight: number; name?: string }

export interface HandoffPortfolio {
  name: string;
  holdings: HandoffHolding[]; // weights in %, ~100 total
}

export interface ModelHandoff {
  source: "portfolio";
  clientId?: string;          // stable reference to the saved client/portfolio
  horizonYears?: number | null;
  primary: HandoffPortfolio;  // the portfolio to project
  second?: HandoffPortfolio;  // present when comparing current vs proposed
}

const KEY = "alca-model-handoff";

export const HANDOFF_EVENT = "alca-model-handoff";

export function setModelHandoff(h: ModelHandoff) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(h));
    // Model may already be mounted — tell it a fresh handoff is waiting.
    window.dispatchEvent(new Event(HANDOFF_EVENT));
  } catch { /* blocked */ }
}

/** Read AND clear — a handoff is consumed exactly once. */
export function takeModelHandoff(): ModelHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const h = JSON.parse(raw) as ModelHandoff;
    return h?.primary?.holdings?.length ? h : null;
  } catch { return null; }
}
