/**
 * SEC subsystem health snapshot — safe fields only (no e-mail, no credentials,
 * no lock keys, no raw error bodies). Server-side only.
 */
import { getSyncStatus, listTrackedTickers, countRecentFailures, persistenceAvailable } from "./sec-store";

export interface SecHealth {
  contactConfigured: boolean;          // boolean only — the value never leaves the server
  sharedRateLimiting: boolean;         // Upstash Redis available?
  persistence: boolean;                // Supabase SEC tables reachable?
  scheduledJobsConfigured: boolean;    // CRON_SECRET present (vercel.json carries the schedules)
  tickerMapLastSuccess: number | null;
  trackedFunds: number;
  recentSyncFailures: number;
  runtimeAiDependency: false;          // deterministic code path only — no AI at runtime
  at: number;
}

export async function getSecHealth(): Promise<SecHealth> {
  const [mapSync, tracked, failures, persistence] = await Promise.all([
    getSyncStatus("ticker-map"),
    listTrackedTickers(200),
    countRecentFailures(),
    persistenceAvailable(),
  ]);
  return {
    contactConfigured: !!(process.env.SEC_USER_AGENT || process.env.SEC_CONTACT_EMAIL),
    sharedRateLimiting: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    persistence,
    scheduledJobsConfigured: !!process.env.CRON_SECRET,
    tickerMapLastSuccess: mapSync?.lastSuccessful ?? null,
    trackedFunds: tracked.length,
    recentSyncFailures: failures,
    runtimeAiDependency: false,
    at: Date.now(),
  };
}
