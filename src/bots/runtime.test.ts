import { describe, expect, it } from "vitest";

import type { CanonicalGameState } from "@/domain/gameState";
import { GAME_STATE_SCHEMA_VERSION, POPULAR_RULES_VERSION } from "@/domain/gameState";
import { projectGameForSeat } from "@/domain/projection";
import type { PersistGameStateResult } from "@/server/gamePersistence";
import { progressAutomaticGameplayWithDependencies } from "@/server/botProgression";
import { planAutomaticGameplayStep } from "./progression";
import { selectAutomaticGameplayCommand, TEMPORARY_CONTROLLER_STRATEGY_ID } from "./runtime";

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
  };
}

function loaded(state: CanonicalGameState) {
  return {
    ok: true as const,
    gameId: state.gameId,
    roomId: state.roomId,
    viewerSeat: 3 as const,
    rulesetId: state.rulesetId,
    rulesVersion: state.rulesVersion,
    stateSchemaVersion: state.stateSchemaVersion,
    stateVersion: state.stateVersion,
    lifecycle: state.lifecycle,
    canonicalState: state,
  };
}

describe("automatic bot strategy selection", () => {
  it("resolves a permanent bot from the pinned profile and returns a legal semantic command", () => {
    const state = baseState();
    const projection = projectGameForSeat(state, 0);
    const selected = selectAutomaticGameplayCommand(projection);
    expect(selected).toEqual({
      command: { type: "play_card", cardId: "7-hearts" },
      strategyId: "strong-basic-v1",
      controller: "permanent_bot",
    });
    expect(JSON.stringify(projection)).not.toContain("8-hearts");
  });

  it("uses a separate temporary-controller profile without changing human ownership", () => {
    const state = baseState();
    state.seats[0] = {
      seatIndex: 0,
      owner: { type: "human", playerId: "55555555-5555-4555-8555-555555555555" },
      controller: "temporary_bot",
      connected: true,
      takeoverAt: "2026-10-04T00:00:00.000Z",
      reclaimable: true,
    };
    state.timing.timeoutTakeoverActive = true;

    const selected = selectAutomaticGameplayCommand(projectGameForSeat(state, 0));
    expect(selected?.strategyId).toBe(TEMPORARY_CONTROLLER_STRATEGY_ID);
    expect(selected?.controller).toBe("temporary_bot");
    expect(state.seats[0].owner.type).toBe("human");
  });

  it("applies the selected command through the canonical dispatcher", () => {
    const result = planAutomaticGameplayStep(baseState(), "2026-10-04T00:00:00.000Z");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextState.stateVersion).toBe(11);
    expect(result.nextState.progression.currentActorSeat).toBe(1);
    expect(result.nextState.cards.currentTrick[0]?.card.id).toBe("7-hearts");
  });
});

describe("persisted automatic progression", () => {
  it("commits one bot play then blocks for human presentation acknowledgement", async () => {
    let state = baseState();
    const expectedVersions: number[] = [];
    const commandTypes: string[] = [];

    const result = await progressAutomaticGameplayWithDependencies(state.gameId, 8, {
      async load() {
        return loaded(state);
      },
      async persist(args): Promise<PersistGameStateResult> {
        expectedVersions.push(args.expectedStateVersion);
        commandTypes.push(args.commandType);
        state = args.newState;
        return {
          ok: true,
          gameId: state.gameId,
          stateVersion: state.stateVersion,
          lifecycle: state.lifecycle,
          replayed: false,
        };
      },
      async actionId(_gameId, label) {
        expect(label).toContain("automatic-gameplay-v1");
        return "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaab";
      },
      now() {
        return "2026-10-04T00:00:00.000Z";
      },
    });

    expect(result).toEqual({ ok: true, steps: 1, stateVersion: 11, stopReason: "PRESENTATION_BARRIER" });
    expect(expectedVersions).toEqual([10]);
    expect(commandTypes).toEqual(["bot_play_card"]);
    expect(state.progression.currentActorSeat).toBe(1);
    expect(state.timing.currentHumanDeadline).toBeNull();
  });

  it("lets a reclaim/version winner cancel a stale temporary-bot action without rollback", async () => {
    let state = baseState();
    state.seats[0] = {
      seatIndex: 0,
      owner: { type: "human", playerId: "55555555-5555-4555-8555-555555555555" },
      controller: "temporary_bot",
      connected: true,
      takeoverAt: "2026-10-04T00:00:00.000Z",
      reclaimable: true,
    };
    state.timing.timeoutTakeoverActive = true;
    let firstPersist = true;

    const result = await progressAutomaticGameplayWithDependencies(state.gameId, 4, {
      async load() {
        return loaded(state);
      },
      async persist(): Promise<PersistGameStateResult> {
        if (!firstPersist) throw new Error("no second bot persistence expected");
        firstPersist = false;
        state = {
          ...state,
          stateVersion: 11,
          seats: state.seats.map((seat, index) =>
            index === 0
              ? { ...seat, controller: "human" as const, reclaimable: false, takeoverAt: null }
              : seat,
          ) as CanonicalGameState["seats"],
          timing: { currentHumanDeadline: "2026-10-04T00:00:30.000Z", timeoutTakeoverActive: false },
        };
        return { ok: false, code: "STALE_STATE", currentStateVersion: 11 };
      },
      async actionId() {
        return "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaac";
      },
      now() {
        return "2026-10-04T00:00:00.000Z";
      },
    });

    expect(result).toEqual({ ok: true, steps: 0, stateVersion: 11, stopReason: "HUMAN_INPUT" });
    expect(state.cards.currentTrick).toEqual([]);
    expect(state.seats[0].controller).toBe("human");
  });
});
