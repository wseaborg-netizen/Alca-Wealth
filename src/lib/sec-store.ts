/**
 * SEC durable storage — Supabase (service-role, server only). Every function
 * degrades gracefully: if the tables or credentials are unavailable the layer
 * reports itself unavailable and the cache-first flow continues without
 * persistence. Browser clients can never touch these tables (RLS with no
 * anon/authenticated policies — see supabase/migrations/…_sec_tables.sql).
 */
import { getSupabaseAdmin } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SecFiling, SecIdentifiers, SecErrorCategory } from "./sec";

// The generated client types don't include the SEC tables; use an untyped
// handle and cast row fields explicitly at each read site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, "public", any>;

let _available: boolean | undefined;
function admin(): Admin | null {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) { _available = false; return null; }
    return getSupabaseAdmin() as unknown as Admin;
  } catch { _available = false; return null; }
}

export async function persistenceAvailable(): Promise<boolean> {
  if (_available !== undefined) return _available;
  const db = admin();
  if (!db) return (_available = false);
  try {
    const { error } = await db.from("sec_sync_status").select("key").limit(1);
    _available = !error;
  } catch { _available = false; }
  return _available;
}

// ── Mappings ──────────────────────────────────────────────────────────────────
export async function saveMapping(ids: SecIdentifiers): Promise<void> {
  const db = admin(); if (!db || !(await persistenceAvailable())) return;
  try {
    await db.from("sec_fund_mappings").upsert({
      ticker: ids.ticker, cik: ids.cik, series_id: ids.seriesId, class_id: ids.classId,
      registrant_name: ids.registrantName, retrieved_at: new Date().toISOString(),
    }, { onConflict: "ticker" });
  } catch { /* non-fatal */ }
}

export async function getMapping(ticker: string): Promise<SecIdentifiers | null> {
  const db = admin(); if (!db || !(await persistenceAvailable())) return null;
  try {
    const { data } = await db.from("sec_fund_mappings").select("*").eq("ticker", ticker).maybeSingle();
    if (!data) return null;
    return {
      ticker: data.ticker as string, cik: data.cik as string,
      registrantName: (data.registrant_name as string) ?? null,
      seriesId: (data.series_id as string) ?? null, seriesName: null,
      classId: (data.class_id as string) ?? null, className: null,
    };
  } catch { return null; }
}

// ── Filings (deduped; first_seen preserved, last_seen refreshed) ──────────────
export async function saveFilings(ticker: string, filings: SecFiling[]): Promise<void> {
  const db = admin(); if (!db || !(await persistenceAvailable()) || !filings.length) return;
  const now = new Date().toISOString();
  try {
    // insert new rows only (unique on ticker+accession → first_seen set once)
    await db.from("sec_fund_filings").upsert(
      filings.map((f) => ({
        ticker, accession_number: f.accessionNumber, form: f.form,
        filing_date: f.filingDate || null, primary_document: f.primaryDocument,
        url: f.url, description: f.description, scope: f.scope, scope_id: f.scopeId,
        retrieved_at: now, last_seen: now,
      })),
      { onConflict: "ticker,accession_number", ignoreDuplicates: true },
    );
    // refresh last_seen (and scope, which can upgrade once feeds respond) for existing rows
    for (const f of filings) {
      await db.from("sec_fund_filings")
        .update({ last_seen: now, retrieved_at: now, scope: f.scope, scope_id: f.scopeId })
        .eq("ticker", ticker).eq("accession_number", f.accessionNumber);
    }
  } catch { /* non-fatal */ }
}

export async function getFilings(ticker: string, limit = 12): Promise<SecFiling[] | null> {
  const db = admin(); if (!db || !(await persistenceAvailable())) return null;
  try {
    const { data } = await db.from("sec_fund_filings").select("*")
      .eq("ticker", ticker).order("filing_date", { ascending: false }).limit(limit);
    if (!data?.length) return null;
    return data.map((r) => ({
      form: r.form as string, filingDate: (r.filing_date as string) ?? "",
      accessionNumber: r.accession_number as string,
      primaryDocument: (r.primary_document as string) ?? null,
      url: r.url as string, description: (r.description as string) ?? null,
      scope: r.scope as SecFiling["scope"], scopeId: (r.scope_id as string) ?? null,
    }));
  } catch { return null; }
}

// ── Sync status (doubles as the tracked-fund registry) ───────────────────────
export interface SyncStatus {
  key: string;
  lastAttempted: number | null;
  lastSuccessful: number | null;
  lastErrorCategory: string | null;
  failureCount: number;
  freshness: "fresh" | "stale" | "failed" | "unknown";
}

export async function getSyncStatus(key: string): Promise<SyncStatus | null> {
  const db = admin(); if (!db || !(await persistenceAvailable())) return null;
  try {
    const { data } = await db.from("sec_sync_status").select("*").eq("key", key).maybeSingle();
    if (!data) return null;
    return {
      key, lastAttempted: data.last_attempted ? Date.parse(data.last_attempted as string) : null,
      lastSuccessful: data.last_successful ? Date.parse(data.last_successful as string) : null,
      lastErrorCategory: (data.last_error_category as string) ?? null,
      failureCount: (data.failure_count as number) ?? 0,
      freshness: (data.freshness as SyncStatus["freshness"]) ?? "unknown",
    };
  } catch { return null; }
}

export async function recordSync(key: string, ok: boolean, errorCategory?: SecErrorCategory): Promise<void> {
  const db = admin(); if (!db || !(await persistenceAvailable())) return;
  const now = new Date().toISOString();
  try {
    const prev = await getSyncStatus(key);
    await db.from("sec_sync_status").upsert({
      key, last_attempted: now,
      last_successful: ok ? now : (prev?.lastSuccessful ? new Date(prev.lastSuccessful).toISOString() : null),
      last_error_category: ok ? null : (errorCategory ?? "network"),
      failure_count: ok ? 0 : (prev?.failureCount ?? 0) + 1,
      freshness: ok ? "fresh" : (prev?.lastSuccessful ? "stale" : "failed"),
    }, { onConflict: "key" });
  } catch { /* non-fatal */ }
}

/** Tickers the scheduler should keep fresh: everything that has been requested
    through the SEC route plus anything on saved watchlists. */
export async function listTrackedTickers(max = 50): Promise<string[]> {
  const db = admin(); if (!db || !(await persistenceAvailable())) return [];
  const out = new Set<string>();
  try {
    const { data: synced } = await db.from("sec_sync_status").select("key")
      .neq("key", "ticker-map").order("last_attempted", { ascending: false }).limit(max);
    for (const r of synced ?? []) out.add(r.key as string);
  } catch { /* ignore */ }
  try {
    const { data: watched } = await db.from("watchlists").select("ticker").limit(max);
    for (const r of watched ?? []) out.add(String(r.ticker).toUpperCase());
  } catch { /* watchlists table may not exist in some envs */ }
  return [...out].slice(0, max);
}

export async function countRecentFailures(): Promise<number> {
  const db = admin(); if (!db || !(await persistenceAvailable())) return 0;
  try {
    const { count } = await db.from("sec_sync_status").select("key", { count: "exact", head: true })
      .gt("failure_count", 0);
    return count ?? 0;
  } catch { return 0; }
}
