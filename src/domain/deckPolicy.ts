import { createDeck, RANK_VALUE, shuffleCards, type Card } from "./cards";
import { nextSeat, type SeatIndex } from "./dealing";
import type { CanonicalGameState } from "./gameState";
import { getRuleset } from "./rulesets";

/** The shuffled normal-card order supplies authoritative, retry-stable suit tie breaks. */
export function prepareGameplayDeck(
  state: CanonicalGameState,
  dealer: SeatIndex,
  count: number,
  random: () => number,
): Card[] {
  const policy = getRuleset(state.rulesetId, state.rulesVersion);
  const shuffled = shuffleCards(createDeck(policy.deckProfile), random);
  if (policy.allocation === "uniform") return shuffled;
  if (!state.privateRulesetState) throw new Error("Missing private allocation snapshot");
  const targetId = state.privateRulesetState.targetPlayerId;
  if (targetId === null) return shuffled;
  const target = state.seats.find(
    (seat) => seat.owner.type === "human" && seat.owner.playerId === targetId,
  );
  if (!target) throw new Error("Allocation target no longer matches starting roster");
  if (!Number.isInteger(count) || count < 1 || count > 9)
    throw new Error("Invalid allocation count");
  const reserved = shuffled
    .filter((card) => card.kind === "standard")
    .sort(
      (a, b) =>
        (a.kind === "standard" ? RANK_VALUE[a.rank] : 0) -
        (b.kind === "standard" ? RANK_VALUE[b.rank] : 0),
    )
    .slice(0, count);
  const ids = new Set(reserved.map((card) => card.id));
  const pool = shuffled.filter((card) => !ids.has(card.id));
  const deck: Card[] = [];
  let cursor = 0;
  for (let round = 0; round < count; round++) {
    for (let offset = 1; offset <= 4; offset++) {
      deck.push(nextSeat(dealer, offset) === target.seatIndex ? reserved[round]! : pool[cursor++]!);
    }
  }
  return [...deck, ...pool.slice(cursor)];
}
