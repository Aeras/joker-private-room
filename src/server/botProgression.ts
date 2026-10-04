import { MAX_SYNCHRONOUS_BOT_STEPS } from "@/domain/controller";
import { planAutomaticGameplayStep, type AutomaticStepStopReason } from "@/bots/progression";
import {
  loadCanonicalGameState,
  persistCanonicalGameState,
  type GameStateFailureCode,
} from "@/server/gamePersistence";
import { stableInternalActionId } from "@/server/internalDeterminism";

export type AutomaticProgressionStopReason =
  | AutomaticStepStopReason
  | "STEP_BOUND"
  | "STALE_RACE";

export type AutomaticProgressionResult =
  | {
      ok: true;
      steps: number;
      stateVersion: number;
      stopReason: AutomaticProgressionStopReason;
    }
  | { ok: false; code: GameStateFailureCode; currentStateVersion?: number };

function serverNow(): string {
  return new Date().toISOString();
}

function automaticCommandType(commandType: string): string {
  return `bot_${commandType}`;
}

/**
 * Persist automatic actions one-by-one through the canonical CAS primitive.
 * A stale write means another authoritative command won the race; reload and
 * continue from that committed truth instead of rolling anything back.
 */
export async function progressAutomaticGameplay(
  gameId: string,
  maxSteps = MAX_SYNCHRONOUS_BOT_STEPS,
): Promise<AutomaticProgressionResult> {
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    return { ok: false, code: "INVALID_REQUEST" };
  }

  let committedSteps = 0;
  let staleRaces = 0;

  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    const loaded = await loadCanonicalGameState(gameId);
    if (!loaded.ok) return loaded;

    const plan = planAutomaticGameplayStep(loaded.canonicalState, serverNow());
    if (!plan.ok) {
      return {
        ok: true,
        steps: committedSteps,
        stateVersion: loaded.stateVersion,
        stopReason: plan.stopReason,
      };
    }

    const actionId = await stableInternalActionId(
      gameId,
      [
        "automatic-gameplay-v1",
        String(loaded.stateVersion),
        String(plan.actorSeat),
        plan.controller,
        plan.strategyId,
      ].join(":"),
    );

    const persisted = await persistCanonicalGameState({
      gameId,
      actionId,
      commandType: automaticCommandType(plan.command.type),
      expectedStateVersion: loaded.stateVersion,
      commandPayload: {
        source: "automatic_controller",
        actorSeat: plan.actorSeat,
        controller: plan.controller,
        strategyId: plan.strategyId,
        command: plan.command,
      },
      newState: plan.nextState,
    });

    if (!persisted.ok) {
      if (persisted.code === "STALE_STATE") {
        staleRaces += 1;
        continue;
      }
      return persisted.currentStateVersion == null
        ? { ok: false, code: persisted.code }
        : {
            ok: false,
            code: persisted.code,
            currentStateVersion: persisted.currentStateVersion,
          };
    }

    if (!persisted.replayed) committedSteps += 1;
  }

  const final = await loadCanonicalGameState(gameId);
  if (!final.ok) return final;
  return {
    ok: true,
    steps: committedSteps,
    stateVersion: final.stateVersion,
    stopReason: staleRaces > 0 ? "STALE_RACE" : "STEP_BOUND",
  };
}
