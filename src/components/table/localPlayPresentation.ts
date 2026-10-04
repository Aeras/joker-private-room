import type { Card } from "@/domain/cards";
import type { SeatIndex } from "@/domain/dealing";
import type { RectLike } from "./useTableGeometry";

export type LocalPlayPresentation = {
  gameId: string;
  dealNumber: number;
  card: Card;
  cardId: string;
  actorSeat: SeatIndex;
  sourceStateVersion: number;
  acceptedStateVersion: number | null;
  geometryEpoch: number;
  releaseRect: RectLike;
  status: "submitted" | "accepted" | "rejected";
};

export function projectionContainsPendingCard(
  presentation: LocalPlayPresentation,
  currentTrick: readonly { seatIndex: number; card: Card }[],
  completedTricks: readonly { cards: readonly { seatIndex: number; card: Card }[] }[],
): boolean {
  const matches = (play: { seatIndex: number; card: Card }) =>
    play.seatIndex === presentation.actorSeat && play.card.id === presentation.cardId;
  if (currentTrick.some(matches)) return true;
  return completedTricks.some((trick) => trick.cards.some(matches));
}
