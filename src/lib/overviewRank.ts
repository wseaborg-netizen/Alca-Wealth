/**
 * Overview performer ranking — PURE and testable.
 *
 * Ranks the firm's funds by the canonical visible Price Change for the selected
 * period. Funds with no price change for the period are EXCLUDED from the ranking
 * (their figure is shown as "Unavailable" elsewhere — never as 0%). Top = highest
 * price change first; Worst = lowest first. The caller passes only the
 * authenticated firm's funds, so no cross-firm data can appear.
 */
export interface RankInput { ticker: string; pc: number | null }

export function rankPerformers<T extends RankInput>(rows: T[], dir: "top" | "worst", limit = 10): T[] {
  const valid = rows.filter((r) => r.pc != null && Number.isFinite(r.pc));
  const sorted = [...valid].sort((a, b) =>
    dir === "top" ? (b.pc as number) - (a.pc as number) : (a.pc as number) - (b.pc as number),
  );
  return sorted.slice(0, limit);
}
