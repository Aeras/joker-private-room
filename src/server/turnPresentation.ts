import { acknowledgePlayedEvent } from "@/domain/turnPresentation";
import { loadCanonicalGameState, persistCanonicalGameState } from "./gamePersistence";
import { stableInternalActionId } from "./internalDeterminism";

/** Seat comes from the authenticated load; token cannot acknowledge a later event. */
export async function completeTurnPresentation(gameId: string, token: number) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await loadCanonicalGameState(gameId);
    if (!loaded.ok) return loaded;
    if (loaded.canonicalState.seats[loaded.viewerSeat].owner.type !== "human")
      return { ok: false, code: "NOT_AUTHENTICATED" } as const;
    let ack;
    try {
      ack = acknowledgePlayedEvent(
        loaded.canonicalState,
        loaded.viewerSeat,
        token,
        new Date().toISOString(),
      );
    } catch {
      return { ok: false, code: "INVALID_REQUEST" } as const;
    }
    if (ack.replayed) return { ok: true } as const;
    const persisted = await persistCanonicalGameState({
      gameId,
      actionId: await stableInternalActionId(
        gameId,
        `turn-presentation:${token}:${loaded.viewerSeat}:${loaded.stateVersion}`,
      ),
      commandType: "acknowledge_turn_presentation",
      expectedStateVersion: loaded.stateVersion,
      commandPayload: { token, seat: loaded.viewerSeat },
      newState: ack.state,
    });
    if (persisted.ok) return { ok: true } as const;
    if (persisted.code !== "STALE_STATE" && persisted.code !== "ACTION_ID_CONFLICT")
      return persisted;
  }
  return { ok: false, code: "STALE_STATE" } as const;
}
