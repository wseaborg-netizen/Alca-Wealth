/**
 * Ticker normalization + validation — PURE (no server/provider imports) so it
 * is trivially testable and safe to use on either side.
 *
 * A valid symbol here is what a fund/ETF ticker realistically looks like:
 * 1–12 characters, letters/digits with optional single dot or hyphen class
 * suffix (e.g. BRK.B, RDS-A), at least one letter. This is a shape guard only —
 * whether the ticker actually exists is decided later by the universe lookup
 * and the FMP support check, never here.
 */

export interface NormalizedTicker {
  ok: boolean;
  normalized: string;
  reason?: string;   // present when ok === false
}

const MAX_LEN = 12;
// letters/digits, optional one ".X" or "-X" class suffix; must contain a letter.
const SHAPE = /^[A-Z0-9]{1,10}([.\-][A-Z0-9]{1,4})?$/;

/** Trim + uppercase; collapse nothing else (internal spaces make it invalid). */
export function normalizeTicker(raw: unknown): NormalizedTicker {
  if (typeof raw !== "string") return { ok: false, normalized: "", reason: "Ticker must be text." };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, normalized: "", reason: "Enter a ticker symbol." };

  const upper = trimmed.toUpperCase();

  if (/\s/.test(upper)) return { ok: false, normalized: upper, reason: "A ticker cannot contain spaces." };
  if (upper.length > MAX_LEN) return { ok: false, normalized: upper.slice(0, MAX_LEN), reason: `Ticker is too long (max ${MAX_LEN} characters).` };
  if (!/[A-Z]/.test(upper)) return { ok: false, normalized: upper, reason: "A ticker must contain at least one letter." };
  if (!SHAPE.test(upper)) return { ok: false, normalized: upper, reason: "That does not look like a valid ticker symbol." };

  return { ok: true, normalized: upper };
}

/** Convenience boolean guard. */
export function isValidTicker(raw: unknown): boolean {
  return normalizeTicker(raw).ok;
}
