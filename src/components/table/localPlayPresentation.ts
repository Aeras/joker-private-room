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

export function projectionContainsPendingCardInCurrentTrick(
  presentation: LocalPlayPresentation,
  currentTrick: readonly { seatIndex: number; card: Card }[],
): boolean {
  return currentTrick.some(
    (play) => play.seatIndex === presentation.actorSeat && play.card.id === presentation.cardId,
  );
}

export function projectionContainsPendingCard(
  presentation: LocalPlayPresentation,
  currentTrick: readonly { seatIndex: number; card: Card }[],
  completedTricks: readonly { cards: readonly { seatIndex: number; card: Card }[] }[],
): boolean {
  if (projectionContainsPendingCardInCurrentTrick(presentation, currentTrick)) return true;
  return completedTricks.some((trick) =>
    trick.cards.some(
      (play) => play.seatIndex === presentation.actorSeat && play.card.id === presentation.cardId,
    ),
  );
}
