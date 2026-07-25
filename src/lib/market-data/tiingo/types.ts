/**
 * Raw Tiingo response shapes — INTERNAL to the adapter.
 *
 * These are intentionally NOT re-exported from the market-data public barrel:
 * consumers must never see provider-shaped objects. Only client.ts and
 * normalize.ts reference them.
 */

export interface TiingoMetaRaw {
  ticker?: string;
  name?: string;
  exchangeCode?: string;
  assetType?: string;
  startDate?: string; // provider COVERAGE start — not inception
  endDate?: string;
  description?: string;
}

export interface TiingoPriceRaw {
  date?: string;
  close?: number | null;
  high?: number | null;
  low?: number | null;
  open?: number | null;
  volume?: number | null;
  adjClose?: number | null;
  adjHigh?: number | null;
  adjLow?: number | null;
  adjOpen?: number | null;
  adjVolume?: number | null;
  divCash?: number | null;
  splitFactor?: number | null;
}
