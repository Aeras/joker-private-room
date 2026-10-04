import { createDeck } from "./cards";
import type { CanonicalGameState } from "./gameState";
import { getRuleset } from "./rulesets";
/** Fail closed before any loaded snapshot can drive commands or persistence. */
export function assertRulesetState(state: CanonicalGameState): void {
  const policy = getRuleset(state.rulesetId, state.rulesVersion);
  if (state.stateSchemaVersion !== 3 && state.stateSchemaVersion !== 4)
    throw new Error("Unsupported serialization schema");
  if (state.stateSchemaVersion === 3 && state.rulesetId !== "popular")
    throw new Error("Legacy schema only supports Popular");
  if (
    policy.allocation === "reserved_lowest" &&
    (!state.privateRulesetState ||
      (state.privateRulesetState.targetPlayerId !== null &&
        !state.seats.some(
          (seat) =>
            seat.owner.type === "human" &&
            seat.owner.playerId === state.privateRulesetState!.targetPlayerId,
        )))
  )
    throw new Error("Invalid frozen target");
  const expected = new Map(createDeck(policy.deckProfile).map((card) => [card.id, card]));
  const valid = (card: (typeof state.cards.deck)[number]) => {
    const canonical = expected.get(card.id);
    if (
      !canonical ||
      canonical.kind !== card.kind ||
      (canonical.kind === "standard" &&
        (card.kind !== "standard" || canonical.rank !== card.rank || canonical.suit !== card.suit))
    )
      throw new Error("Card outside selected deck");
  };
  if (state.progression.phase === "INITIAL_DEALER_SELECTION") {
    if (state.cards.deck.length !== 0) throw new Error("Starting deck must be empty");
  } else {
    if (
      state.cards.deck.length !== policy.deckSize ||
      new Set(state.cards.deck.map((card) => card.id)).size !== policy.deckSize
    )
      throw new Error("Invalid selected deck composition");
    state.cards.deck.forEach(valid);
  }
  const live = [
    ...state.cards.hands.flat(),
    ...state.cards.currentTrick.map((play) => play.card),
    ...state.cards.completedTricks.flatMap((trick) => trick.cards.map((play) => play.card)),
  ];
  live.forEach(valid);
  const count = state.progression.cardsPerPlayer;
  if (!Number.isInteger(count) || count < 1 || count > 9) throw new Error("Invalid deal size");
  const expectedCursor =
    state.progression.phase === "INITIAL_DEALER_SELECTION"
      ? 0
      : state.cards.hiddenPartialNineCardHands
        ? 12
        : count * 4;
  if (state.cards.drawCursor !== expectedCursor || live.length !== expectedCursor)
    throw new Error("Invalid dealt-card accounting");
  const dealtIds = new Set(state.cards.deck.slice(0, expectedCursor).map((card) => card.id));
  if (live.some((card) => !dealtIds.has(card.id))) throw new Error("Undealt card entered play");
  if (
    policy.nineCardTrump === "reveal" &&
    count === 9 &&
    state.progression.phase !== "INITIAL_DEALER_SELECTION" &&
    state.cards.exposedTrumpCard?.id !== state.cards.deck[36]?.id
  )
    throw new Error("Classic must reveal card 37");

  if (new Set(live.map((card) => card.id)).size !== live.length)
    throw new Error("Duplicate live cards");
  if (state.cards.exposedTrumpCard) {
    valid(state.cards.exposedTrumpCard);
    if (live.some((card) => card.id === state.cards.exposedTrumpCard!.id))
      throw new Error("Exposed card in play");
  }
  if (
    policy.nineCardTrump === "reveal" &&
    (state.cards.hiddenPartialNineCardHands ||
      state.trump.status === "chooser_pending" ||
      state.progression.phase === "NINE_CARD_TRUMP_CHOICE")
  )
    throw new Error("Classic cannot choose trump");
  if (state.initialDealerSelection?.status === "resolved")
    state.initialDealerSelection.revealedSelectionCards.forEach(valid);
}
