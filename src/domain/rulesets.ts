import { type PhaseConfig } from "./gameConfig";
import { resolvePremia, type RoundDealOutcome } from "./premia";
import { scoreDeal, type DealResultInput } from "./scoring";
import type { SpecialRowKind } from "./scoreSheet";
import type { DeckProfile } from "./cards";

export type RulesetId = "popular" | "classic" | "minus" | "panagiotis";
export type RulesVersion = "popular-v1" | "classic-v1" | "minus-v1" | "panagiotis-v1";
export interface PhaseBonusEntry {
  kind: SpecialRowKind;
  values: (number | null)[];
}
export type PhaseBonusCalculator = (args: {
  phase: PhaseConfig["phase"];
  outcomes: readonly RoundDealOutcome[];
}) => PhaseBonusEntry[];
export interface Ruleset {
  id: RulesetId;
  version: RulesVersion;
  name: string;
  description: string;
  deckProfile: DeckProfile;
  deckSize: 36 | 38;
  nineCardTrump: "chooser" | "reveal";
  allocation: "uniform" | "reserved_lowest";
  scoreDeal: (input: DealResultInput) => number;
  calculatePhaseBonus: PhaseBonusCalculator;
  resolvePremia: typeof resolvePremia;
}
const popularPremia: PhaseBonusCalculator = ({ phase, outcomes }) => {
  const resolution = resolvePremia(phase, outcomes);
  return resolution.adjustments.every((value) => value === 0)
    ? []
    : [{ kind: "premia", values: resolution.adjustments }];
};
export function scoreMinus(input: DealResultInput): number {
  return input.taken < input.declared ? -100 * (input.declared - input.taken) : scoreDeal(input);
}
const base = {
  deckProfile: "popular36",
  deckSize: 36,
  nineCardTrump: "chooser",
  allocation: "uniform",
  scoreDeal,
  calculatePhaseBonus: popularPremia,
  resolvePremia,
} as const;
export const RULESETS: Record<RulesetId, Ruleset> = {
  popular: {
    ...base,
    id: "popular",
    version: "popular-v1",
    name: "Popular — Our Rules",
    description: "Η βασική έκδοση που παίζουμε συνήθως.",
  },
  classic: {
    ...base,
    id: "classic",
    version: "classic-v1",
    name: "Κλασικό Τζόκερ",
    description: "38 φύλλα και αυτόματη αποκάλυψη ατού σε κάθε μοίρασμα.",
    deckProfile: "classic38",
    deckSize: 38,
    nineCardTrump: "reveal",
  },
  minus: {
    ...base,
    id: "minus",
    version: "minus-v1",
    name: "Minus",
    description: "−100 βαθμοί για κάθε μπάζα που λείπει από τη δήλωση.",
    scoreDeal: scoreMinus,
  },
  panagiotis: {
    ...base,
    id: "panagiotis",
    version: "panagiotis-v1",
    name: "Panagiotis Special 😈",
    description: "Ειδική παραλλαγή.",
    allocation: "reserved_lowest",
  },
};
/** Resolve the exact immutable policy pair; unknown persisted rules never fall back. */
export function getRuleset(id: unknown, version: unknown): Ruleset {
  if (typeof id !== "string" || !Object.hasOwn(RULESETS, id)) throw new Error("Unknown ruleset");
  const policy = RULESETS[id as RulesetId];
  if (version !== policy.version) throw new Error("Unsupported rules version");
  return policy;
}
export const RULESET_LIST = Object.values(RULESETS);
