import { stableJson } from "@/lib/stableFingerprint";
import {
  LAB_ENGINE_VERSION,
  compactLabResult,
  configForJobGame,
  validateLabJobConfig,
} from "./jobModel";
import {
  advanceSimulationCheckpoint,
  createSimulationCheckpoint,
  resultOfCheckpoint,
  SimulationFailure,
  type SimulationCheckpoint,
} from "./simulation.server";
export interface LabClaim {
  id: string;
  lease_token: string;
  completed_games: number;
  engine_version: string;
  config: unknown;
  checkpoint: SimulationCheckpoint | null;
}
export interface LabWorkerRepository {
  claim(token: string): Promise<LabClaim | null>;
  commit(input: {
    jobId: string;
    leaseToken: string;
    gameIndex: number;
    checkpoint: SimulationCheckpoint | null;
    result: ReturnType<typeof compactLabResult> | null;
    error: string | null;
  }): Promise<boolean>;
}
/** Exactly one bounded chunk per invocation. The DB owns progress, fencing,
 * cancellation and next invocation dispatch. No browser or waitUntil loop. */
export async function runLabWorkerChunk(repository: LabWorkerRepository, token: string) {
  const claim = await repository.claim(token);
  if (!claim) return { claimed: false, committed: false };
  const input = {
    jobId: claim.id,
    leaseToken: claim.lease_token,
    gameIndex: claim.completed_games,
  };
  try {
    if (claim.engine_version !== LAB_ENGINE_VERSION) throw Error("ENGINE_VERSION_MISMATCH");
    const config = configForJobGame(validateLabJobConfig(claim.config), claim.completed_games);
    const initial = claim.checkpoint ?? createSimulationCheckpoint(config);
    if (stableJson(initial.config) !== stableJson(config))
      throw Error("CHECKPOINT_CONFIG_MISMATCH");
    const next = advanceSimulationCheckpoint(initial, {}, { maxSteps: 32, maxMs: 500 });
    const complete = next.state.lifecycle === "complete";
    const committed = await repository.commit({
      ...input,
      checkpoint: complete ? null : next,
      result: complete ? compactLabResult(resultOfCheckpoint(next)) : null,
      error: null,
    });
    return { claimed: true, committed };
  } catch (error) {
    // Stable bounded codes; never logs hidden simulated hands or tokens.
    const code =
      error instanceof SimulationFailure
        ? error.code
        : error instanceof Error &&
            ["ENGINE_VERSION_MISMATCH", "CHECKPOINT_CONFIG_MISMATCH"].includes(error.message)
          ? error.message
          : "SIMULATION_FAILURE";
    return {
      claimed: true,
      committed: await repository.commit({ ...input, checkpoint: null, result: null, error: code }),
    };
  }
}
