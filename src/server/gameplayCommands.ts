import { applyGameplayCommand, type GameplayCommand, type GameplayCommandFailureCode } from "@/domain/gameplayCommands";
import { resolveOverdueTimeoutBeforeRead } from "@/server/gameControl";
import {
  persistCanonicalGameState,
  type GameStateFailureCode,
} from "@/server/gamePersistence";

export type SubmitGameplayCommandFailureCode = GameStateFailureCode | GameplayCommandFailureCode;

export type SubmitGameplayCommandResult =
  | { ok: true; stateVersion: number; replayed: boolean }
  | { ok: false; code: SubmitGameplayCommandFailureCode; currentStateVersion?: number };

function commandType(command: GameplayCommand): string {
  switch (command.type) {
    case "declare":
      return "declare";
    case "choose_trump":
      return "choose_trump";
    case "play_card":
      return "play_card";
    case "choose_joker_semantic":
      return "choose_joker_semantic";
  }
}

/**
 * Authenticated human command boundary. Identity/seat comes exclusively from
 * the server-side game-state load. Domain legality is evaluated by the same
 * pure dispatcher used by future permanent/temporary bot execution.
 */
export async function submitHumanGameplayCommand(args: {
  gameId: string;
  actionId: string;
  expectedStateVersion: number;
  command: GameplayCommand;
}): Promise<SubmitGameplayCommandResult> {
  const loaded = await resolveOverdueTimeoutBeforeRead(args.gameId);
  if (!loaded.ok) return { ok: false, code: loaded.code };
  if (loaded.stateVersion !== args.expectedStateVersion) {
    return { ok: false, code: "STALE_STATE", currentStateVersion: loaded.stateVersion };
  }

  const transition = applyGameplayCommand({
    state: loaded.canonicalState,
    seat: loaded.viewerSeat,
    command: args.command,
    serverNow: new Date().toISOString(),
    expectedController: "human",
  });
  if (!transition.ok) return transition;

  const persisted = await persistCanonicalGameState({
    gameId: args.gameId,
    actionId: args.actionId,
    commandType: commandType(args.command),
    expectedStateVersion: args.expectedStateVersion,
    commandPayload: args.command,
    newState: transition.state,
  });

  if (!persisted.ok) {
    return persisted.currentStateVersion == null
      ? { ok: false, code: persisted.code }
      : {
          ok: false,
          code: persisted.code,
          currentStateVersion: persisted.currentStateVersion,
        };
  }

  return {
    ok: true,
    stateVersion: persisted.stateVersion,
    replayed: persisted.replayed,
  };
}
