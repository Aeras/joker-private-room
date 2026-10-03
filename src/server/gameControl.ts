import type { SeatIndex } from "@/domain/dealing";
import { applyOverdueTimeout, applyReclaimControl } from "@/domain/controller";
import {
  loadCanonicalGameState,
  persistCanonicalGameState,
  type GameStateFailureCode,
  type LoadGameStateResult,
} from "@/server/gamePersistence";

export type GameControlFailureCode = GameStateFailureCode | "RECLAIM_NOT_AVAILABLE";

export type ReclaimControlResult =
  | { ok: true; stateVersion: number; replayed: boolean }
  | { ok: false; code: GameControlFailureCode; currentStateVersion?: number };

function serverNow(): string {
  return new Date().toISOString();
}

/**
 * Every authoritative read path may call this before projection. If the human
 * deadline is overdue, exactly one CAS winner transfers controller to the
 * temporary bot. A concurrent winner is observed by reloading the canonical state.
 */
export async function resolveOverdueTimeoutBeforeRead(gameId: string): Promise<LoadGameStateResult> {
  const loaded = await loadCanonicalGameState(gameId);
  if (!loaded.ok) return loaded;

  const now = serverNow();
  const transition = applyOverdueTimeout(loaded.canonicalState, now);
  if (!transition.ok || !transition.changed) return loaded;

  const persisted = await persistCanonicalGameState({
    gameId,
    actionId: crypto.randomUUID(),
    commandType: "system_timeout_takeover",
    expectedStateVersion: loaded.stateVersion,
    commandPayload: {
      deadline: loaded.canonicalState.timing.currentHumanDeadline,
      actorSeat: loaded.canonicalState.progression.currentActorSeat,
    },
    newState: transition.state,
  });

  if (!persisted.ok && persisted.code !== "STALE_STATE") {
    return { ok: false, code: persisted.code };
  }
  return loadCanonicalGameState(gameId);
}

/** Reclaim identity is always the authenticated viewer seat returned by the DB. */
export async function reclaimGameControl(args: {
  gameId: string;
  actionId: string;
  expectedStateVersion: number;
}): Promise<ReclaimControlResult> {
  const loaded = await loadCanonicalGameState(args.gameId);
  if (!loaded.ok) return { ok: false, code: loaded.code };
  if (loaded.stateVersion !== args.expectedStateVersion) {
    return { ok: false, code: "STALE_STATE", currentStateVersion: loaded.stateVersion };
  }

  const seat = loaded.viewerSeat as SeatIndex;
  const transition = applyReclaimControl(loaded.canonicalState, seat, serverNow());
  if (!transition.ok) return { ok: false, code: transition.code };
  if (!transition.changed) return { ok: false, code: "RECLAIM_NOT_AVAILABLE" };

  const persisted = await persistCanonicalGameState({
    gameId: args.gameId,
    actionId: args.actionId,
    commandType: "reclaim_control",
    expectedStateVersion: args.expectedStateVersion,
    commandPayload: { type: "reclaim_control" },
    newState: transition.state,
  });

  if (!persisted.ok) {
    return {
      ok: false,
      code: persisted.code,
      currentStateVersion: persisted.currentStateVersion,
    };
  }
  return { ok: true, stateVersion: persisted.stateVersion, replayed: persisted.replayed };
}
