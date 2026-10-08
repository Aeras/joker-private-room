import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CARD_ASSET_URLS } from "@/assets/cardPreload";
import {
  NORMAL_TRICK_HOLD_MS,
  NORMAL_TRICK_PLAY_SPACING_MS,
} from "@/components/table/trickPresentationModel";
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

describe("JK-006 card artwork, Joker decision, and trick pacing", () => {
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

  it("preloads the complete canonical visual deck", () => {
    expect(CARD_ASSET_URLS).toHaveLength(39);
    expect(new Set(CARD_ASSET_URLS).size).toBe(39);
    expect(CARD_ASSET_URLS).toContain("/cards/runtime-png/faces/joker_red.png");
    expect(CARD_ASSET_URLS).toContain("/cards/runtime-png/faces/joker_black.png");
    expect(CARD_ASSET_URLS).toContain("/cards/runtime-png/backs/blue_back.png");
  });

  it("does not flash the semantic face during normal PNG loading", () => {
    const source = read("src/components/joker/PlayingCard.tsx");
    expect(source).toContain("preloadCardAsset");
    expect(source).toContain("!loaded && !failed");
    expect(source).toContain("failed && fallback");
    expect(source).toContain('data-card-artwork-loaded={loaded ? "true" : "false"}');
  });

  it("centers the Joker choice and visually differentiates over/under", () => {
    const source = read("src/components/table/JokerChoicePicker.tsx");
    expect(source).toContain('data-joker-choice-position="table-center"');
    expect(source).toContain("fixed left-1/2 top-1/2");
    expect(source).toContain("Τζόκερ από πάνω");
    expect(source).toContain("bg-red-600");
    expect(source).toContain("Τζόκερ από κάτω");
    expect(source).toContain("bg-white");
    expect(source).not.toContain("Joker ψηλά");
  });

  it("keeps FROM_BELOW Joker face-down underneath the live trick until collection", () => {
    const source = read("src/components/table/TrickPresentation.tsx");
    expect(source).toContain('play.joker?.context === "OPEN_TRICK" && play.joker.mode === "FROM_BELOW"');
    expect(source).toContain('data-joker-from-below={fromBelowJoker ? "true" : undefined}');
    expect(source).toContain('const faceDown = fromBelowJoker || collecting');
    expect(source).toContain('fromBelowJoker ? "z-0" : "z-10"');
    expect(source).toContain("underStackPoint(landing, center)");
  });

  it("does not announce redundant open-trick Joker over/under text after the choice", () => {
    const source = read("src/components/table/TrickPresentation.tsx");
    expect(source).toContain('if (semantic.context === "OPEN_TRICK") return null');
    expect(source).not.toContain('semantic.mode === "COMPETE" ? "Τζόκερ από πάνω" : "Τζόκερ από κάτω"');
  });

  it("shows authoritative Joker choices without waiting for trick presentation to finish", () => {
    const source = read("src/components/table/GameTable.tsx");
    expect(source).toContain("!startupPresentationActive && !handRevealActive && ownArtworkSettled && jokerAction");
    expect(source).not.toContain("!interactionPresentationActive && jokerAction");
  });

  it("paces live trick plays so the previous card can settle before the next one appears", () => {
    expect(NORMAL_TRICK_PLAY_SPACING_MS).toBeGreaterThanOrEqual(600);
    expect(NORMAL_TRICK_HOLD_MS).toBeGreaterThanOrEqual(850);
  });
});
