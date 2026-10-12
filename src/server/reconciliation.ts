import { ensureInitialDealerBootstrapPrepared } from "./dealerBootstrap";
import { loadReconciledStateWithDependencies } from "./projectedStateReconciliation";
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

/** Project a fresh authenticated snapshot without repeating the same read. */
export async function loadReconciledGameState(gameId: string) {
  return loadReconciledStateWithDependencies(gameId, LIVE_REQUEST_AUTOMATIC_STEP_BUDGET, {
    ...productionDependencies, load: loadCanonicalGameState, bootstrap: async (id) => {
      const result = await ensureInitialDealerBootstrapPrepared(id);
      if (result.ok) return { ok: true };
      return { ok: false, code: result.code === "NOT_HOST" || result.code === "GAME_NOT_ACTIVE" ? "SERVICE_UNAVAILABLE" : result.code };
    },
  });
}
