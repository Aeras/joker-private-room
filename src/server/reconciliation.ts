import {
  finalizeCanonicalGameState,
  loadCanonicalGameState,
  persistCanonicalGameState,
} from "@/server/gamePersistence";
import {
  deterministicRandomUnitsFromSeed,
  stableInternalActionId,
} from "@/server/internalDeterminism";
import {
  advanceGameUntilBlockedWithDependencies,
  type AdvanceGameResult,
  type ReconciliationDependencies,
} from "@/server/reconciliationCore";

export const LIVE_REQUEST_AUTOMATIC_STEP_BUDGET = 1;

const productionDependencies: ReconciliationDependencies = {
  load: loadCanonicalGameState,
  persist: persistCanonicalGameState,
  finalize: finalizeCanonicalGameState,
  actionId: stableInternalActionId,
  randomUnits: deterministicRandomUnitsFromSeed,
  now: () => new Date().toISOString(),
};

/**
 * Request-triggered adapter for the live table. One automatic action per request
 * prevents a projection refresh from collapsing several bot plays into one
 * canonical jump. The durable worker keeps its independent bounded batch safety.
 */
export async function advanceGameUntilBlocked(
  gameId: string,
  maxSteps = LIVE_REQUEST_AUTOMATIC_STEP_BUDGET,
): Promise<AdvanceGameResult> {
  return advanceGameUntilBlockedWithDependencies(gameId, maxSteps, productionDependencies);
}
