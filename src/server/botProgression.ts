import { MAX_SYNCHRONOUS_BOT_STEPS } from "@/domain/controller";
import { planAutomaticGameplayStep, type AutomaticStepStopReason } from "@/bots/progression";
import {
  loadCanonicalGameState,
  persistCanonicalGameState,
  type GameStateFailureCode,
  type LoadGameStateResult,
  type PersistGameStateResult,
} from "@/server/gamePersistence";
import { settleGameLifecycle, type LifecycleSettlementResult } from "@/server/gameLifecycle";
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

interface AutomaticProgressionDependencies {
  load(gameId: string): Promise<LoadGameStateResult>;
  persist(args: Parameters<typeof persistCanonicalGameState>[0]): Promise<PersistGameStateResult>;
  actionId(gameId: string, label: string): Promise<string>;
  now(): string;
  settleLifecycle?(gameId: string): Promise<LifecycleSettlementResult>;
}

const productionDependencies: AutomaticProgressionDependencies = {
  load: loadCanonicalGameState,
  persist: persistCanonicalGameState,
  actionId: stableInternalActionId,
  now: () => new Date().toISOString(),
  settleLifecycle: settleGameLifecycle,
};

function automaticCommandType(commandType: string): string {
  return `bot_${commandType}`;
}

/**
 * Persist automatic actions one-by-one through the canonical CAS primitive.
 * Before every next decision, settle any DEAL_RESULT/PHASE_RESULT boundary so
 * bot chains can continue across deals and rounds without browser authority.
 */
export async function progressAutomaticGameplayWithDependencies(
  gameId: string,
  maxSteps: number,
  dependencies: AutomaticProgressionDependencies,
): Promise<AutomaticProgressionResult> {
  if (!Number.isInteger(maxSteps) || maxSteps < 1) return { ok: false, code: "INVALID_REQUEST" };

  let committedSteps = 0;
  let staleRaces = 0;

  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    if (dependencies.settleLifecycle) {
      const settled = await dependencies.settleLifecycle(gameId);
      if (!settled.ok) return settled;
      if (settled.lifecycle === "complete") {
        return {
          ok: true,
          steps: committedSteps,
          stateVersion: settled.stateVersion,
          stopReason: "GAME_NOT_ACTIVE",
        };
      }
    }

    const loaded = await dependencies.load(gameId);
    if (!loaded.ok) return loaded;

    const plan = planAutomaticGameplayStep(loaded.canonicalState, dependencies.now());
    if (!plan.ok) {
      return {
        ok: true,
        steps: committedSteps,
        stateVersion: loaded.stateVersion,
        stopReason: plan.stopReason,
      };
    }

    const actionId = await dependencies.actionId(
      gameId,
      [
        "automatic-gameplay-v1",
        String(loaded.stateVersion),
        String(plan.actorSeat),
        plan.controller,
        plan.strategyId,
      ].join(":"),
    );

    const persisted = await dependencies.persist({
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
        : { ok: false, code: persisted.code, currentStateVersion: persisted.currentStateVersion };
    }
    if (!persisted.replayed) committedSteps += 1;
  }

  if (dependencies.settleLifecycle) {
    const settled = await dependencies.settleLifecycle(gameId);
    if (!settled.ok) return settled;
  }
  const final = await dependencies.load(gameId);
  if (!final.ok) return final;
  return {
    ok: true,
    steps: committedSteps,
    stateVersion: final.stateVersion,
    stopReason: staleRaces > 0 ? "STALE_RACE" : "STEP_BOUND",
  };
}

export async function progressAutomaticGameplay(
  gameId: string,
  maxSteps = MAX_SYNCHRONOUS_BOT_STEPS,
): Promise<AutomaticProgressionResult> {
  return progressAutomaticGameplayWithDependencies(gameId, maxSteps, productionDependencies);
}
