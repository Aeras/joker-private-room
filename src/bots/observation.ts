import { createDeck, RANK_VALUE, shuffleCards, type Card, type Suit } from "@/domain/cards";
import { requestedSuitForTrick, type PlayedCard } from "@/domain/engine";
import type { PlayerGameProjection } from "@/domain/projection";

export type BidIntent = "UNDECLARED" | "NEEDS_TRICKS" | "EXACT" | "OVERSHOT" | "UNREACHABLE";
export interface HoldingConstraint {
  voidSuits: ReadonlySet<Suit>;
  /** A HIGHER_SUIT response proves no higher requested card remained in that hand. */
  maximumRank: ReadonlyMap<Suit, number>;
}
export interface BotObservation {
  identity: { gameId: string; dealNumber: number; stateVersion: number; seat: number };
  ownHand: readonly Card[];
  committedTrick: readonly PlayedCard[];
  pendingJoker: PlayedCard | null;
  unknownCards: readonly Card[];
  remainingHandSizes: readonly number[];
  constraints: readonly HoldingConstraint[];
  intents: readonly BidIntent[];
  declarations: readonly (number | null)[];
  tricksTaken: readonly number[];
  trump: Suit | null;
  publicScore: PlayerGameProjection["score"];
  progression: PlayerGameProjection["progression"];
  rulesetId: PlayerGameProjection["rulesetId"];
  rulesVersion: string;
}

/** Accepts the public boundary, never a canonical game or opponent hands.
 * Facts reset with the current deal's history. Presentation tails and dealer
 * selection cards belong to other decks/deals and must not subtract inventory. */
export function observeBot(projection: PlayerGameProjection): BotObservation {
  if (!projection.cards.ownHandVisible) throw new Error("Own hand is not observable yet");
  const ownHand = structuredClone(projection.cards.ownHand);
  const visibleTrick = structuredClone(projection.cards.currentTrick);
  const pending = visibleTrick.filter((play) => play.card.kind === "joker" && !play.joker);
  if (pending.length > 1 || (pending.length && projection.progression.phase !== "JOKER_DECISION"))
    throw new Error("Invalid public pending Joker");
  const committedTrick = visibleTrick.filter((play) => !pending.includes(play));
  const history = structuredClone(projection.cards.completedTricks);
  const partial =
    projection.progression.phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS" ||
    projection.progression.phase === "NINE_CARD_TRUMP_CHOICE";
  const dealtSize = partial ? 3 : projection.progression.cardsPerPlayer;
  const remainingHandSizes = [0, 1, 2, 3].map(
    (seat) =>
      dealtSize - history.length - visibleTrick.filter((play) => play.seatIndex === seat).length,
  );
  if (
    remainingHandSizes.some((size) => size < 0) ||
    remainingHandSizes[projection.viewerSeat] !== ownHand.length
  )
    throw new Error("Inconsistent public hand size");
  const trump = projection.trump.status === "resolved" ? projection.trump.suit : null;
  const facts = [0, 1, 2, 3].map(() => ({
    voidSuits: new Set<Suit>(),
    maximumRank: new Map<Suit, number>(),
  }));
  for (const trick of [...history.map((t) => t.cards), committedTrick]) {
    if (!trick.length) continue;
    const requested = requestedSuitForTrick(trick);
    if (!requested) continue;
    const lead = trick[0]!;
    const highestRequired =
      lead.card.kind === "joker" &&
      lead.joker?.context === "LEAD" &&
      lead.joker.mode === "HIGHER_SUIT";
    for (const play of trick.slice(1)) {
      if (play.card.kind === "joker") continue; // A voluntary Joker reveals no suit void.
      const fact = facts[play.seatIndex];
      if (!fact) throw new Error("Invalid public seat");
      if (play.card.suit !== requested) {
        fact.voidSuits.add(requested);
        if (trump && play.card.suit !== trump) fact.voidSuits.add(trump);
      } else if (highestRequired) {
        fact.maximumRank.set(
          requested,
          Math.min(fact.maximumRank.get(requested) ?? Infinity, RANK_VALUE[play.card.rank]),
        );
      }
    }
  }
  const publicPlayed = [...history.flatMap((t) => t.cards), ...visibleTrick].map((p) => p.card);
  const known = [
    ...ownHand,
    ...publicPlayed,
    ...(projection.cards.exposedTrumpCard ? [projection.cards.exposedTrumpCard] : []),
  ];
  const deck = createDeck(projection.rulesetId === "classic" ? "classic38" : "popular36");
  const validIds = new Set(deck.map((card) => card.id));
  if (
    known.some((card) => !validIds.has(card.id)) ||
    new Set(known.map((card) => card.id)).size !== known.length
  )
    throw new Error("Invalid or duplicate public card inventory");
  const excluded = new Set(known.map((card) => card.id));
  const unknownCards = deck.filter((card) => !excluded.has(card.id));
  const remainingTricks = projection.progression.cardsPerPlayer - history.length;
  const intents = projection.declarations.values.map((bid, seat): BidIntent => {
    if (bid == null) return "UNDECLARED";
    const taken = projection.score.tricksTaken[seat]!;
    if (taken > bid) return "OVERSHOT";
    if (taken === bid) return "EXACT";
    return bid - taken > remainingTricks ? "UNREACHABLE" : "NEEDS_TRICKS";
  });
  return {
    identity: {
      gameId: projection.gameId,
      dealNumber: projection.progression.dealNumber,
      stateVersion: projection.stateVersion,
      seat: projection.viewerSeat,
    },
    ownHand,
    committedTrick,
    pendingJoker: pending[0] ?? null,
    unknownCards,
    remainingHandSizes,
    constraints: facts,
    intents,
    declarations: [...projection.declarations.values],
    tricksTaken: [...projection.score.tricksTaken],
    trump,
    publicScore: structuredClone(projection.score),
    progression: { ...projection.progression },
    rulesetId: projection.rulesetId,
    rulesVersion: projection.rulesVersion,
  };
}

export interface HypotheticalWorld {
  /** Hypotheses, not authoritative holdings. Pending Joker is separately public. */
  hands: Card[][];
  stock: Card[];
}
export function consistentHolding(card: Card, constraint: HoldingConstraint): boolean {
  return (
    card.kind === "joker" ||
    (!constraint.voidSuits.has(card.suit) &&
      RANK_VALUE[card.rank] <= (constraint.maximumRank.get(card.suit) ?? Infinity))
  );
}

/** Uniform rejection sampling conditional on hard public facts. No greedy
 * repair, fake allocation or peeking at a hidden canonical hand. Unallocated
 * unknown cards remain stock, not automatically in opponents' hands.
 * Strong constraints can exhaust the bounded budget: callers must use a safe
 * legal fallback rather than relaxing facts. Soft bid evidence belongs in
 * policy weighting, never in hard impossibility constraints. */
export function sampleConsistentWorld(
  observation: BotObservation,
  random: () => number,
  maxAttempts = 128,
): HypotheticalWorld | null {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 512)
    throw new Error("Invalid sampling budget");
  const ownSeat = observation.identity.seat;
  if (
    ownSeat < 0 ||
    ownSeat > 3 ||
    observation.remainingHandSizes.length !== 4 ||
    observation.constraints.length !== 4
  )
    throw new Error("Invalid observation");
  const required = observation.remainingHandSizes.reduce(
    (sum, size, seat) => sum + (seat === ownSeat ? 0 : size),
    0,
  );
  if (required > observation.unknownCards.length) return null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffleCards(observation.unknownCards, random);
    const hands = [[], [], [], []] as Card[][];
    hands[ownSeat] = structuredClone(observation.ownHand) as Card[];
    let cursor = 0,
      valid = true;
    for (let seat = 0; seat < 4; seat++) {
      if (seat === ownSeat) continue;
      const size = observation.remainingHandSizes[seat]!;
      hands[seat] = shuffled.slice(cursor, cursor + size);
      cursor += size;
      if (hands[seat]!.some((card) => !consistentHolding(card, observation.constraints[seat]!))) {
        valid = false;
        break;
      }
    }
    if (valid) return { hands, stock: shuffled.slice(cursor) };
  }
  return null;
}
