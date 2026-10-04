import { MAX_SYNCHRONOUS_BOT_STEPS } from "@/domain/controller";
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

const productionDependencies: ReconciliationDependencies = {
  load: loadCanonicalGameState,
  persist: persistCanonicalGameState,
  finalize: finalizeCanonicalGameState,
  actionId: stableInternalActionId,
  randomUnits: deterministicRandomUnitsFromSeed,
  now: () => new Date().toISOString(),
};

/** Request-triggered adapter for the same core used by the durable worker. */
export async function advanceGameUntilBlocked(
  gameId: string,
  maxSteps = MAX_SYNCHRONOUS_BOT_STEPS,
): Promise<AdvanceGameResult> {
  return advanceGameUntilBlockedWithDependencies(gameId, maxSteps, productionDependencies);
}
