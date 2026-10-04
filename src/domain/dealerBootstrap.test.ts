import { describe, expect, it } from "vitest";

import { projectGameForSeat } from "./projection";
import {
  chooseUniformFirstRecipient,
  createInitialDealerBootstrapState,
  resolveDealerBootstrapAndInitializeDealOne,
  type InitialSeatInput,
} from "./dealerBootstrap";
import { nextSeat } from "./dealing";

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

function seats(): [InitialSeatInput, InitialSeatInput, InitialSeatInput, InitialSeatInput] {
  return [
    { seatIndex: 0, owner: { type: "human", playerId: "p0" }, connected: true },
    { seatIndex: 1, owner: { type: "human", playerId: "p1" }, connected: true },
    { seatIndex: 2, owner: { type: "human", playerId: "p2" }, connected: true },
    {
      seatIndex: 3,
      owner: {
        type: "bot",
        botId: "theia-tamara",
        displayName: "Θεία Ταμάρα",
        personalityId: "theia-tamara",
        strategyProfileId: "memory-inference-v1",
        catalogVersion: "popular-bots-v1",
      },
      connected: false,
    },
  ];
}

function pending() {
  return createInitialDealerBootstrapState({
    gameId: "00000000-0000-4000-8000-000000000091",
    roomId: "00000000-0000-4000-8000-000000000092",
    bootstrapActionId: "00000000-0000-5000-8000-000000000093",
    seats: seats(),
  });
}

describe("uniform dealer-selection first recipient", () => {
  it("maps the unit interval evenly across all four seats", () => {
    expect(chooseUniformFirstRecipient(() => 0)).toBe(0);
    expect(chooseUniformFirstRecipient(() => 0.249999)).toBe(0);
    expect(chooseUniformFirstRecipient(() => 0.25)).toBe(1);
    expect(chooseUniformFirstRecipient(() => 0.5)).toBe(2);
    expect(chooseUniformFirstRecipient(() => 0.75)).toBe(3);
    expect(chooseUniformFirstRecipient(() => 0.999999)).toBe(3);
  });

  it("rejects invalid random sources instead of biasing/defaulting", () => {
    expect(() => chooseUniformFirstRecipient(() => -0.01)).toThrow();
    expect(() => chooseUniformFirstRecipient(() => 1)).toThrow();
  });
});

describe("canonical dealer bootstrap", () => {
  it("persists an unresolved state with no fake dealer or gameplay cards", () => {
    const state = pending();
    expect(state.stateSchemaVersion).toBe(2);
    expect(state.lifecycle).toBe("starting");
    expect(state.progression.phase).toBe("INITIAL_DEALER_SELECTION");
    expect(state.progression.dealerSeat).toBeNull();
    expect(state.progression.firstDeclarerSeat).toBeNull();
    expect(state.progression.firstLeaderSeat).toBeNull();
    expect(state.cards.deck).toEqual([]);
    expect(state.cards.hands.every((hand) => hand.length === 0)).toBe(true);
    expect(state.initialDealerSelection).toEqual({
      status: "pending",
      bootstrapActionId: "00000000-0000-5000-8000-000000000093",
    });
  });

  it("resolves one public first-Ace prefix then initializes Deal 1 from a fresh full deck", () => {
    const state = resolveDealerBootstrapAndInitializeDealOne({
      state: pending(),
      firstRecipientRandom: () => 0.75,
      selectionShuffleRandom: sequence([0.11, 0.87, 0.32, 0.66, 0.04]),
      dealOneShuffleRandom: sequence([0.93, 0.21, 0.58, 0.14, 0.77]),
      serverNow: "2026-10-04T12:00:00.000Z",
    });

    expect(state.lifecycle).toBe("active");
    expect(state.stateVersion).toBe(2);
    expect(state.progression.phase).toBe("DECLARATION");
    expect(state.cards.deck).toHaveLength(36);
    expect(new Set(state.cards.deck.map((card) => card.id)).size).toBe(36);
    expect(state.cards.hands.every((hand) => hand.length === 1)).toBe(true);
    expect(state.progression.dealNumber).toBe(1);

    const selection = state.initialDealerSelection;
    expect(selection?.status).toBe("resolved");
    if (!selection || selection.status !== "resolved") throw new Error("expected resolved selection");
    expect(selection.firstRecipientSeat).toBe(3);
    expect(selection.revealedSelectionCards.length).toBeGreaterThan(0);
    const last = selection.revealedSelectionCards.at(-1);
    expect(last?.kind).toBe("standard");
    expect(last && last.kind === "standard" ? last.rank : null).toBe("A");
    expect(
      selection.revealedSelectionCards
        .slice(0, -1)
        .some((card) => card.kind === "standard" && card.rank === "A"),
    ).toBe(false);
    expect(state.progression.dealerSeat).toBe(selection.selectedDealerSeat);
    expect(state.progression.firstDeclarerSeat).toBe(nextSeat(selection.selectedDealerSeat));
    expect(state.progression.firstLeaderSeat).toBe(nextSeat(selection.selectedDealerSeat));

    for (const revealed of selection.revealedSelectionCards) {
      expect(state.cards.deck.some((card) => card.id === revealed.id)).toBe(true);
    }
  });

  it("projects the ritual publicly without exposing any gameplay deck or hand", () => {
    const pendingState = pending();
    const pendingProjection = projectGameForSeat(pendingState, 0);
    expect(pendingProjection.initialDealerSelection).toEqual({ status: "pending" });
    expect(pendingProjection.cards.ownHandVisible).toBe(false);
    expect(pendingProjection.cards.ownHand).toEqual([]);
    expect(JSON.stringify(pendingProjection)).not.toContain('"deck"');
    expect(JSON.stringify(pendingProjection)).not.toContain("bootstrapActionId");
  });
});
