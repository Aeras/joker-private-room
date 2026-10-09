import type { PlayerGameProjection } from "@/domain/projection";
import { selectBaselineGameplayCommand } from "./baselineRuntime";
import { analyzeCompetitive, COMPETITIVE_VERSION, type CompetitiveTier } from "./competitive";

/** Catalog tier IDs remain compatible with existing games and temporary
 * takeovers. The explicit algorithm version identifies the new policy. */
export function selectCompetitiveCommand(projection: PlayerGameProjection) {
  const fallback = selectBaselineGameplayCommand(projection);
  if (!fallback) return null;
  const id = fallback.strategyId;
  const tier: CompetitiveTier =
    id === "probability-simulation-v1" ? 3 : id === "memory-inference-v1" ? 2 : 1;
  try {
    const report = analyzeCompetitive(projection, tier, fallback.command);
    return { ...fallback, command: report.command, strategyVersion: COMPETITIVE_VERSION, report };
  } catch {
    return { ...fallback, strategyVersion: COMPETITIVE_VERSION, report: null };
  }
}
