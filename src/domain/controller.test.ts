import { describe, expect, it } from "vitest";

import type { CanonicalGameState } from "./gameState";
import { GAME_STATE_SCHEMA_VERSION, POPULAR_RULES_VERSION } from "./gameState";
import {
  applyOverdueTimeout,
  applyReclaimControl,
  HUMAN_TURN_TIMEOUT_MS,
  isSoloHumanPaused,
  runBoundedBotProgression,
} from "./controller";

function state(): CanonicalGameState {
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
    seats: [0, 1, 2, 3].map((seatIndex) => ({
      seatIndex: seatIndex as 0 | 1 | 2 | 3,
      owner: { type: "human" as const, playerId: `player-${seatIndex}` },
      controller: "human" as const,
      connected: true,
      takeoverAt: null,
      reclaimable: false,
    })) as CanonicalGameState["seats"],
    cards: {
      deck: [],
      drawCursor: 0,
      hands: [
        [{ kind: "standard", id: "7-hearts", suit: "hearts", rank: "7" }],
        [],
        [],
        [],
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
    timing: {
      currentHumanDeadline: "2026-10-03T19:00:30.000Z",
      timeoutTakeoverActive: false,
    },
  };
}

function replaceWithPermanentBot(game: CanonicalGameState, seatIndex: 0 | 1 | 2 | 3): void {
  game.seats[seatIndex] = {
    seatIndex,
    owner: {
      type: "bot",
      botId: `bot-${seatIndex}`,
      displayName: `Bot ${seatIndex}`,
      personalityId: `bot-${seatIndex}`,
      strategyProfileId: "strong-basic-v1",
      catalogVersion: "test-v1",
    },
    controller: "permanent_bot",
    connected: true,
    takeoverAt: null,
    reclaimable: false,
  };
}

function soloHumanState(): CanonicalGameState {
  const game = state();
  replaceWithPermanentBot(game, 1);
  replaceWithPermanentBot(game, 2);
  replaceWithPermanentBot(game, 3);
  return game;
}

function twoHumanState(): CanonicalGameState {
  const game = state();
  replaceWithPermanentBot(game, 2);
  replaceWithPermanentBot(game, 3);
  return game;
}

describe("controller timeout/reclaim", () => {
  it("does not time out before the authoritative server deadline", () => {
    const original = state();
    const result = applyOverdueTimeout(original, "2026-10-03T19:00:29.999Z");
    expect(result).toEqual({ ok: true, changed: false, state: original });
  });

  it("persists a solo-human pause without replacing the human controller", () => {
    const original = soloHumanState();
    const result = applyOverdueTimeout(original, "2026-10-03T19:00:30.000Z");
    expect(result.ok && result.changed).toBe(true);
    if (!result.ok || !result.changed) return;
    expect(result.state.stateVersion).toBe(11);
    expect(result.state.seats[0].owner).toEqual({ type: "human", playerId: "player-0" });
    expect(result.state.seats[0].controller).toBe("human");
    expect(result.state.seats[0].reclaimable).toBe(true);
    expect(result.state.seats[0].takeoverAt).toBe("2026-10-03T19:00:30.000Z");
    expect(result.state.timing.currentHumanDeadline).toBeNull();
    expect(result.state.timing.timeoutTakeoverActive).toBe(false);
    expect(isSoloHumanPaused(result.state, 0)).toBe(true);
  });

  it("resumes a paused solo-human seat with a fresh 30 second deadline", () => {
    const paused = applyOverdueTimeout(soloHumanState(), "2026-10-03T19:00:30.000Z");
    if (!paused.ok || !paused.changed) throw new Error("expected pause");
    const resumed = applyReclaimControl(paused.state, 0, "2026-10-03T19:10:00.000Z");
    if (!resumed.ok || !resumed.changed) throw new Error("expected resume");
    expect(resumed.state.seats[0].controller).toBe("human");
    expect(resumed.state.seats[0].reclaimable).toBe(false);
    expect(resumed.state.seats[0].takeoverAt).toBeNull();
    expect(resumed.state.timing.currentHumanDeadline).toBe(
      new Date(Date.parse("2026-10-03T19:10:00.000Z") + HUMAN_TURN_TIMEOUT_MS).toISOString(),
    );
    expect(isSoloHumanPaused(resumed.state, 0)).toBe(false);
  });

  it("still transfers control when at least two human-owned seats exist", () => {
    const original = twoHumanState();
    const result = applyOverdueTimeout(original, "2026-10-03T19:00:30.000Z");
    expect(result.ok && result.changed).toBe(true);
    if (!result.ok || !result.changed) return;
    expect(result.state.seats[0].owner).toEqual({ type: "human", playerId: "player-0" });
    expect(result.state.seats[0].controller).toBe("temporary_bot");
    expect(result.state.seats[0].reclaimable).toBe(true);
  });

  it("assigns one of three strategy tiers only once per takeover and clears it on reclaim", () => {
    const initial = state();
    initial.serverEntropySeed = "a".repeat(64);
    const timeout = applyOverdueTimeout(initial, "2026-10-03T19:00:30.000Z");
    if (!timeout.ok || !timeout.changed) throw new Error("expected takeover");
    const tier = timeout.state.seats[0].temporaryBotStrategyProfileId;
    expect(["strong-basic-v1", "memory-inference-v1", "probability-simulation-v1"]).toContain(tier);
    expect(timeout.state.seats[0].controller).toBe("temporary_bot");
    const second = applyOverdueTimeout(timeout.state, "2026-10-03T19:01:00.000Z");
    expect(second).toEqual({ ok: true, changed: false, state: timeout.state });
    if (!second.ok) throw new Error("unexpected timeout rejection");
    expect(second.state.seats[0].temporaryBotStrategyProfileId).toBe(tier);
    const reclaim = applyReclaimControl(timeout.state, 0, "2026-10-03T19:01:00.000Z");
    if (!reclaim.ok || !reclaim.changed) throw new Error("expected reclaim");
    expect(reclaim.state.seats[0].temporaryBotStrategyProfileId).toBeUndefined();
  });

  it("allows all three selected tiers across independent takeover states", () => {
    const selected = new Set<string>();
    for (let version = 1; version <= 90; version += 1) {
      const original = state();
      original.serverEntropySeed = "b".repeat(64);
      original.stateVersion = version;
      const timeout = applyOverdueTimeout(original, "2026-10-03T19:00:30.000Z");
      if (!timeout.ok || !timeout.changed) throw new Error("expected timeout");
      selected.add(timeout.state.seats[0].temporaryBotStrategyProfileId ?? "");
    }
    expect(selected).toEqual(new Set(["strong-basic-v1", "memory-inference-v1", "probability-simulation-v1"]));
  });

  it("changes controller only after timeout and preserves ownership/hand/score", () => {
    const original = state();
    const result = applyOverdueTimeout(original, "2026-10-03T19:00:30.000Z");
    expect(result.ok && result.changed).toBe(true);
    if (!result.ok || !result.changed) return;
    expect(result.state.stateVersion).toBe(11);
    expect(result.state.seats[0].owner).toEqual(original.seats[0].owner);
    expect(result.state.seats[0].controller).toBe("temporary_bot");
    expect(result.state.seats[0].reclaimable).toBe(true);
    expect(result.state.cards.hands[0]).toEqual(original.cards.hands[0]);
    expect(result.state.score).toEqual(original.score);
    expect(result.state.timing.currentHumanDeadline).toBeNull();
  });

  it("reclaims the same temporary-bot seat and gives current actor a fresh 30 second server deadline", () => {
    const timed = applyOverdueTimeout(state(), "2026-10-03T19:00:30.000Z");
    if (!timed.ok || !timed.changed) throw new Error("expected timeout");
    const reclaimed = applyReclaimControl(timed.state, 0, "2026-10-03T19:00:40.000Z");
    if (!reclaimed.ok || !reclaimed.changed) throw new Error("expected reclaim");
    expect(reclaimed.state.seats[0].controller).toBe("human");
    expect(reclaimed.state.seats[0].owner).toEqual(state().seats[0].owner);
    expect(reclaimed.state.timing.currentHumanDeadline).toBe(
      new Date(Date.parse("2026-10-03T19:00:40.000Z") + HUMAN_TURN_TIMEOUT_MS).toISOString(),
    );
  });

  it("rejects reclaim when neither temporary control nor solo pause is active", () => {
    expect(applyReclaimControl(state(), 0, "2026-10-03T19:00:10.000Z")).toEqual({
      ok: false,
      code: "RECLAIM_NOT_AVAILABLE",
    });
  });
});

describe("bounded bot progression", () => {
  it("feeds the bot only a fair seat projection and a concrete semantic command", () => {
    const timed = applyOverdueTimeout(state(), "2026-10-03T19:00:30.000Z");
    if (!timed.ok || !timed.changed) throw new Error("expected timeout");
    let sawOpponentHand = false;
    let selectedCardId: string | null = null;
    const result = runBoundedBotProgression(timed.state, {
      selectAction(view) {
        const json = JSON.stringify(view);
        sawOpponentHand = json.includes("player-1-secret-card");
        const legalPlay = view.local.legalActions.find((action) => action.type === "play_card");
        if (!legalPlay || legalPlay.cardIds.length === 0) return null;
        selectedCardId = legalPlay.cardIds[0]!;
        return { type: "play_card", cardId: selectedCardId };
      },
      applyAction({ state: current, action }) {
        expect(action).toEqual({ type: "play_card", cardId: "7-hearts" });
        const seats = current.seats.map((seat) => ({ ...seat })) as CanonicalGameState["seats"];
        seats[1] = { ...seats[1], controller: "human" };
        return {
          ...current,
          stateVersion: current.stateVersion + 1,
          progression: { ...current.progression, currentActorSeat: 1 },
          seats,
        };
      },
    });
    expect(sawOpponentHand).toBe(false);
    expect(selectedCardId).toBe("7-hearts");
    expect(result.steps).toBe(1);
    expect(result.stopReason).toBe("HUMAN_INPUT");
  });

  it("stops at the hard step bound using concrete commands", () => {
    const original = state();
    original.seats[0].controller = "permanent_bot";
    const result = runBoundedBotProgression(
      original,
      {
        selectAction(view) {
          const legalPlay = view.local.legalActions.find((action) => action.type === "play_card");
          return legalPlay?.cardIds[0]
            ? { type: "play_card" as const, cardId: legalPlay.cardIds[0] }
            : { type: "declare" as const, value: 0 };
        },
        applyAction({ state: current }) {
          return { ...current, stateVersion: current.stateVersion + 1 };
        },
      },
      3,
    );
    expect(result.steps).toBe(3);
    expect(result.stopReason).toBe("STEP_BOUND");
  });
});
