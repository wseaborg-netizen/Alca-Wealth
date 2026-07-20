/**
 * SEC monitoring orchestration — SERVER ONLY.
 *
 * Reuses the mature SEC layer (src/lib/sec.ts: resolveTicker + getFundFilings,
 * with built-in caching + rate limiting + SEC_USER_AGENT). Flow:
 *   saved lists → monitored_entities → resolve CIK → fetch recent filings →
 *   store new sec_filings → create ONE advisor_alert per new filing (deduped).
 *
 * Never called on page load. Never calls SEC from the browser. Never fabricates
 * an alert — an alert exists only when SEC actually returned that filing.
 */
import type { createServerClient } from "./supabase";
import {
  listsGetAll, monitoredEntityUpsert, monitoredEntitiesList, monitoredEntitySetStatus,
  secFilingUpsert, alertInsertDedup,
} from "./db";
import { getFundFilings } from "./sec";
import { formSummary, filingAlertTitle, formSeverity, secDedupeKey, entityTypeForForm } from "./alerts";

type Supa = Awaited<ReturnType<typeof createServerClient>>;

const MAX_TICKERS_PER_REFRESH = 25;   // keep each refresh polite + bounded
const FILINGS_PER_TICKER = 8;

/** True when a SEC User-Agent is configured (required by SEC fair-access). */
export function secUserAgentConfigured(): boolean {
  return !!(process.env.SEC_USER_AGENT?.trim() || process.env.SEC_CONTACT_EMAIL?.trim());
}

export interface RefreshSummary {
  ok: boolean;
  reason?: string;
  monitored: number;
  checked: number;
  newFilings: number;
  newAlerts: number;
  unresolved: number;
  errors: number;
}

function secIndexUrl(cik: string, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/`;
}

/** Sync saved-list tickers into monitored_entities (no duplicate active rows). */
export async function syncMonitoredFromSavedLists(sb: Supa, firmId: string, userId: string): Promise<number> {
  const lists = await listsGetAll(sb, firmId, userId);
  const seen = new Set<string>();
  for (const l of lists) {
    for (const it of l.items) {
      const t = it.ticker.toUpperCase();
      if (seen.has(t)) continue;
      seen.add(t);
      await monitoredEntityUpsert(sb, firmId, userId, {
        ticker: t, entityName: it.fund_name ?? null, sourceType: "saved_list", sourceId: l.id,
      });
    }
  }
  return seen.size;
}

/** Full refresh: sync saved lists, resolve CIKs, fetch filings, create alerts. */
export async function refreshSecMonitoring(sb: Supa, firmId: string, userId: string): Promise<RefreshSummary> {
  const summary: RefreshSummary = { ok: true, monitored: 0, checked: 0, newFilings: 0, newAlerts: 0, unresolved: 0, errors: 0 };

  if (!secUserAgentConfigured()) {
    return { ...summary, ok: false, reason: "SEC_USER_AGENT is not configured — SEC monitoring is disabled." };
  }

  await syncMonitoredFromSavedLists(sb, firmId, userId).catch(() => 0);
  const entities = (await monitoredEntitiesList(sb, firmId)).filter((e) => e.active);
  summary.monitored = entities.length;

  const now = new Date().toISOString();
  for (const e of entities.slice(0, MAX_TICKERS_PER_REFRESH)) {
    summary.checked++;
    try {
      const res = await getFundFilings(e.normalized_ticker, FILINGS_PER_TICKER);
      if (res.status === "not_found") {
        summary.unresolved++;
        await monitoredEntitySetStatus(sb, firmId, e.id, { cikSource: "unavailable", lastCheckedAt: now, lastError: "No SEC CIK mapping for this ticker." });
        continue;
      }
      if (res.status === "sec_unavailable") {
        summary.errors++;
        await monitoredEntitySetStatus(sb, firmId, e.id, { lastCheckedAt: now, lastError: res.warning ?? "SEC unavailable." });
        continue;
      }
      const cik = res.identifiers!.cik;
      const entityName = res.identifiers!.registrantName ?? e.entity_name ?? null;
      await monitoredEntitySetStatus(sb, firmId, e.id, {
        cik, cikSource: "sec_mapping", entityName, lastCheckedAt: now, lastSuccessAt: now, lastError: null,
      });

      for (const f of res.filings) {
        const { row, isNew } = await secFilingUpsert(sb, {
          cik, ticker: e.normalized_ticker, entityName, accessionNumber: f.accessionNumber,
          formType: f.form, filingDate: f.filingDate, primaryDocument: f.primaryDocument,
          filingUrl: f.url, secIndexUrl: secIndexUrl(cik, f.accessionNumber),
          rawMetadata: { scope: f.scope, description: f.description },
        });
        if (!isNew) continue;                 // filing already stored — no duplicate alert
        summary.newFilings++;
        const alert = await alertInsertDedup(sb, firmId, userId, {
          alertType: "sec_filing", severity: formSeverity(f.form), source: "sec_edgar",
          ticker: e.normalized_ticker, fundName: entityName, cik,
          title: filingAlertTitle(e.normalized_ticker, f.form),
          summary: formSummary(f.form), reason: `${f.form} filed ${f.filingDate} (via SEC EDGAR).`,
          actionLabel: "View on SEC.gov", actionHref: f.url,
          relatedFilingId: row.id, dedupeKey: secDedupeKey(cik, f.accessionNumber),
          metadata: { form: f.form, filingDate: f.filingDate },
        });
        if (alert) summary.newAlerts++;
      }
    } catch {
      summary.errors++;
      await monitoredEntitySetStatus(sb, firmId, e.id, { lastCheckedAt: now, lastError: "Refresh error." }).catch(() => {});
    }
  }
  return summary;
}
