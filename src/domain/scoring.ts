/**
 * Confirmed basic per-deal scoring. Pure and testable.
 * Phase/premia bonuses are NOT implemented here — see rulesets.ts extension point.
 */

export interface DealResultInput {
  declared: number;
  taken: number;
  /** Tricks available in the deal (= cards dealt per player). */
  tricksInDeal: number;
}

export const ZERO_TRICK_PENALTY = -200;

export function scoreDeal({ declared, taken, tricksInDeal }: DealResultInput): number {
  if (declared === taken) {
    // All-tricks special case overrides the normal formula.
    if (tricksInDeal > 0 && declared === tricksInDeal) return 100 * tricksInDeal;
    return 50 + 50 * declared;
  }
  if (taken === 0) return ZERO_TRICK_PENALTY; // declared >= 1, took none
  return 10 * taken;
}
