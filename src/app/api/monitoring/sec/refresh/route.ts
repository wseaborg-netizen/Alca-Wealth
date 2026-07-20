import { NextResponse } from "next/server";
import { requireFirmContext } from "@/lib/db";
import { refreshSecMonitoring, secUserAgentConfigured } from "@/lib/monitoring";

/**
 * On-demand SEC monitoring refresh for the signed-in firm.
 * Server-side only; never runs on page load. Uses saved-list tickers, resolves
 * CIKs, fetches recent SEC filings, stores new ones, and creates deduped alerts.
 * Fails safely (503) when SEC_USER_AGENT is not configured — never calls SEC
 * anonymously.
 */
export async function POST() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  if (!secUserAgentConfigured()) {
    return NextResponse.json({ error: "SEC monitoring is not configured on the server (SEC_USER_AGENT missing)." }, { status: 503 });
  }

  try {
    const summary = await refreshSecMonitoring(ctx.sb, ctx.firm.id, ctx.user.id);
    return NextResponse.json(summary, { status: summary.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "SEC refresh failed." }, { status: 500 });
  }
}
