/**
 * Deck model for JOKER.
 * Ranks 6..A in four suits, minus 6♠ and 6♣, plus 2 Jokers = 36 cards.
 * Special Joker behavior is intentionally NOT implemented (not yet specified).
 */

export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export type Rank = (typeof RANKS)[number];

export interface StandardCard {
  kind: "standard";
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface JokerCard {
  kind: "joker";
  id: string;
}

export type Card = StandardCard | JokerCard;

/** Cards removed from the base 6..A deck. */
export const EXCLUDED_CARDS: ReadonlyArray<{ suit: Suit; rank: Rank }> = [
  { suit: "spades", rank: "6" },
  { suit: "clubs", rank: "6" },
];

export const JOKER_COUNT = 2;
export const DECK_SIZE = 36;

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export const isRedSuit = (suit: Suit) => suit === "hearts" || suit === "diamonds";

export function cardId(card: { suit: Suit; rank: Rank }) {
  return `${card.rank}-${card.suit}`;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (EXCLUDED_CARDS.some((c) => c.suit === suit && c.rank === rank)) continue;
      deck.push({ kind: "standard", id: cardId({ suit, rank }), suit, rank });
    }
  }
  for (let i = 1; i <= JOKER_COUNT; i++) deck.push({ kind: "joker", id: `joker-${i}` });
  return deck;
}

export function cardLabel(card: Card): string {
  return card.kind === "joker" ? "Joker" : `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}
