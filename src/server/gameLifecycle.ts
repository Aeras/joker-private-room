import { settleCanonicalLifecycle } from "@/domain/gameLifecycle";
import {
  finalizeCanonicalGameState,
  loadCanonicalGameState,
  persistCanonicalGameState,
  type GameStateFailureCode,
  type LoadGameStateResult,
} from "@/server/gamePersistence";
import {
  deterministicRandomUnitsFromSeed,
  randomIterator,
  stableInternalActionId,
} from "@/server/internalDeterminism";

export type LifecycleSettlementResult =
  | { ok: true; stateVersion: number; lifecycle: "starting" | "active" | "complete"; steps: number }
  | { ok: false; code: GameStateFailureCode; currentStateVersion?: number };

interface LifecycleDependencies {
  load(gameId: string): Promise<LoadGameStateResult>;
  persist(args: Parameters<typeof persistCanonicalGameState>[0]): ReturnType<typeof persistCanonicalGameState>;
  finalize(args: Parameters<typeof finalizeCanonicalGameState>[0]): ReturnType<typeof finalizeCanonicalGameState>;
  actionId(gameId: string, label: string): Promise<string>;
  randomUnits(seed: string, label: string, count: number): Promise<number[]>;
  now(): string;
}

const productionDependencies: LifecycleDependencies = {
  load: loadCanonicalGameState,
  persist: persistCanonicalGameState,
  finalize: finalizeCanonicalGameState,
  actionId: stableInternalActionId,
  randomUnits: deterministicRandomUnitsFromSeed,
  now: () => new Date().toISOString(),
};

function lifecycleCommandType(phase: string): string {
  return phase === "PHASE_RESULT" ? "settle_round" : "settle_deal";
}

/**
 * Settles DEAL_RESULT/PHASE_RESULT boundaries one CAS at a time. The final
 * GAME_COMPLETE transition uses the dedicated atomic finalization transaction.
 */
export async function settleGameLifecycleWithDependencies(
  gameId: string,
  dependencies: LifecycleDependencies,
  maxSteps = 3,
): Promise<LifecycleSettlementResult> {
  let settledSteps = 0;

  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    const loaded = await dependencies.load(gameId);
    if (!loaded.ok) return loaded;
    const state = loaded.canonicalState;

    if (state.lifecycle === "complete" || (state.progression.phase !== "DEAL_RESULT" && state.progression.phase !== "PHASE_RESULT")) {
      return { ok: true, stateVersion: loaded.stateVersion, lifecycle: state.lifecycle, steps: settledSteps };
    }
    const entropySeed = state.serverEntropySeed;
    if (!entropySeed) return { ok: false, code: "INVALID_CANONICAL_STATE" };

    const finalRoundBoundary = state.progression.phase === "PHASE_RESULT" && state.progression.dealNumber === 24;
    let nextDealRandom: (() => number) | undefined;
    if (!finalRoundBoundary) {
      const nextDealNumber = state.progression.dealNumber + 1;
      const units = await dependencies.randomUnits(entropySeed, `deal-${nextDealNumber}-shuffle-v1`, 35);
      nextDealRandom = randomIterator(units);
    }

    const transition = settleCanonicalLifecycle({
      state,
      ...(nextDealRandom ? { nextDealRandom } : {}),
      serverNow: dependencies.now(),
    });
    if (!transition.ok) return { ok: false, code: "INVALID_CANONICAL_STATE" };
    if (!transition.changed) {
      return { ok: true, stateVersion: loaded.stateVersion, lifecycle: state.lifecycle, steps: settledSteps };
    }

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
      if (persisted.code === "STALE_STATE") continue;
      return persisted.currentStateVersion == null
        ? { ok: false, code: persisted.code }
        : { ok: false, code: persisted.code, currentStateVersion: persisted.currentStateVersion };
    }
    if (!persisted.replayed) settledSteps += 1;
  }

  const final = await dependencies.load(gameId);
  if (!final.ok) return final;
  return {
    ok: true,
    stateVersion: final.stateVersion,
    lifecycle: final.canonicalState.lifecycle,
    steps: settledSteps,
  };
}

export async function settleGameLifecycle(gameId: string): Promise<LifecycleSettlementResult> {
  return settleGameLifecycleWithDependencies(gameId, productionDependencies);
}
