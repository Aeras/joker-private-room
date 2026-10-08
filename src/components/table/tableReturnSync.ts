import type { PlayerGameProjection } from "@/domain/projection";
import { markDealerSelectionPresented } from "./dealerSelectionPresentationModel";
import { dealPresentationStageKey, dealPresentationStorageKey } from "./dealPresentationModel";
import { markPresentationCompleted } from "./presentationCompletion";

/** An absence boundary rejects every response issued before the fresh return fetch. */
export class TableReturnSync {
  constructor(readonly routeKey = "") {}
  generation = 0;
  pending = true;
  begin() { this.generation++; this.pending = true; }
  accepts(generation: number) { return generation === this.generation; }
  complete() { this.pending = false; }
}

/** Hydrate past presentation only; never acknowledge a canonical presentation barrier. */
export function hydrateReturnedPresentation(projection: PlayerGameProjection) {
  if (projection.lifecycle !== "active") return;
  const phase = projection.progression.phase;
  if (["DEAL_SETUP", "INITIAL_DEALER_SELECTION"].includes(phase)) return;
  markDealerSelectionPresented(projection);
  const completed: ("initial" | "remaining" | "full")[] =
    phase === "NINE_CARD_TRUMP_CHOICE" || phase === "NINE_CARD_REMAINING_DEAL" ? ["initial"] :
    ["DECLARATION", "CARD_PLAY", "JOKER_DECISION", "TRICK_RESOLUTION", "DEAL_RESULT", "PHASE_RESULT"].includes(phase) ? ["initial", "remaining", "full"] : [];
  for (const stage of completed) markPresentationCompleted(dealPresentationStorageKey(dealPresentationStageKey(projection.gameId, projection.progression.dealNumber, projection.progression.dealerSeat, stage)));
}
