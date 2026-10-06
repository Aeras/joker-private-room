import { markPresentationCompleted, presentationWasCompleted } from "./presentationCompletion";
import { nextSeat, type SeatIndex } from "@/domain/dealing";
import type { PlayerGameProjection } from "@/domain/projection";

export const DEALER_START_CUE_MS = 350;
export const DEALER_SELECTION_STAGGER_MS = 350;
export const DEALER_SELECTION_CARD_TRAVEL_MS = 308;
export const DEALER_SELECTION_WINNER_HOLD_MS = 490;

export function dealerSelectionRecipient(firstRecipientSeat: SeatIndex, cardIndex: number): SeatIndex {
  return nextSeat(firstRecipientSeat, cardIndex % 4);
}

export function dealerSelectionPresentationKey(projection: PlayerGameProjection): string | null {
  const selection = projection.initialDealerSelection;
  if (!selection || selection.status !== "resolved") return null;
  return [
    "joker:dealer-selection-presented",
    projection.gameId,
    selection.resolvedAtStateVersion,
  ].join(":");
}

export function dealerSelectionNeedsPresentation(projection: PlayerGameProjection): boolean {
  const key = dealerSelectionPresentationKey(projection);
  if (!key || typeof window === "undefined") return false;
  return !presentationWasCompleted(key);
}

export function markDealerSelectionPresented(projection: PlayerGameProjection): void {
  const key = dealerSelectionPresentationKey(projection);
  if (!key || typeof window === "undefined") return;
  markPresentationCompleted(key);
}
