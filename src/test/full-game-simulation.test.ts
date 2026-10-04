import { describe, expect, it } from "vitest";
import { selectAutomaticGameplayCommand } from "@/bots/runtime";
import { resolveDealerBootstrapAndInitializeDealOne, createInitialDealerBootstrapState } from "@/domain/dealerBootstrap";
import { applyGameplayCommand } from "@/domain/gameplayCommands";
import { settleCanonicalLifecycle } from "@/domain/gameLifecycle";
import { projectGameForSeat } from "@/domain/projection";
import type { CanonicalGameState, SeatOwner } from "@/domain/gameState";

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function bot(
  botId: string,
  displayName: string,
  strategyProfileId: "strong-basic-v1" | "memory-inference-v1" | "probability-simulation-v1",
): SeatOwner {
  return {
    type: "bot",
    botId,
    displayName,
    personalityId: botId,
    strategyProfileId,
    catalogVersion: "popular-bots-v1",
  };
}

function mixedTierGame(seed: number): CanonicalGameState {
  const random = lcg(seed);
  const pending = createInitialDealerBootstrapState({
    gameId: "00000000-0000-4000-8000-000000001201",
    roomId: "00000000-0000-4000-8000-000000001202",
    bootstrapActionId: "00000000-0000-5000-8000-000000001203",
    serverEntropySeed: "12".repeat(32),
    seats: [
      { seatIndex: 0, owner: bot("giorgos-nousios", "Γιώργος Νούσιος", "strong-basic-v1"), connected: false },
      { seatIndex: 1, owner: bot("theia-tamara", "Θεία Ταμάρα", "memory-inference-v1"), connected: false },
      { seatIndex: 2, owner: bot("ka-monika", "κα. Μόνικα", "probability-simulation-v1"), connected: false },
      { seatIndex: 3, owner: bot("thomoulis", "Θωμούλης", "strong-basic-v1"), connected: false },
    ],
  });

  return resolveDealerBootstrapAndInitializeDealOne({
    state: pending,
    firstRecipientRandom: random,
    selectionShuffleRandom: random,
    dealOneShuffleRandom: random,
    serverNow: "2026-10-04T08:00:00.000Z",
  });
}

function simulate(seed: number): CanonicalGameState {
  const random = lcg(seed ^ 0x9e3779b9);
  let state = mixedTierGame(seed);
  let steps = 0;

  while (state.lifecycle !== "complete") {
    steps += 1;
    if (steps > 5000) throw new Error(`Simulation exceeded safety bound at ${state.progression.phase}`);

    if (state.progression.phase === "DEAL_RESULT" || state.progression.phase === "PHASE_RESULT") {
      const settled = settleCanonicalLifecycle({
        state,
        nextDealRandom: random,
        serverNow: "2026-10-04T08:00:00.000Z",
      });
      if (!settled.ok || !settled.changed) throw new Error(`Lifecycle failed at ${state.progression.phase}`);
      state = settled.state;
      continue;
    }

    const actor = state.progression.currentActorSeat;
    if (actor == null) throw new Error(`Missing actor at ${state.progression.phase}`);
    const selected = selectAutomaticGameplayCommand(projectGameForSeat(state, actor));
    if (!selected) throw new Error(`Bot could not select action at ${state.progression.phase} seat ${actor}`);

    const transition = applyGameplayCommand({
      state,
      seat: actor,
      command: selected.command,
      serverNow: "2026-10-04T08:00:00.000Z",
      expectedController: "permanent_bot",
    });
    if (!transition.ok) throw new Error(`Canonical command rejected: ${transition.code}`);
    state = transition.state;
  }

  return state;
}

describe("full 24-deal production game simulation", () => {
  for (const seed of [1201, 1202, 1203]) {
    it(`completes all four rounds with mixed Tier 1/2/3 strategies (seed ${seed})`, () => {
      const state = simulate(seed);
      const completedDeals = state.score.completedDeals ?? [];
      const roundPremia = state.score.roundPremia ?? [];

      expect(state.lifecycle).toBe("complete");
      expect(state.progression.phase).toBe("GAME_COMPLETE");
      expect(state.progression.dealNumber).toBe(24);
      expect(completedDeals).toHaveLength(24);
      expect(roundPremia).toHaveLength(4);
      expect(state.score.finalPlacements.every((placement) => placement != null)).toBe(true);
      expect(completedDeals.map((deal) => deal.dealNumber)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
      expect(completedDeals.every((deal) => deal.tricksTaken.reduce((sum, tricks) => sum + tricks, 0) === deal.cardsPerPlayer)).toBe(true);
      expect(completedDeals.every((deal) => deal.declarations.reduce((sum, declaration) => sum + declaration, 0) !== deal.cardsPerPlayer)).toBe(true);
      expect(state.cards.hands.every((hand) => hand.length === 0)).toBe(true);
    });
  }
});
