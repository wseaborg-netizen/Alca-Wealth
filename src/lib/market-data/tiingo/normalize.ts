/**
 * Pure Tiingo → ALCA normalization. No I/O, no token, no logging, no throwing.
 *
 * Each function maps a validated raw Tiingo shape onto an ALCA-owned type from
 * ../types. Provider fields never escape: only normalized types are returned.
 * Missing values become explicit `null` / Unavailable / empty — never fabricated.
 */
import {
  unavailable,
  type SecurityMetadata,
  type SecurityType,
  type PriceHistory,
  type PriceBar,
  type PriceSeriesKind,
  type DistributionHistory,
  type Distribution,
  type SplitHistory,
  type Split,
  type Provenance,
  type SeriesAvailability,
} from "../types";
import type { TiingoMetaRaw, TiingoPriceRaw } from "./types";

const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const num = (v: unknown): number | null => (isFiniteNum(v) ? v : null);
const isoDate = (v: unknown): string | null => (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null);

/**
 * Tiingo's `/tiingo/daily/{symbol}` metadata does NOT expose a structured asset
 * type (observed fields: ticker/name/description/startDate/endDate/exchangeCode),
 * so this resolves to "unknown" for both ETFs and mutual funds unless a future
 * Tiingo field/endpoint supplies it. ETF-vs-fund classification therefore comes
 * from ALCA's canonical universe, never guessed here. No fabrication.
 */
function securityTypeOf(raw: TiingoMetaRaw): SecurityType {
  const a = (raw.assetType ?? "").toLowerCase();
  if (a.includes("etf")) return "etf";
  if (a.includes("mutual") || a.includes("fund")) return "mutual_fund";
  if (a.includes("stock") || a.includes("equity")) return "equity";
  return "unknown";
}

/** Ascending sort by date, then de-duplicate by date (last occurrence wins). */
function dedupeByDateAscending(bars: PriceBar[]): PriceBar[] {
  bars.sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map<string, PriceBar>();
  for (const b of bars) byDate.set(b.date, b); // adjacent duplicates → last wins, order stays ascending
  return [...byDate.values()];
}

export function normalizeMetadata(symbol: string, raw: TiingoMetaRaw, provenance: Provenance): SecurityMetadata {
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;
  return {
    symbol: symbol.toUpperCase(),
    displayName: name,
    securityType: securityTypeOf(raw),
    coverageStartDate: isoDate(raw.startDate), // COVERAGE start — never labeled inception
    aum: unavailable<number>("not_supported_by_provider"), // Tiingo does not supply AUM
    provenance,
  };
}

function toBar(r: TiingoPriceRaw): PriceBar {
  return {
    date: isoDate(r.date) ?? "",
    close: num(r.close),
    adjClose: num(r.adjClose),
    open: num(r.open),
    high: num(r.high),
    low: num(r.low),
    volume: num(r.volume),
  };
}

function seriesAvailability(count: number, minUsable: number): SeriesAvailability {
  if (count === 0) return { status: "empty" };
  if (count < minUsable) return { status: "insufficient", count };
  return { status: "available", count };
}

export function normalizePriceHistory(
  symbol: string,
  kind: PriceSeriesKind,
  rows: readonly TiingoPriceRaw[],
  provenance: Provenance,
  observedAt: string,
  minUsable = 2,
): PriceHistory {
  const bars = dedupeByDateAscending(rows.map(toBar).filter((b) => b.date !== ""));
  const asOf = bars.length ? bars[bars.length - 1].date : null;
  return {
    symbol: symbol.toUpperCase(),
    kind,
    bars,
    availability: seriesAvailability(bars.length, minUsable),
    provenance,
    freshness: { asOf, observedAt },
  };
}

export function normalizeDistributions(
  symbol: string,
  rows: readonly TiingoPriceRaw[],
  provenance: Provenance,
): DistributionHistory {
  const distributions: Distribution[] = rows
    .map((r) => ({ exDate: isoDate(r.date) ?? "", amount: num(r.divCash) ?? 0 }))
    .filter((d) => d.exDate !== "" && d.amount > 0)
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
  return {
    symbol: symbol.toUpperCase(),
    distributions,
    availability: distributions.length ? { status: "available", count: distributions.length } : { status: "empty" },
    provenance,
  };
}

export function normalizeSplits(
  symbol: string,
  rows: readonly TiingoPriceRaw[],
  provenance: Provenance,
): SplitHistory {
  const splits: Split[] = rows
    .map((r) => ({ date: isoDate(r.date) ?? "", factor: num(r.splitFactor) ?? 1 }))
    .filter((s) => s.date !== "" && s.factor > 0 && s.factor !== 1)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    symbol: symbol.toUpperCase(),
    splits,
    availability: splits.length ? { status: "available", count: splits.length } : { status: "empty" },
    provenance,
  };
}
