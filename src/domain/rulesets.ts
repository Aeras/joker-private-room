import { scoreDeal, type DealResultInput } from "./scoring";
import type { ScoreSheet, SpecialRowKind } from "./scoreSheet";
import type { PhaseConfig } from "./gameConfig";

export type RulesetId = "popular" | "classic" | "panagiotis";

export interface PhaseBonusEntry {
  kind: SpecialRowKind;
  /** Per-seat adjustment, length = SEAT_COUNT. */
  values: (number | null)[];
}

/**
 * Ruleset-specific phase/premia bonus calculation.
 * The real rules are not yet documented — implementations return [] for now.
 */
export type PhaseBonusCalculator = (args: {
  phase: PhaseConfig["phase"];
  sheet: ScoreSheet;
}) => PhaseBonusEntry[];

export interface Ruleset {
  id: RulesetId;
  name: string;
  description: string;
  scoreDeal: (input: DealResultInput) => number;
  calculatePhaseBonus: PhaseBonusCalculator;
}

const notYetSpecified: PhaseBonusCalculator = () => [];

export const RULESETS: Record<RulesetId, Ruleset> = {
  popular: {
    id: "popular",
    name: "Popular — Our Rules",
    description: "Η βασική έκδοση που παίζουμε συνήθως.",
    scoreDeal,
    calculatePhaseBonus: notYetSpecified,
  },
  classic: {
    id: "classic",
    name: "Classic Joker",
    description: "Κλασική παραλλαγή Joker.",
    scoreDeal,
    calculatePhaseBonus: notYetSpecified,
  },
  panagiotis: {
    id: "panagiotis",
    name: "Panagiotis Special 😈",
    description: "Ειδική χιουμοριστική παραλλαγή.",
    scoreDeal,
    calculatePhaseBonus: notYetSpecified,
  },
};

export const RULESET_LIST = Object.values(RULESETS);
