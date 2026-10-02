/**
 * Single source of truth for game structure: 4 phases, 24 deals.
 * Never hardcode these numbers in components.
 */

export const SEAT_COUNT = 4;
export const TURN_DURATION_SECONDS = 30;

export interface PhaseConfig {
  /** 1-based phase number ("Γύρα N"). */
  phase: 1 | 2 | 3 | 4;
  /** Cards dealt per player for each deal in this phase. */
  deals: readonly number[];
}

export const GAME_PHASES: readonly PhaseConfig[] = [
  { phase: 1, deals: [1, 2, 3, 4, 5, 6, 7, 8] },
  { phase: 2, deals: [9, 9, 9, 9] },
  { phase: 3, deals: [8, 7, 6, 5, 4, 3, 2, 1] },
  { phase: 4, deals: [9, 9, 9, 9] },
] as const;

export interface DealInfo {
  /** 1-based global deal number (1..24). */
  dealNumber: number;
  phase: PhaseConfig["phase"];
  /** 1-based index inside its phase. */
  indexInPhase: number;
  cardsPerPlayer: number;
}

export const DEALS: readonly DealInfo[] = GAME_PHASES.flatMap((p, pi) =>
  p.deals.map((cards, i) => ({
    dealNumber: GAME_PHASES.slice(0, pi).reduce((n, x) => n + x.deals.length, 0) + i + 1,
    phase: p.phase,
    indexInPhase: i + 1,
    cardsPerPlayer: cards,
  })),
);

export const TOTAL_DEALS = DEALS.length; // 24

export const dealsOfPhase = (phase: PhaseConfig["phase"]) =>
  DEALS.filter((d) => d.phase === phase);
