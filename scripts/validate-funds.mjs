#!/usr/bin/env node
/**
 * Validate the generated fund data (`npm run funds:validate`).
 *
 * Checks:
 *   1. JSON structure of every generated file parses.
 *   2. No duplicate tickers in the fund universe.
 *   3. Every fund field uses a controlled taxonomy value.
 *   4. Every fund is verified === true.
 *   5. Review queue is empty.
 *   6. Import failures is empty.
 *
 * Exits non-zero if any check fails.
 */
import { readFileSync, existsSync } from "node:fs";
import { PATHS, rel } from "./paths.mjs";

let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); failed++; };

function loadJson(p) {
  if (!existsSync(p)) { bad(`missing file: ${rel(p)}`); return null; }
  try { return JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { bad(`invalid JSON in ${rel(p)}: ${e.message}`); return null; }
}

console.log("Validating fund data…\n");

// 1. Structure
const universe = loadJson(PATHS.universe);
const review = loadJson(PATHS.reviewQueue);
const failures = loadJson(PATHS.importFailures);
const taxonomy = loadJson(PATHS.taxonomy);
if (universe && review && failures && taxonomy) ok("all generated + config JSON parses");

const funds = universe?.funds ?? [];

// 2. Duplicate tickers
if (universe) {
  const seen = new Set(), dupes = new Set();
  for (const f of funds) { const t = String(f.ticker).toUpperCase(); if (seen.has(t)) dupes.add(t); seen.add(t); }
  dupes.size ? bad(`duplicate tickers: ${[...dupes].join(", ")}`) : ok(`no duplicate tickers (${funds.length} unique)`);
}

// 3. Controlled taxonomy values
if (universe && taxonomy) {
  const enums = ["fund_type", "asset_class", "primary_category", "region", "management_style", "portfolio_role", "investment_focus", "benchmark_category"];
  const nullable = ["market_cap", "style", "style_box"];
  const badVals = [];
  for (const f of funds) {
    for (const k of enums) if (!(taxonomy[k] ?? []).includes(f[k])) badVals.push(`${f.ticker}.${k}=${JSON.stringify(f[k])}`);
    for (const k of nullable) if (f[k] != null && !(taxonomy[k] ?? []).includes(f[k])) badVals.push(`${f.ticker}.${k}=${JSON.stringify(f[k])}`);
  }
  badVals.length ? bad(`${badVals.length} invalid taxonomy values (e.g. ${badVals.slice(0, 5).join(", ")})`) : ok("all fund fields use controlled taxonomy values");
}

// 4. Every fund verified
if (universe) {
  const unverified = funds.filter((f) => f.verified !== true);
  unverified.length ? bad(`${unverified.length} funds not verified`) : ok(`all ${funds.length} funds verified === true`);
}

// 5. Review queue empty
if (review) {
  const n = review.count ?? (review.funds?.length ?? 0);
  n === 0 ? ok("review queue is empty") : bad(`${n} funds in review queue (${rel(PATHS.reviewQueue)})`);
}

// 6. Import failures empty
if (failures) {
  const n = failures.count ?? (failures.tickers?.length ?? 0);
  n === 0 ? ok("no import failures") : bad(`${n} import failures (${rel(PATHS.importFailures)})`);
}

console.log(`\n${failed === 0 ? "PASS — fund data is valid." : `FAIL — ${failed} check(s) failed.`}`);
process.exit(failed === 0 ? 0 : 1);
