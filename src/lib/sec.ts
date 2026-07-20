/**
 * SEC / EDGAR client — official SEC sources only. SERVER-SIDE ONLY.
 *
 * Identity & secrecy: the User-Agent comes from SEC_USER_AGENT (the full
 * string, e.g. "Alca Wealth will@alcawealth.com"), or is derived from
 * SEC_CONTACT_EMAIL ("ALCA Wealth <email>") as a fallback. It comes exclusively
 * from the server environment; it is never hardcoded, logged, returned by an
 * API route, or shipped to the browser. If neither is set, development throws a
 * clear configuration error and production fails each request safely (no SEC
 * traffic without a compliant UA).
 *
 * Official endpoints used (no third parties, no scraping of fund sites):
 *   1. https://www.sec.gov/files/company_tickers_mf.json
 *   2. https://data.sec.gov/submissions/CIK##########.json
 *   3. https://www.sec.gov/cgi-bin/browse-edgar?…CIK=<S|C id>&output=atom
 *      (EDGAR's own per-series/class feed — used only to CONFIRM scope)
 *
 * Fair access: a DISTRIBUTED rate limiter (Upstash Redis, shared across all
 * serverless instances) caps total ALCA traffic at ≤4 SEC requests/second,
 * with an in-memory serialized fallback for local development. Requests use
 * strict timeouts, limited retries with exponential backoff + jitter,
 * Retry-After support, content-type validation, a response-size cap, and a
 * same-domain redirect check. Failures are logged as safe categories only.
 */
import { cacheGet, cacheSet } from "./cache";

const TICKER_MAP_TTL = 24 * 60 * 60;
const SUBMISSIONS_TTL = 6 * 60 * 60;
const SCOPE_FEED_TTL = 6 * 60 * 60;
const MAX_BODY_BYTES = 20 * 1024 * 1024; // company_tickers_mf.json is ~10MB

export const FUND_FORMS = [
  "485BPOS", "485APOS", "N-1A", "497", "497K", "N-CSR", "N-CSRS", "N-PORT", "N-PORT-P", "N-CEN", "N-PX",
] as const;

// ── Identity ──────────────────────────────────────────────────────────────────
let warnedMissingContact = false;
function userAgent(): string | null {
  // SEC EDGAR fair-access policy requires an identifiable UA with a contact.
  // Prefer the full SEC_USER_AGENT string; fall back to deriving it from
  // SEC_CONTACT_EMAIL ("ALCA Wealth <email>") for backward compatibility.
  const ua = process.env.SEC_USER_AGENT?.trim();
  if (ua) return ua;
  const email = process.env.SEC_CONTACT_EMAIL;
  if (!email) {
    if (process.env.NODE_ENV === "development") {
      throw new Error("[sec] SEC_USER_AGENT is not configured — set it in .env.local before making SEC requests.");
    }
    if (!warnedMissingContact) { console.warn("[sec] SEC_USER_AGENT / SEC_CONTACT_EMAIL missing — SEC requests disabled."); warnedMissingContact = true; }
    return null;
  }
  return `ALCA Wealth ${email}`;
}

// ── Shared Redis handle (reuses the cache layer's provider — no new vendor) ──
type RedisLike = {
  incr: (k: string) => Promise<number>;
  expire: (k: string, s: number) => Promise<unknown>;
  set: (k: string, v: string, opts?: { nx?: boolean; ex?: number }) => Promise<unknown>;
  del: (k: string) => Promise<unknown>;
};
let _redis: RedisLike | null | undefined;
function redis(): RedisLike | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { _redis = null; return null; }
  try {
    const { Redis } = require("@upstash/redis") as typeof import("@upstash/redis");
    _redis = new Redis({ url, token }) as unknown as RedisLike;
  } catch { _redis = null; }
  return _redis;
}

// ── Distributed rate limiting: ≤4 SEC requests/second GLOBALLY ────────────────
const SEC_RPS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acquireGlobalSlot(): Promise<void> {
  const r = redis();
  if (!r) return; // local dev falls back to the serialized in-memory queue below
  for (let attempt = 0; attempt < 20; attempt++) {
    const win = Math.floor(Date.now() / 1000);
    try {
      const n = await r.incr(`sec:rl:${win}`);
      if (n === 1) await r.expire(`sec:rl:${win}`, 3);
      if (n <= SEC_RPS) return;
    } catch { return; } // Redis hiccup: fall back to local pacing rather than block
    await sleep(120 + Math.random() * 130); // wait into the next window (jitter)
  }
}

/** Distributed lock (SET NX EX). Returns false if another instance holds it. */
export async function acquireLock(key: string, ttlSec: number): Promise<boolean> {
  const r = redis();
  if (!r) { // local fallback: in-memory lock
    if (MEM_LOCKS.has(key) && MEM_LOCKS.get(key)! > Date.now()) return false;
    MEM_LOCKS.set(key, Date.now() + ttlSec * 1000);
    return true;
  }
  try { return (await r.set(key, "1", { nx: true, ex: ttlSec })) === "OK"; }
  catch { return true; } // if Redis is down, proceed (SEC limiter still paces us)
}
export async function releaseLock(key: string): Promise<void> {
  const r = redis();
  if (!r) { MEM_LOCKS.delete(key); return; }
  try { await r.del(key); } catch { /* expires via TTL */ }
}
const MEM_LOCKS = new Map<string, number>();

/** Fixed-window API rate limit (shared via Redis; per-instance fallback). */
const MEM_HITS = new Map<string, { n: number; win: number }>();
export async function apiRateLimitOk(bucket: string, limit = 30, windowSec = 60): Promise<boolean> {
  const win = Math.floor(Date.now() / (windowSec * 1000));
  const key = `sec:api:${bucket}:${win}`;
  const r = redis();
  if (r) {
    try {
      const n = await r.incr(key);
      if (n === 1) await r.expire(key, windowSec + 5);
      return n <= limit;
    } catch { return true; }
  }
  const e = MEM_HITS.get(bucket);
  if (!e || e.win !== win) { MEM_HITS.set(bucket, { n: 1, win }); return true; }
  e.n++;
  return e.n <= limit;
}

// local serialized pacing (dev fallback + belt-and-braces in prod)
let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;
const MIN_GAP_MS = 260; // ≈3.8/s per instance

// ── Error taxonomy (pure, unit-tested) ────────────────────────────────────────
export type SecErrorCategory = "forbidden" | "not_found" | "rate_limited" | "server_error"
  | "timeout" | "network" | "malformed" | "bad_request" | "misconfigured";

export function categorizeStatus(status: number): SecErrorCategory {
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "bad_request";
}
/** Only transient categories are retried. */
export function isRetryable(cat: SecErrorCategory): boolean {
  return cat === "rate_limited" || cat === "server_error" || cat === "timeout" || cat === "network";
}
/** Parse a Retry-After header (seconds form), capped for serverless budgets. */
export function retryAfterMs(header: string | null, capMs = 5000): number | null {
  if (!header) return null;
  const s = Number(header);
  if (!Number.isFinite(s) || s < 0) return null;
  return Math.min(s * 1000, capMs);
}

export interface SecFetchResult { text: string | null; error?: SecErrorCategory }

/** Throttled, UA-tagged, retrying fetch of an official SEC URL. */
async function secFetch(url: string, accept = "application/json"): Promise<SecFetchResult> {
  const ua = userAgent();
  if (!ua) return { text: null, error: "misconfigured" };
  const host = new URL(url).hostname;
  if (!host.endsWith(".sec.gov") && host !== "sec.gov") return { text: null, error: "bad_request" };

  const run = queue.then(async (): Promise<SecFetchResult> => {
    let lastErr: SecErrorCategory = "network";
    for (let attempt = 0; attempt <= 2; attempt++) {
      const gap = lastAt + MIN_GAP_MS - Date.now();
      if (gap > 0) await sleep(gap);
      await acquireGlobalSlot();
      lastAt = Date.now();
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": ua, "Accept": accept, "Accept-Encoding": "gzip, deflate" },
          signal: AbortSignal.timeout(12_000),
          redirect: "follow",
        });
        // never follow SEC off-domain
        const finalHost = new URL(res.url || url).hostname;
        if (!finalHost.endsWith(".sec.gov") && finalHost !== "sec.gov") return { text: null, error: "bad_request" };

        if (!res.ok) {
          const cat = categorizeStatus(res.status);
          console.warn(`[sec] ${res.status} (${cat}) for ${new URL(url).pathname}`);
          if (!isRetryable(cat) || attempt === 2) return { text: null, error: cat };
          const ra = retryAfterMs(res.headers.get("retry-after"));
          await sleep(ra ?? (500 * 2 ** attempt + Math.random() * 300));
          lastErr = cat;
          continue;
        }
        const ct = res.headers.get("content-type") ?? "";
        if (accept.includes("json") && !ct.includes("json")) {
          console.warn(`[sec] unexpected content-type for ${new URL(url).pathname}`);
          return { text: null, error: "malformed" };
        }
        const len = Number(res.headers.get("content-length") || 0);
        if (len > MAX_BODY_BYTES) return { text: null, error: "malformed" };
        const text = await res.text();
        if (text.length > MAX_BODY_BYTES) return { text: null, error: "malformed" };
        return { text };
      } catch (e) {
        const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        lastErr = timeout ? "timeout" : "network";
        console.warn(`[sec] ${lastErr} for ${new URL(url).pathname} (attempt ${attempt + 1})`);
        if (attempt < 2) await sleep(500 * 2 ** attempt + Math.random() * 300);
      }
    }
    return { text: null, error: lastErr };
  });
  queue = run.catch(() => undefined);
  return run;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────
export function padCik(cik: number | string): string {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}

export function isValidTicker(raw: string): boolean {
  return /^[A-Z0-9.]{1,10}$/.test(raw.trim().toUpperCase());
}

/** Canonical sec.gov archive URL — inputs are digit/word-sanitized, so callers
    can never steer this to another domain or path. */
export function filingUrl(cik: number | string, accession: string, primaryDoc?: string | null): string {
  const cikNum = String(Number(String(cik).replace(/\D/g, "")) || 0);
  const acc = accession.replace(/[^0-9-]/g, "");
  const accNoDashes = acc.replace(/-/g, "");
  if (primaryDoc && /^[\w.\-/]+$/.test(primaryDoc)) {
    return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDashes}/${primaryDoc}`;
  }
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDashes}`;
}

export function parseAtomAccessions(xml: string): Set<string> {
  const out = new Set<string>();
  for (const m of xml.matchAll(/accession-n(?:o|umber)>([\d-]+)</g)) out.add(m[1]);
  for (const m of xml.matchAll(/(\d{10}-\d{2}-\d{6})/g)) out.add(m[1]);
  return out;
}

export type FilingScope = "exact_class" | "exact_series" | "registrant" | "unconfirmed";

/** Scope decision for one filing (pure, unit-tested). */
export function computeScope(
  accession: string,
  classAcc: Set<string> | null,
  seriesAcc: Set<string> | null,
): FilingScope {
  if (classAcc?.has(accession)) return "exact_class";
  if (seriesAcc?.has(accession)) return "exact_series";
  if (classAcc || seriesAcc) return "registrant";
  return "unconfirmed";
}

/** Data freshness bucket (pure, unit-tested). */
export function computeFreshness(lastSuccessMs: number | null, now = Date.now(), freshForMs = 6 * 60 * 60 * 1000): "fresh" | "stale" | "unknown" {
  if (lastSuccessMs == null) return "unknown";
  return now - lastSuccessMs < freshForMs ? "fresh" : "stale";
}

// ── Ticker resolution ─────────────────────────────────────────────────────────
export interface SecIdentifiers {
  ticker: string;
  cik: string;
  registrantName: string | null;
  seriesId: string | null;
  seriesName: string | null;
  classId: string | null;
  className: string | null;
}

interface MfRow { cik: number; seriesId: string; classId: string; symbol: string }

export async function loadTickerMap(force = false): Promise<Map<string, MfRow> | null> {
  const KEY = "sec:mf-ticker-map";
  if (!force) {
    const cached = await cacheGet<Record<string, MfRow>>(KEY);
    if (cached) return new Map(Object.entries(cached));
  }
  const { text } = await secFetch("https://www.sec.gov/files/company_tickers_mf.json");
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { fields: string[]; data: (string | number)[][] };
    const idx = (f: string) => parsed.fields.indexOf(f);
    const iCik = idx("cik"), iSeries = idx("seriesId"), iClass = idx("classId"), iSym = idx("symbol");
    const map: Record<string, MfRow> = {};
    for (const row of parsed.data) {
      const sym = String(row[iSym] ?? "").toUpperCase();
      if (!sym) continue;
      map[sym] = { cik: Number(row[iCik]), seriesId: String(row[iSeries] ?? ""), classId: String(row[iClass] ?? ""), symbol: sym };
    }
    await cacheSet(KEY, map, TICKER_MAP_TTL);
    return new Map(Object.entries(map));
  } catch {
    console.warn("[sec] ticker map parse failed");
    return null;
  }
}

/** Exact-match resolution only — no fuzzy matching, no guessed identifiers. */
export async function resolveTicker(ticker: string): Promise<SecIdentifiers | "not_found" | null> {
  const t = ticker.trim().toUpperCase();
  if (!isValidTicker(t)) return "not_found";
  const map = await loadTickerMap();
  if (!map) return null;
  const row = map.get(t);
  if (!row) return "not_found";
  return {
    ticker: t, cik: padCik(row.cik), registrantName: null,
    seriesId: row.seriesId || null, seriesName: null,
    classId: row.classId || null, className: null,
  };
}

// ── Filings ───────────────────────────────────────────────────────────────────
export interface SecFiling {
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string | null;
  url: string;
  description: string | null;
  scope: FilingScope;
  scopeId: string | null;
}

interface SubmissionsJson {
  name?: string;
  filings?: { recent?: {
    form?: string[]; filingDate?: string[]; accessionNumber?: string[];
    primaryDocument?: string[]; primaryDocDescription?: string[];
  } };
}

async function loadSubmissions(cik10: string): Promise<SubmissionsJson | null> {
  const KEY = `sec:submissions:${cik10}`;
  const cached = await cacheGet<SubmissionsJson>(KEY);
  if (cached) return cached;
  const { text } = await secFetch(`https://data.sec.gov/submissions/CIK${cik10}.json`);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as SubmissionsJson;
    await cacheSet(KEY, parsed, SUBMISSIONS_TTL);
    return parsed;
  } catch { return null; }
}

async function loadScopeAccessions(id: string): Promise<Set<string> | null> {
  if (!/^[SC]\d{9,10}$/.test(id)) return null; // only official series/class ids
  const KEY = `sec:scope:${id}`;
  const cached = await cacheGet<string[]>(KEY);
  if (cached) return new Set(cached);
  const { text } = await secFetch(
    `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${id}&type=&dateb=&owner=include&count=40&output=atom`,
    "application/atom+xml",
  );
  if (!text) return null;
  const set = parseAtomAccessions(text);
  await cacheSet(KEY, [...set], SCOPE_FEED_TTL);
  return set;
}

export interface SecFundResult {
  status: "resolved" | "not_found" | "sec_unavailable";
  identifiers?: SecIdentifiers;
  filings: SecFiling[];
  warning?: string;
}

/** LIVE fetch: resolve a ticker and return scoped recent fund filings.
    Callers should prefer the cache/DB-first flow in sec-service.ts. */
export async function getFundFilings(ticker: string, limit = 12): Promise<SecFundResult> {
  const ids = await resolveTicker(ticker);
  if (ids === "not_found") return { status: "not_found", filings: [] };
  if (ids === null) return { status: "sec_unavailable", filings: [], warning: "SEC EDGAR is unreachable right now." };

  const subs = await loadSubmissions(ids.cik);
  if (subs?.name) ids.registrantName = subs.name;

  const [classAcc, seriesAcc] = await Promise.all([
    ids.classId ? loadScopeAccessions(ids.classId) : Promise.resolve(null),
    ids.seriesId ? loadScopeAccessions(ids.seriesId) : Promise.resolve(null),
  ]);

  const filings: SecFiling[] = [];
  let warning: string | undefined;
  const recent = subs?.filings?.recent;
  if (!recent?.form) {
    warning = "Registrant filing index unavailable from SEC.";
  } else {
    const wanted = new Set<string>(FUND_FORMS);
    for (let i = 0; i < recent.form.length && filings.length < limit; i++) {
      const form = recent.form[i] ?? "";
      if (!wanted.has(form)) continue;
      const acc = recent.accessionNumber?.[i] ?? "";
      const doc = recent.primaryDocument?.[i] || null;
      const scope = computeScope(acc, classAcc, seriesAcc);
      filings.push({
        form, filingDate: recent.filingDate?.[i] ?? "", accessionNumber: acc,
        primaryDocument: doc, url: filingUrl(ids.cik, acc, doc),
        description: recent.primaryDocDescription?.[i] || null,
        scope,
        scopeId: scope === "exact_class" ? ids.classId : scope === "exact_series" ? ids.seriesId : scope === "registrant" ? ids.cik : null,
      });
    }
    if ((!classAcc && ids.classId) || (!seriesAcc && ids.seriesId)) {
      warning = "Series/class scope feeds were unavailable — some filings are labeled unconfirmed.";
    } else if (!ids.seriesId && !ids.classId) {
      warning = "SEC mapping has no series/class ids for this ticker — filings are registrant-level.";
    }
  }
  return { status: "resolved", identifiers: ids, filings, warning };
}
