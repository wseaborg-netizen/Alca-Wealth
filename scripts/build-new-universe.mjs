#!/usr/bin/env node
/**
 * Build a NEW fund universe from a plain ticker list, using FMP only.
 *
 * This script is intentionally standalone:
 *   - It does NOT read, merge with, or modify the old data/universe.json.
 *   - It does NOT classify anything (no category/style/benchmark) — identity only.
 *   - It only pulls basic facts FMP returns for each ticker.
 *
 * Input : data/tickers.txt — one ticker per line. (Override: node ... <path>.)
 * Output: data/new_universe.json          (successful lookups)
 *         data/new_universe_failed.json    (failed / unsupported tickers)
 *
 * API key is read from the environment (FMP_API_KEY), then .env.local — never
 * hardcoded.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_OK = join(ROOT, "data", "new_universe.json");
const OUT_FAIL = join(ROOT, "data", "new_universe_failed.json");
const STABLE = "https://financialmodelingprep.com/stable";

// ── API key (env → .env.local), never hardcoded ───────────────────────────────
function fmpKey() {
  if (process.env.FMP_API_KEY) return process.env.FMP_API_KEY;
  const envFile = join(ROOT, ".env.local");
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, "utf8").match(/^FMP_API_KEY=(.*)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("FMP_API_KEY not set (checked process.env and .env.local)");
}

// ── Locate the ticker list ────────────────────────────────────────────────────
function tickersPath() {
  const override = process.argv[2];
  const candidates = [
    override && join(ROOT, override),
    join(ROOT, "data", "tickers.txt"),
    join(ROOT, "tickers.txt"),
  ].filter(Boolean);
  for (const p of candidates) if (existsSync(p)) return p;
  throw new Error(`No ticker file found (looked for: ${candidates.join(", ")})`);
}

function readTickers(path) {
  const raw = readFileSync(path, "utf8");
  const seen = new Set();
  const out = [];
  for (const line of raw.split(/[\r\n,]+/)) {          // one per line, or comma-separated
    const t = line.trim().toUpperCase();
    if (!t || t.startsWith("#")) continue;              // skip blanks / comments
    if (seen.has(t)) continue;                          // dedupe
    seen.add(t);
    out.push(t);
  }
  return out;
}

// Best-effort provider from the fund name (FMP has no dedicated issuer field).
const ISSUERS = [
  "Vanguard", "Fidelity", "iShares", "SPDR", "Schwab", "Invesco", "American Funds",
  "American Beacon", "American Century", "T. Rowe Price", "JPMorgan", "BlackRock",
  "PIMCO", "Franklin", "Dimensional", "First Trust", "ProShares", "Direxion",
  "VanEck", "WisdomTree", "Global X", "Janus Henderson", "Columbia", "Nuveen",
  "MFS", "John Hancock", "Putnam", "Lord Abbett", "Goldman Sachs", "Morgan Stanley",
  "Hartford", "Principal", "Northern", "TIAA", "Voya", "AllianceBernstein",
  "Federated", "Eaton Vance", "Neuberger Berman", "Delaware", "Capital Group",
  "Artisan", "Ariel", "Ave Maria", "Dodge & Cox", "Baird", "Calamos",
];
function issuerFrom(name) {
  const n = (name || "").toLowerCase();
  return ISSUERS.find((f) => n.startsWith(f.toLowerCase())) ?? null;
}

async function throttle(ms) { await new Promise((r) => setTimeout(r, ms)); }

async function lookup(ticker, key) {
  const url = `${STABLE}/profile?symbol=${encodeURIComponent(ticker)}&apikey=${key}`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    return { ok: false, reason: `network error: ${e instanceof Error ? e.message : "unknown"}` };
  }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
  let json;
  try { json = await res.json(); } catch { return { ok: false, reason: "invalid JSON" }; }
  if (json && !Array.isArray(json) && json["Error Message"]) return { ok: false, reason: String(json["Error Message"]) };
  const p = Array.isArray(json) ? json[0] : null;
  if (!p || !p.companyName) return { ok: false, reason: "not found / unsupported by FMP" };
  return {
    ok: true,
    record: {
      ticker,
      fund_name: p.companyName,
      issuer: issuerFrom(p.companyName),
      fund_type: p.isEtf ? "ETF" : p.isFund ? "Mutual Fund" : "Unknown",
    },
  };
}

async function main() {
  const key = fmpKey();
  const path = tickersPath();
  const tickers = readTickers(path);
  console.log(`Reading ${tickers.length} tickers from: ${path.replace(ROOT + "/", "")}`);

  const ok = [];
  const failed = [];
  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    const r = await lookup(t, key);
    if (r.ok) { ok.push(r.record); process.stdout.write("."); }
    else { failed.push({ ticker: t, reason: r.reason }); process.stdout.write("x"); }
    if ((i + 1) % 50 === 0) process.stdout.write(` ${i + 1}\n`);
    await throttle(250); // ~4 req/s — safe under the FMP Starter 300/min limit
  }
  process.stdout.write("\n");

  writeFileSync(OUT_OK, JSON.stringify({ generatedAt: new Date().toISOString(), count: ok.length, funds: ok }, null, 2) + "\n");
  writeFileSync(OUT_FAIL, JSON.stringify({ generatedAt: new Date().toISOString(), count: failed.length, tickers: failed }, null, 2) + "\n");

  console.log(`\nDone.`);
  console.log(`  ✓ ${ok.length} written → data/new_universe.json`);
  console.log(`  ✗ ${failed.length} written → data/new_universe_failed.json`);
  if (failed.length) console.log(`    failed: ${failed.slice(0, 12).map((f) => f.ticker).join(", ")}${failed.length > 12 ? " …" : ""}`);
}

main().catch((e) => { console.error("build-new-universe failed:", e.message); process.exit(1); });
