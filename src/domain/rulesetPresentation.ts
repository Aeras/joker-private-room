import type { RulesetId } from "./rulesets";
/** Browser-safe labels. Restricted options arrive only after server authorization. */
export interface RulesetOption {
  id: RulesetId;
  name: string;
  description: string;
}
export const PUBLIC_RULESET_OPTIONS: RulesetOption[] = [
  {
    id: "popular",
    name: "Popular — Our Rules",
    description: "Η βασική έκδοση που παίζουμε συνήθως.",
  },
  {
    id: "classic",
    name: "Κλασικό Τζόκερ",
    description: "38 φύλλα και αυτόματη αποκάλυψη ατού σε κάθε μοίρασμα.",
  },
  {
    id: "minus",
    name: "Minus",
    description: "−100 βαθμοί για κάθε μπάζα που λείπει από τη δήλωση.",
  },
];
export function publicRulesetName(id: RulesetId): string {
  return (
    PUBLIC_RULESET_OPTIONS.find((option) => option.id === id)?.name ??
    PUBLIC_RULESET_OPTIONS[0]!.name
  );
}
