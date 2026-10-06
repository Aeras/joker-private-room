import { acknowledgePlayedEvent } from "./turnPresentation";
import { describe, expect, it } from "vitest";

import { createDeck, shuffleCards, type Card, type StandardCard } from "./cards";
import { declarationOrder, legalDeclarationValues, type Declarations } from "./declarations";
import { dealNineCardInitial, nextSeat, type SeatIndex } from "./dealing";
import { applyGameplayCommand, type GameplayCommand } from "./gameplayCommands";
import {
  GAME_STATE_SCHEMA_VERSION,
  POPULAR_RULES_VERSION,
  type CanonicalGameState,
} from "./gameState";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function standard(id: string, suit: StandardCard["suit"], rank: StandardCard["rank"]): StandardCard {
  return { kind: "standard", id, suit, rank };
}

function seats(): CanonicalGameState["seats"] {
  return [0, 1, 2, 3].map((seatIndex) => ({
    seatIndex: seatIndex as SeatIndex,
    owner: { type: "human" as const, playerId: `player-${seatIndex}` },
    controller: "human" as const,
    connected: true,
    takeoverAt: null,
    reclaimable: false,
  })) as CanonicalGameState["seats"];
}

function baseState(): CanonicalGameState {
  return {
    gameId: "00000000-0000-4000-8000-000000000011",
    roomId: "00000000-0000-4000-8000-000000000012",
    rulesetId: "popular",
    rulesVersion: POPULAR_RULES_VERSION,
    stateSchemaVersion: GAME_STATE_SCHEMA_VERSION,
    stateVersion: 10,
    lifecycle: "active",
    progression: {
      round: 1,
      dealNumber: 1,
      indexInPhase: 1,
      cardsPerPlayer: 1,
      dealerSeat: 0,
      firstDeclarerSeat: 1,
      firstLeaderSeat: 1,
      currentActorSeat: 1,
      phase: "CARD_PLAY",
    },
    seats: seats(),
    cards: {
      deck: createDeck(),
      drawCursor: 4,
      hands: [
        [standard("A-clubs-test", "clubs", "A")],
        [standard("7-clubs-test", "clubs", "7")],
        [standard("9-clubs-test", "clubs", "9")],
        [standard("10-hearts-test", "hearts", "10")],
      ],
      hiddenPartialNineCardHands: false,
      exposedTrumpCard: standard("6-hearts-trump", "hearts", "6"),
      currentTrick: [],
      completedTricks: [],
    },
    declarations: {
      order: [1, 2, 3, 0],
      currentDeclarerSeat: null,
      declarations: [0, 0, 0, 0],
      legalValues: [],
      forbiddenDealerValue: null,
    },
    trump: { status: "resolved", suit: "hearts" },
    joker: { pendingForSeat: null, cardId: null, semantic: null },
    score: {
      tricksTaken: [0, 0, 0, 0],
      currentDealScores: [null, null, null, null],
      cumulativeTotals: [0, 0, 0, 0],
      finalPlacements: [null, null, null, null],
    },
    timing: {
      currentHumanDeadline: "2026-10-04T06:00:30.000Z",
      timeoutTakeoverActive: false,
    },
  };
}

function declarationState(): CanonicalGameState {
  const state = baseState();
  const declarations: Declarations = [null, null, null, null];
  return {
    ...state,
    progression: { ...state.progression, currentActorSeat: 1, phase: "DECLARATION" },
    declarations: {
      order: [1, 2, 3, 0],
      currentDeclarerSeat: 1,
      declarations,
      legalValues: legalDeclarationValues({
        cardsPerPlayer: 1,
        dealerSeat: 0,
        seatIndex: 1,
        declarations,
      }),
      forbiddenDealerValue: null,
    },
  };
}

function apply(state: CanonicalGameState, seat: SeatIndex, command: GameplayCommand) {
  return applyGameplayCommand({
    state,
    seat,
    command,
    serverNow: "2026-10-04T06:00:05.000Z",
    expectedController: "human",
  });
}

describe("declaration dispatcher", () => {
  it("enforces order and transitions to first leader after the fourth declaration", () => {
    let state = declarationState();
    expect(apply(state, 2, { type: "declare", value: 0 })).toEqual({ ok: false, code: "NOT_CURRENT_ACTOR" });

    for (let count = 0; count < 4; count += 1) {
      const actor = state.declarations.currentDeclarerSeat!;
      const result = apply(state, actor, { type: "declare", value: state.declarations.legalValues[0]! });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.code);
      state = result.state;
      const boundary = state.timing.turnPresentation;
      if (boundary) for (const viewer of boundary.requiredSeats) state = acknowledgePlayedEvent(state, viewer, boundary.token, "2026-10-04T06:00:00.000Z").state;
    }

    expect(state.declarations.declarations.every((value) => value != null)).toBe(true);
    expect(state.progression.phase).toBe("CARD_PLAY");
    expect(state.progression.currentActorSeat).toBe(state.progression.firstLeaderSeat);
  });

  it("rejects the dealer's forbidden total explicitly", () => {
    const base = declarationState();
    const dealer = base.progression.dealerSeat;
    if (dealer == null) throw new Error("test fixture requires resolved dealer");
    const order = declarationOrder(dealer);
    const declarations: Declarations = [null, null, null, null];
    declarations[order[0]!] = 0;
    declarations[order[1]!] = 0;
    declarations[order[2]!] = 0;
    const state: CanonicalGameState = {
      ...base,
      progression: { ...base.progression, currentActorSeat: dealer },
      declarations: {
        ...base.declarations,
        currentDeclarerSeat: dealer,
        declarations,
        legalValues: legalDeclarationValues({ cardsPerPlayer: 1, dealerSeat: dealer, seatIndex: dealer, declarations }),
        forbiddenDealerValue: 1,
      },
    };
    expect(apply(state, dealer, { type: "declare", value: 1 })).toEqual({
      ok: false,
      code: "FORBIDDEN_DEALER_DECLARATION",
    });
  });
});

describe("9-card trump choice", () => {
  it("continues from the canonical 12-card cursor but waits for remaining-deal presentation before declarations", () => {
    const deck = shuffleCards(createDeck(), seededRandom(25));
    const dealer: SeatIndex = 0;
    const initial = dealNineCardInitial(deck, dealer);
    const chooser = nextSeat(dealer);
    const declarations: Declarations = [null, null, null, null];
    const state: CanonicalGameState = {
      ...baseState(),
      stateVersion: 20,
      progression: {
        round: 2,
        dealNumber: 9,
        indexInPhase: 1,
        cardsPerPlayer: 9,
        dealerSeat: dealer,
        firstDeclarerSeat: chooser,
        firstLeaderSeat: chooser,
        currentActorSeat: chooser,
        phase: "NINE_CARD_TRUMP_CHOICE",
      },
      cards: {
        deck,
        drawCursor: initial.cursor,
        hands: initial.hands,
        hiddenPartialNineCardHands: true,
        exposedTrumpCard: null,
        currentTrick: [],
        completedTricks: [],
      },
      declarations: {
        order: declarationOrder(dealer) as [SeatIndex, SeatIndex, SeatIndex, SeatIndex],
        currentDeclarerSeat: null,
        declarations,
        legalValues: [],
        forbiddenDealerValue: null,
      },
      trump: { status: "chooser_pending", chooserSeat: chooser },
    };

    const result = apply(state, chooser, { type: "choose_trump", suit: "hearts" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.state.cards.drawCursor).toBe(36);
    expect(result.state.cards.hands.every((hand) => hand.length === 9)).toBe(true);
    expect(result.state.cards.hiddenPartialNineCardHands).toBe(false);
    expect(result.state.trump).toEqual({ status: "resolved", suit: "hearts" });
    expect(result.state.progression.phase).toBe("NINE_CARD_REMAINING_DEAL");
    expect(result.state.progression.currentActorSeat).toBeNull();
    expect(result.state.declarations.currentDeclarerSeat).toBeNull();
    expect(result.state.declarations.legalValues).toEqual([]);
    expect(result.state.timing.currentHumanDeadline).toBeNull();
  });
});

describe("card/Joker command dispatcher", () => {
  it("uses canonical legal cards and resolves a complete normal trick", () => {
    let state = baseState();
    for (const [seat, cardId] of [[1, "7-clubs-test"], [2, "9-clubs-test"], [3, "10-hearts-test"], [0, "A-clubs-test"]] as const) {
      const result = apply(state, seat, { type: "play_card", cardId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.code);
      state = result.state;
      const boundary = state.timing.turnPresentation;
      if (boundary) for (const viewer of boundary.requiredSeats) state = acknowledgePlayedEvent(state, viewer, boundary.token, "2026-10-04T06:00:00.000Z").state;
    }
    expect(state.progression.phase).toBe("DEAL_RESULT");
    expect(state.cards.completedTricks[0]?.winnerSeat).toBe(3);
    expect(state.score.tricksTaken).toEqual([0, 0, 0, 1]);
  });

  it("rejects an off-suit card when requested suit is held", () => {
    const base = baseState();
    const state: CanonicalGameState = {
      ...base,
      progression: { ...base.progression, currentActorSeat: 2 },
      cards: {
        ...base.cards,
        hands: [base.cards.hands[0], [], [standard("8-clubs-held", "clubs", "8"), standard("A-spades-illegal", "spades", "A")], base.cards.hands[3]],
        currentTrick: [{ seatIndex: 1, card: standard("7-clubs-lead", "clubs", "7") }],
      },
    };
    expect(apply(state, 2, { type: "play_card", cardId: "A-spades-illegal" })).toEqual({ ok: false, code: "ILLEGAL_CARD" });
  });

  it("requires a contextual Joker semantic before committing the Joker", () => {
    const joker: Card = { kind: "joker", id: "joker-1" };
    const base = baseState();
    let state: CanonicalGameState = {
      ...base,
      cards: {
        ...base.cards,
        hands: [[standard("A-clubs", "clubs", "A")], [joker], [standard("9-clubs", "clubs", "9")], [standard("10-hearts", "hearts", "10")]],
      },
    };
    const selected = apply(state, 1, { type: "play_card", cardId: "joker-1" });
    expect(selected.ok).toBe(true);
    if (!selected.ok) throw new Error(selected.code);
    state = selected.state;
    expect(state.progression.phase).toBe("JOKER_DECISION");
    expect(state.cards.hands[1].map((card) => card.id)).toContain("joker-1");

    expect(state.timing.turnPresentation).toBeUndefined();
    expect(apply(state, 1, { type: "choose_joker_semantic", semantic: { context: "OPEN_TRICK", mode: "COMPETE" } })).toEqual({ ok: false, code: "INVALID_JOKER_CHOICE" });

    const chosen = apply(state, 1, {
      type: "choose_joker_semantic",
      semantic: { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "diamonds" },
    });
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) throw new Error(chosen.code);
    expect(chosen.state.cards.hands[1]).toEqual([]);
    expect(chosen.state.cards.currentTrick[0]?.joker).toEqual({ context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "diamonds" });
  });

  it("rejects a human command after controller takeover", () => {
    const state = baseState();
    state.seats[1] = { ...state.seats[1], controller: "temporary_bot", reclaimable: true, takeoverAt: "2026-10-04T06:00:31.000Z" };
    expect(apply(state, 1, { type: "play_card", cardId: "7-clubs-test" })).toEqual({ ok: false, code: "CONTROLLER_CHANGED" });
  });
});