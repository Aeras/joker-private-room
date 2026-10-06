import { acknowledgePresentationBoundary, activateOrdinaryDealAfterPresentation, type PresentationStage } from "@/domain/dealPresentationBarrier";
import { activateNineCardDeclarationAfterPresentation, activateNineCardTrumpChoiceAfterPresentation } from "@/domain/nineCardPresentation";
import { loadCanonicalGameState, persistCanonicalGameState, type GameStateFailureCode } from "@/server/gamePersistence";
import { stableInternalActionId } from "@/server/internalDeterminism";
export type NineCardPresentationActivationResult =
  | { ok: true; gameId: string; stateVersion: number; replayed: boolean }
  | { ok: false; code: GameStateFailureCode };
/** Authenticated viewer only; scoped acknowledgement, aggregate human readiness, one CAS commit. */
export async function completeNineCardPresentation(gameId: string, dealNumber: number, stage: PresentationStage): Promise<NineCardPresentationActivationResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await loadCanonicalGameState(gameId);
    if (!loaded.ok) return { ok: false, code: loaded.code };
    const state = loaded.canonicalState;
    if (state.seats[loaded.viewerSeat]?.owner.type !== "human") return { ok: false, code: "NOT_AUTHENTICATED" };
    const phase = state.progression.phase;
    const currentStage = phase === "DEAL_PRESENTATION" ? "full" : phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS" ? "initial" : phase === "NINE_CARD_REMAINING_DEAL" ? "remaining" : null;
    if (dealNumber < state.progression.dealNumber || (dealNumber === state.progression.dealNumber && currentStage !== stage)) {
      return { ok: true, gameId, stateVersion: loaded.stateVersion, replayed: true };
    }
    if (dealNumber !== state.progression.dealNumber || currentStage !== stage) return { ok: false, code: "INVALID_REQUEST" };
    let nextState;
    try {
      const ack = acknowledgePresentationBoundary(state, loaded.viewerSeat, dealNumber, stage);
      if (ack.replayed) return { ok: true, gameId, stateVersion: loaded.stateVersion, replayed: true };
      nextState = ack.state;
      if (ack.allComplete) {
        const now = new Date().toISOString();
        nextState = stage === "full" ? activateOrdinaryDealAfterPresentation(ack.state, now) : stage === "initial" ? activateNineCardTrumpChoiceAfterPresentation(ack.state, now) : activateNineCardDeclarationAfterPresentation(ack.state, now);
        nextState.stateVersion = loaded.stateVersion + 1;
      }
    } catch { return { ok: false, code: "INVALID_CANONICAL_STATE" }; }
    const actionId = await stableInternalActionId(gameId, ["presentation-ack-v2", dealNumber, stage, loaded.viewerSeat, loaded.stateVersion].join(":"));
    const persisted = await persistCanonicalGameState({ gameId, actionId, commandType: "acknowledge_deal_presentation", expectedStateVersion: loaded.stateVersion, commandPayload: { source: "presentation_complete", dealNumber, stage, seat: loaded.viewerSeat }, newState: nextState });
    if (persisted.ok) return { ok: true, gameId, stateVersion: persisted.stateVersion, replayed: persisted.replayed };
    if (persisted.code !== "STALE_STATE" && persisted.code !== "ACTION_ID_CONFLICT") return { ok: false, code: persisted.code };
  }
  return { ok: false, code: "STALE_STATE" };
}
