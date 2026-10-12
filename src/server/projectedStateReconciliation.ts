import type { LoadGameStateResult } from "./gamePersistence";
import { advanceGameUntilBlockedWithDependencies, type ReconciliationDependencies } from "./reconciliationCore";

export type ProjectedStateDependencies = Omit<ReconciliationDependencies, "load"> & {
  load(gameId: string): Promise<LoadGameStateResult>;
  bootstrap(gameId: string): Promise<{ ok: true } | { ok: false; code: Extract<LoadGameStateResult, { ok: false }>["code"] }>;
};

/** Reuse authenticated reads within this request only. Every write/race still
 * follows the canonical reconciler and a fresh authenticated final read. */
export async function loadReconciledStateWithDependencies(
  gameId: string,
  maxSteps: number,
  dependencies: ProjectedStateDependencies,
): Promise<LoadGameStateResult> {
  let initial = await dependencies.load(gameId);
  if (!initial.ok && initial.code === "GAME_STATE_NOT_INITIALIZED") {
    const prepared = await dependencies.bootstrap(gameId);
    if (!prepared.ok) return prepared;
    initial = await dependencies.load(gameId);
  }
  if (!initial.ok) return initial;
  let latest: LoadGameStateResult = initial;
  let firstRead = true;
  const result = await advanceGameUntilBlockedWithDependencies(gameId, maxSteps, {
    ...dependencies,
    load: async (id) => {
      if (firstRead) { firstRead = false; return initial; }
      latest = await dependencies.load(id);
      return latest;
    },
  });
  if (!result.ok) return result.currentStateVersion == null
    ? { ok: false, code: result.code }
    : { ok: false, code: result.code, stateVersion: result.currentStateVersion };
  if (!latest.ok) return latest;
  if (latest.stateVersion !== result.stateVersion) return { ok: false, code: "SERVICE_UNAVAILABLE" };
  return latest;
}
