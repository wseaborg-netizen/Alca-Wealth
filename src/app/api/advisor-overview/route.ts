import { NextResponse } from "next/server";
import {
  requireFirmContext, profileGet, listsGetAll, fundRequestCounts, dynamicFundCount,
  alertsList, alertCounts, monitoredEntityCounts,
} from "@/lib/db";
import { UNIVERSE } from "@/lib/universe";
import { greetingName } from "@/lib/profile";
import { secUserAgentConfigured } from "@/lib/monitoring";
import { getMarketQuote } from "@/lib/market-data/marketQuote";
import { cacheGet, cacheSet } from "@/lib/cache";

// Real per-fund quote (1D/1W/1M/YTD) via the existing FMP provider, cached 15m
// per ticker so the overview never re-hammers the API. Null when uncovered.
const QUOTE_TTL = 15 * 60;
async function deskQuote(ticker: string): Promise<{ change1d: number; change1w: number; change1m: number; changeYtd: number } | null> {
  const key = `ovq:${ticker}`;
  const cached = await cacheGet<{ change1d: number; change1w: number; change1m: number; changeYtd: number } | "none">(key);
  if (cached) return cached === "none" ? null : cached;
  const q = await getMarketQuote(ticker).catch(() => null);
  const val = q ? { change1d: q.change1d, change1w: q.change1w, change1m: q.change1m, changeYtd: q.changeYtd } : null;
  await cacheSet(key, val ?? "none", QUOTE_TTL);
  return val;
}

/**
 * Advisor Overview aggregation — one call powering the command-center page.
 * All data is REAL (firm-scoped via RLS). Health detail + market pulse are
 * fetched by the page from their dedicated endpoints (/api/health/system,
 * /api/market); this returns a light health hint only. 401 signed out.
 */
export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const [profile, lists, reqCounts, dynCount, alerts, aCounts, meCounts] = await Promise.all([
      profileGet(ctx.sb, ctx.user.id).catch(() => null),
      listsGetAll(ctx.sb, ctx.firm.id, ctx.user.id).catch(() => []),
      fundRequestCounts(ctx.sb, ctx.firm.id).catch(() => null),
      dynamicFundCount(ctx.sb).catch(() => 0),
      alertsList(ctx.sb, ctx.firm.id, { limit: 8 }).catch(() => []),
      alertCounts(ctx.sb, ctx.firm.id).catch(() => ({ unread: 0, total: 0 })),
      monitoredEntityCounts(ctx.sb, ctx.firm.id).catch(() => ({ total: 0, active: 0, unresolvedCik: 0 })),
    ]);

    const firstName = profile?.first_name ?? (ctx.user.user_metadata?.first_name as string | undefined) ?? null;
    const userSummary = {
      greeting: greetingName(firstName, ctx.user.email ?? null),
      displayName: profile?.display_name ?? null,
      email: ctx.user.email ?? null,
      timezone: profile?.timezone ?? null,
      workspace: "Personal Workspace",
    };

    const byType = (t: string) => lists.filter((l) => l.type === t);
    const totalFunds = lists.reduce((s, l) => s + l.items.length, 0);
    const topTickers = Array.from(new Set(lists.flatMap((l) => l.items.map((i) => i.ticker)))).slice(0, 8);
    const savedListSummary = {
      commonCount: byType("common").reduce((s, l) => s + l.items.length, 0),
      watchlistCount: byType("watchlist").reduce((s, l) => s + l.items.length, 0),
      customListCount: byType("custom").length,
      totalFunds, topTickers,
    };

    // Daily Desk tables — REAL saved-list funds enriched with REAL quotes.
    const commonItems = byType("common").flatMap((l) => l.items).slice(0, 8);
    const watchItems = byType("watchlist").flatMap((l) => l.items).slice(0, 8);
    const alertCountBy = new Map<string, number>();
    for (const a of alerts ?? []) if (a.ticker) alertCountBy.set(a.ticker, (alertCountBy.get(a.ticker) ?? 0) + 1);
    const enrich = async (items: typeof commonItems) => Promise.all(items.map(async (it) => ({
      ticker: it.ticker, name: it.fund_name, category: it.category,
      quote: await deskQuote(it.ticker), alertCount: alertCountBy.get(it.ticker) ?? 0,
    })));
    const [coreFunds, watchlistFunds] = await Promise.all([enrich(commonItems), enrich(watchItems)]);

    const expansionSummary = {
      static: UNIVERSE.length, dynamic: dynCount, merged: UNIVERSE.length + dynCount,
      pendingRequests: reqCounts?.pending ?? 0,
      readyForReview: reqCounts?.readyForReview ?? 0,
      needsClassification: reqCounts?.needsClassification ?? 0,
      unsupported: reqCounts?.unsupported ?? 0,
      addedToUniverse: reqCounts?.addedToUniverse ?? 0,
    };

    // Attention queue — real counts only; each item links to a real workflow.
    const attentionItems: { type: string; severity: string; title: string; count: number; href: string }[] = [];
    if (aCounts.unread > 0) attentionItems.push({ type: "sec_alerts", severity: "watch", title: "Unread SEC filing alerts", count: aCounts.unread, href: "#alerts" });
    if ((reqCounts?.needsClassification ?? 0) > 0) attentionItems.push({ type: "needs_classification", severity: "warning", title: "Fund requests need classification review", count: reqCounts!.needsClassification, href: "#expansion" });
    if ((reqCounts?.readyForReview ?? 0) > 0) attentionItems.push({ type: "ready_for_review", severity: "info", title: "Fund requests ready for review", count: reqCounts!.readyForReview, href: "#expansion" });
    if ((reqCounts?.pending ?? 0) > 0) attentionItems.push({ type: "stuck_requests", severity: "warning", title: "Fund requests stuck (provider retry)", count: reqCounts!.pending, href: "#expansion" });
    if (meCounts.unresolvedCik > 0) attentionItems.push({ type: "unresolved_cik", severity: "watch", title: "Monitored funds with no SEC CIK match", count: meCounts.unresolvedCik, href: "#alerts" });

    const recentActivity = alerts.slice(0, 6).map((a) => ({
      kind: "alert", label: a.title, ticker: a.ticker, severity: a.severity, at: a.created_at, href: a.action_href,
    }));

    const healthHint = {
      secConfigured: secUserAgentConfigured(),
      monitored: meCounts.active,
      unresolvedCik: meCounts.unresolvedCik,
      overall: (reqCounts && (reqCounts.pending > 0 || reqCounts.needsClassification > 0)) || meCounts.unresolvedCik > 0 ? "warning" : "healthy",
    };

    const workspaceSummary = {
      research: { label: "Research", href: "#research" },
      portfolio: { label: "Portfolio", href: "#portfolio" },
      model: { label: "Model", href: "#model" },
      expansion: { label: "Expansion", mergedFunds: expansionSummary.merged, pending: expansionSummary.pendingRequests },
      alerts: { label: "Alerts", unread: aCounts.unread, monitored: meCounts.active },
    };

    return NextResponse.json({
      ok: true, userSummary, attentionItems, savedListSummary, recentActivity,
      coreFunds, watchlistFunds,
      expansionSummary, healthSummary: healthHint, marketPulse: null, workspaceSummary,
      alertCounts: aCounts, generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not load overview." }, { status: 500 });
  }
}
