import type { GameplayCommand } from "@/domain/gameplayCommands";
import type { ControllerType } from "@/domain/gameState";
import type { PlayerGameProjection } from "@/domain/projection";
import type { BotStrategyProfileId } from "../../supabase/functions/_shared/bot-catalog";
import { selectCompetitiveCommand } from "./competitiveRuntime";
export const TEMPORARY_CONTROLLER_STRATEGY_ID = "temporary-controller-v1" as const;
export interface AutomaticCommandSelection {
  command: GameplayCommand;
  strategyId: BotStrategyProfileId | typeof TEMPORARY_CONTROLLER_STRATEGY_ID;
  strategyVersion?: string;
  controller: Exclude<ControllerType, "human">;
}
/** Existing pinned IDs identify tiers; algorithm version is recorded separately.
 * Only a seat-safe projection crosses this strategy boundary. */
export function selectAutomaticGameplayCommand(
  projection: PlayerGameProjection,
): AutomaticCommandSelection | null {
  const selected = selectCompetitiveCommand(projection);
  if (!selected) return null;
  const { command, strategyId, strategyVersion, controller } = selected;
  return { command, strategyId, strategyVersion, controller };
}
