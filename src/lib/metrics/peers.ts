/**
 * Category peer benchmarking — peer-group selection and rank math.
 *
 * Peer group = the fund's verified `primary_category` from ALCA's controlled
 * taxonomy (e.g. "US Large Blend"). That single field already encodes asset
 * class, region, and style box, so funds are only ever compared with true
 * same-category peers. There is NO fallback: a fund with an unknown or
 * unclassifiable category ("Other") gets no peer rank rather than a fake one,
 * and nothing is ever ranked against the full universe.
 */
import { UNIVERSE, type UniverseFund } from "../universe";

/** Categories that are catch-alls, not real peer groups. */
const NON_PEER_CATEGORIES = new Set(["Other", "Alternative", ""]);

/** Minimum peers (including the fund itself) for a rank to mean anything. */
export const MIN_PEERS = 5;

/** The peer-group key for a fund — null when no defensible peer group exists. */
export function peerGroupOf(fund: Pick<UniverseFund, "primary_category" | "verified"> | undefined | null): string | null {
  if (!fund || !fund.verified) return null;
  const cat = fund.primary_category?.trim();
  if (!cat || NON_PEER_CATEGORIES.has(cat)) return null;
  return cat;
}

/** All same-category peers (including the fund itself) from the verified universe. */
export function peersOf(ticker: string): { group: string; peers: UniverseFund[] } | null {
  const me = UNIVERSE.find((f) => f.ticker === ticker.toUpperCase());
  const group = peerGroupOf(me);
  if (!group) return null;
  return { group, peers: UNIVERSE.filter((f) => f.primary_category === group) };
}

export interface CategoryRank {
  rank: number;        // 1 = best
  count: number;       // peers WITH data for this metric/period (incl. this fund)
  group: string;       // peer-group label, e.g. "US Large Blend"
  metric: string;      // what was ranked, e.g. "annualized return"
}

/**
 * Rank a fund's value among peer values for the same metric and period.
 * `peerValues` = values for OTHER peers (nulls allowed — they're excluded,
 * never invented). Returns null when fewer than MIN_PEERS have data.
 */
export function rankAmong(
  value: number | null | undefined,
  peerValues: (number | null | undefined)[],
  group: string,
  metric: string,
  higherIsBetter = true,
): CategoryRank | null {
  if (value == null) return null;
  const usable = peerValues.filter((v): v is number => v != null && Number.isFinite(v));
  const count = usable.length + 1;
  if (count < MIN_PEERS) return null;
  const better = usable.filter((v) => (higherIsBetter ? v > value : v < value)).length;
  return { rank: better + 1, count, group, metric };
}

/** Human sentence: “Ranked 12 of 84 US Large Blend funds over 3Y (by annualized return)”. */
export function rankSentence(r: CategoryRank, period: string): string {
  return `Ranked ${r.rank} of ${r.count} ${r.group} funds over ${period} (by ${r.metric})`;
}
