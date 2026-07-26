import { NextRequest, NextResponse } from "next/server";
import {
  requireFirmContext, fundRequestsList, fundRequestActive, fundRequestCreate, dynamicFundInsert,
} from "@/lib/db";
import { evaluateFundRequest, ACTIVE_STATUSES } from "@/lib/fundRequests";
import { findMergedFund } from "@/lib/universeServer";
import { classifyFund } from "@/lib/classify";
import { checkFundSupport } from "@/lib/market-data/fundSupport";

/**
 * Add Missing Fund — request intake + runtime add.
 *
 * GET  → the caller's firm fund requests (RLS-scoped).
 * POST → normalize a ticker, check the MERGED universe + FMP, classify with the
 *        shared pipeline rules, and — when confident + taxonomy-valid — store it
 *        as a verified dynamic fund (added_to_universe). Never fakes a
 *        classification or an add; unclear funds become needs_classification.
 *
 * Requires an authenticated session. No FMP key/raw payload is ever returned.
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
    lookupUniverse: (t) => findMergedFund(t, ctx.sb),
    checkFmp: (t) => checkFundSupport(t),
    classify: classifyFund,
  });
  if (!outcome.ok) return NextResponse.json({ error: outcome.reason }, { status: 400 });
  const r = outcome.result;

  // Already in the merged universe → return metadata, store nothing.
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

    // Confident + valid classification → persist the verified dynamic fund.
    if (r.status === "added_to_universe" && r.classification && r.classification.status === "verified") {
      const f = r.classification.fields!;
      const fund = await dynamicFundInsert(ctx.sb, ctx.firm.id, ctx.user.id, {
        ticker: r.normalized, fundName: r.fundName ?? r.normalized, vehicle: r.vehicle,
        assetClass: f.asset_class, primaryCategory: f.primary_category, category: r.classification.category,
        benchmark: r.classification.benchmark, benchmarkCategory: f.benchmark_category,
        managementStyle: f.management_style, portfolioRole: f.portfolio_role, investmentFocus: f.investment_focus,
        region: f.region, marketCap: f.market_cap, style: f.style, styleBox: f.style_box,
        classificationSource: r.classification.source, sourceRequestId: request.id,
        fmpPayloadSummary: { name: r.fundName, assetType: r.vehicle }, // safe identity only
      });
      return NextResponse.json({ status: r.status, request, fund }, { status: 201 });
    }

    return NextResponse.json({ status: r.status, request }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not save the fund request." }, { status: 500 });
  }
}
