import type { CanonicalGameState } from "./gameState";

/** Already-played public data only. Two maximum-size deals bound reconnect delivery. */
export function retainedPresentationTail(state: CanonicalGameState) {
  return [
    ...(state.cards.presentationTail ?? []),
    ...state.cards.completedTricks.map((trick, index) => ({ ...trick, dealNumber: state.progression.dealNumber, ordinal: index + 1 })),
  ].slice(-18);
}
