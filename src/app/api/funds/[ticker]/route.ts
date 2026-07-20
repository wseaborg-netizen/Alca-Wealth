import { NextRequest, NextResponse } from "next/server";
import { getFund, getRecommendFund, inferVehicle, type FundRecord } from "@/lib/funds";
import { UNIVERSE } from "@/lib/universe";
import { findMergedFund } from "@/lib/universeServer";
import { cacheGet } from "@/lib/cache";
import { computeTaxEfficiency } from "@/lib/tax";
import { peersOf, rankAmong, MIN_PEERS, type CategoryRank } from "@/lib/metrics/peers";
import { PERIODS, type Period } from "@/lib/metrics/periods";
import type { PeriodStats } from "@/lib/kpi";

/** Cold-fetch budget for peers per request — warm caches carry the rest.
    Scores/ranks appear and deepen as the peer cache warms; never invented. */
const MAX_COLD_PEERS = 8;

/** Everything the client-side score engine needs for one fund. The Advisor
    Review Score is context/period-aware, so the API ships raw INPUTS and the
    client computes scores instantly for any period + scoring context with the
    single shared engine (src/lib/metrics/score.ts). */
export interface ScoreInputsPayload {
  ticker: string;
  name: string;
  expenseRatio: number | null;
  ttmYield: number | null;
  taxScore: number | null;     // ALCA tax-efficiency heuristic (0–100)
  fundAge: number | null;
  battingAvg: number | null;   // 3Y consistency proxy
  periods: Record<Period, PeriodStats>;
}

export interface PeerIntel {
  peerGroup: string;
  peerCount: number;                                   // peers fetched with data (incl. self)
  categoryRanks: Partial<Record<Period, CategoryRank>>;
  subject: ScoreInputsPayload;
  peers: ScoreInputsPayload[];
  warming: boolean;                                    // some peers not cached yet
  unavailableReasons: string[];
}

function toInputsPayload(r: FundRecord): ScoreInputsPayload {
  return {
    ticker: r.ticker, name: r.name, expenseRatio: r.expenseRatio,
    ttmYield: r.kpi.ttmYield,
    taxScore: (() => { try { return computeTaxEfficiency(r).score; } catch { return null; } })(),
    fundAge: r.fundAge,
    battingAvg: r.kpi.battingAvg3y,
    periods: r.kpi.periods,
  };
}

/** Category rank (2A) + score inputs for the unified client-side engine —
    all from one peer fetch (warm cache + small cold budget). */
async function peerIntel(ticker: string, record: FundRecord): Promise<PeerIntel | null> {
  const pg = peersOf(ticker);
  if (!pg) return null; // unknown/"Other" category → nothing peer-relative, no fallback
  const others = pg.peers.filter((p) => p.ticker !== ticker);
  if (others.length + 1 < MIN_PEERS) {
    return { peerGroup: pg.group, peerCount: others.length + 1, categoryRanks: {},
      subject: toInputsPayload(record), peers: [], warming: false,
      unavailableReasons: [`Fewer than ${MIN_PEERS} funds in this category.`] };
  }

  const warmFlags = await Promise.all(others.map((p) => cacheGet(`fund:rec:${p.ticker}`).then((v) => !!v)));
  const warm = others.filter((_, i) => warmFlags[i]);
  const cold = others.filter((_, i) => !warmFlags[i]).slice(0, MAX_COLD_PEERS);
  const settled = await Promise.allSettled(
    [...warm, ...cold].map((p) => getRecommendFund(p.ticker, p.vehicle, p.category, p.benchmark)),
  );
  const peerRecords = settled
    .filter((r): r is PromiseFulfilledResult<FundRecord> => r.status === "fulfilled" && !r.value.error)
    .map((r) => r.value);

  const warming = peerRecords.length < others.length;
  const reasons: string[] = warming
    ? ["Peer data still warming — scores use the peers cached so far."] : [];

  const categoryRanks: Partial<Record<Period, CategoryRank>> = {};
  for (const period of PERIODS) {
    const rank = rankAmong(
      record.kpi.periods?.[period]?.return ?? null,
      peerRecords.map((p) => p.kpi.periods?.[period]?.return ?? null),
      pg.group, "annualized return");
    if (rank) categoryRanks[period] = rank;
  }

  return {
    peerGroup: pg.group, peerCount: peerRecords.length + 1, categoryRanks,
    subject: toInputsPayload(record),
    peers: peerRecords.map(toInputsPayload),
    warming, unavailableReasons: reasons,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();
  let entry = UNIVERSE.find((u) => u.ticker === t);

  // Verified dynamic funds (Expansion Hub) aren't in the static set — resolve
  // their identity from the merged universe so Analyze/KPIs work.
  if (!entry) entry = await findMergedFund(t).catch(() => undefined);

  if (!entry) {
    // Arbitrary off-universe tickers: no classification → no peer group, no
    // score (never ranked against the full universe).
    try {
      const record = await getFund(t, inferVehicle(t), "Other", "SPY");
      return NextResponse.json({ ...record, categoryRanks: null, peerIntel: null });
    } catch {
      return NextResponse.json({ error: `Ticker ${t} not found` }, { status: 404 });
    }
  }

  try {
    const record = await getFund(entry.ticker, entry.vehicle, entry.category, entry.benchmark);
    const intel = await peerIntel(t, record).catch(() => null);
    return NextResponse.json({ ...record, categoryRanks: intel?.categoryRanks ?? null, peerIntel: intel });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
