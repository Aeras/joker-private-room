/**
 * Game engine extension points. The authoritative engine will run server-side.
 * Rules for legal moves / trick winner / trump / Joker are NOT yet specified,
 * so only types and stubs live here.
 */
import type { Card, Suit } from "./cards";

export interface PlayedCard {
  seatIndex: number;
  card: Card;
}

export interface PublicDealHistory {
  completedTricks: { cards: PlayedCard[]; winnerSeat: number }[];
}

/**
 * Everything a single seat may legitimately know. Bots receive ONLY this.
 * Never add opponents' hidden hands here.
 */
export interface PlayerView {
  seatIndex: number;
  hand: Card[];
  cardsPerPlayer: number;
  trump: Suit | null;
  declarations: (number | null)[];
  tricksTaken: number[];
  currentTrick: PlayedCard[];
  history: PublicDealHistory;
}

/** To be implemented with the confirmed rules (server-authoritative). */
export type LegalMovesFn = (view: PlayerView) => Card[];

/** Placeholder: every card is legal. NOT the real rule. */
export const unrestrictedLegalMoves: LegalMovesFn = (view) => view.hand;
