#!/usr/bin/env node
/**
 * Rule-based fund classifier (`npm run funds:classify`).
 *
 * Input : data/generated/fund-reference-data.json    ({ funds: [{ ticker, fund_name, issuer, fund_type }] })
 *         data/config/fund-taxonomy.json              (controlled values — post-classify validation)
 *         data/config/fund-classification-overrides.json  (manual, fund-specific)
 * Output: data/generated/fund-universe.json           (high-confidence, verified: true)
 *         data/generated/fund-review-queue.json        (unclear — verified: false + reason)
 *
 * The classification RULES live in src/lib/classify/core.mjs and are shared with
 * the runtime Expansion Hub — this script only does file I/O + override merge +
 * the taxonomy validity report. Rules only. No AI, no network, no guessing.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PATHS, rel } from "./paths.mjs";
import { classify, validateFields } from "../src/lib/classify/core.js";

const IN = PATHS.referenceData;
const OUT_OK = PATHS.universe;
const OUT_REVIEW = PATHS.reviewQueue;
const OVERRIDES = PATHS.overrides;
const TAXONOMY = PATHS.taxonomy;

// ── Run ──
if (!existsSync(IN)) {
  console.error(`Input not found: ${rel(IN)} — run \`npm run funds:import\` first.`);
  process.exit(1);
}
const input = JSON.parse(readFileSync(IN, "utf8"));
const funds = Array.isArray(input) ? input : (input.funds ?? []);
// Controlled taxonomy (loaded for a post-classification validity check).
const taxonomy = existsSync(TAXONOMY) ? JSON.parse(readFileSync(TAXONOMY, "utf8")) : null;

// ── Manual overrides ──────────────────────────────────────────────────────────
// If a ticker appears here, its classification is used verbatim instead of the
// rules. Accepts an array of records (each with a `ticker`) OR an object keyed by
// ticker. Fund-specific classifications live only in
// data/config/fund-classification-overrides.json — never hardcoded in this script.
function loadOverrides() {
  const map = new Map();
  if (!existsSync(OVERRIDES)) return map;
  let raw;
  try { raw = JSON.parse(readFileSync(OVERRIDES, "utf8")); } catch (e) {
    console.error(`${rel(OVERRIDES)} is not valid JSON: ${e.message}`); process.exit(1);
  }
  const records = Array.isArray(raw)
    ? raw
    : Object.entries(raw).map(([ticker, v]) => ({ ticker, ...v }));
  for (const rec of records) {
    if (!rec || !rec.ticker) continue;
    map.set(String(rec.ticker).toUpperCase(), rec);
  }
  return map;
}
const overrides = loadOverrides();
const usedOverrides = new Set();

const classified = [];
const review = [];
for (const f of funds) {
  const base = { ticker: f.ticker, fund_name: f.fund_name, issuer: f.issuer ?? null, fund_type: f.fund_type ?? null };
  const ov = overrides.get(String(f.ticker).toUpperCase());
  if (ov) {
    // Override wins over the rules. Keep the FMP identity as the base, overlay
    // the manual classification, and mark its provenance.
    usedOverrides.add(String(f.ticker).toUpperCase());
    classified.push({ ...base, ...ov, ticker: base.ticker, classification_confidence: "manual", verified: ov.verified ?? true, source: ov.source ?? "manual-override" });
    continue;
  }
  const r = classify(f);
  if (r.fields && r.confidence === "high") {
    classified.push({ ...base, ...r.fields, classification_confidence: "high", verified: true, source: "rule-based" });
  } else {
    review.push({ ...base, ...(r.suggestion ?? {}), classification_confidence: "low", verified: false, review_reason: r.reason });
  }
}

// Overrides for tickers not present in the reference data (e.g. funds FMP can't
// find) are still honored — appended so nothing you manually classify is lost.
for (const [ticker, ov] of overrides) {
  if (usedOverrides.has(ticker)) continue;
  classified.push({ ticker, ...ov, classification_confidence: "manual", verified: ov.verified ?? true, source: ov.source ?? "manual-override" });
}

writeFileSync(OUT_OK, JSON.stringify({ generatedAt: new Date().toISOString(), count: classified.length, funds: classified }, null, 2) + "\n");
writeFileSync(OUT_REVIEW, JSON.stringify({ generatedAt: new Date().toISOString(), count: review.length, funds: review }, null, 2) + "\n");

// Light taxonomy validity check on the classified output (funds:validate is the strict gate).
let taxIssues = 0;
if (taxonomy) {
  for (const f of classified) taxIssues += validateFields(f, taxonomy).length;
}

console.log(`Classified ${funds.length} funds${overrides.size ? ` (${overrides.size} manual override${overrides.size > 1 ? "s" : ""})` : ""}:`);
console.log(`  ✓ ${classified.length} verified → ${rel(OUT_OK)}`);
console.log(`  ? ${review.length} need review → ${rel(OUT_REVIEW)}`);
if (taxonomy) console.log(`  taxonomy check: ${taxIssues} invalid value${taxIssues === 1 ? "" : "s"}`);
