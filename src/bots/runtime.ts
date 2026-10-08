import type { Card } from "@/domain/cards";
import type { GameplayCommand } from "@/domain/gameplayCommands";
import type { ControllerType } from "@/domain/gameState";
import type { PlayerView } from "@/domain/engine";
import type { LocalLegalAction, PlayerGameProjection } from "@/domain/projection";
import type { BotStrategyProfileId } from "../../supabase/functions/_shared/bot-catalog";
import {
  resolveBotStrategy,
  strongBasicStrategy,
  type BotStrategy,
} from "./strategy";

export const TEMPORARY_CONTROLLER_STRATEGY_ID = "temporary-controller-v1" as const;

export interface AutomaticCommandSelection {
  command: GameplayCommand;
  strategyId: BotStrategyProfileId | typeof TEMPORARY_CONTROLLER_STRATEGY_ID;
  controller: Exclude<ControllerType, "human">;
}

interface SelectedStrategy {
  strategy: BotStrategy;
  strategyId: AutomaticCommandSelection["strategyId"];
  controller: Exclude<ControllerType, "human">;
}

function playerViewFromProjection(projection: PlayerGameProjection): PlayerView {
  return {
    deckProfile: projection.rulesetId === "classic" ? "classic38" : "popular36",
    scoringProfile: projection.rulesetId === "minus" ? "minus" : "popular",
    exposedTrumpCard: projection.cards.exposedTrumpCard,
    seatIndex: projection.viewerSeat,
    hand: projection.cards.ownHand.slice(),
    cardsPerPlayer: projection.progression.cardsPerPlayer,
    trump: projection.trump.status === "resolved" ? projection.trump.suit : null,
    declarations: Array.from(projection.declarations.values),
    tricksTaken: Array.from(projection.score.tricksTaken),
    currentTrick: projection.cards.currentTrick.slice(),
    history: { completedTricks: projection.cards.completedTricks.slice() },
  };
}

function permanentStrategy(profileId: string): BotStrategy | null {
  if (
    profileId !== "strong-basic-v1" &&
    profileId !== "memory-inference-v1" &&
    profileId !== "probability-simulation-v1"
  ) {
    return null;
  }
  return resolveBotStrategy(profileId as BotStrategyProfileId);
}

function strategyForProjection(projection: PlayerGameProjection): SelectedStrategy | null {
  const seat = projection.seats[projection.viewerSeat];
  if (seat.controller === "human") return null;

  if (seat.controller === "temporary_bot") {
    if (seat.owner.type !== "human") return null;
    const selectedId = seat.temporaryBotStrategyProfileId;
    const selectedStrategy = selectedId ? permanentStrategy(selectedId) : null;
    return {
      // Backward compatibility with games taken over before tier selection existed.
      strategy: selectedStrategy ?? strongBasicStrategy,
      strategyId: selectedStrategy ? selectedStrategy.id : TEMPORARY_CONTROLLER_STRATEGY_ID,
      controller: "temporary_bot",
    };
  }

  if (seat.owner.type !== "bot") return null;
  const strategy = permanentStrategy(seat.owner.strategyProfileId);
  return strategy
    ? {
        strategy,
        strategyId: strategy.id,
        controller: "permanent_bot",
      }
    : null;
}

function cardChoices(
  projection: PlayerGameProjection,
  action: Extract<LocalLegalAction, { type: "play_card" }>,
): Card[] {
  const legalIds = new Set(action.cardIds);
  return projection.cards.ownHand.filter((card) => legalIds.has(card.id));
}

function sameSemantic(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function commandForAction(
  projection: PlayerGameProjection,
  strategy: BotStrategy,
  action: LocalLegalAction,
): GameplayCommand | null {
  const view = playerViewFromProjection(projection);

  switch (action.type) {
    case "declare": {
      const value = strategy.chooseDeclaration(view, action.values);
      return action.values.includes(value) ? { type: "declare", value } : null;
    }
    case "choose_trump": {
      const suit = strategy.chooseTrump(view, action.suits);
      return action.suits.includes(suit) ? { type: "choose_trump", suit } : null;
    }
    case "play_card": {
      const legal = cardChoices(projection, action);
      if (legal.length !== action.cardIds.length) return null;
      const card = strategy.chooseCard(view, legal);
      return action.cardIds.includes(card.id) ? { type: "play_card", cardId: card.id } : null;
    }
    case "choose_joker_semantic": {
      const semantic = strategy.chooseJokerSemantic(view, action.options);
      return action.options.some((option) => sameSemantic(option, semantic))
        ? { type: "choose_joker_semantic", semantic }
        : null;
    }
    case "reclaim_control":
      return null;
  }
}

/**
 * Select exactly one semantic command from a seat-safe projection.
 * This module cannot access CanonicalGameState and therefore cannot inspect hidden truth.
 */
export function selectAutomaticGameplayCommand(
  projection: PlayerGameProjection,
): AutomaticCommandSelection | null {
  const selected = strategyForProjection(projection);
  if (!selected) return null;

  const gameplayAction = projection.local.legalActions.find(
    (action) => action.type !== "reclaim_control",
  );
  if (!gameplayAction) return null;

  const command = commandForAction(projection, selected.strategy, gameplayAction);
  if (!command) return null;

  return {
    command,
    strategyId: selected.strategyId,
    controller: selected.controller,
  };
}
