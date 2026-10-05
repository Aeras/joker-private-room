import {
  activateNineCardDeclarationAfterPresentation,
  activateNineCardTrumpChoiceAfterPresentation,
} from "@/domain/nineCardPresentation";
import {
  loadCanonicalGameState,
  persistCanonicalGameState,
  type GameStateFailureCode,
} from "@/server/gamePersistence";
import { stableInternalActionId } from "@/server/internalDeterminism";

export type NineCardPresentationActivationResult =
  | { ok: true; gameId: string; stateVersion: number; replayed: boolean }
  | { ok: false; code: GameStateFailureCode };

function isAlreadyReleasedPhase(phase: string): boolean {
  return phase === "NINE_CARD_TRUMP_CHOICE" || phase === "DECLARATION";
}

/**
 * Releases exactly one explicit nine-card presentation barrier. The transition
 * is idempotent through a stable action ID; it does not run automatic gameplay
 * afterward, so a bot trump choice/declaration remains visibly staged until a
 * subsequent normal reconciliation turn.
 */
export async function completeNineCardPresentation(
  gameId: string,
): Promise<NineCardPresentationActivationResult> {
  const loaded = await loadCanonicalGameState(gameId);
  if (!loaded.ok) return { ok: false, code: loaded.code };

  const state = loaded.canonicalState;
  const phase = state.progression.phase;
  const dealNumber = state.progression.dealNumber;

  if (isAlreadyReleasedPhase(phase)) {
    return { ok: true, gameId, stateVersion: loaded.stateVersion, replayed: true };
  }

  let nextState;
  let stage: "initial" | "remaining";
  try {
    if (phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS") {
      stage = "initial";
      nextState = activateNineCardTrumpChoiceAfterPresentation(state, new Date().toISOString());
    } else if (phase === "NINE_CARD_REMAINING_DEAL") {
      stage = "remaining";
      nextState = activateNineCardDeclarationAfterPresentation(state, new Date().toISOString());
    } else {
      return { ok: false, code: "GAME_NOT_ACTIVE" };
    }
  } catch {
    return { ok: false, code: "INVALID_CANONICAL_STATE" };
  }

  const actionId = await stableInternalActionId(
    gameId,
    `nine-card-presentation-v1:${dealNumber}:${stage}`,
  );
  const persisted = await persistCanonicalGameState({
    gameId,
    actionId,
    commandType: stage === "initial"
      ? "activate_nine_card_trump_choice"
      : "activate_nine_card_declaration",
    expectedStateVersion: loaded.stateVersion,
    commandPayload: { source: "presentation_complete", dealNumber, stage },
    newState: nextState,
  });

  if (!persisted.ok) {
    if (persisted.code === "STALE_STATE" || persisted.code === "ACTION_ID_CONFLICT") {
      const winner = await loadCanonicalGameState(gameId);
      if (winner.ok) {
        const expectedPhase = stage === "initial" ? "NINE_CARD_TRUMP_CHOICE" : "DECLARATION";
        if (winner.canonicalState.progression.dealNumber === dealNumber && winner.canonicalState.progression.phase === expectedPhase) {
          return { ok: true, gameId, stateVersion: winner.stateVersion, replayed: true };
        }
      }
    }
    return { ok: false, code: persisted.code };
  }

  return { ok: true, gameId, stateVersion: persisted.stateVersion, replayed: persisted.replayed };
}
