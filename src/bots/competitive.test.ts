import { stableJson } from "@/lib/stableFingerprint";
import { describe, expect, it } from "vitest";
import { simulateFullGame, LAB_TIERS } from "@/server/botLab/simulation.server";
import { selectBaselineGameplayCommand } from "./baselineRuntime";
import {
  analyzeCompetitive,
  COMPETITIVE_VERSION,
  completeActions,
  rolloutPolicy,
  outcomeUtility,
  strategicRandom,
} from "./competitive";
import { selectCompetitiveCommand } from "./competitiveRuntime";
import { observeBot } from "./observation";
import { getRuleset } from "@/domain/rulesets";
import { rankFinalScores } from "@/domain/ranking";
import { projectGameForSeat } from "@/domain/projection";
import {
  createInitialDealerBootstrapState,
  resolveDealerBootstrapAndInitializeDealOne,
  activateDealOneAfterPresentation,
} from "@/domain/dealerBootstrap";
import { seededRandom } from "@/server/botLab/simulation.server";
import { createDeck } from "@/domain/cards";
const config = {
  seed: 801,
  ruleset: "popular" as const,
  lineup: [...LAB_TIERS, LAB_TIERS[0]] as [
    (typeof LAB_TIERS)[number],
    (typeof LAB_TIERS)[number],
    (typeof LAB_TIERS)[number],
    (typeof LAB_TIERS)[number],
  ],
  strategyVersion: COMPETITIVE_VERSION,
};
describe("competitive observation-safe search", () => {
  it("finishes a real full game with legal advanced decisions", () => {
    const g = simulateFullGame(config);
    expect(g.deals).toHaveLength(24);
    expect(g.placements).toContain(1);
  }, 30000);
  it("preserves deterministic baseline and candidate policy reproducibility", () => {
    const a = simulateFullGame(config, { now: () => 0 }),
      b = simulateFullGame(config, { now: () => 0 });
    expect(a).toEqual(b);
  }, 60000);
  it("returns a legal fallback on zero budget/cancellation and ignores injected hidden truth", () => {
    let checked = false;
    simulateFullGame(
      { ...config, strategyVersion: "baseline" },
      {
        select: (p) => {
          const old = selectBaselineGameplayCommand(p)!;
          if (!checked) {
            checked = true;
            expect(analyzeCompetitive(p, 3, old.command, { transitions: 0 }).command).toEqual(
              old.command,
            );
            expect(
              analyzeCompetitive(p, 3, old.command, { cancelled: () => true }).command,
            ).toEqual(old.command);
            const first = selectCompetitiveCommand(p);
            const polluted = {
              ...p,
              hiddenHands: [["joker-2"]],
              futureDeck: ["A-spades"],
              serverEntropySeed: "secret",
            };
            expect(selectCompetitiveCommand(polluted)).toEqual(first);
            expect(
              selectCompetitiveCommand({
                ...p,
                seats: p.seats.map((s) => ({
                  ...s,
                  owner:
                    s.owner.type === "bot"
                      ? { ...s.owner, displayName: "changed", personalityId: "changed" }
                      : s.owner,
                })) as typeof p.seats,
              }),
            ).toEqual(first);
          }
          return old.command;
        },
      },
    );
  });
  it("uses compulsory highest and every Joker semantic as joint actions", () => {
    const d = createDeck(),
      c = (id: string) => d.find((c) => c.id === id)!;
    const trick = [
      {
        seatIndex: 0,
        card: c("joker-1"),
        joker: {
          context: "LEAD" as const,
          mode: "HIGHER_SUIT" as const,
          requestedSuit: "spades" as const,
        },
      },
    ];
    const a = completeActions([c("A-spades"), c("7-spades"), c("joker-2")], trick, "hearts", 1);
    expect(a.filter((p) => p.card.kind !== "joker").map((p) => p.card.id)).toEqual(["A-spades"]);
    expect(a.filter((p) => p.card.kind === "joker").map((p) => p.joker?.mode)).toEqual([
      "COMPETE",
      "FROM_BELOW",
    ]);
    expect(completeActions([c("joker-2")], [], null, 0)).toHaveLength(8);
  });
  it("fourth-seat exact protection loses high rather than burning a small escape", () => {
    const d = createDeck(),
      c = (id: string) => d.find((c) => c.id === id)!;
    const action = rolloutPolicy({
      hand: [c("7-hearts"), c("Q-hearts")],
      trick: [
        { seatIndex: 0, card: c("A-hearts") },
        { seatIndex: 1, card: c("8-hearts") },
        { seatIndex: 2, card: c("9-hearts") },
      ],
      trump: null,
      seat: 3,
      bid: 1,
      taken: 1,
      remaining: 2,
      scenario: 0,
    });
    expect(action.card.id).toBe("Q-hearts");
  });
  it.each(["classic", "minus"] as const)(
    "new policies finish %s through canonical scoring",
    (ruleset) => {
      const g = simulateFullGame({ ...config, ruleset, seed: 55 });
      expect(g.deals).toHaveLength(24);
      expect(g.steps).toBeLessThan(5000);
    },
    60000,
  );
  it("final-standings utility uses exact scorer and exact complete-round premia", () => {
    let checked = false;
    simulateFullGame(
      { ...config, strategyVersion: "baseline" },
      {
        select: (p) => {
          const old = selectBaselineGameplayCommand(p)!;
          if (
            !checked &&
            p.progression.dealNumber === 24 &&
            p.progression.phase === "DECLARATION"
          ) {
            checked = true;
            const o = observeBot(p),
              rules = getRuleset(o.rulesetId, o.rulesVersion);
            const bids = [1, 2, 2, 2],
              taken = [1, 2, 3, 3];
            const outcomes = o.publicScore.completedDeals
              .filter((d) => d.round === 4)
              .map((d) => ({
                indexInPhase: d.indexInPhase,
                cardsPerPlayer: d.cardsPerPlayer,
                declarations: d.declarations,
                tricksTaken: d.tricksTaken,
              }));
            outcomes.push({
              indexInPhase: 4,
              cardsPerPlayer: 9,
              declarations: bids as [number, number, number, number],
              tricksTaken: taken as [number, number, number, number],
            });
            const premia = rules.resolvePremia(4, outcomes);
            const totals = o.publicScore.cumulativeTotals.map(
              (s, i) =>
                s +
                rules.scoreDeal({ declared: bids[i]!, taken: taken[i]!, tricksInDeal: 9 }) +
                premia.adjustments[i]!,
            );
            const ranks = rankFinalScores(totals),
              own = ranks.find((r) => r.seatIndex === o.identity.seat)!;
            const expected =
              (own.placement === 1 ? 10000 / ranks.filter((r) => r.placement === 1).length : 0) -
              own.placement * 100 +
              totals[o.identity.seat]! * 0.001;
            expect(outcomeUtility(o, bids, taken, strategicRandom("oracle"), 3)).toBe(expected);
            expect(
              analyzeCompetitive(p, 3, old.command, { maxMs: 0, now: () => 0 }).command,
            ).toEqual(old.command);
          }
          return old.command;
        },
      },
    );
    expect(checked).toBe(true);
  });
  it("swapping real opponent hidden hands and future stock leaves the decision unchanged", () => {
    const seats = ([0, 1, 2, 3] as const).map((seatIndex) => ({
      seatIndex,
      connected: false,
      owner: {
        type: "bot" as const,
        botId: "test-" + seatIndex,
        displayName: "Test",
        personalityId: "test",
        strategyProfileId: LAB_TIERS[0],
        catalogVersion: "test",
      },
    })) as Parameters<typeof createInitialDealerBootstrapState>[0]["seats"];
    const pending = createInitialDealerBootstrapState({
      gameId: "00000000-0000-4000-8000-00000000c001",
      roomId: "00000000-0000-4000-8000-00000000c002",
      bootstrapActionId: "00000000-0000-4000-8000-00000000c003",
      serverEntropySeed: "ab".repeat(32),
      rulesetId: "popular",
      rulesVersion: "popular-v1",
      seats,
    });
    const s = activateDealOneAfterPresentation(
      resolveDealerBootstrapAndInitializeDealOne({
        state: pending,
        firstRecipientRandom: seededRandom(1),
        selectionShuffleRandom: seededRandom(2),
        dealOneShuffleRandom: seededRandom(3),
        serverNow: "2026-10-09T00:00:00Z",
      }),
      "2026-10-09T00:00:00Z",
    );
    const actor = s.progression.currentActorSeat!,
      before = projectGameForSeat(s, actor),
      changed = structuredClone(s);
    const others = ([0, 1, 2, 3] as const).filter((i) => i !== actor);
    [changed.cards.hands[others[0]!], changed.cards.hands[others[1]!]] = [
      changed.cards.hands[others[1]!]!,
      changed.cards.hands[others[0]!]!,
    ];
    changed.cards.deck = changed.cards.deck.slice().reverse();
    const after = projectGameForSeat(changed, actor);
    expect(after).toEqual(before);
    expect(selectCompetitiveCommand(after)).toEqual(selectCompetitiveCommand(before));
  });
  it("commits the evaluated Joker meaning atomically without a second decision", () => {
    let checked = 0;
    simulateFullGame({ ...config, seed: 12 }, { select: p => {
      expect(p.progression.phase).not.toBe("JOKER_DECISION");
      const old = selectBaselineGameplayCommand(p)!;
      const report = analyzeCompetitive(p, 1, old.command, { now: () => 0 });
      if (report.command.type === "play_card" && report.command.cardId.startsWith("joker")) {
        expect(report.command.jokerSemantic).toBeDefined();
        expect(report.command.cardId + "/" + JSON.stringify(report.command.jokerSemantic)).toBe(report.candidates[0]!.key);
        checked++;
      }
      return report.command;
    }});
    expect(checked).toBeGreaterThan(0);
  }, 60000);
  it("JSONB key ordering does not alter public-state seeds or the chosen decision", () => {
    let checked = false;
    simulateFullGame(
      { ...config, strategyVersion: "baseline" },
      {
        select: (p) => {
          const old = selectBaselineGameplayCommand(p)!;
          if (
            !checked &&
            p.progression.phase === "CARD_PLAY" &&
            p.cards.currentTrick.length === 2
          ) {
            checked = true;
            const options = { now: () => 0 };
            expect(analyzeCompetitive(JSON.parse(stableJson(p)), 3, old.command, options)).toEqual(
              analyzeCompetitive(p, 3, old.command, options),
            );
          }
          return old.command;
        },
      },
    );
    expect(checked).toBe(true);
  }, 30000);
});
