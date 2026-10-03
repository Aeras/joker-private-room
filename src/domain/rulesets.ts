import { type PhaseConfig } from "./gameConfig";
import { resolvePremia, type RoundDealOutcome } from "./premia";
import { scoreDeal, type DealResultInput } from "./scoring";
import type { SpecialRowKind } from "./scoreSheet";

export type RulesetId = "popular" | "classic" | "panagiotis";

export interface PhaseBonusEntry {
  kind: SpecialRowKind;
  /** Per-seat adjustment, length = SEAT_COUNT. */
  values: (number | null)[];
}

export type PhaseBonusCalculator = (args: {
  phase: PhaseConfig["phase"];
  outcomes: readonly RoundDealOutcome[];
}) => PhaseBonusEntry[];

export interface Ruleset {
  id: RulesetId;
  name: string;
  description: string;
  scoreDeal: (input: DealResultInput) => number;
  calculatePhaseBonus: PhaseBonusCalculator;
}

const popularPremia: PhaseBonusCalculator = ({ phase, outcomes }) => {
  const resolution = resolvePremia(phase, outcomes);
  if (resolution.adjustments.every((value) => value === 0)) return [];
  return [{ kind: "premia", values: resolution.adjustments }];
};

/** Classic/Panagiotis differences remain deliberately unspecified. */
const notYetSpecified: PhaseBonusCalculator = () => [];

export const RULESETS: Record<RulesetId, Ruleset> = {
  popular: {
    id: "popular",
    name: "Popular — Our Rules",
    description: "Η βασική έκδοση που παίζουμε συνήθως.",
    scoreDeal,
    calculatePhaseBonus: popularPremia,
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
