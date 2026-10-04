import { describe, expect, it } from "vitest";

import { createDeck } from "./cards";
import { settleCanonicalLifecycle } from "./gameLifecycle";
import { DEALS } from "./gameConfig";
import {
  GAME_STATE_SCHEMA_VERSION,
  POPULAR_RULES_VERSION,
  type CanonicalDealScoreRecord,
  type CanonicalGameState,
  type CanonicalRoundPremiaRecord,
} from "./gameState";
import { scoreDeal } from "./scoring";

const SEED = "b".repeat(64);
const NOW = "2026-10-04T09:00:00.000Z";

function random(): number { return 0.314159; }

function seats(): CanonicalGameState["seats"] {
  return [0, 1, 2, 3].map((seatIndex) => ({
    seatIndex: seatIndex as 0 | 1 | 2 | 3,
    owner: { type: "human" as const, playerId: `p${seatIndex}` },
    controller: "human" as const,
    connected: true,
    takeoverAt: null,
    reclaimable: false,
  })) as CanonicalGameState["seats"];
}

function baseResult(dealNumber = 1): CanonicalGameState {
  const deal = DEALS[dealNumber - 1]!;
  const cards = deal.cardsPerPlayer;
  return {
    gameId: "00000000-0000-4000-8000-000000000121",
    roomId: "00000000-0000-4000-8000-000000000122",
    rulesetId: "popular",
    rulesVersion: POPULAR_RULES_VERSION,
    stateSchemaVersion: GAME_STATE_SCHEMA_VERSION,
    stateVersion: 30,
    lifecycle: "active",
    serverEntropySeed: SEED,
    progression: {
      round: deal.phase,
      dealNumber: deal.dealNumber,
      indexInPhase: deal.indexInPhase,
      cardsPerPlayer: cards,
      dealerSeat: 3,
      firstDeclarerSeat: 0,
      firstLeaderSeat: 0,
      currentActorSeat: null,
      phase: "DEAL_RESULT",
    },
    initialDealerSelection: {
      status: "resolved",
      bootstrapActionId: "00000000-0000-5000-8000-000000000123",
      firstRecipientSeat: 0,
      revealedSelectionCards: [{ kind: "standard", id: "A-hearts", suit: "hearts", rank: "A" }],
      selectedDealerSeat: 3,
      resolvedAtStateVersion: 2,
    },
    seats: seats(),
    cards: {
      deck: createDeck(),
      drawCursor: cards * 4 + (cards < 9 ? 1 : 0),
      hands: [[], [], [], []],
      hiddenPartialNineCardHands: false,
      exposedTrumpCard: null,
      currentTrick: [],
      completedTricks: [],
    },
    declarations: {
      order: [0, 1, 2, 3],
      currentDeclarerSeat: null,
      declarations: [cards, Math.min(1, cards), 0, 0],
      legalValues: [],
      forbiddenDealerValue: null,
    },
    trump: { status: "resolved", suit: null },
    joker: { pendingForSeat: null, cardId: null, semantic: null },
    score: {
      tricksTaken: [cards, 0, 0, 0],
      currentDealScores: [null, null, null, null],
      cumulativeTotals: [0, 0, 0, 0],
      finalPlacements: [null, null, null, null],
      completedDeals: [],
      roundPremia: [],
    },
    timing: { currentHumanDeadline: null, timeoutTakeoverActive: false },
  };
}

function recordFor(dealNumber: number): CanonicalDealScoreRecord {
  const deal = DEALS[dealNumber - 1]!;
  const declarations: [number, number, number, number] = [deal.cardsPerPlayer, Math.min(1, deal.cardsPerPlayer), 0, 0];
  const tricksTaken: [number, number, number, number] = [deal.cardsPerPlayer, 0, 0, 0];
  const dealScores: [number, number, number, number] = [
    scoreDeal({ declared: declarations[0], taken: tricksTaken[0], tricksInDeal: deal.cardsPerPlayer }),
    scoreDeal({ declared: declarations[1], taken: tricksTaken[1], tricksInDeal: deal.cardsPerPlayer }),
    scoreDeal({ declared: 0, taken: 0, tricksInDeal: deal.cardsPerPlayer }),
    scoreDeal({ declared: 0, taken: 0, tricksInDeal: deal.cardsPerPlayer }),
  ];
  return {
    dealNumber,
    round: deal.phase,
    indexInPhase: deal.indexInPhase,
    cardsPerPlayer: deal.cardsPerPlayer,
    declarations,
    tricksTaken,
    dealScores,
    totalsAfterDeal: [0, 0, 0, 0],
  };
}

function priorPremia(round: 1 | 2 | 3): CanonicalRoundPremiaRecord {
  return {
    round,
    qualified: [true, false, true, true],
    adjustments: [0, 0, 0, 0],
    transfers: [],
    totalsAfterPremia: [0, 0, 0, 0],
  };
}

describe("canonical game lifecycle", () => {
  it("scores a deal and initializes the next deal with one state-version increment", () => {
    const state = baseResult(1);
    const result = settleCanonicalLifecycle({ state, nextDealRandom: random, serverNow: NOW });
    expect(result.ok && result.changed).toBe(true);
    if (!result.ok || !result.changed) return;
    expect(result.state.stateVersion).toBe(31);
    expect(result.state.score.completedDeals).toHaveLength(1);
    expect(result.state.score.completedDeals?.[0]?.dealScores).toEqual([100, -200, 50, 50]);
    expect(result.state.score.cumulativeTotals).toEqual([100, -200, 50, 50]);
    expect(result.state.progression.dealNumber).toBe(2);
    expect(result.state.progression.dealerSeat).toBe(0);
    expect(result.state.progression.firstDeclarerSeat).toBe(1);
    expect(result.state.progression.cardsPerPlayer).toBe(2);
    expect(result.state.progression.phase).toBe("DECLARATION");
    expect(result.state.cards.hands.every((hand) => hand.length === 2)).toBe(true);
  });

  it("enters corrected 9-card chooser state with three hidden cards dealt to every seat", () => {
    const state = baseResult(8);
    state.score.completedDeals = Array.from({ length: 7 }, (_, index) => recordFor(index + 1));
    const dealSettled = settleCanonicalLifecycle({ state, serverNow: NOW });
    if (!dealSettled.ok || !dealSettled.changed) throw new Error("expected deal settlement");
    expect(dealSettled.state.progression.phase).toBe("PHASE_RESULT");

    const roundSettled = settleCanonicalLifecycle({
      state: dealSettled.state,
      nextDealRandom: random,
      serverNow: NOW,
    });
    if (!roundSettled.ok || !roundSettled.changed) throw new Error("expected round settlement");
    expect(roundSettled.state.stateVersion).toBe(32);
    expect(roundSettled.state.progression.dealNumber).toBe(9);
    expect(roundSettled.state.progression.round).toBe(2);
    expect(roundSettled.state.progression.phase).toBe("NINE_CARD_TRUMP_CHOICE");
    expect(roundSettled.state.cards.drawCursor).toBe(12);
    expect(roundSettled.state.cards.hands.every((hand) => hand.length === 3)).toBe(true);
    expect(roundSettled.state.cards.hiddenPartialNineCardHands).toBe(true);
    expect(roundSettled.state.score.roundPremia).toHaveLength(1);
  });

  it("applies final-round premia and produces competition placements at GAME_COMPLETE", () => {
    const state = baseResult(24);
    state.progression.phase = "PHASE_RESULT";
    state.score.completedDeals = Array.from({ length: 24 }, (_, index) => recordFor(index + 1));
    state.score.roundPremia = [priorPremia(1), priorPremia(2), priorPremia(3)];
    state.score.cumulativeTotals = [1000, 500, 1000, 100];

    const result = settleCanonicalLifecycle({ state, serverNow: NOW });
    expect(result.ok && result.changed).toBe(true);
    if (!result.ok || !result.changed) return;
    expect(result.state.stateVersion).toBe(31);
    expect(result.state.lifecycle).toBe("complete");
    expect(result.state.progression.phase).toBe("GAME_COMPLETE");
    expect(result.state.score.roundPremia).toHaveLength(4);
    expect(result.state.score.finalPlacements.every((placement) => placement != null)).toBe(true);
    const placements = result.state.score.finalPlacements;
    expect(new Set(placements.filter((placement) => placement === 1)).size).toBeLessThanOrEqual(1);
  });
});
