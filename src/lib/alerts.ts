/**
 * Alert helpers — PURE (no server/network). Maps SEC form types to FACTUAL,
 * generic summaries for Phase-1 monitoring. No claims about manager/expense/
 * strategy/holdings/risk changes — only "a filing of type X was filed".
 */

export type AlertSeverity = "info" | "watch" | "warning" | "critical";

/** Fund + company forms we surface. Fund forms are fetched via getFundFilings;
    company forms are reserved for a future company-monitoring path. */
export const RELEVANT_FORMS: string[] = [
  // funds
  "N-PORT", "N-PORT-P", "N-CEN", "N-CSR", "N-CSRS", "N-1A", "485BPOS", "485APOS", "497", "497K", "N-PX",
  // companies (future path)
  "10-K", "10-Q", "8-K", "DEF 14A", "S-1", "4",
];

/** Generic, factual summary per form type (Phase 1). */
const FORM_SUMMARY: Record<string, string> = {
  "N-PORT": "New fund portfolio report filed.",
  "N-PORT-P": "New fund portfolio report filed.",
  "N-CEN": "New annual fund census filing.",
  "N-CSR": "New shareholder report filed.",
  "N-CSRS": "New semi-annual shareholder report filed.",
  "N-1A": "New prospectus-related filing.",
  "485BPOS": "New prospectus-related filing.",
  "485APOS": "New prospectus-related filing.",
  "497": "New prospectus-related filing.",
  "497K": "New summary prospectus filing.",
  "N-PX": "New proxy voting record filed.",
  "10-K": "New annual report filed.",
  "10-Q": "New quarterly report filed.",
  "8-K": "New current report filed.",
  "DEF 14A": "New proxy filing.",
  "S-1": "New registration statement filed.",
  "4": "New insider transaction filing.",
};

export function formSummary(form: string): string {
  return FORM_SUMMARY[form] ?? "New SEC filing.";
}

/** All SEC filing alerts are informational in Phase 1 (factual metadata only). */
export function formSeverity(_form: string): AlertSeverity {
  return "info";
}

/** Human title for a filing alert, e.g. "VTI — N-PORT filing". */
export function filingAlertTitle(ticker: string | null, form: string): string {
  return ticker ? `${ticker} — ${form} filing` : `${form} filing`;
}

/** Stable dedupe key so a filing produces exactly one alert per firm. */
export function secDedupeKey(cik: string, accession: string): string {
  return `sec:${cik}:${accession}`;
}

/** Guess fund vs company from a SEC form type (best-effort; unknown otherwise). */
export function entityTypeForForm(form: string): "fund" | "company" | "unknown" {
  if (/^N-|^485|^497/.test(form)) return "fund";
  if (/^10-|^8-K|^DEF 14A|^S-1|^4$/.test(form)) return "company";
  return "unknown";
}
