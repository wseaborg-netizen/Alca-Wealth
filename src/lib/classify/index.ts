/**
 * Runtime fund classification for the Expansion Hub — same rules + taxonomy as
 * the offline pipeline (imports the shared core.mjs; no forked/weaker logic).
 *
 * Given an FMP profile (name + fund type), it runs the shared classifier, honors
 * the same manual overrides, and validates against the controlled taxonomy. It
 * returns a definite outcome — never a guessed classification:
 *   - "verified"             → confident + taxonomy-valid → safe to add
 *   - "needs_classification" → rules couldn't confidently classify → human review
 *   - "invalid_taxonomy"     → classified but produced a non-controlled value → review
 */
import { classify, validateFields, type ClassifiedFields } from "./core.js";
import { legacyCategory, benchmarkFor } from "../universe";
import taxonomyRaw from "@/../data/config/fund-taxonomy.json";
import overridesRaw from "@/../data/config/fund-classification-overrides.json";

const taxonomy = taxonomyRaw as Record<string, string[] | string>;

type OverrideRecord = Partial<ClassifiedFields> & { ticker?: string; verified?: boolean; source?: string };

// Manual overrides keyed by ticker (same file the pipeline uses). Accepts an
// array of records or an object keyed by ticker.
const OVERRIDES: Map<string, OverrideRecord> = (() => {
  const map = new Map<string, OverrideRecord>();
  const raw = overridesRaw as unknown;
  const records: OverrideRecord[] = Array.isArray(raw)
    ? raw as OverrideRecord[]
    : Object.entries(raw as Record<string, OverrideRecord>).map(([ticker, v]) => ({ ticker, ...v }));
  for (const rec of records) if (rec?.ticker) map.set(String(rec.ticker).toUpperCase(), rec);
  return map;
})();

export type ClassificationStatus = "verified" | "needs_classification" | "invalid_taxonomy";

export interface RuntimeClassification {
  status: ClassificationStatus;
  fields: ClassifiedFields | null;
  category: string | null;      // legacy category vocabulary (screener/sleeves)
  benchmark: "SPY" | "AGG" | "VXUS" | null;
  source: "manual-override" | "rule-based" | null;
  reason: string | null;
  invalidFields?: string[];
}

const REQUIRED: (keyof ClassifiedFields)[] = [
  "asset_class", "primary_category", "region", "management_style", "portfolio_role", "investment_focus", "benchmark_category",
];

function finalize(fields: ClassifiedFields, source: "manual-override" | "rule-based"): RuntimeClassification {
  // Guard against a partial override that's missing required enum fields.
  const missing = REQUIRED.filter((k) => fields[k] == null || fields[k] === "");
  if (missing.length) {
    return { status: "needs_classification", fields, category: null, benchmark: null, source,
      reason: `Classification incomplete (missing: ${missing.join(", ")}).`, invalidFields: missing };
  }
  const invalid = validateFields(fields as unknown as Record<string, unknown>, taxonomy);
  if (invalid.length) {
    return { status: "invalid_taxonomy", fields, category: null, benchmark: null, source,
      reason: `Produced values outside the controlled taxonomy (${invalid.join(", ")}).`, invalidFields: invalid };
  }
  return {
    status: "verified", fields,
    category: legacyCategory(fields.primary_category),
    benchmark: benchmarkFor(fields.asset_class, fields.region),
    source, reason: null,
  };
}

/** Classify a fund from its FMP identity. `normalizedTicker` is upper-cased. */
export function classifyFund(input: { normalizedTicker: string; name: string; fundType: string | null }): RuntimeClassification {
  const ov = OVERRIDES.get(input.normalizedTicker.toUpperCase());
  if (ov) {
    // Override wins over the rules (same precedence as the pipeline).
    const fields = {
      asset_class: ov.asset_class ?? "", primary_category: ov.primary_category ?? "", region: ov.region ?? "",
      market_cap: ov.market_cap ?? null, style: ov.style ?? null, style_box: ov.style_box ?? null,
      management_style: ov.management_style ?? "", portfolio_role: ov.portfolio_role ?? "",
      investment_focus: ov.investment_focus ?? "", benchmark_category: ov.benchmark_category ?? "",
    } as ClassifiedFields;
    return finalize(fields, "manual-override");
  }

  const r = classify({ fund_name: input.name, fund_type: input.fundType });
  if ("fields" in r && r.confidence === "high") {
    return finalize(r.fields, "rule-based");
  }
  return {
    status: "needs_classification", fields: (r as { suggestion?: ClassifiedFields }).suggestion ?? null,
    category: null, benchmark: null, source: null,
    reason: (r as { reason: string }).reason ?? "No classification rule matched the fund name.",
  };
}

/** Cheap self-test used by System Health — proves the classifier + taxonomy load
    and a known name classifies to a taxonomy-valid result. */
export function classifierSelfTest(): { ok: boolean; detail: string } {
  try {
    const r = classifyFund({ normalizedTicker: "__TEST__", name: "Total Stock Market Index Fund", fundType: "ETF" });
    if (r.status !== "verified") return { ok: false, detail: `self-test did not verify (${r.status})` };
    return { ok: true, detail: `taxonomy loaded; sample classified to ${r.fields?.primary_category}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 80) : "classifier error" };
  }
}
