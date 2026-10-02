import { SEAT_COUNT, type PhaseConfig } from "./gameConfig";

export type SpecialRowKind = "bonus" | "penalty" | "premia";

export interface DealScoreRow {
  dealNumber: number;
  /** Per-seat score; null = not played yet. */
  scores: (number | null)[];
}

export interface SpecialScoreRow {
  phase: PhaseConfig["phase"];
  kind: SpecialRowKind;
  label?: string;
  values: (number | null)[];
}

export interface ScoreSheet {
  deals: DealScoreRow[];
  special: SpecialScoreRow[];
}

export const emptyScoreSheet = (): ScoreSheet => ({ deals: [], special: [] });

export function computeTotals(sheet: ScoreSheet): number[] {
  const totals = Array<number>(SEAT_COUNT).fill(0);
  for (const row of [...sheet.deals.map((d) => d.scores), ...sheet.special.map((s) => s.values)]) {
    row.forEach((v, i) => {
      if (v != null) totals[i] += v;
    });
  }
  return totals;
}
