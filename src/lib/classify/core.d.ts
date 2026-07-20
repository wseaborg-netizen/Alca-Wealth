/** Types for the shared CommonJS classifier core (core.js). */

export interface ClassifiedFields {
  asset_class: string;
  primary_category: string;
  region: string;
  market_cap: string | null;
  style: string | null;
  style_box: string | null;
  management_style: string;
  portfolio_role: string;
  investment_focus: string;
  benchmark_category: string;
}

export interface ClassifyInput {
  fund_name: string;
  fund_type: string | null;
}

export type ClassifyResult =
  | { confidence: "high"; fields: ClassifiedFields }
  | { reason: string; suggestion?: ClassifiedFields };

export type Taxonomy = Record<string, string[] | string>;

export function classify(fund: ClassifyInput): ClassifyResult;
export function validateFields(fields: Record<string, unknown>, taxonomy: Taxonomy | null): string[];
export function mgmtStyle(nameLower: string, fundType: string | null): string;
export function styleOf(nameLower: string): string | null;
export function capOf(nameLower: string): string | null;
export const ENUM_FIELDS: string[];
export const NULLABLE_FIELDS: string[];
