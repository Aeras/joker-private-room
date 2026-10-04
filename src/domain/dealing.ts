import type { Card, Suit } from "./cards";
import { SEAT_COUNT } from "./gameConfig";

export type SeatIndex = 0 | 1 | 2 | 3;
export type Hands = [Card[], Card[], Card[], Card[]];

export interface DealCursorState {
  hands: Hands;
  cursor: number;
}

export interface StandardDealResult extends DealCursorState {
  revealedTrumpCard: Card;
  trump: Suit | null;
}

export interface InitialDealerResult {
  dealerSeat: SeatIndex;
  firstAceCard: Card;
  revealedCount: number;
}

export function assertSeatIndex(value: number): asserts value is SeatIndex {
  if (!Number.isInteger(value) || value < 0 || value >= SEAT_COUNT) {
    throw new Error(`Invalid seat index: ${value}`);
  }
}

export function nextSeat(seat: number, offset = 1): SeatIndex {
  assertSeatIndex(seat);
  const normalized = ((offset % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT;
  return ((seat + normalized) % SEAT_COUNT) as SeatIndex;
}

export function orderAfter(seat: number): SeatIndex[] {
  assertSeatIndex(seat);
  return [nextSeat(seat, 1), nextSeat(seat, 2), nextSeat(seat, 3), nextSeat(seat, 4)];
}

/**
 * Dealer-selection deck is separate from the actual first-deal deck. The
 * caller supplies which seat receives the first selection card so this pure
 * function does not invent a seating convention outside the canonical rules.
 */
export function selectInitialDealer(
  shuffledSelectionDeck: readonly Card[],
  firstRecipientSeat: SeatIndex,
): InitialDealerResult {
  for (let i = 0; i < shuffledSelectionDeck.length; i += 1) {
    const card = shuffledSelectionDeck[i];
    if (card?.kind !== "standard" || card.rank !== "A") continue;
    return {
      dealerSeat: nextSeat(firstRecipientSeat, i),
      firstAceCard: card,
      revealedCount: i + 1,
    };
  }
  throw new Error("Dealer-selection deck contains no Ace");
}

function emptyHands(): Hands {
  return [[], [], [], []];
}

function cloneHands(hands?: Hands): Hands {
  if (!hands) return emptyHands();
  return [hands[0].slice(), hands[1].slice(), hands[2].slice(), hands[3].slice()];
}

/** Deal cyclically, beginning immediately after dealer. */
export function dealCards(
  deck: readonly Card[],
  dealerSeat: SeatIndex,
  cardsPerSeat: number,
  cursor = 0,
  existingHands?: Hands,
): DealCursorState {
  if (!Number.isInteger(cardsPerSeat) || cardsPerSeat < 0) {
    throw new Error("cardsPerSeat must be a non-negative integer");
  }
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > deck.length) {
    throw new Error("Invalid deck cursor");
  }

  const hands = cloneHands(existingHands);
  let nextCursor = cursor;
  const firstSeat = nextSeat(dealerSeat);

  for (let round = 0; round < cardsPerSeat; round += 1) {
    for (let offset = 0; offset < SEAT_COUNT; offset += 1) {
      const card = deck[nextCursor];
      if (!card) throw new Error("Deck exhausted during deal");
      const seat = nextSeat(firstSeat, offset);
      hands[seat].push(card);
      nextCursor += 1;
    }
  }

  return { hands, cursor: nextCursor };
}

export function trumpFromReveal(card: Card): Suit | null {
  return card.kind === "standard" ? card.suit : null;
}

/** Policy-selected 1..9-card deal followed by immediate next-card trump reveal. */
export function dealWithTrumpReveal(
  deck: readonly Card[],
  dealerSeat: SeatIndex,
  cardsPerSeat: number,
): StandardDealResult {
  if (cardsPerSeat < 1 || cardsPerSeat > 9) {
    throw new Error("Trump-reveal deals must contain 1..9 cards per seat");
  }
  const dealt = dealCards(deck, dealerSeat, cardsPerSeat);
  const revealedTrumpCard = deck[dealt.cursor];
  if (!revealedTrumpCard) throw new Error("Missing trump reveal card");
  return {
    ...dealt,
    revealedTrumpCard,
    trump: trumpFromReveal(revealedTrumpCard),
  };
}

/** First stage of every 9-card deal: 3 cards to each of all four seats. */
export function dealNineCardInitial(
  deck: readonly Card[],
  dealerSeat: SeatIndex,
): DealCursorState {
  return dealCards(deck, dealerSeat, 3);
}

/** Continue from the same cursor and add six cards to every seat. */
export function completeNineCardDeal(
  deck: readonly Card[],
  dealerSeat: SeatIndex,
  initial: DealCursorState,
): DealCursorState {
  if (initial.cursor !== 12 || initial.hands.some((hand) => hand.length !== 3)) {
    throw new Error("Invalid nine-card initial deal state");
  }
  const completed = dealCards(deck, dealerSeat, 6, initial.cursor, initial.hands);
  if (completed.cursor !== 36 || completed.hands.some((hand) => hand.length !== 9)) {
    throw new Error("Invalid completed nine-card deal state");
  }
  return completed;
}
