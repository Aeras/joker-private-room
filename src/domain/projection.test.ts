import { describe, expect, it } from "vitest";

import type { Card, Rank, Suit } from "./cards";
import type { SeatIndex } from "./dealing";
import type { PlayedCard } from "./engine";
import {
  GAME_STATE_SCHEMA_VERSION,
  POPULAR_RULES_VERSION,
  type CanonicalGameState,
} from "./gameState";
import { projectGameForSeat } from "./projection";

function card(id: string, suit: Suit = "hearts", rank: Rank = "7"): Card {
  return { kind: "standard", id, suit, rank };
}

function baseState(): CanonicalGameState {
  const publicPlay: PlayedCard = { seatIndex: 2, card: card("PUBLIC-PLAY", "clubs", "9") };
  return {
    gameId: "11111111-1111-4111-8111-111111111111",
    roomId: "22222222-2222-4222-8222-222222222222",
    rulesetId: "popular",
    rulesVersion: POPULAR_RULES_VERSION,
    stateSchemaVersion: GAME_STATE_SCHEMA_VERSION,
    stateVersion: 7,
    lifecycle: "active",
    progression: {
      round: 1,
      dealNumber: 3,
      indexInPhase: 2,
      cardsPerPlayer: 3,
      dealerSeat: 3,
      firstDeclarerSeat: 0,
      firstLeaderSeat: 0,
      currentActorSeat: 0,
      phase: "CARD_PLAY",
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
      deck: [card("SECRET-DECK-0"), card("SECRET-FUTURE-1")],
      drawCursor: 17,
      hands: [
        [card("OWN-0", "hearts", "7"), card("OWN-1", "clubs", "A")],
        [card("SECRET-OPPONENT-1")],
        [card("SECRET-OPPONENT-2")],
        [card("SECRET-OPPONENT-3")],
      ],
      hiddenPartialNineCardHands: false,
      exposedTrumpCard: card("PUBLIC-TRUMP", "spades", "K"),
      currentTrick: [publicPlay],
      completedTricks: [],
    },
    declarations: {
      order: [0, 1, 2, 3],
      currentDeclarerSeat: null,
      declarations: [1, 0, 1, 1],
      legalValues: [],
      forbiddenDealerValue: null,
    },
    trump: { status: "resolved", suit: "spades" },
    joker: { pendingForSeat: null, cardId: null, semantic: null },
    score: {
      tricksTaken: [0, 1, 0, 0],
      currentDealScores: [null, null, null, null],
      cumulativeTotals: [50, 100, 0, -200],
      finalPlacements: [null, null, null, null],
    },
    timing: {
      currentHumanDeadline: "2026-10-03T20:00:00.000Z",
      timeoutTakeoverActive: false,
    },
  };
}

function serialized(state: CanonicalGameState, seat: SeatIndex): string {
  return JSON.stringify(projectGameForSeat(state, seat));
}

describe("projectGameForSeat", () => {
  it("serializes public state plus only the viewer own hand", () => {
    const state = baseState();
    const projection = projectGameForSeat(state, 0);
    const json = JSON.stringify(projection);

    expect(projection.cards.ownHand.map((item) => item.id)).toEqual(["OWN-0", "OWN-1"]);
    expect(json).toContain("PUBLIC-PLAY");
    expect(json).toContain("PUBLIC-TRUMP");
    expect(json).not.toContain("SECRET-DECK-0");
    expect(json).not.toContain("SECRET-FUTURE-1");
    expect(json).not.toContain("SECRET-OPPONENT-1");
    expect(json).not.toContain("SECRET-OPPONENT-2");
    expect(json).not.toContain("SECRET-OPPONENT-3");
    expect(json).not.toContain('"drawCursor"');
    expect(json).not.toContain('"hands"');
    expect(json).not.toContain('"canonicalState"');
  });

  it("reveals the corrected nine-card first three only to the chooser", () => {
    const state = baseState();
    state.progression.phase = "NINE_CARD_TRUMP_CHOICE";
    state.progression.cardsPerPlayer = 9;
    state.progression.currentActorSeat = 0;
    state.cards.hiddenPartialNineCardHands = true;
    state.cards.hands = [
      [card("CHOOSER-A"), card("CHOOSER-B"), card("CHOOSER-C")],
      [card("HIDDEN-OWN-1A"), card("HIDDEN-OWN-1B"), card("HIDDEN-OWN-1C")],
      [card("HIDDEN-OWN-2A"), card("HIDDEN-OWN-2B"), card("HIDDEN-OWN-2C")],
      [card("HIDDEN-OWN-3A"), card("HIDDEN-OWN-3B"), card("HIDDEN-OWN-3C")],
    ];
    state.trump = { status: "chooser_pending", chooserSeat: 0 };

    const chooser = projectGameForSeat(state, 0);
    const nonChooser = projectGameForSeat(state, 1);
    const nonChooserJson = JSON.stringify(nonChooser);

    expect(chooser.cards.ownHandVisible).toBe(true);
    expect(chooser.cards.ownHand.map((item) => item.id)).toEqual([
      "CHOOSER-A",
      "CHOOSER-B",
      "CHOOSER-C",
    ]);
    expect(nonChooser.cards.ownHandVisible).toBe(false);
    expect(nonChooser.cards.ownHand).toEqual([]);
    expect(nonChooserJson).not.toContain("HIDDEN-OWN-1A");
    expect(nonChooserJson).not.toContain("CHOOSER-A");
    expect(nonChooserJson).not.toContain("HIDDEN-OWN-2A");
    expect(nonChooserJson).not.toContain("HIDDEN-OWN-3A");
  });

  it("fails closed for hidden partial hands when chooser state is inconsistent", () => {
    const state = baseState();
    state.cards.hiddenPartialNineCardHands = true;
    state.trump = { status: "unresolved" };

    for (const seat of [0, 1, 2, 3] as const) {
      const projection = projectGameForSeat(state, seat);
      expect(projection.cards.ownHandVisible).toBe(false);
      expect(projection.cards.ownHand).toEqual([]);
    }
  });

  it("derives card-play choices through the canonical legal-move engine", () => {
    const state = baseState();
    state.cards.hands[0] = [
      card("LEGAL-HEART", "hearts", "8"),
      card("ILLEGAL-CLUB", "clubs", "A"),
      { kind: "joker", id: "LEGAL-JOKER" },
    ];
    state.cards.currentTrick = [
      { seatIndex: 3, card: card("LED-HEART", "hearts", "9") },
    ];
    state.progression.phase = "CARD_PLAY";
    state.progression.currentActorSeat = 0;
    state.trump = { status: "resolved", suit: "spades" };

    const projection = projectGameForSeat(state, 0);
    const play = projection.local.legalActions.find((action) => action.type === "play_card");

    expect(play).toEqual({ type: "play_card", cardIds: ["LEGAL-HEART", "LEGAL-JOKER"], jokerOptions: [{ context: "OPEN_TRICK", mode: "COMPETE" }, { context: "OPEN_TRICK", mode: "FROM_BELOW" }] });
  });

  it("exposes declaration, trump, Joker and reclaim actions only to the local authorized seat", () => {
    const state = baseState();

    state.progression.phase = "DECLARATION";
    state.declarations.currentDeclarerSeat = 0;
    state.declarations.legalValues = [0, 1, 2, 3];
    expect(projectGameForSeat(state, 0).local.legalActions).toContainEqual({
      type: "declare",
      values: [0, 1, 2, 3],
    });
    expect(projectGameForSeat(state, 1).local.legalActions).not.toContainEqual(
      expect.objectContaining({ type: "declare" }),
    );

    state.progression.phase = "NINE_CARD_TRUMP_CHOICE";
    state.cards.hiddenPartialNineCardHands = true;
    state.trump = { status: "chooser_pending", chooserSeat: 0 };
    expect(projectGameForSeat(state, 0).local.legalActions).toContainEqual({
      type: "choose_trump",
      suits: ["spades", "hearts", "diamonds", "clubs", null],
    });

    state.progression.phase = "JOKER_DECISION";
    state.cards.hiddenPartialNineCardHands = false;
    state.joker.pendingForSeat = 0;
    state.cards.currentTrick = [];
    const jokerAction = projectGameForSeat(state, 0).local.legalActions.find(
      (action) => action.type === "choose_joker_semantic",
    );
    expect(jokerAction && jokerAction.type === "choose_joker_semantic" ? jokerAction.options : []).toHaveLength(8);

    state.seats[0].reclaimable = true;
    expect(projectGameForSeat(state, 0).local.legalActions).toContainEqual({ type: "reclaim_control" });
    expect(projectGameForSeat(state, 1).local.legalActions).not.toContainEqual({ type: "reclaim_control" });
  });

  it("never serializes server-only future-card material into any seat projection", () => {
    const state = baseState();
    for (const seat of [0, 1, 2, 3] as const) {
      const json = serialized(state, seat);
      expect(json).not.toContain("SECRET-DECK-0");
      expect(json).not.toContain("SECRET-FUTURE-1");
      for (const other of [0, 1, 2, 3] as const) {
        if (other === seat) continue;
        expect(json).not.toContain(`SECRET-OPPONENT-${other}`);
      }
    }
  });
});
