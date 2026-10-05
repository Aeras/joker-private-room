import { describe, expect, it } from "vitest";

import { projectGameForSeat } from "./projection";
import {
  activateDealOneAfterPresentation,
  chooseUniformFirstRecipient,
  createInitialDealerBootstrapState,
  resolveDealerBootstrapAndInitializeDealOne,
  type InitialSeatInput,
} from "./dealerBootstrap";
import { nextSeat } from "./dealing";

const PRIVATE_SEED = "a".repeat(64);

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
    serverEntropySeed: PRIVATE_SEED,
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
  it("persists an unresolved state with no fake dealer, gameplay cards or public-derived entropy", () => {
    const state = pending();
    expect(state.stateSchemaVersion).toBe(4);
    expect(state.serverEntropySeed).toBe(PRIVATE_SEED);
    expect(state.lifecycle).toBe("starting");
    expect(state.progression.phase).toBe("INITIAL_DEALER_SELECTION");
    expect(state.progression.dealerSeat).toBeNull();
    expect(state.progression.firstDeclarerSeat).toBeNull();
    expect(state.progression.firstLeaderSeat).toBeNull();
    expect(state.cards.deck).toEqual([]);
    expect(state.cards.hands.every((hand) => hand.length === 0)).toBe(true);
    expect(state.score.completedDeals).toEqual([]);
    expect(state.score.roundPremia).toEqual([]);
  });

  it("resolves a center opening card before distributed first-Ace dealer selection, then activates gameplay explicitly", () => {
    const barrier = resolveDealerBootstrapAndInitializeDealOne({
      state: pending(),
      firstRecipientRandom: () => 0.75,
      selectionShuffleRandom: sequence([0.11, 0.87, 0.32, 0.66, 0.04]),
      dealOneShuffleRandom: sequence([0.93, 0.21, 0.58, 0.14, 0.77]),
      serverNow: "2026-10-04T12:00:00.000Z",
    });

    expect(barrier.lifecycle).toBe("starting");
    expect(barrier.stateVersion).toBe(2);
    expect(barrier.progression.phase).toBe("DEAL_SETUP");
    expect(barrier.progression.currentActorSeat).toBeNull();
    expect(barrier.timing.currentHumanDeadline).toBeNull();
    expect(barrier.cards.deck).toHaveLength(36);
    expect(new Set(barrier.cards.deck.map((card) => card.id)).size).toBe(36);
    expect(barrier.cards.hands.every((hand) => hand.length === 1)).toBe(true);

    const selection = barrier.initialDealerSelection;
    expect(selection?.status).toBe("resolved");
    if (!selection || selection.status !== "resolved") throw new Error("expected resolved selection");
    expect(selection.openingCard).toBeDefined();
    expect(selection.revealedSelectionCards.map((card) => card.id)).not.toContain(selection.openingCard?.id);
    expect(selection.firstRecipientSeat).toBe(3);
    const last = selection.revealedSelectionCards.at(-1);
    expect(last?.kind).toBe("standard");
    expect(last && last.kind === "standard" ? last.rank : null).toBe("A");
    expect(selection.revealedSelectionCards.slice(0, -1).some((card) => card.kind === "standard" && card.rank === "A")).toBe(false);
    expect(barrier.progression.dealerSeat).toBe(selection.selectedDealerSeat);
    expect(barrier.progression.firstDeclarerSeat).toBe(nextSeat(selection.selectedDealerSeat));
    expect(barrier.progression.firstLeaderSeat).toBe(nextSeat(selection.selectedDealerSeat));

    const projected = projectGameForSeat(barrier, 0).initialDealerSelection;
    expect(projected?.status).toBe("resolved");
    if (!projected || projected.status !== "resolved") throw new Error("expected projected resolved selection");
    expect(projected.openingCard?.id).toBe(selection.openingCard?.id);

    const active = activateDealOneAfterPresentation(barrier, "2026-10-04T12:00:05.000Z");
    expect(active.lifecycle).toBe("active");
    expect(active.stateVersion).toBe(3);
    expect(active.progression.phase).toBe("DECLARATION");
    expect(active.progression.currentActorSeat).toBe(active.progression.firstDeclarerSeat);
    expect(active.declarations.currentDeclarerSeat).toBe(active.progression.firstDeclarerSeat);
    const actor = active.progression.currentActorSeat!;
    expect(active.timing.currentHumanDeadline).toBe(active.seats[actor].controller === "human" ? "2026-10-04T12:00:35.000Z" : null);
  });

  it("projects the ritual without exposing deck, bootstrap identity or private entropy", () => {
    const projection = projectGameForSeat(pending(), 0);
    const serialized = JSON.stringify(projection);
    expect(projection.initialDealerSelection).toEqual({ status: "pending" });
    expect(projection.cards.ownHandVisible).toBe(false);
    expect(projection.cards.ownHand).toEqual([]);
    expect(serialized).not.toContain('"deck"');
    expect(serialized).not.toContain("bootstrapActionId");
    expect(serialized).not.toContain("serverEntropySeed");
    expect(serialized).not.toContain(PRIVATE_SEED);
  });
});
