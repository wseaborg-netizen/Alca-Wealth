import { NextRequest, NextResponse } from "next/server";
import { requireFirmContext, fundRequestsList, fundRequestActive, fundRequestCreate } from "@/lib/db";
import { evaluateFundRequest, ACTIVE_STATUSES } from "@/lib/fundRequests";
import { findFund } from "@/lib/universe";
import { fetchFundSupport } from "@/lib/fmp";

/**
 * Add Missing Fund — request intake.
 *
 * GET  → the caller's firm fund requests (RLS-scoped).
 * POST → normalize a ticker, check the universe + FMP, dedupe active requests,
 *        and record the request. NEVER mutates the verified universe.
 *
 * Requires an authenticated session (saved workflows are auth-gated). No FMP
 * key or raw provider payload is ever returned.
 */
export async function GET() {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ requests: null }, { status: 401 });
  try {
    return NextResponse.json({ requests: await fundRequestsList(ctx.sb, ctx.firm.id) });
  } catch {
    return NextResponse.json({ error: "Could not load fund requests." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireFirmContext();
  if (!ctx) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await req.json().catch(() => null) as { ticker?: unknown } | null;

  const outcome = await evaluateFundRequest(body?.ticker, {
    lookupUniverse: (t) => findFund(t),
    checkFmp: (t) => fetchFundSupport(t),
  });
  if (!outcome.ok) return NextResponse.json({ error: outcome.reason }, { status: 400 });
  const r = outcome.result;

  // Already verified in the universe → return metadata, store nothing.
  if (r.status === "already_available") {
    return NextResponse.json({ status: r.status, alreadyInUniverse: true, fund: r.existingFund });
  }

  try {
    // Dedupe: an open request for this ticker already exists → return it.
    const existing = await fundRequestActive(ctx.sb, ctx.firm.id, r.normalized, ACTIVE_STATUSES);
    if (existing) {
      return NextResponse.json({ status: existing.status, duplicate: true, request: existing });
    }

    const request = await fundRequestCreate(ctx.sb, ctx.firm.id, ctx.user.id, {
      ticker: r.normalized, normalizedTicker: r.normalized, status: r.status,
      fundName: r.fundName, fmpSupported: r.fmpSupported, alreadyInUniverse: r.alreadyInUniverse,
      classificationStatus: r.classificationStatus, failureReason: r.failureReason,
    });
    return NextResponse.json({ status: r.status, request }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not save the fund request." }, { status: 500 });
  }
}
