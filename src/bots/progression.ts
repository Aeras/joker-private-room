import { applyGameplayCommand, type GameplayCommand } from "@/domain/gameplayCommands";
import type { CanonicalGameState } from "@/domain/gameState";
import { projectGameForSeat } from "@/domain/projection";
import { selectAutomaticGameplayCommand } from "./runtime";

export type AutomaticStepStopReason =
  | "PRESENTATION_BARRIER"
  | "GAME_NOT_ACTIVE"
  | "NO_ACTOR"
  | "HUMAN_INPUT"
  | "NO_LEGAL_ACTION"
  | "INVALID_AUTOMATIC_STATE";

export type AutomaticStepPlan =
  | {
      ok: true;
      command: GameplayCommand;
      strategyId: string;
      controller: "permanent_bot" | "temporary_bot";
      actorSeat: 0 | 1 | 2 | 3;
      nextState: CanonicalGameState;
    }
  | { ok: false; stopReason: AutomaticStepStopReason };

/**
 * One automatic action only. Strategy receives a seat projection, while the
 * canonical dispatcher independently validates the selected semantic command.
 */
export function planAutomaticGameplayStep(
  state: CanonicalGameState,
  serverNow: string,
): AutomaticStepPlan {
  if (state.lifecycle !== "active") return { ok: false, stopReason: "GAME_NOT_ACTIVE" };
  if (state.timing.turnPresentation) return { ok: false, stopReason: "PRESENTATION_BARRIER" };
  const actor = state.progression.currentActorSeat;
  if (actor == null) return { ok: false, stopReason: "NO_ACTOR" };

  const controller = state.seats[actor].controller;
  if (controller === "human") return { ok: false, stopReason: "HUMAN_INPUT" };

  const projection = projectGameForSeat(state, actor);
  const selected = selectAutomaticGameplayCommand(projection);
  if (!selected) return { ok: false, stopReason: "NO_LEGAL_ACTION" };
  if (selected.controller !== controller) {
    return { ok: false, stopReason: "INVALID_AUTOMATIC_STATE" };
  }

  const transition = applyGameplayCommand({
    state,
    seat: actor,
    command: selected.command,
    serverNow,
    expectedController: controller,
  });
  if (!transition.ok) return { ok: false, stopReason: "INVALID_AUTOMATIC_STATE" };

  return {
    ok: true,
    command: selected.command,
    strategyId: selected.strategyId,
    controller,
    actorSeat: actor,
    nextState: transition.state,
  };
}
