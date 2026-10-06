import { describe, expect, it } from "vitest";

import { GAME_STATE_SCHEMA_VERSION, POPULAR_RULES_VERSION, type CanonicalGameState } from "@/domain/gameState";
import {
  advanceGameUntilBlockedWithDependencies,
  type ReconciliationDependencies,
} from "@/server/reconciliationCore";

function baseState(): CanonicalGameState {
  return {
    gameId: "11111111-1111-4111-8111-111111111111",
    roomId: "22222222-2222-4222-8222-222222222222",
    rulesetId: "popular",
    rulesVersion: POPULAR_RULES_VERSION,
    stateSchemaVersion: GAME_STATE_SCHEMA_VERSION,
    stateVersion: 10,
    lifecycle: "active",
    progression: {
      round: 1,
      dealNumber: 1,
      indexInPhase: 0,
      cardsPerPlayer: 1,
      dealerSeat: 3,
      firstDeclarerSeat: 0,
      firstLeaderSeat: 0,
      currentActorSeat: 0,
      phase: "CARD_PLAY",
    },
    initialDealerSelection: {
      status: "resolved",
      bootstrapActionId: "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa",
      firstRecipientSeat: 0,
      revealedSelectionCards: [{ kind: "standard", id: "A-hearts", suit: "hearts", rank: "A" }],
      selectedDealerSeat: 3,
      resolvedAtStateVersion: 2,
    },
    seats: [
      {
        seatIndex: 0,
        owner: {
          type: "bot",
          botId: "giorgos-nousios",
          displayName: "Γιώργος Νούσιος",
          personalityId: "giorgos-nousios",
          strategyProfileId: "strong-basic-v1",
          catalogVersion: "popular-bots-v1",
        },
        controller: "permanent_bot",
        connected: false,
        takeoverAt: null,
        reclaimable: false,
      },
      {
        seatIndex: 1,
        owner: {
          type: "bot",
          botId: "theia-tamara",
          displayName: "Θεία Ταμάρα",
          personalityId: "theia-tamara",
          strategyProfileId: "memory-inference-v1",
          catalogVersion: "popular-bots-v1",
        },
        controller: "permanent_bot",
        connected: false,
        takeoverAt: null,
        reclaimable: false,
      },
      {
        seatIndex: 2,
        owner: { type: "human", playerId: "33333333-3333-4333-8333-333333333333" },
        controller: "human",
        connected: true,
        takeoverAt: null,
        reclaimable: false,
      },
      {
        seatIndex: 3,
        owner: { type: "human", playerId: "44444444-4444-4444-8444-444444444444" },
        controller: "human",
        connected: true,
        takeoverAt: null,
        reclaimable: false,
      },
    ],
    cards: {
      deck: [],
      drawCursor: 0,
      hands: [
        [{ kind: "standard", id: "7-hearts", suit: "hearts", rank: "7" }],
        [{ kind: "standard", id: "8-hearts", suit: "hearts", rank: "8" }],
        [{ kind: "standard", id: "9-hearts", suit: "hearts", rank: "9" }],
        [{ kind: "standard", id: "10-hearts", suit: "hearts", rank: "10" }],
      ],
      hiddenPartialNineCardHands: false,
      exposedTrumpCard: null,
      currentTrick: [],
      completedTricks: [],
    },
    declarations: {
      order: [0, 1, 2, 3],
      currentDeclarerSeat: null,
      declarations: [0, 0, 0, 0],
      legalValues: [],
      forbiddenDealerValue: null,
    },
    trump: { status: "resolved", suit: null },
    joker: { pendingForSeat: null, cardId: null, semantic: null },
    score: {
      tricksTaken: [0, 0, 0, 0],
      currentDealScores: [null, null, null, null],
      cumulativeTotals: [0, 0, 0, 0],
      finalPlacements: [null, null, null, null],
    },
    timing: { currentHumanDeadline: null, timeoutTakeoverActive: false },
    serverEntropySeed: "11".repeat(32),
  };
}

function inMemoryDependencies(initial: CanonicalGameState) {
  let state = structuredClone(initial);
  const persistedCommands: string[] = [];

  const dependencies: ReconciliationDependencies = {
    load: async (gameId) => ({
      ok: true,
      gameId,
      stateVersion: state.stateVersion,
      canonicalState: structuredClone(state),
    }),
    persist: async (input) => {
      if (input.expectedStateVersion !== state.stateVersion) {
        return { ok: false, code: "STALE_STATE", currentStateVersion: state.stateVersion };
      }
      state = structuredClone(input.newState);
      persistedCommands.push(input.commandType);
      return {
        ok: true,
        gameId: input.gameId,
        stateVersion: state.stateVersion,
        lifecycle: state.lifecycle,
        replayed: false,
      };
    },
    finalize: async (input) => {
      state = structuredClone(input.newState);
      persistedCommands.push("finalize_game");
      return {
        ok: true,
        gameId: input.gameId,
        stateVersion: state.stateVersion,
        lifecycle: state.lifecycle,
        replayed: false,
      };
    },
    actionId: async (_gameId, label) => `action:${label}`,
    randomUnits: async (_seed, _label, count) => Array.from({ length: count }, (_, index) => (index + 1) / (count + 1)),
    now: () => "2026-10-04T16:30:00.000Z",
  };

  return { dependencies, getState: () => state, persistedCommands };
}

describe("JK-002 shared reconciliation core", () => {
  it("continues authoritative bot progression without browser presentation acknowledgement", async () => {
    const memory = inMemoryDependencies(baseState());
    const result = await advanceGameUntilBlockedWithDependencies(
      "11111111-1111-4111-8111-111111111111",
      8,
      memory.dependencies,
    );

    expect(result).toMatchObject({ ok: true, steps: 2, stopReason: "HUMAN_INPUT" });
    expect(memory.persistedCommands).toEqual(["bot_play_card", "bot_play_card"]);
    expect(memory.getState().progression.currentActorSeat).toBe(2);
    expect(memory.getState().timing.currentHumanDeadline).toBe("2026-10-04T16:30:30.000Z");
    expect(memory.getState().cards.currentTrick.map((play) => play.seatIndex)).toEqual([0, 1]);
  });

  it("returns STEP_BOUND after the configured safety budget while leaving canonical state advanced", async () => {
    const memory = inMemoryDependencies(baseState());
    const result = await advanceGameUntilBlockedWithDependencies(
      "11111111-1111-4111-8111-111111111111",
      1,
      memory.dependencies,
    );

    expect(result).toMatchObject({ ok: true, steps: 1, stopReason: "STEP_BOUND" });
    expect(memory.persistedCommands).toEqual(["bot_play_card"]);
    expect(memory.getState().progression.currentActorSeat).toBe(1);
    expect(memory.getState().stateVersion).toBe(11);
  });

  it("rejects a zero safety budget instead of entering an unbounded loop", async () => {
    const memory = inMemoryDependencies(baseState());
    const result = await advanceGameUntilBlockedWithDependencies(
      "11111111-1111-4111-8111-111111111111",
      0,
      memory.dependencies,
    );
    expect(result).toEqual({ ok: false, code: "INVALID_REQUEST" });
    expect(memory.persistedCommands).toHaveLength(0);
  });
});
