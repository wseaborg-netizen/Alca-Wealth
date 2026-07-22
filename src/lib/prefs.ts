/**
 * Local workspace preferences — stored on this device via localStorage.
 * There is no account-level sync; the Settings drawer says so honestly.
 */

export type LandingPref = "home" | "dashboard" | "research" | "workspace" | "model";
export type BenchmarkPref = "SPY" | "AGG" | "VXUS";
export type MotionPref = "system" | "full" | "reduced";

export interface Prefs {
  landing: LandingPref;
  benchmark: BenchmarkPref;
  openLast: boolean;
  motion: MotionPref;
}

export const DEFAULT_PREFS: Prefs = { landing: "home", benchmark: "SPY", openLast: false, motion: "system" };

const KEY = "alca-prefs";

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch { return DEFAULT_PREFS; }
}

export function savePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...patch };
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* blocked */ }
  return next;
}

/** Reflect the motion preference onto <html data-motion> so CSS + hooks see it. */
export function applyMotionPref(m: MotionPref) {
  if (typeof document === "undefined") return;
  if (m === "system") document.documentElement.removeAttribute("data-motion");
  else document.documentElement.setAttribute("data-motion", m);
}
