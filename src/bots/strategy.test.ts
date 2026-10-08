import { describe, expect, it } from "vitest";

import type { Card } from "@/domain/cards";
import type { PlayerView } from "@/domain/engine";
import {
  MAX_TIER3_SIMULATION_BUDGET,
  TIER1_DECLARATION_SIMULATION_BUDGET,
  TIER2_DECLARATION_SIMULATION_BUDGET,
  TIER3_DECLARATION_SIMULATION_BUDGET,
  analyzeDeclaration,
  createProbabilitySimulationStrategy,
  derivePublicInference,
  memoryInferenceStrategy,
  resolveBotStrategy,
  strongBasicStrategy,
} from "./strategy";

function standard(id: string, suit: "spades" | "hearts" | "diamonds" | "clubs", rank: "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A"): Card {
  return { kind: "standard", id, suit, rank };
}

function makeView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    seatIndex: 0,
    hand: [standard("A-hearts", "hearts", "A"), standard("7-clubs", "clubs", "7")],
    cardsPerPlayer: 2,
    trump: null,
    declarations: [1, 0, 0, 0],
    tricksTaken: [0, 0, 0, 0],
    currentTrick: [],
    history: { completedTricks: [] },
    ...overrides,
  };
}

describe("tiered canonical bot strategies", () => {
  it("resolves every pinned production strategy profile", () => {
    expect(resolveBotStrategy("strong-basic-v1").id).toBe("strong-basic-v1");
    expect(resolveBotStrategy("memory-inference-v1").id).toBe("memory-inference-v1");
    expect(resolveBotStrategy("probability-simulation-v1").id).toBe(
      "probability-simulation-v1",
    );
  });

  it("gives every tier a serious declaration budget, with stronger tiers doing deeper analysis", () => {
    expect(TIER1_DECLARATION_SIMULATION_BUDGET).toBeGreaterThanOrEqual(128);
    expect(TIER2_DECLARATION_SIMULATION_BUDGET).toBeGreaterThan(TIER1_DECLARATION_SIMULATION_BUDGET);
    expect(TIER3_DECLARATION_SIMULATION_BUDGET).toBeGreaterThan(TIER2_DECLARATION_SIMULATION_BUDGET);
  });

  it("all tiers pass with a genuinely weak three-card hand rather than inventing a bid", () => {
    const view = makeView({
      hand: [
        standard("6-hearts", "hearts", "6"),
        standard("7-clubs", "clubs", "7"),
        standard("8-diamonds", "diamonds", "8"),
      ],
      cardsPerPlayer: 3,
      trump: "spades",
      declarations: [null, null, null, null],
      scoringProfile: "popular",
    });
    expect(strongBasicStrategy.chooseDeclaration(view, [0, 1, 2, 3])).toBe(0);
    expect(memoryInferenceStrategy.chooseDeclaration(view, [0, 1, 2, 3])).toBe(0);
    expect(createProbabilitySimulationStrategy({ seed: "weak-hand" }).chooseDeclaration(view, [0, 1, 2, 3])).toBe(0);
  });

  it("all tiers recognize Joker plus two strong trumps as a serious three-card contract", () => {
    const view = makeView({
      hand: [
        { kind: "joker", id: "joker-1" },
        standard("A-spades", "spades", "A"),
        standard("K-spades", "spades", "K"),
      ],
      cardsPerPlayer: 3,
      trump: "spades",
      declarations: [null, null, null, null],
      scoringProfile: "popular",
    });
    for (const strategy of [
      strongBasicStrategy,
      memoryInferenceStrategy,
      createProbabilitySimulationStrategy({ seed: "strong-hand" }),
    ]) {
      expect(strategy.chooseDeclaration(view, [0, 1, 2, 3])).toBeGreaterThanOrEqual(2);
    }
  });

  it("declaration analysis uses only own/public information and always obeys legal values", () => {
    const view = makeView({
      hand: [
        { kind: "joker", id: "joker-1" },
        standard("A-hearts", "hearts", "A"),
        standard("Q-hearts", "hearts", "Q"),
      ],
      cardsPerPlayer: 3,
      trump: "hearts",
      declarations: [null, 1, 0, 1],
      scoringProfile: "popular",
    });
    const legal = [0, 1, 3];
    const analysis = analyzeDeclaration(view, legal, 3, { seed: "fair-info", budget: 256 });
    expect(legal).toContain(analysis.selected);
    expect(analysis.probabilities).toHaveLength(4);
    expect(analysis.probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 6);
    expect([...analysis.expectedScores.keys()]).toEqual(legal);
  });

  it("Tier 1 makes competent declaration and card decisions instead of taking the first option", () => {
    const view = makeView({
      hand: [
        standard("A-hearts", "hearts", "A"),
        standard("A-clubs", "clubs", "A"),
        { kind: "joker", id: "joker-1" },
      ],
      cardsPerPlayer: 3,
      declarations: [2, 0, 0, 0],
    });

    expect(strongBasicStrategy.chooseDeclaration(view, [0, 1, 2, 3])).toBeGreaterThan(0);
    expect(
      strongBasicStrategy.chooseCard(view, [
        standard("7-clubs", "clubs", "7"),
        standard("A-clubs", "clubs", "A"),
      ]).id,
    ).toBe("A-clubs");
  });

  it("Tier 1 conserves strength after its declaration target is already met", () => {
    const view = makeView({ declarations: [1, 0, 0, 0], tricksTaken: [1, 0, 0, 0] });
    expect(
      strongBasicStrategy.chooseCard(view, [
        standard("7-clubs", "clubs", "7"),
        standard("A-clubs", "clubs", "A"),
      ]).id,
    ).toBe("7-clubs");
  });

  it("Tier 1 chooses trump from hand quality and chooses Joker semantics by contract need", () => {
    const view = makeView({
      trump: null,
      hand: [
        standard("A-spades", "spades", "A"),
        standard("K-spades", "spades", "K"),
        standard("Q-spades", "spades", "Q"),
        standard("A-hearts", "hearts", "A"),
      ],
      declarations: [2, null, null, null],
    });

    expect(strongBasicStrategy.chooseTrump(view, [null, "hearts", "spades"])).toBe("spades");
    expect(
      strongBasicStrategy.chooseJokerSemantic(view, [
        { context: "OPEN_TRICK", mode: "FROM_BELOW" },
        { context: "OPEN_TRICK", mode: "COMPETE" },
      ]),
    ).toEqual({ context: "OPEN_TRICK", mode: "COMPETE" });
  });

  it("Tier 2 infers void suits only from legitimate public trick observations", () => {
    const view = makeView({
      history: {
        completedTricks: [
          {
            winnerSeat: 0,
            cards: [
              { seatIndex: 0, card: standard("A-hearts", "hearts", "A") },
              { seatIndex: 1, card: standard("7-hearts", "hearts", "7") },
              { seatIndex: 2, card: standard("8-clubs", "clubs", "8") },
              { seatIndex: 3, card: { kind: "joker", id: "joker-1" }, joker: { context: "OPEN_TRICK", mode: "FROM_BELOW" } },
            ],
          },
        ],
      },
    });

    const inference = derivePublicInference(view);
    expect(inference.playedCardIds.has("8-clubs")).toBe(true);
    expect(inference.voidSuitsBySeat.get(2)?.has("hearts")).toBe(true);
    // A strategic Joker does not prove that the player was void in the requested suit.
    expect(inference.voidSuitsBySeat.get(3)?.has("hearts") ?? false).toBe(false);
  });

  it("Tier 2 changes a lead choice when public history shows trump-risk voids", () => {
    const base = makeView({
      trump: "spades",
      hand: [standard("A-hearts", "hearts", "A"), standard("A-clubs", "clubs", "A")],
      declarations: [1, 0, 0, 0],
    });
    const withPublicVoid = makeView({
      ...base,
      history: {
        completedTricks: [
          {
            winnerSeat: 0,
            cards: [
              { seatIndex: 0, card: standard("K-hearts", "hearts", "K") },
              { seatIndex: 1, card: standard("7-clubs", "clubs", "7") },
              { seatIndex: 2, card: standard("8-hearts", "hearts", "8") },
              { seatIndex: 3, card: standard("9-hearts", "hearts", "9") },
            ],
          },
        ],
      },
    });

    const chosen = memoryInferenceStrategy.chooseCard(withPublicVoid, withPublicVoid.hand);
    expect(chosen.id).toBe("A-clubs");
  });

  it("Tier 3 is deterministic for a seed and always returns a legal candidate", () => {
    const strategyA = createProbabilitySimulationStrategy({ seed: "phase10-test", simulationBudget: 24 });
    const strategyB = createProbabilitySimulationStrategy({ seed: "phase10-test", simulationBudget: 24 });
    const view = makeView({
      trump: "spades",
      hand: [
        standard("A-hearts", "hearts", "A"),
        standard("K-spades", "spades", "K"),
        standard("7-clubs", "clubs", "7"),
      ],
      declarations: [1, 0, 0, 0],
    });

    const legal = view.hand;
    const first = strategyA.chooseCard(view, legal);
    const second = strategyB.chooseCard(view, legal);
    expect(second.id).toBe(first.id);
    expect(legal.some((card) => card.id === first.id)).toBe(true);
  });

  it("Tier 3 has a hard simulation cap and a legal zero-budget fallback", () => {
    expect(MAX_TIER3_SIMULATION_BUDGET).toBeLessThanOrEqual(256);
    const fallbackStrategy = createProbabilitySimulationStrategy({
      seed: "fallback",
      simulationBudget: 0,
    });
    const view = makeView();
    const selected = fallbackStrategy.chooseCard(view, view.hand);
    expect(view.hand.some((card) => card.id === selected.id)).toBe(true);
  });

  it("all tiers cover declaration, trump, card and Joker semantic decisions", () => {
    const view = makeView({ hand: [{ kind: "joker", id: "joker-1" }] });
    for (const strategy of [
      strongBasicStrategy,
      memoryInferenceStrategy,
      createProbabilitySimulationStrategy({ seed: "contract", simulationBudget: 8 }),
    ]) {
      expect([0, 1]).toContain(strategy.chooseDeclaration(view, [0, 1]));
      expect(["hearts", null]).toContain(strategy.chooseTrump(view, ["hearts", null]));
      expect(strategy.chooseCard(view, view.hand).id).toBe("joker-1");
      expect(
        strategy.chooseJokerSemantic(view, [
          { context: "OPEN_TRICK", mode: "COMPETE" },
          { context: "OPEN_TRICK", mode: "FROM_BELOW" },
        ]),
      ).toEqual({ context: "OPEN_TRICK", mode: "COMPETE" });
    }
  });
});
