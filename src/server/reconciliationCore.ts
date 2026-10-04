import { getRuleset } from "@/domain/rulesets";
import { planAutomaticGameplayStep, type AutomaticStepStopReason } from "@/bots/progression";
import { applyOverdueTimeout } from "@/domain/controller";
import { settleCanonicalLifecycle } from "@/domain/gameLifecycle";
import type { CanonicalGameState } from "@/domain/gameState";
import { randomIterator } from "@/server/internalDeterminism";

export type ReconciliationFailureCode =
  | "GAME_NOT_FOUND"
  | "GAME_STATE_NOT_INITIALIZED"
  | "GAME_ALREADY_INITIALIZED"
  | "ACTION_ID_CONFLICT"
  | "STALE_STATE"
  | "INVALID_REQUEST"
  | "INVALID_CANONICAL_STATE"
  | "FINALIZATION_REQUIRED"
  | "SERVICE_UNAVAILABLE"
  | "NOT_AUTHENTICATED";

export type ReconciliationStopReason =
  | AutomaticStepStopReason
  | "GAME_COMPLETE"
  | "STEP_BOUND"
  | "STALE_RACE";

export type ReconciliationLoadResult =
  | {
      ok: true;
      gameId: string;
      stateVersion: number;
      canonicalState: CanonicalGameState;
    }
  | { ok: false; code: ReconciliationFailureCode; stateVersion?: number };

export type ReconciliationPersistResult =
  | {
      ok: true;
      gameId: string;
      stateVersion: number;
      lifecycle: CanonicalGameState["lifecycle"];
      replayed: boolean;
    }
  | { ok: false; code: ReconciliationFailureCode; currentStateVersion?: number };

export interface ReconciliationPersistInput {
  gameId: string;
  actionId: string;
  commandType: string;
  expectedStateVersion: number;
  commandPayload: unknown;
  newState: CanonicalGameState;
}

export interface ReconciliationFinalizeInput {
  gameId: string;
  actionId: string;
  expectedStateVersion: number;
  newState: CanonicalGameState;
}

export interface ReconciliationDependencies {
  load(gameId: string): Promise<ReconciliationLoadResult>;
  persist(input: ReconciliationPersistInput): Promise<ReconciliationPersistResult>;
  finalize(input: ReconciliationFinalizeInput): Promise<ReconciliationPersistResult>;
  actionId(gameId: string, label: string): Promise<string>;
  randomUnits(seed: string, label: string, count: number): Promise<number[]>;
  now(): string;
}

export type AdvanceGameResult =
  | {
      ok: true;
      stateVersion: number;
      steps: number;
      stopReason: ReconciliationStopReason;
    }
  | { ok: false; code: ReconciliationFailureCode; currentStateVersion?: number };

function failureFromPersist(result: Extract<ReconciliationPersistResult, { ok: false }>): AdvanceGameResult {
  return result.currentStateVersion == null
    ? { ok: false, code: result.code }
    : { ok: false, code: result.code, currentStateVersion: result.currentStateVersion };
}

function lifecycleCommandType(phase: string): string {
  return phase === "PHASE_RESULT" ? "settle_round" : "settle_deal";
}

async function lifecycleTransition(
  gameId: string,
  loaded: Extract<ReconciliationLoadResult, { ok: true }>,
  dependencies: ReconciliationDependencies,
): Promise<
  | { kind: "none" }
  | { kind: "stale" }
  | { kind: "committed"; replayed: boolean }
  | { kind: "complete"; replayed: boolean }
  | { kind: "failure"; result: AdvanceGameResult }
> {
  const state = loaded.canonicalState;
  if (state.progression.phase !== "DEAL_RESULT" && state.progression.phase !== "PHASE_RESULT") {
    return { kind: "none" };
  }

  const entropySeed = state.serverEntropySeed;
  if (!entropySeed) return { kind: "failure", result: { ok: false, code: "INVALID_CANONICAL_STATE" } };

  const finalRoundBoundary = state.progression.phase === "PHASE_RESULT" && state.progression.dealNumber === 24;
  let nextDealRandom: (() => number) | undefined;
  if (!finalRoundBoundary) {
    const nextDealNumber = state.progression.dealNumber + 1;
    const units = await dependencies.randomUnits(entropySeed, `deal-${nextDealNumber}-shuffle-v1`, getRuleset(state.rulesetId, state.rulesVersion).deckSize - 1);
    nextDealRandom = randomIterator(units);
  }

  const transition = settleCanonicalLifecycle({
    state,
    ...(nextDealRandom ? { nextDealRandom } : {}),
    serverNow: dependencies.now(),
  });
  if (!transition.ok) return { kind: "failure", result: { ok: false, code: "INVALID_CANONICAL_STATE" } };
  if (!transition.changed) return { kind: "none" };

  const phase = state.progression.phase;
  const actionId = await dependencies.actionId(
    gameId,
    `lifecycle-v1:${loaded.stateVersion}:${state.progression.dealNumber}:${phase}`,
  );

  const persisted = transition.state.lifecycle === "complete"
    ? await dependencies.finalize({
        gameId,
        actionId,
        expectedStateVersion: loaded.stateVersion,
        newState: transition.state,
      })
    : await dependencies.persist({
        gameId,
        actionId,
        commandType: lifecycleCommandType(phase),
        expectedStateVersion: loaded.stateVersion,
        commandPayload: {
          source: "canonical_lifecycle",
          dealNumber: state.progression.dealNumber,
          round: state.progression.round,
          fromPhase: phase,
          transition: transition.transition,
        },
        newState: transition.state,
      });

  if (!persisted.ok) {
    if (persisted.code === "STALE_STATE") return { kind: "stale" };
    return { kind: "failure", result: failureFromPersist(persisted) };
  }
  return transition.state.lifecycle === "complete"
    ? { kind: "complete", replayed: persisted.replayed }
    : { kind: "committed", replayed: persisted.replayed };
}

/**
 * The one canonical reconciliation loop used by request-driven and scheduled
 * progression. It owns orchestration only; every rules decision still comes
 * from the existing controller, lifecycle and gameplay/bot modules.
 */
export async function advanceGameUntilBlockedWithDependencies(
  gameId: string,
  maxSteps: number,
  dependencies: ReconciliationDependencies,
): Promise<AdvanceGameResult> {
  if (!Number.isInteger(maxSteps) || maxSteps < 1) return { ok: false, code: "INVALID_REQUEST" };

  let committedSteps = 0;
  let staleRaces = 0;

  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    const loaded = await dependencies.load(gameId);
    if (!loaded.ok) {
      return loaded.stateVersion == null
        ? { ok: false, code: loaded.code }
        : { ok: false, code: loaded.code, currentStateVersion: loaded.stateVersion };
    }
    const state = loaded.canonicalState;
    try { getRuleset(state.rulesetId, state.rulesVersion); } catch { return { ok: false, code: "INVALID_CANONICAL_STATE" }; }

    if (state.lifecycle === "complete") {
      return { ok: true, stateVersion: loaded.stateVersion, steps: committedSteps, stopReason: "GAME_COMPLETE" };
    }

    const serverNow = dependencies.now();
    const timeout = applyOverdueTimeout(state, serverNow);
    if (!timeout.ok) return { ok: false, code: "INVALID_CANONICAL_STATE" };
    if (timeout.changed) {
      const actionId = await dependencies.actionId(
        gameId,
        `timeout-v1:${loaded.stateVersion}:${state.progression.currentActorSeat ?? "none"}:${state.timing.currentHumanDeadline ?? "none"}`,
      );
      const persisted = await dependencies.persist({
        gameId,
        actionId,
        commandType: "system_timeout_takeover",
        expectedStateVersion: loaded.stateVersion,
        commandPayload: {
          deadline: state.timing.currentHumanDeadline,
          actorSeat: state.progression.currentActorSeat,
        },
        newState: timeout.state,
      });
      if (!persisted.ok) {
        if (persisted.code === "STALE_STATE") {
          staleRaces += 1;
          continue;
        }
        return failureFromPersist(persisted);
      }
      if (!persisted.replayed) committedSteps += 1;
      continue;
    }

    const lifecycle = await lifecycleTransition(gameId, loaded, dependencies);
    if (lifecycle.kind === "failure") return lifecycle.result;
    if (lifecycle.kind === "stale") {
      staleRaces += 1;
      continue;
    }
    if (lifecycle.kind === "committed") {
      if (!lifecycle.replayed) committedSteps += 1;
      continue;
    }
    if (lifecycle.kind === "complete") {
      if (!lifecycle.replayed) committedSteps += 1;
      const final = await dependencies.load(gameId);
      if (final.ok) {
        return { ok: true, stateVersion: final.stateVersion, steps: committedSteps, stopReason: "GAME_COMPLETE" };
      }
      return final.stateVersion == null
        ? { ok: false, code: final.code }
        : { ok: false, code: final.code, currentStateVersion: final.stateVersion };
    }

    const plan = planAutomaticGameplayStep(state, serverNow);
    if (!plan.ok) {
      return {
        ok: true,
        stateVersion: loaded.stateVersion,
        steps: committedSteps,
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
      commandType: `bot_${plan.command.type}`,
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
      return failureFromPersist(persisted);
    }
    if (!persisted.replayed) committedSteps += 1;
  }

  const final = await dependencies.load(gameId);
  if (!final.ok) {
    return final.stateVersion == null
      ? { ok: false, code: final.code }
      : { ok: false, code: final.code, currentStateVersion: final.stateVersion };
  }
  return {
    ok: true,
    stateVersion: final.stateVersion,
    steps: committedSteps,
    stopReason: staleRaces > 0 ? "STALE_RACE" : "STEP_BOUND",
  };
}
