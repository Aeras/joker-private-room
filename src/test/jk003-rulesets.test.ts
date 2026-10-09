import { describe, expect, it } from "vitest";
import { createDeck } from "@/domain/cards";
import { prepareGameplayDeck } from "@/domain/deckPolicy";
import { assets } from "@/assets/registry";
import {
  dealCards,
  dealNineCardInitial,
  completeNineCardDeal,
  dealWithTrumpReveal,
  type SeatIndex,
} from "@/domain/dealing";
import { getRuleset, RULESETS, scoreMinus, type RulesetId } from "@/domain/rulesets";
import { assertRulesetState } from "@/domain/rulesetValidation";
import { scoreDeal } from "@/domain/scoring";
import { projectGameForSeat } from "@/domain/projection";
import { applyGameplayCommand } from "@/domain/gameplayCommands";
import { settleCanonicalLifecycle } from "@/domain/gameLifecycle";
import { derivePublicInference, fairUnknownCards, strongBasicStrategy, memoryInferenceStrategy, probabilitySimulationStrategy } from "@/bots/strategy";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import { existsSync } from "node:fs";
import { legalMoves, type PlayerView } from "@/domain/engine";

function rng(seed: number) {
  let x = seed;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}
const now = "2026-10-04T19:00:00.000Z";

function nextNine(id: RulesetId) {
  const state = reconciliationFixture(id);
  state.progression = {
    ...state.progression,
    round: 2,
    dealNumber: 9,
    indexInPhase: 1,
    cardsPerPlayer: 9,
    phase: "DEAL_RESULT",
  };
  state.cards.hands = [[], [], [], []];
  state.cards.currentTrick = [];
  state.declarations.declarations = [9, 0, 0, 0];
  state.score.tricksTaken = [9, 0, 0, 0];
  const result = settleCanonicalLifecycle({ state, nextDealRandom: rng(431), serverNow: now });
  if (!result.ok || !result.changed) throw new Error("Nine-card lifecycle failed");
  return result.state;
}

describe("JK-003 exact versioned policies", () => {
  it("has exactly three supported immutable identity/version pairs and rejects every mismatch", () => {
    expect(Object.keys(RULESETS)).toEqual(["popular", "classic", "minus"]);
    for (const id of Object.keys(RULESETS) as RulesetId[]) {
      expect(getRuleset(id, id + "-v1")).toBe(RULESETS[id]);
      for (const other of Object.keys(RULESETS))
        if (other !== id) expect(() => getRuleset(id, other + "-v1")).toThrow();
    }
    for (const id of [undefined, null, "future", "panagiotis", "__proto__", "constructor"])
      expect(() => getRuleset(id, "popular-v1")).toThrow();
  });
  it("reuses the existing six assets and preserves the Popular 34+2 deck", () => {
    expect(createDeck()).toHaveLength(36);
    expect(createDeck("classic38")).toHaveLength(38);
    expect(createDeck().filter((c) => c.kind === "joker")).toHaveLength(2);
    for (const suit of ["spades", "clubs"] as const) {
      const card = createDeck("classic38").find((c) => c.id === "6-" + suit)!;
      expect(createDeck().some((c) => c.id === card.id)).toBe(false);
      expect(assets.cardFace(card)).toBe("/cards/runtime-png/faces/" + suit + "_6.png");
      expect(existsSync("public/cards/runtime-png/faces/" + suit + "_6.png")).toBe(true);
    }
  });
  it("inherits Popular premia for every policy", () => {
    for (const policy of Object.values(RULESETS))
      expect(policy.calculatePhaseBonus).toBe(RULESETS.popular.calculatePhaseBonus);
  });
  it("uses Minus only for underbids, including zero tricks, without adding the Popular penalty", () => {
    for (let total = 1; total <= 9; total++)
      for (let declared = 0; declared <= total; declared++)
        for (let taken = 0; taken <= total; taken++) {
          const input = { declared, taken, tricksInDeal: total };
          expect(scoreMinus(input)).toBe(
            taken < declared ? -100 * (declared - taken) : scoreDeal(input),
          );
        }
    expect(scoreMinus({ declared: 1, taken: 0, tricksInDeal: 9 })).toBe(-100);
    expect(scoreMinus({ declared: 3, taken: 0, tricksInDeal: 9 })).toBe(-300);
  });
  it("settles Minus scores into authoritative history", () => {
    const state = reconciliationFixture("minus");
    state.cards.hands = [[], [], [], []];
    state.progression.phase = "DEAL_RESULT";
    state.declarations.declarations = [1, 0, 0, 0];
    state.score.tricksTaken = [0, 1, 0, 0];
    const result = settleCanonicalLifecycle({ state, nextDealRandom: rng(12), serverNow: now });
    expect(
      result.ok && result.changed && result.state.score.completedDeals?.[0]?.dealScores,
    ).toEqual([-100, 10, 50, 50]);
  });
});

describe("JK-003 Classic 38-card dealing and privacy", () => {
  for (let n = 1; n <= 9; n++)
    it("deals cyclically and exposes the next card for N=" + n, () => {
      for (const dealer of [0, 1, 2, 3] as SeatIndex[]) {
        const state = reconciliationFixture("classic");
        const deck = prepareGameplayDeck(state, rng(312 + n));
        const result = dealWithTrumpReveal(deck, dealer, n);
        expect(result.hands.map((hand) => hand.length)).toEqual([n, n, n, n]);
        expect(result.revealedTrumpCard).toEqual(deck[n * 4]);
        expect(new Set(result.hands.flat().map((c) => c.id)).size).toBe(n * 4);
        for (let round = 0; round < n; round++)
          for (let offset = 1; offset <= 4; offset++)
            expect(result.hands[(dealer + offset) % 4]![round]).toEqual(
              deck[round * 4 + offset - 1],
            );
      }
    });
  it("enters declarations directly on 9, exposes 37, retains 38 privately and offers no chooser", () => {
    const state = nextNine("classic");
    expect(state.progression.phase).toBe("DECLARATION");
    expect(state.cards.drawCursor).toBe(36);
    expect(state.cards.exposedTrumpCard).toEqual(state.cards.deck[36]);
    expect(state.cards.hiddenPartialNineCardHands).toBe(false);
    assertRulesetState(state);
    // Dealer-selection public prefix belongs to an independent deck; clear that historic prefix for the unused-card assertion.
    delete state.initialDealerSelection;
    for (const seat of [0, 1, 2, 3] as SeatIndex[]) {
      const projection = projectGameForSeat(state, seat);
      expect(projection.cards.ownHand).toHaveLength(9);
      expect(projection.local.legalActions.some((a) => a.type === "choose_trump")).toBe(false);
      expect(JSON.stringify(projection)).not.toContain(state.cards.deck[37]!.id);
      expect(JSON.stringify(projection)).not.toMatch(
        /drawCursor|hiddenPartial|serverEntropySeed|deckSize|unusedCard/,
      );
    }
    expect(
      applyGameplayCommand({
        state,
        seat: state.progression.currentActorSeat!,
        command: { type: "choose_trump", suit: null },
        serverNow: now,
      }),
    ).toEqual({ ok: false, code: "WRONG_PHASE" });
  });
  it("a revealed Joker means No Trump with no chooser", () => {
    const deck = createDeck("classic38");
    const joker = deck.findIndex((c) => c.kind === "joker");
    [deck[36], deck[joker]] = [deck[joker]!, deck[36]!];
    expect(dealWithTrumpReveal(deck, 3, 9).trump).toBeNull();
  });
  it("bot uncertainty removes public 37 and retains the unseen 38", () => {
    const state = nextNine("classic");
    const view: PlayerView = {
      seatIndex: 0,
      hand: state.cards.hands[0],
      deckProfile: "classic38",
      exposedTrumpCard: state.cards.exposedTrumpCard,
      cardsPerPlayer: 9,
      trump: null,
      declarations: [null, null, null, null],
      tricksTaken: [0, 0, 0, 0],
      currentTrick: [],
      history: { completedTricks: [] },
    };
    const unknown = fairUnknownCards(view, derivePublicInference(view));
    expect(unknown.some((c) => c.id === state.cards.deck[36]!.id)).toBe(false);
    expect(unknown.some((c) => c.id === state.cards.deck[37]!.id)).toBe(true);
    expect(unknown).toHaveLength(28);
  });
});

describe("JK-003 safe persisted compatibility", () => {
  it("preserves all three Popular bot strategies when public ruleset context is added", () => {
    const deck = createDeck();
    for (let seed=1;seed<=20;seed++) {
      const view: PlayerView = { seatIndex: 0, hand: deck.slice(seed,seed+9), cardsPerPlayer: 9, trump: "hearts", declarations: [2,3,1,0], tricksTaken: [0,0,0,0], currentTrick: [], history: {completedTricks: []} };
      const enriched: PlayerView = {...view, deckProfile: "popular36", scoringProfile: "popular", exposedTrumpCard: deck[(seed+15)%36]!};
      const legal = legalMoves(view);
      for (const strategy of [strongBasicStrategy,memoryInferenceStrategy,probabilitySimulationStrategy]) {
        expect(strategy.chooseCard(enriched,legal)).toEqual(strategy.chooseCard(view,legal));
        expect(strategy.chooseDeclaration(enriched,[0,1,2,3,4,5,6,7,8,9])).toBe(strategy.chooseDeclaration(view,[0,1,2,3,4,5,6,7,8,9]));
        expect(strategy.chooseTrump(enriched,["spades","hearts","diamonds","clubs",null])).toBe(strategy.chooseTrump(view,["spades","hearts","diamonds","clubs",null]));
      }
    }
  });
  it("continues genuine schema-v3 Popular snapshots without changing their identity", () => {
    const state = reconciliationFixture();
    state.stateSchemaVersion = 3;
    assertRulesetState(state);
    expect(projectGameForSeat(state, 0).rulesVersion).toBe("popular-v1");
    const command = applyGameplayCommand({
      state,
      seat: state.progression.currentActorSeat!,
      command: { type: "declare", value: state.declarations.legalValues[0]! },
      serverNow: now,
    });
    expect(command.ok && command.state.stateSchemaVersion).toBe(3);
  });
  it("rejects malformed decks, policy versions, Classic chooser state", () => {
    const state = reconciliationFixture("classic");
    for (const mutate of [
      (s: typeof state) => {
        s.rulesVersion = "popular-v1";
      },
      (s: typeof state) => {
        s.cards.deck.pop();
      },
      (s: typeof state) => {
        s.cards.deck[0] = s.cards.deck[1]!;
      },
      (s: typeof state) => {
        s.trump = { status: "chooser_pending", chooserSeat: 0 };
      },
    ]) {
      const copy = structuredClone(state);
      mutate(copy);
      expect(() => assertRulesetState(copy)).toThrow();
    }
    const classicNine = nextNine("classic");
    const substituted = structuredClone(classicNine);
    substituted.cards.hands[0][0] = substituted.cards.deck[37]!;
    expect(() => assertRulesetState(substituted)).toThrow("Undealt card entered play");
    const wrongReveal = structuredClone(classicNine);
    wrongReveal.cards.exposedTrumpCard = wrongReveal.cards.deck[37]!;
    expect(() => assertRulesetState(wrongReveal)).toThrow("Classic must reveal card 37");
    const bad = structuredClone(state);
    bad.rulesVersion = "popular-v1";
    expect(settleCanonicalLifecycle({ state: bad, serverNow: now })).toEqual({
      ok: false,
      code: "INVALID_LIFECYCLE_STATE",
    });
  });
});
