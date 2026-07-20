/**
 * Typed database access for saved work — SERVER-SIDE ONLY.
 *
 * Every helper uses the cookie-session Supabase client, so Postgres RLS is
 * the authorization boundary: a user can only touch rows in firms where they
 * hold a membership. Nothing here uses the service-role key.
 *
 * PII policy: names/labels stored through this layer must be anonymous,
 * de-identified labels — never real client names or account identifiers.
 */
import { createServerClient } from "./supabase";

export interface Firm { id: string; name: string }
export interface FirmMember { firm_id: string; user_id: string; role: "owner" | "admin" | "member" }
export interface SavedComparisonRow {
  id: string; firm_id: string; name: string; tickers: string[]; updated_at: string;
}
export interface SavedPortfolioRow {
  id: string; firm_id: string; name: string; payload: Record<string, unknown>; updated_at: string;
}
export interface SavedModelScenarioRow {
  id: string; firm_id: string; name: string; tool: string; subject: string;
  assumptions: Record<string, unknown>; extra: Record<string, unknown> | null;
  version: number; updated_at: string;
}

type Supa = Awaited<ReturnType<typeof createServerClient>>;

/** Current user, or null. */
export async function getSessionUser(supabase?: Supa) {
  const sb = supabase ?? await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

/** The user's default firm (first membership; owner membership is created at
    signup). Returns null when logged out or not provisioned. */
export async function getDefaultFirm(sb: Supa): Promise<Firm | null> {
  const { data } = await sb
    .from("firm_members")
    .select("firm_id, firms(id, name)")
    .order("created_at", { ascending: true })
    .limit(1);
  const row = data?.[0] as { firms?: Firm | Firm[] } | undefined;
  const firm = Array.isArray(row?.firms) ? row?.firms[0] : row?.firms;
  return firm ?? null;
}

/** Auth + firm context for API routes; null when not a full session. */
export async function requireFirmContext() {
  const sb = await createServerClient();
  const user = await getSessionUser(sb);
  if (!user) return null;
  const firm = await getDefaultFirm(sb);
  if (!firm) return null;
  return { sb, user, firm };
}

// ── Fund lists (Commonly Used / Watchlist defaults + custom lists) ──────────

export interface FundListRow {
  id: string; name: string; type: "common" | "watchlist" | "custom"; updated_at: string;
  items: FundListItemRow[];
}
export interface FundListItemRow {
  ticker: string; fund_name: string | null; category: string | null;
  note: string | null; added_at: string;
}

/** Get-or-create the two default lists; returns all lists with items. */
export async function listsGetAll(sb: Supa, firmId: string, userId: string): Promise<FundListRow[]> {
  for (const [name, type] of [["Watchlist", "watchlist"], ["Commonly Used Funds", "common"]] as const) {
    const { data } = await sb.from("watchlists").select("id").eq("firm_id", firmId).eq("type", type).limit(1);
    if (!data?.length) await sb.from("watchlists").insert({ firm_id: firmId, created_by: userId, name, type });
  }
  const { data: lists, error } = await sb.from("watchlists")
    .select("id, name, type, updated_at, watchlist_items(ticker, fund_name, category, note, added_at)")
    .eq("firm_id", firmId).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (lists ?? []).map((l) => ({
    id: l.id as string, name: l.name as string, type: (l.type ?? "custom") as FundListRow["type"],
    updated_at: l.updated_at as string,
    items: ((l.watchlist_items ?? []) as FundListItemRow[])
      .sort((a, b) => (b.added_at ?? "").localeCompare(a.added_at ?? "")),
  }));
}

export async function listCreate(sb: Supa, firmId: string, userId: string, name: string): Promise<string> {
  const { data, error } = await sb.from("watchlists")
    .insert({ firm_id: firmId, created_by: userId, name: name.trim().slice(0, 80), type: "custom" })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function listRename(sb: Supa, firmId: string, listId: string, name: string) {
  const { error } = await sb.from("watchlists").update({ name: name.trim().slice(0, 80) })
    .eq("firm_id", firmId).eq("id", listId).eq("type", "custom"); // defaults keep their names
  if (error) throw new Error(error.message);
}

export async function listDelete(sb: Supa, firmId: string, listId: string) {
  // Custom lists only — default lists are permanent. Items cascade.
  const { error } = await sb.from("watchlists").delete()
    .eq("firm_id", firmId).eq("id", listId).eq("type", "custom");
  if (error) throw new Error(error.message);
}

export async function listItemAdd(sb: Supa, firmId: string, userId: string, listId: string,
  item: { ticker: string; fundName?: string | null; category?: string | null; note?: string | null }) {
  // RLS guarantees the list belongs to the user's firm; upsert dedupes.
  const { error } = await sb.from("watchlist_items").upsert({
    watchlist_id: listId, ticker: item.ticker.toUpperCase(), added_by: userId,
    fund_name: item.fundName ?? null, category: item.category ?? null, note: item.note ?? null,
  }, { onConflict: "watchlist_id,ticker" });
  if (error) throw new Error(error.message);
}

export async function listItemRemove(sb: Supa, listId: string, ticker: string) {
  const { error } = await sb.from("watchlist_items").delete()
    .eq("watchlist_id", listId).eq("ticker", ticker.toUpperCase());
  if (error) throw new Error(error.message);
}

export async function listItemNote(sb: Supa, listId: string, ticker: string, note: string | null) {
  const { error } = await sb.from("watchlist_items").update({ note: note?.slice(0, 500) ?? null })
    .eq("watchlist_id", listId).eq("ticker", ticker.toUpperCase());
  if (error) throw new Error(error.message);
}

// ── Fund requests (Add Missing Fund) ────────────────────────────────────────
// Firm-scoped, RLS-enforced. Records an advisor's request for a ticker not in
// the verified universe + the outcome of the automated checks. Never mutates
// the universe.

export interface FundRequestRow {
  id: string; ticker: string; normalized_ticker: string; status: string;
  fund_name: string | null; fmp_supported: boolean; already_in_universe: boolean;
  classification_status: string | null; failure_reason: string | null;
  admin_note: string | null; requested_at: string; updated_at: string;
}

const FUND_REQUEST_COLS =
  "id, ticker, normalized_ticker, status, fund_name, fmp_supported, already_in_universe, " +
  "classification_status, failure_reason, admin_note, requested_at, updated_at";

/** All fund requests visible to the caller's firm (newest first). */
export async function fundRequestsList(sb: Supa, firmId: string): Promise<FundRequestRow[]> {
  const { data, error } = await sb.from("fund_requests")
    .select(FUND_REQUEST_COLS).eq("firm_id", firmId)
    .order("requested_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FundRequestRow[];
}

/** One request by normalized ticker (firm-scoped), or null. */
export async function fundRequestByTicker(sb: Supa, firmId: string, normalized: string): Promise<FundRequestRow | null> {
  const { data, error } = await sb.from("fund_requests")
    .select(FUND_REQUEST_COLS).eq("firm_id", firmId).eq("normalized_ticker", normalized.toUpperCase())
    .order("requested_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as unknown as FundRequestRow) ?? null;
}

/** Existing ACTIVE (open) request for this ticker, if any — used to dedupe. */
export async function fundRequestActive(sb: Supa, firmId: string, normalized: string,
  activeStatuses: string[]): Promise<FundRequestRow | null> {
  const { data, error } = await sb.from("fund_requests")
    .select(FUND_REQUEST_COLS).eq("firm_id", firmId).eq("normalized_ticker", normalized.toUpperCase())
    .in("status", activeStatuses).limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as unknown as FundRequestRow) ?? null;
}

export async function fundRequestCreate(sb: Supa, firmId: string, userId: string, r: {
  ticker: string; normalizedTicker: string; status: string; fundName: string | null;
  fmpSupported: boolean; alreadyInUniverse: boolean; classificationStatus: string | null;
  failureReason: string | null;
}): Promise<FundRequestRow> {
  const { data, error } = await sb.from("fund_requests").insert({
    firm_id: firmId, created_by: userId,
    ticker: r.ticker, normalized_ticker: r.normalizedTicker.toUpperCase(), status: r.status,
    fund_name: r.fundName, fmp_supported: r.fmpSupported, already_in_universe: r.alreadyInUniverse,
    classification_status: r.classificationStatus, failure_reason: r.failureReason,
  }).select(FUND_REQUEST_COLS).single();
  if (error) throw new Error(error.message);
  return data as unknown as FundRequestRow;
}

/** Status counts for the firm — used by System Health (informational). */
export async function fundRequestCounts(sb: Supa, firmId: string): Promise<{
  total: number; pending: number; readyForReview: number; unsupported: number;
  needsClassification: number; addedToUniverse: number; failedValidation: number; classificationFailed: number;
}> {
  const { data, error } = await sb.from("fund_requests").select("status").eq("firm_id", firmId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { status: string }[];
  const n = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length, pending: n("pending"), readyForReview: n("ready_for_review"),
    unsupported: n("unsupported"), needsClassification: n("needs_classification"),
    addedToUniverse: n("added_to_universe"), failedValidation: n("failed_validation"),
    classificationFailed: n("classification_failed"),
  };
}

// ── User profile (minimal signup profile) ──────────────────────────────────
// One row per user in `profiles` (id = auth.users.id). RLS: own row only.

export interface ProfileRow {
  id: string; email: string | null; first_name: string | null; last_name: string | null;
  display_name: string | null; timezone: string | null; onboarding_completed: boolean;
}

const PROFILE_COLS = "id, email, first_name, last_name, display_name, timezone, onboarding_completed";

/** The caller's own profile, or null if none exists yet. */
export async function profileGet(sb: Supa, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await sb.from("profiles").select(PROFILE_COLS).eq("id", userId).limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as unknown as ProfileRow) ?? null;
}

/** Update the caller's own profile (name / display name / timezone / onboarding).
    RLS guarantees id = auth.uid(); undefined fields are left untouched. */
export async function profileUpsert(sb: Supa, userId: string, email: string | null, p: {
  firstName?: string | null; lastName?: string | null; displayName?: string | null;
  timezone?: string | null; onboardingCompleted?: boolean;
}): Promise<ProfileRow> {
  const patch: Record<string, unknown> = { id: userId, email };
  if (p.firstName !== undefined) patch.first_name = p.firstName?.slice(0, 80) ?? null;
  if (p.lastName !== undefined) patch.last_name = p.lastName?.slice(0, 80) ?? null;
  if (p.displayName !== undefined) patch.display_name = p.displayName?.slice(0, 120) ?? null;
  if (p.timezone !== undefined) patch.timezone = p.timezone ?? null;
  if (p.onboardingCompleted !== undefined) patch.onboarding_completed = p.onboardingCompleted;
  const { data, error } = await sb.from("profiles").upsert(patch, { onConflict: "id" }).select(PROFILE_COLS).single();
  if (error) throw new Error(error.message);
  return data as unknown as ProfileRow;
}

// ── Monitoring + alerts (Advisor Hub) ───────────────────────────────────────

export interface MonitoredEntityRow {
  id: string; ticker: string; normalized_ticker: string; entity_name: string | null;
  entity_type: string; cik: string | null; cik_source: string; active: boolean;
  source_type: string; source_id: string | null; last_checked_at: string | null;
  last_success_at: string | null; last_error: string | null;
}
const ME_COLS = "id, ticker, normalized_ticker, entity_name, entity_type, cik, cik_source, active, source_type, source_id, last_checked_at, last_success_at, last_error";

export async function monitoredEntitiesList(sb: Supa, firmId: string): Promise<MonitoredEntityRow[]> {
  const { data, error } = await sb.from("monitored_entities").select(ME_COLS).eq("firm_id", firmId).order("normalized_ticker");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MonitoredEntityRow[];
}

/** Upsert a monitored entity by (firm, ticker) — no duplicate active rows. */
export async function monitoredEntityUpsert(sb: Supa, firmId: string, userId: string, e: {
  ticker: string; entityName?: string | null; entityType?: string; cik?: string | null;
  cikSource?: string; sourceType?: string; sourceId?: string | null;
}): Promise<MonitoredEntityRow> {
  const t = e.ticker.toUpperCase();
  const row: Record<string, unknown> = {
    firm_id: firmId, created_by: userId, ticker: t, normalized_ticker: t, active: true,
    source_type: e.sourceType ?? "saved_list", source_id: e.sourceId ?? null,
  };
  if (e.entityName !== undefined) row.entity_name = e.entityName;
  if (e.entityType !== undefined) row.entity_type = e.entityType;
  if (e.cik !== undefined) row.cik = e.cik;
  if (e.cikSource !== undefined) row.cik_source = e.cikSource;
  const { data, error } = await sb.from("monitored_entities").upsert(row, { onConflict: "firm_id,normalized_ticker" }).select(ME_COLS).single();
  if (error) throw new Error(error.message);
  return data as unknown as MonitoredEntityRow;
}

export async function monitoredEntitySetStatus(sb: Supa, firmId: string, id: string, s: {
  cik?: string | null; cikSource?: string; entityName?: string | null; lastCheckedAt?: string;
  lastSuccessAt?: string | null; lastError?: string | null;
}): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (s.cik !== undefined) patch.cik = s.cik;
  if (s.cikSource !== undefined) patch.cik_source = s.cikSource;
  if (s.entityName !== undefined) patch.entity_name = s.entityName;
  if (s.lastCheckedAt !== undefined) patch.last_checked_at = s.lastCheckedAt;
  if (s.lastSuccessAt !== undefined) patch.last_success_at = s.lastSuccessAt;
  if (s.lastError !== undefined) patch.last_error = s.lastError;
  const { error } = await sb.from("monitored_entities").update(patch).eq("firm_id", firmId).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function monitoredEntityCounts(sb: Supa, firmId: string): Promise<{ total: number; active: number; unresolvedCik: number }> {
  const { data, error } = await sb.from("monitored_entities").select("active, cik").eq("firm_id", firmId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { active: boolean; cik: string | null }[];
  return {
    total: rows.length,
    active: rows.filter((r) => r.active).length,
    unresolvedCik: rows.filter((r) => r.active && !r.cik).length,
  };
}

export interface SecFilingRow { id: string; cik: string; accession_number: string; form_type: string | null; filing_date: string | null; ticker: string | null; entity_name: string | null; filing_url: string | null }

/** Insert a filing if new; returns { row, isNew }. Dedup by (cik, accession). */
export async function secFilingUpsert(sb: Supa, f: {
  cik: string; ticker: string | null; entityName: string | null; accessionNumber: string;
  formType: string | null; filingDate: string | null; primaryDocument: string | null;
  filingUrl: string | null; secIndexUrl: string | null; rawMetadata?: Record<string, unknown> | null;
}): Promise<{ row: SecFilingRow; isNew: boolean }> {
  const existing = await sb.from("sec_filings").select("id, cik, accession_number, form_type, filing_date, ticker, entity_name, filing_url")
    .eq("cik", f.cik).eq("accession_number", f.accessionNumber).limit(1);
  if (existing.data?.[0]) return { row: existing.data[0] as unknown as SecFilingRow, isNew: false };
  const { data, error } = await sb.from("sec_filings").insert({
    cik: f.cik, ticker: f.ticker, entity_name: f.entityName, accession_number: f.accessionNumber,
    form_type: f.formType, filing_date: f.filingDate || null, primary_document: f.primaryDocument,
    filing_url: f.filingUrl, sec_index_url: f.secIndexUrl, raw_metadata: f.rawMetadata ?? null,
  }).select("id, cik, accession_number, form_type, filing_date, ticker, entity_name, filing_url").single();
  if (error) throw new Error(error.message);
  return { row: data as unknown as SecFilingRow, isNew: true };
}

export interface AdvisorAlertRow {
  id: string; alert_type: string; severity: string; status: string; source: string;
  ticker: string | null; fund_name: string | null; cik: string | null; title: string;
  summary: string | null; reason: string | null; action_label: string | null; action_href: string | null;
  related_filing_id: string | null; created_at: string; read_at: string | null;
}
const ALERT_COLS = "id, alert_type, severity, status, source, ticker, fund_name, cik, title, summary, reason, action_label, action_href, related_filing_id, created_at, read_at";

export async function alertsList(sb: Supa, firmId: string, opts?: { includeArchived?: boolean; limit?: number }): Promise<AdvisorAlertRow[]> {
  let q = sb.from("advisor_alerts").select(ALERT_COLS).eq("firm_id", firmId);
  if (!opts?.includeArchived) q = q.neq("status", "archived");
  const { data, error } = await q.order("created_at", { ascending: false }).limit(opts?.limit ?? 100);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AdvisorAlertRow[];
}

/** Insert an alert unless one with the same dedupe_key already exists for the
    firm. Returns the row when newly created, or null when a duplicate. */
export async function alertInsertDedup(sb: Supa, firmId: string, userId: string, a: {
  alertType: string; severity: string; source: string; ticker?: string | null; fundName?: string | null;
  cik?: string | null; title: string; summary?: string | null; reason?: string | null;
  actionLabel?: string | null; actionHref?: string | null; relatedFilingId?: string | null;
  relatedListId?: string | null; dedupeKey?: string | null; metadata?: Record<string, unknown> | null;
}): Promise<AdvisorAlertRow | null> {
  if (a.dedupeKey) {
    const dup = await sb.from("advisor_alerts").select("id").eq("firm_id", firmId).eq("dedupe_key", a.dedupeKey).limit(1);
    if (dup.data?.[0]) return null;
  }
  const { data, error } = await sb.from("advisor_alerts").insert({
    firm_id: firmId, created_by: userId, alert_type: a.alertType, severity: a.severity, source: a.source,
    ticker: a.ticker ?? null, fund_name: a.fundName ?? null, cik: a.cik ?? null, title: a.title,
    summary: a.summary ?? null, reason: a.reason ?? null, action_label: a.actionLabel ?? null,
    action_href: a.actionHref ?? null, related_filing_id: a.relatedFilingId ?? null,
    related_list_id: a.relatedListId ?? null, dedupe_key: a.dedupeKey ?? null, metadata: a.metadata ?? null,
  }).select(ALERT_COLS).single();
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return null; // race → treat as dedup
    throw new Error(error.message);
  }
  return data as unknown as AdvisorAlertRow;
}

export async function alertSetStatus(sb: Supa, firmId: string, id: string, status: "read" | "archived" | "unread"): Promise<boolean> {
  const patch: Record<string, unknown> = { status };
  if (status === "read") patch.read_at = new Date().toISOString();
  const { data, error } = await sb.from("advisor_alerts").update(patch).eq("firm_id", firmId).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return !!data?.length;
}

export async function alertCounts(sb: Supa, firmId: string): Promise<{ unread: number; total: number }> {
  const { data, error } = await sb.from("advisor_alerts").select("status").eq("firm_id", firmId).neq("status", "archived");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { status: string }[];
  return { unread: rows.filter((r) => r.status === "unread").length, total: rows.length };
}

// ── Dynamic universe funds (Expansion Hub) ──────────────────────────────────
// Verified rows are the shared runtime universe overlay; merged with the static
// universe server-side (src/lib/universeServer.ts). RLS lets any authenticated
// user read verified rows.

export interface DynamicFundRow {
  id: string; ticker: string; normalized_ticker: string; fund_name: string; vehicle: string | null;
  asset_class: string | null; primary_category: string | null; category: string | null;
  benchmark: string | null; benchmark_category: string | null; management_style: string | null;
  portfolio_role: string | null; investment_focus: string | null; region: string | null;
  market_cap: string | null; style: string | null; style_box: string | null;
  classification_source: string | null; verified: boolean; created_at: string; updated_at: string;
}

const DYNAMIC_FUND_COLS =
  "id, ticker, normalized_ticker, fund_name, vehicle, asset_class, primary_category, category, " +
  "benchmark, benchmark_category, management_style, portfolio_role, investment_focus, region, " +
  "market_cap, style, style_box, classification_source, verified, created_at, updated_at";

/** All verified dynamic funds (the runtime overlay). RLS allows any signed-in read. */
export async function dynamicFundsListVerified(sb: Supa): Promise<DynamicFundRow[]> {
  const { data, error } = await sb.from("dynamic_funds")
    .select(DYNAMIC_FUND_COLS).eq("verified", true).order("created_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DynamicFundRow[];
}

export async function dynamicFundByTicker(sb: Supa, normalized: string): Promise<DynamicFundRow | null> {
  const { data, error } = await sb.from("dynamic_funds")
    .select(DYNAMIC_FUND_COLS).eq("normalized_ticker", normalized.toUpperCase()).limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as unknown as DynamicFundRow) ?? null;
}

/** Verified dynamic-fund count (for the merged universe count / health). */
export async function dynamicFundCount(sb: Supa): Promise<number> {
  const { count, error } = await sb.from("dynamic_funds")
    .select("id", { count: "exact", head: true }).eq("verified", true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function dynamicFundInsert(sb: Supa, firmId: string, userId: string, f: {
  ticker: string; fundName: string; vehicle: string | null;
  assetClass: string | null; primaryCategory: string | null; category: string | null;
  benchmark: string | null; benchmarkCategory: string | null; managementStyle: string | null;
  portfolioRole: string | null; investmentFocus: string | null; region: string | null;
  marketCap: string | null; style: string | null; styleBox: string | null;
  classificationSource: string | null; sourceRequestId: string | null;
  fmpPayloadSummary: Record<string, unknown> | null;
}): Promise<DynamicFundRow> {
  const { data, error } = await sb.from("dynamic_funds").insert({
    firm_id: firmId, created_by: userId, source_request_id: f.sourceRequestId,
    ticker: f.ticker.toUpperCase(), normalized_ticker: f.ticker.toUpperCase(), fund_name: f.fundName,
    vehicle: f.vehicle, asset_class: f.assetClass, primary_category: f.primaryCategory, category: f.category,
    benchmark: f.benchmark, benchmark_category: f.benchmarkCategory, management_style: f.managementStyle,
    portfolio_role: f.portfolioRole, investment_focus: f.investmentFocus, region: f.region,
    market_cap: f.marketCap, style: f.style, style_box: f.styleBox,
    classification_source: f.classificationSource, fmp_payload_summary: f.fmpPayloadSummary, verified: true,
  }).select(DYNAMIC_FUND_COLS).single();
  if (error) throw new Error(error.message);
  return data as unknown as DynamicFundRow;
}

// ── Legacy single-watchlist API (WatchlistTab) — now the default Watchlist ───

async function defaultWatchlistId(sb: Supa, firmId: string): Promise<string | null> {
  const { data } = await sb.from("watchlists").select("id").eq("firm_id", firmId).eq("type", "watchlist").limit(1);
  if (data?.[0]?.id) return data[0].id as string;
  const { data: created } = await sb.from("watchlists")
    .insert({ firm_id: firmId, name: "Watchlist", type: "watchlist" }).select("id").single();
  return (created?.id as string) ?? null;
}

export async function watchlistGet(sb: Supa, firmId: string): Promise<string[]> {
  const wl = await defaultWatchlistId(sb, firmId);
  if (!wl) return [];
  const { data } = await sb.from("watchlist_items")
    .select("ticker, added_at").eq("watchlist_id", wl)
    .order("added_at", { ascending: false });
  return (data ?? []).map((r) => r.ticker as string);
}

export async function watchlistAdd(sb: Supa, firmId: string, userId: string, ticker: string) {
  const wl = await defaultWatchlistId(sb, firmId);
  if (!wl) throw new Error("no watchlist");
  const { error } = await sb.from("watchlist_items")
    .upsert({ watchlist_id: wl, ticker: ticker.toUpperCase(), added_by: userId },
      { onConflict: "watchlist_id,ticker" });
  if (error) throw new Error(error.message);
}

export async function watchlistRemove(sb: Supa, firmId: string, ticker: string) {
  const wl = await defaultWatchlistId(sb, firmId);
  if (!wl) return;
  const { error } = await sb.from("watchlist_items")
    .delete().eq("watchlist_id", wl).eq("ticker", ticker.toUpperCase());
  if (error) throw new Error(error.message);
}

// ── Saved model scenarios ────────────────────────────────────────────────────

export async function scenariosList(sb: Supa, firmId: string): Promise<SavedModelScenarioRow[]> {
  const { data, error } = await sb.from("saved_model_scenarios")
    .select("id, firm_id, name, tool, subject, assumptions, extra, version, updated_at")
    .eq("firm_id", firmId).order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedModelScenarioRow[];
}

export async function scenarioUpsert(sb: Supa, firmId: string, userId: string,
  s: { id?: string; name: string; tool: string; subject: string; assumptions: Record<string, unknown>; extra?: Record<string, unknown> | null; version?: number }) {
  const row = { firm_id: firmId, created_by: userId, name: s.name, tool: s.tool,
    subject: s.subject, assumptions: s.assumptions, extra: s.extra ?? null, version: s.version ?? 2,
    ...(s.id ? { id: s.id } : {}) };
  const { data, error } = await sb.from("saved_model_scenarios").upsert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data?.id as string;
}

export async function scenarioDelete(sb: Supa, firmId: string, id: string) {
  const { error } = await sb.from("saved_model_scenarios").delete().eq("firm_id", firmId).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Saved portfolios (anonymous labels only) ─────────────────────────────────

export async function portfoliosList(sb: Supa, firmId: string): Promise<SavedPortfolioRow[]> {
  const { data, error } = await sb.from("saved_portfolios")
    .select("id, firm_id, name, payload, updated_at")
    .eq("firm_id", firmId).order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedPortfolioRow[];
}

export async function portfolioUpsert(sb: Supa, firmId: string, userId: string,
  p: { id?: string; name: string; payload: Record<string, unknown> }) {
  const row = { firm_id: firmId, created_by: userId, name: p.name, payload: p.payload,
    ...(p.id ? { id: p.id } : {}) };
  const { data, error } = await sb.from("saved_portfolios").upsert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data?.id as string;
}

export async function portfolioDelete(sb: Supa, firmId: string, id: string) {
  const { error } = await sb.from("saved_portfolios").delete().eq("firm_id", firmId).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Saved comparisons ────────────────────────────────────────────────────────

export async function comparisonsList(sb: Supa, firmId: string): Promise<SavedComparisonRow[]> {
  const { data, error } = await sb.from("saved_comparisons")
    .select("id, firm_id, name, tickers, updated_at")
    .eq("firm_id", firmId).order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedComparisonRow[];
}

export async function comparisonUpsert(sb: Supa, firmId: string, userId: string,
  c: { id?: string; name: string; tickers: string[] }) {
  const row = { firm_id: firmId, created_by: userId, name: c.name,
    tickers: c.tickers.map((t) => t.toUpperCase()), ...(c.id ? { id: c.id } : {}) };
  const { data, error } = await sb.from("saved_comparisons").upsert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data?.id as string;
}

export async function comparisonDelete(sb: Supa, firmId: string, id: string) {
  const { error } = await sb.from("saved_comparisons").delete().eq("firm_id", firmId).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── User preferences ─────────────────────────────────────────────────────────

export async function prefsGet(sb: Supa, userId: string): Promise<Record<string, unknown>> {
  const { data } = await sb.from("user_preferences").select("prefs").eq("user_id", userId).limit(1);
  return (data?.[0]?.prefs as Record<string, unknown>) ?? {};
}

export async function prefsSet(sb: Supa, userId: string, prefs: Record<string, unknown>) {
  const { error } = await sb.from("user_preferences")
    .upsert({ user_id: userId, prefs, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
