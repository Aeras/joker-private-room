import { describe, expect, it } from "vitest";
import {
  LAB_TIERS,
  simulateFullGame,
  SimulationFailure,
  type SimulationConfig,
} from "./simulation.server";
import { pairedScoreComparison, summarizeGames } from "./metrics";
import { RULESET_LIST } from "@/domain/rulesets";
import { DEALS } from "@/domain/gameConfig";
import { selectAutomaticGameplayCommand } from "@/bots/runtime";
const config: SimulationConfig = {
  seed: 20261009,
  ruleset: "popular",
  lineup: [LAB_TIERS[0], LAB_TIERS[1], LAB_TIERS[2], LAB_TIERS[0]],
  strategyVersion: "baseline",
};
const clock = { now: () => 0 };
describe("isolated canonical bot benchmark", () => {
  for (const ruleset of RULESET_LIST)
    it(`finishes every canonical deal and exact scoring: ${ruleset.id}`, () => {
      const game = simulateFullGame({ ...config, ruleset: ruleset.id }, clock);
      expect(game.deals).toHaveLength(DEALS.length);
      expect(game.premia).toHaveLength(4);
      expect(game.tricks).toHaveLength(DEALS.reduce((sum, deal) => sum + deal.cardsPerPlayer, 0));
      for (const deal of game.deals) {
        expect(deal.tricksTaken.reduce((a, b) => a + b, 0)).toBe(deal.cardsPerPlayer);
        expect(deal.declarations.reduce((a, b) => a + b, 0)).not.toBe(deal.cardsPerPlayer);
        expect(deal.dealScores).toEqual(
          deal.declarations.map((declared, seat) =>
            ruleset.scoreDeal({
              declared,
              taken: deal.tricksTaken[seat]!,
              tricksInDeal: deal.cardsPerPlayer,
            }),
          ),
        );
      }
      expect(game.scores).toEqual(
        [0, 1, 2, 3].map(
          (seat) =>
            game.deals.reduce((sum, d) => sum + d.dealScores[seat]!, 0) +
            game.premia.reduce((sum, p) => sum + p.adjustments[seat]!, 0),
        ),
      );
    });
  it("reproduces decisions, results and dealer, independent of measured timings", () => {
    expect(simulateFullGame(config, clock)).toEqual(simulateFullGame(config, clock));
  });
  it("cancels between transitions rather than returning fake completed results", () => {
    let checks = 0;
    expect(() => simulateFullGame(config, { cancelled: () => ++checks > 5 })).toThrow(
      SimulationFailure,
    );
  });
  it("rejects injected illegal commands through the canonical dispatcher", () => {
    expect(() =>
      simulateFullGame(config, { select: () => ({ type: "declare", value: 99 }) }),
    ).toThrow(/Rejected/);
  });
  it("passes only a seat-safe projection on every decision of a full game", () => {
    let inspected = 0;
    const game = simulateFullGame(config, {
      ...clock,
      select: (projection) => {
        inspected++;
        expect(Object.keys(projection.cards).sort()).toEqual(
          [
            "completedTricks",
            "currentTrick",
            "exposedTrumpCard",
            "ownHand",
            "ownHandVisible",
            "presentationTail",
          ].sort(),
        );
        expect(projection).not.toHaveProperty("serverEntropySeed");
        expect(projection).not.toHaveProperty("joker");
        for (const seat of projection.seats) expect(seat).not.toHaveProperty("hand");
        return selectAutomaticGameplayCommand(projection)?.command ?? null;
      },
    });
    expect(inspected).toBe(game.decisions.length);
    expect(inspected).toBeGreaterThan(500);
  }, 30000);
  it("aggregates real denominators and exact/under/over outcomes", () => {
    const game = simulateFullGame(config, clock),
      stats = summarizeGames([game]);
    expect(Object.values(stats).reduce((sum, s) => sum + s.participations, 0)).toBe(4);
    expect(Object.values(stats).reduce((sum, s) => sum + s.winShare, 0)).toBeCloseTo(1);
    expect(
      Object.values(stats)
        .flatMap((s) => Object.values(s.exactByDealSize))
        .reduce((sum, row) => sum + row.deals, 0),
    ).toBe(DEALS.length * 4);
    for (const tier of Object.values(stats))
      for (const row of Object.values(tier.exactByDealSize))
        expect(row.exact + row.under + row.over).toBe(row.deals);
    expect(
      Object.values(stats).reduce((sum, s) => sum + s.jokerTricksWon + s.jokerTricksLost, 0),
    ).toBe(game.tricks.flatMap((t) => t.cards).filter((p) => p.card.kind === "joker").length);
  });
  it("does not advertise a confidence interval from a small pilot", () => {
    const game = simulateFullGame(config, clock);
    expect(pairedScoreComparison([game], [game], 0)).toEqual({
      independentSeeds: 1,
      matchedGames: 1,
      meanScoreDelta: 0,
      approximate95CI: null,
    });
    expect(() => pairedScoreComparison([game], [], 0)).toThrow("Missing");
    expect(() => pairedScoreComparison([game, game], [game], 0)).toThrow("Duplicate");
  });
  it("rotates all four lineup positions and keeps the dealer ritual independent", () => {
    const first = simulateFullGame(config, clock);
    for (const rotation of [1, 2, 3] as const) {
      const game = simulateFullGame({ ...config, rotation }, clock);
      expect(game.selectedDealer).toBe(first.selectedDealer);
      expect(game.physicalLineup[rotation]).toBe(config.lineup[0]);
    }
  });
});
