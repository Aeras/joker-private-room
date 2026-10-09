import type { Card } from "@/domain/cards";
import type { JokerSemantic } from "@/domain/engine";
import type { SeatIndex } from "@/domain/dealing";
import type { CardReleaseRect } from "./useTableGeometry";

export type LocalPlayPresentation = {
  gameId: string;
  dealNumber: number;
  card: Card;
  cardId: string;
  actorSeat: SeatIndex;
  sourceStateVersion: number;
  acceptedStateVersion: number | null;
  geometryEpoch: number;
  releaseRect: CardReleaseRect;
  status: "submitted" | "accepted" | "rejected";
  jokerSemantic?: JokerSemantic;
};

function sameSemantic(actual: JokerSemantic | undefined, expected: JokerSemantic): boolean {
  return actual?.context === expected.context && actual.mode === expected.mode && (expected.context !== "LEAD" || (actual.context === "LEAD" && actual.requestedSuit === expected.requestedSuit));
}

export function projectionContainsPendingCardInCurrentTrick(
  presentation: LocalPlayPresentation,
  currentTrick: readonly { seatIndex: number; card: Card; joker?: JokerSemantic }[],
): boolean {
  return currentTrick.some(
    (play) => play.seatIndex === presentation.actorSeat && play.card.id === presentation.cardId && (!presentation.jokerSemantic || sameSemantic(play.joker, presentation.jokerSemantic)),
  );
}

export function projectionContainsPendingCard(
  presentation: LocalPlayPresentation,
  currentTrick: readonly { seatIndex: number; card: Card; joker?: JokerSemantic }[],
  completedTricks: readonly { cards: readonly { seatIndex: number; card: Card; joker?: JokerSemantic }[] }[],
): boolean {
  if (projectionContainsPendingCardInCurrentTrick(presentation, currentTrick)) return true;
  return completedTricks.some((trick) =>
    projectionContainsPendingCardInCurrentTrick(presentation, trick.cards),
  );
}
