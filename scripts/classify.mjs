#!/usr/bin/env node
/**
 * Fund Classification Database — ingest + validate tool.
 *
 *   node scripts/classify.mjs --validate          Check the whole store against the taxonomy.
 *   node scripts/classify.mjs --add batch.json     Merge a verified batch (array of records), then validate.
 *   node scripts/classify.mjs --list [--verified]  Print the current store (optionally only verified).
 *
 * The taxonomy (data/taxonomy.json) is the single source of allowed values.
 * A record is only written if it passes validation — no off-taxonomy or
 * free-form values can enter the database. Numeric/performance fields are
 * rejected on purpose: this database is identity/classification only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAX_PATH = join(ROOT, "data", "taxonomy.json");
const DB_PATH = join(ROOT, "data", "classifications.json");

const TAX = JSON.parse(readFileSync(TAX_PATH, "utf8"));
const REQUIRED_ENUM = ["fund_type", "asset_class", "primary_category", "region", "management_style", "portfolio_role", "investment_focus", "benchmark_category"];
const NULLABLE_ENUM = ["market_cap", "style", "style_box"];
const IDENTITY = ["ticker", "fund_name", "issuer"];
const BANNED_NUMERIC = ["expense_ratio", "sharpe", "alpha", "beta", "volatility", "returns", "yield", "aum", "risk_level"];
// notes = optional free text (the only non-controlled field).
const ALLOWED_FIELDS = new Set([...IDENTITY, ...REQUIRED_ENUM, ...NULLABLE_ENUM, "verified", "source", "notes"]);

function validate(f) {
  const errs = [];
  for (const k of IDENTITY) if (!f[k] || !String(f[k]).trim()) errs.push(`missing ${k}`);
  for (const k of REQUIRED_ENUM) {
    if (f[k] == null || !TAX[k].includes(String(f[k]))) errs.push(`${k}: "${f[k] ?? "null"}" not an allowed value`);
  }
  for (const k of NULLABLE_ENUM) {
    if (f[k] != null && !TAX[k].includes(String(f[k]))) errs.push(`${k}: "${f[k]}" not an allowed value (or null)`);
    if (f.asset_class === "Equity" && f[k] == null) errs.push(`${k}: required for Equity funds`);
  }
  if (typeof f.verified !== "boolean") errs.push("verified must be true/false");
  if (!f.source || !String(f.source).trim()) errs.push("missing source");
  // Reject any numeric/performance field — those belong to the data providers, not here.
  for (const k of Object.keys(f)) {
    if (BANNED_NUMERIC.includes(k)) errs.push(`field "${k}" is a performance metric and does not belong in this database`);
    else if (!ALLOWED_FIELDS.has(k)) errs.push(`unknown field "${k}" (not in schema)`);
  }
  return errs;
}

function loadDb() { return JSON.parse(readFileSync(DB_PATH, "utf8")); }
function saveDb(db) { db.updatedAt = new Date().toISOString(); writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + "\n"); }

const args = process.argv.slice(2);
const db = loadDb();

if (args[0] === "--add") {
  const batch = JSON.parse(readFileSync(args[1], "utf8"));
  const records = Array.isArray(batch) ? batch : [batch];
  let added = 0, updated = 0; const rejected = [];
  for (const rec of records) {
    const errs = validate(rec);
    if (errs.length) { rejected.push({ ticker: rec.ticker ?? "?", errs }); continue; }
    const t = String(rec.ticker).toUpperCase();
    if (db.funds[t]) updated++; else added++;
    db.funds[t] = { ...rec, ticker: t };
  }
  if (rejected.length) {
    console.log(`REJECTED ${rejected.length} record(s) — nothing written for these:`);
    for (const r of rejected) console.log(`  ${r.ticker}: ${r.errs.join("; ")}`);
    console.log("\nFix the batch and re-run. No partial/invalid data enters the DB.");
    process.exit(1);
  }
  saveDb(db);
  console.log(`Stored: +${added} new, ${updated} updated. Total: ${Object.keys(db.funds).length}.`);
}

// Always end with a full-store validation report.
const all = Object.values(db.funds);
const bad = all.map((f) => ({ t: f.ticker, e: validate(f) })).filter((x) => x.e.length);
const verified = all.filter((f) => f.verified).length;

if (args[0] === "--list") {
  const only = args.includes("--verified");
  for (const f of all) {
    if (only && !f.verified) continue;
    console.log(`  ${f.ticker.padEnd(7)} ${f.verified ? "✓" : "·"} ${f.benchmark_category.padEnd(22)} ${f.fund_name}`);
  }
}
console.log(`\nStore: ${all.length} funds (${verified} verified). Taxonomy violations: ${bad.length}.`);
for (const b of bad) console.log(`  ✗ ${b.t}: ${b.e.join("; ")}`);
process.exit(bad.length ? 1 : 0);
