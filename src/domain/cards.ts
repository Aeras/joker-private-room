/** Canonical 36-card model for JOKER. */

export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export type Rank = (typeof RANKS)[number];

export const RANK_VALUE: Record<Rank, number> = Object.fromEntries(
  RANKS.map((rank, index) => [rank, index]),
) as Record<Rank, number>;

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

export type DeckProfile = "popular36" | "classic38";

export function createDeck(profile: DeckProfile = "popular36"): Card[] {
  if (profile !== "popular36" && profile !== "classic38") throw new Error("Unknown deck profile");
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (profile === "popular36" && EXCLUDED_CARDS.some((c) => c.suit === suit && c.rank === rank)) continue;
      deck.push({ kind: "standard", id: cardId({ suit, rank }), suit, rank });
    }
  }
  for (let i = 1; i <= JOKER_COUNT; i += 1) {
    deck.push({ kind: "joker", id: `joker-${i}` });
  }
  return deck;
}

export function compareRanks(a: Rank, b: Rank): number {
  return RANK_VALUE[a] - RANK_VALUE[b];
}

/**
 * Pure Fisher-Yates shuffle. Production code injects a server-side RNG;
 * deterministic tests inject a seeded RNG.
 */
export function shuffleCards(cards: readonly Card[], random: () => number): Card[] {
  const result = cards.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new Error("RNG must return a finite value in [0, 1)");
    }
    const j = Math.floor(sample * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function cardLabel(card: Card): string {
  return card.kind === "joker" ? "Joker" : `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}
