/** DURAK-only rules. Never import JOKER game state, cards or scoring here. */
export type DurakVariant = "podkidnoy" | "perevodnoy";
export type DurakSuit = "clubs" | "diamonds" | "hearts" | "spades";
export type DurakRank = 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type DurakCard = { suit: DurakSuit; rank: DurakRank };
export const DURAK_SUITS: readonly DurakSuit[] = ["clubs", "diamonds", "hearts", "spades"];
export const DURAK_RANKS: readonly DurakRank[] = [6, 7, 8, 9, 10, 11, 12, 13, 14];
export const PLAYER_COUNTS = [2, 3, 4, 5, 6] as const;
export const VARIANT_NAMES: Record<DurakVariant,string> = {
  podkidnoy: "Κλασικό Ντουράκ (Подкидной)",
  perevodnoy: "Ντουράκ με μεταφορά (Переводной)",
};
/** First attack of a match is capped at five; subsequent attacks by defender's starting hand count. */
export function maximumAttackCards(defenderStartingHand: number, isFirstAttack: boolean): number {
  if (!Number.isSafeInteger(defenderStartingHand) || defenderStartingHand < 0) throw new Error("Invalid hand count");
  return isFirstAttack ? Math.min(5, defenderStartingHand) : defenderStartingHand;
}
export function beats(attack: DurakCard, defense: DurakCard, trump: DurakSuit): boolean {
  if (attack.suit === defense.suit) return defense.rank > attack.rank;
  return defense.suit === trump && attack.suit !== trump;
}
export function canThrowIn(card: DurakCard, cardsOnTable: readonly DurakCard[]): boolean {
  return cardsOnTable.some(other => other.rank === card.rank);
}
export function canTransfer(
  variant: DurakVariant,
  transferCard: DurakCard,
  attackingCards: readonly DurakCard[],
  hasDefendedAnyCard: boolean,
  nextDefenderHandCount: number,
  isFirstAttack: boolean,
): boolean {
  if (variant !== "perevodnoy" || hasDefendedAnyCard || attackingCards.length === 0) return false;
  if (!attackingCards.every(card => card.rank === transferCard.rank)) return false;
  return attackingCards.length + 1 <= maximumAttackCards(nextDefenderHandCount, isFirstAttack);
}
export function createDeck(): DurakCard[] {
  return DURAK_SUITS.flatMap(suit => DURAK_RANKS.map(rank => ({ suit, rank })));
}
/** Presentation seats only: the local player is always at the bottom. */
export const DURAK_SEAT_POSITIONS: Record<number, readonly string[]> = {
  2: ["bottom", "top"],
  3: ["bottom", "left", "right"],
  4: ["bottom", "left", "top", "right"],
  5: ["bottom", "left", "top-left", "top-right", "right"],
  6: ["bottom", "left", "top-left", "top-center", "top-right", "right"],
};
