import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { SeatIndex } from "@/domain/dealing";
import {
  GAME_STATE_SCHEMA_VERSION,
  POPULAR_RULES_VERSION,
  type CanonicalGameState,
} from "@/domain/gameState";
import { projectGameForSeat } from "@/domain/projection";

function jokerPendingState(): CanonicalGameState {
  return {
    gameId: "11111111-1111-4111-8111-111111111111",
    roomId: "22222222-2222-4222-8222-222222222222",
    rulesetId: "popular",
    rulesVersion: POPULAR_RULES_VERSION,
    stateSchemaVersion: GAME_STATE_SCHEMA_VERSION,
    stateVersion: 12,
    lifecycle: "active",
    progression: {
      round: 1,
      dealNumber: 4,
      indexInPhase: 3,
      cardsPerPlayer: 4,
      dealerSeat: 3,
      firstDeclarerSeat: 0,
      firstLeaderSeat: 0,
      currentActorSeat: 0,
      phase: "JOKER_DECISION",
    },
    seats: [0, 1, 2, 3].map((seatIndex) => ({
      seatIndex: seatIndex as SeatIndex,
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
        [
          { kind: "joker", id: "PENDING-JOKER" },
          { kind: "standard", id: "OWN-HEART", suit: "hearts", rank: "7" },
        ],
        [{ kind: "standard", id: "P1", suit: "clubs", rank: "8" }],
        [{ kind: "standard", id: "P2", suit: "diamonds", rank: "9" }],
        [{ kind: "standard", id: "P3", suit: "spades", rank: "10" }],
      ],
      hiddenPartialNineCardHands: false,
      exposedTrumpCard: null,
      currentTrick: [
        { seatIndex: 3, card: { kind: "standard", id: "LED", suit: "spades", rank: "A" } },
      ],
      completedTricks: [],
    },
    declarations: {
      order: [0, 1, 2, 3],
      currentDeclarerSeat: null,
      declarations: [1, 1, 1, 1],
      legalValues: [],
      forbiddenDealerValue: null,
    },
    trump: { status: "resolved", suit: "hearts" },
    joker: { pendingForSeat: 0, cardId: "PENDING-JOKER", semantic: null },
    score: {
      tricksTaken: [0, 0, 0, 0],
      currentDealScores: [null, null, null, null],
      cumulativeTotals: [0, 0, 0, 0],
      finalPlacements: [null, null, null, null],
    },
    timing: {
      currentHumanDeadline: "2026-10-05T13:00:30.000Z",
      timeoutTakeoverActive: false,
    },
  };
}

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("JK-006 card-face loading and Joker decision presentation", () => {
  it("keeps a thrown pending Joker on the projected table and out of the thrower's visible hand", () => {
    const state = jokerPendingState();
    const thrower = projectGameForSeat(state, 0);
    const opponent = projectGameForSeat(state, 1);

    expect(thrower.cards.ownHand.map((card) => card.id)).toEqual(["OWN-HEART"]);
    expect(thrower.cards.currentTrick.map((play) => play.card.id)).toEqual(["LED", "PENDING-JOKER"]);
    expect(opponent.cards.currentTrick.map((play) => play.card.id)).toEqual(["LED", "PENDING-JOKER"]);

    const choice = thrower.local.legalActions.find((action) => action.type === "choose_joker_semantic");
    expect(choice).toEqual({
      type: "choose_joker_semantic",
      options: [
        { context: "OPEN_TRICK", mode: "COMPETE" },
        { context: "OPEN_TRICK", mode: "FROM_BELOW" },
      ],
    });
  });

  it("uses an immediate semantic card face until PNG artwork has loaded", () => {
    const source = read("src/components/joker/PlayingCard.tsx");
    expect(source).toContain('data-card-semantic-fallback="true"');
    expect(source).toContain('data-card-artwork-loaded={loaded ? "true" : "false"}');
    expect(source).toContain('loaded ? "opacity-100" : "opacity-0"');
  });

  it("uses the requested explicit over/under Joker labels", () => {
    const source = read("src/components/table/JokerChoicePicker.tsx");
    expect(source).toContain("Τζόκερ από πάνω");
    expect(source).toContain("Τζόκερ από κάτω");
    expect(source).not.toContain("Joker ψηλά");
  });
});
