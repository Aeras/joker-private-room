import { createDeck, shuffleCards, type Card } from "./cards";
import type { CanonicalGameState } from "./gameState";
import { getRuleset } from "./rulesets";

/** Every supported ruleset uses the same unbiased canonical shuffle. */
export function prepareGameplayDeck(state: CanonicalGameState, random: () => number): Card[] {
  return shuffleCards(createDeck(getRuleset(state.rulesetId, state.rulesVersion).deckProfile), random);
}
