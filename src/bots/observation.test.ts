import { beforeAll, describe, expect, it } from "vitest";
import { createDeck, RANK_VALUE, SUITS, type Card } from "@/domain/cards";
import type { PlayerGameProjection } from "@/domain/projection";
import { LAB_TIERS, seededRandom, simulateFullGame } from "@/server/botLab/simulation.server";
import { selectBaselineGameplayCommand as selectAutomaticGameplayCommand } from "./baselineRuntime";
import { consistentHolding, observeBot, sampleConsistentWorld } from "./observation";

let base: PlayerGameProjection;
const card = (id: string): Card => {
  const found = createDeck("classic38").find((c) => c.id === id);
  if (!found) throw new Error(id);
  return found;
};
beforeAll(() => {
  simulateFullGame(
    {
      seed: 42,
      ruleset: "popular",
      lineup: [...LAB_TIERS, LAB_TIERS[0]],
      strategyVersion: "baseline",
    },
    {
      select: (projection) => {
        base ??= structuredClone(projection);
        return selectAutomaticGameplayCommand(projection)?.command ?? null;
      },
    },
  );
});
function highestFixture(): PlayerGameProjection {
  const p = structuredClone(base);
  p.viewerSeat = 0;
  p.progression.cardsPerPlayer = 3;
  p.progression.phase = "CARD_PLAY";
  p.trump = { status: "resolved", suit: "clubs" };
  p.cards.ownHandVisible = true;
  p.cards.ownHand = [card("7-hearts"), card("8-hearts")];
  p.cards.exposedTrumpCard = null;
  p.cards.currentTrick = [];
  p.cards.completedTricks = [
    {
      winnerSeat: 2,
      cards: [
        {
          seatIndex: 1,
          card: card("joker-1"),
          joker: { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "spades" },
        },
        { seatIndex: 2, card: card("Q-spades") },
        { seatIndex: 3, card: card("9-hearts") },
        { seatIndex: 0, card: card("7-clubs") },
      ],
    },
  ];
  p.declarations.values = [0, 1, 2, 3];
  p.score.tricksTaken = [0, 0, 1, 0];
  return p;
}
describe("public bot observation and constrained worlds", () => {
  it("deduces requested void, mandatory trump fallback and forced maximum, not arbitrary rank preference", () => {
    const o = observeBot(highestFixture());
    expect(o.constraints[2]!.maximumRank.get("spades")).toBe(RANK_VALUE.Q);
    expect(o.constraints[3]!.voidSuits).toEqual(new Set(["spades", "clubs"]));
    expect(o.constraints[0]!.voidSuits).toEqual(new Set(["spades"]));
    expect(o.constraints[0]!.maximumRank.size).toBe(0);
    expect(o.intents).toEqual(["EXACT", "NEEDS_TRICKS", "NEEDS_TRICKS", "UNREACHABLE"]);
    expect(o.unknownCards.some((c) => c.id === "joker-2")).toBe(true);
    expect(o.unknownCards.some((c) => c.id === "joker-1")).toBe(false);
  });
  it("a competing Joker does not prove void or force away a held Ace", () => {
    const p = highestFixture();
    p.cards.completedTricks[0]!.cards[1] = {
      seatIndex: 2,
      card: card("joker-2"),
      joker: { context: "OPEN_TRICK", mode: "COMPETE" },
    };
    const o = observeBot(p);
    expect(o.constraints[2]!.voidSuits.size).toBe(0);
    expect(o.constraints[2]!.maximumRank.size).toBe(0);
  });
  it("SUIT_WINS follows suit but does not deduce a maximum rank", () => {
    const p = highestFixture();
    p.cards.completedTricks[0]!.cards[0]!.joker = {
      context: "LEAD",
      mode: "SUIT_WINS",
      requestedSuit: "spades",
    };
    expect(observeBot(p).constraints[2]!.maximumRank.size).toBe(0);
  });
  it("samples unique inventories, exact hand sizes, hard legal facts and explicit stock", () => {
    const o = observeBot(highestFixture()),
      random = seededRandom(123);
    for (let i = 0; i < 50; i++) {
      const world = sampleConsistentWorld(o, random);
      expect(world).not.toBeNull();
      expect(world!.hands.map((h) => h.length)).toEqual([2, 2, 2, 2]);
      for (let seat = 0; seat < 4; seat++)
        expect(world!.hands[seat]!.every((c) => consistentHolding(c, o.constraints[seat]!))).toBe(
          true,
        );
      const ids = [...world!.hands.flat(), ...world!.stock].map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(world!.stock.length).toBe(24);
      expect(world!.hands[0]).toEqual(o.ownHand);
    }
  });
  it("is reproducible and never repairs impossible worlds by violating deductions", () => {
    const o = observeBot(highestFixture());
    expect(sampleConsistentWorld(o, seededRandom(17))).toEqual(
      sampleConsistentWorld(o, seededRandom(17)),
    );
    const impossible = {
      ...o,
      unknownCards: [card("A-spades"), card("K-spades")],
      remainingHandSizes: [2, 0, 2, 0],
    };
    expect(sampleConsistentWorld(impossible, seededRandom(17), 3)).toBeNull();
    expect(() => sampleConsistentWorld(o, seededRandom(17), 513)).toThrow("budget");
  });
  it("normalizes the public pending Joker without inventing its semantic", () => {
    const p = highestFixture();
    p.progression.phase = "JOKER_DECISION";
    p.cards.ownHand = [card("7-hearts")];
    p.cards.currentTrick = [{ seatIndex: 0, card: card("joker-2") }];
    const o = observeBot(p);
    expect(o.committedTrick).toEqual([]);
    expect(o.pendingJoker?.card.id).toBe("joker-2");
    expect(o.pendingJoker?.joker).toBeUndefined();
    expect(o.remainingHandSizes).toEqual([1, 2, 2, 2]);
  });
  it("keeps score/round context and observation copies independent of caller mutations", () => {
    const p = highestFixture(),
      o = observeBot(p),
      old = o.publicScore.cumulativeTotals[0];
    p.score.cumulativeTotals[0] += 999;
    p.cards.ownHand.length = 0;
    expect(o.publicScore.cumulativeTotals[0]).toBe(old);
    expect(o.ownHand.length).toBe(2);
    expect(o).not.toHaveProperty("serverEntropySeed");
    expect(o).not.toHaveProperty("deckOrder");
  });
  it("ignores cross-deal presentation and independent dealer-selection cards", () => {
    const p = highestFixture(),
      first = observeBot(p);
    p.cards.presentationTail = [
      {
        dealNumber: 99,
        ordinal: 1,
        winnerSeat: 0,
        cards: [{ seatIndex: 0, card: card("A-spades") }],
      },
    ];
    p.initialDealerSelection = {
      status: "resolved",
      firstRecipientSeat: 0,
      selectedDealerSeat: 0,
      revealedSelectionCards: [card("K-spades")],
      resolvedAtStateVersion: 1,
    };
    expect(observeBot(p)).toEqual(first);
  });
  it("refuses malformed inventories and unavailable private hand views", () => {
    const p = highestFixture();
    p.cards.ownHand[1] = p.cards.ownHand[0]!;
    expect(() => observeBot(p)).toThrow("inventory");
    p.cards.ownHandVisible = false;
    expect(() => observeBot(p)).toThrow("observable");
  });
  it("observes every active decision through all rulesets, including partial nines and pending Jokers", () => {
    const phases = new Set<string>();
    for (const ruleset of ["popular", "classic", "minus", "panagiotis"] as const) {
      simulateFullGame(
        { seed: 56, ruleset, lineup: [...LAB_TIERS, LAB_TIERS[0]], strategyVersion: "baseline" },
        {
          select: (projection) => {
            const o = observeBot(projection);
            phases.add(projection.progression.phase);
            expect(o.remainingHandSizes[o.identity.seat]).toBe(o.ownHand.length);
            expect(o.unknownCards.every((c) => !o.ownHand.some((owned) => owned.id === c.id))).toBe(
              true,
            );
            return selectAutomaticGameplayCommand(projection)?.command ?? null;
          },
        },
      );
    }
    expect(phases.has("NINE_CARD_TRUMP_CHOICE")).toBe(true);
    expect(phases.has("JOKER_DECISION")).toBe(true);
    expect(phases.has("DECLARATION")).toBe(true);
  }, 30000);
});
