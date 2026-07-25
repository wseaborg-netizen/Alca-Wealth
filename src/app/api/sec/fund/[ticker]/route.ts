/**
 * Public SEC fund lookup — cache-first, normalized, hardened.
 * Never proxies raw SEC responses, internal errors, or any configuration
 * detail. Data is served from the shared cache / database; live SEC requests
 * happen only through the locked server-side refresh path.
 * ALCA Wealth is not affiliated with, endorsed, or approved by the SEC.
 */
import { NextRequest, NextResponse } from "next/server";
import { getFundDataCached } from "@/lib/sec-service";
import { isValidTicker, apiRateLimitOk } from "@/lib/sec";

export async function GET(req: NextRequest, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  const t = (ticker ?? "").trim().toUpperCase();
  if (!t || t.length > 10 || !isValidTicker(t)) {
    return NextResponse.json(
      { status: "not_found", ticker: t.slice(0, 12), filings: [], source: "SEC EDGAR", retrievedAt: Date.now() },
      { status: 404 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await apiRateLimitOk(`fund:${ip}`, 30, 60))) {
    return NextResponse.json({ status: "rate_limited", ticker: t }, { status: 429, headers: { "Retry-After": "30" } });
  }

  const data = await getFundDataCached(t);
  const body = {
    status: data.status,
    ticker: data.ticker,
    identifiers: data.identifiers,
    filings: data.filings,
    stale: data.stale,
    lastSuccessfulSync: data.lastSuccessfulSync,
    coverageWarning: data.coverageWarning,
    source: "SEC EDGAR",
    retrievedAt: Date.now(),
  };
  const code = data.status === "resolved" ? 200 : data.status === "not_found" ? 404 : 503;
  return NextResponse.json(body, {
    status: code,
    headers: code === 200
      ? { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" }
      : { "Cache-Control": "no-store" },
  });
}
