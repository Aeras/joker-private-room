import { describe, expect, it } from "vitest";
import {
  applyDurakMove,
  beginDurak,
  durakAttackSeats,
  legalDurakMoves,
  type DurakMatch,
} from "@/durak/engine";
import {
  advanceDurakBot,
  scheduleDurakBot,
  DURAK_BOT_REACTION_MS,
} from "../../supabase/functions/durak-commands/bot-turn";
import type { DurakVariant } from "@/durak/rules";

function scenario(variant: DurakVariant = "podkidnoy"): DurakMatch {
  const state = beginDurak(variant, 4, () => 0.3);
  state.hands = [
    [
      { suit: "clubs", rank: 6 },
      { suit: "hearts", rank: 9 },
    ],
    [
      { suit: "clubs", rank: 7 },
      { suit: "diamonds", rank: 7 },
      { suit: "hearts", rank: 10 },
    ],
    [
      { suit: "diamonds", rank: 6 },
      { suit: "hearts", rank: 7 },
    ],
    [
      { suit: "spades", rank: 6 },
      { suit: "spades", rank: 9 },
    ],
  ];
  state.primaryAttacker = 0;
  state.attacker = 0;
  state.defender = 1;
  state.defenderStartingHand = 3;
  state.firstAttack = false;
  return state;
}
const bots = Array.from({ length: 4 }, (_, index) => ({ index, occupant: "bot" }));

describe("DURAK ordered adjacent attackers", () => {
  it.each(["podkidnoy", "perevodnoy"] as const)("requires primary decline in %s", (variant) => {
    let state = applyDurakMove(scenario(variant), 0, {
      type: "attack",
      card: { suit: "clubs", rank: 6 },
    });
    state = applyDurakMove(state, 1, { type: "defend", pair: 0, card: { suit: "clubs", rank: 7 } });
    expect(durakAttackSeats(state)).toEqual([0]);
    expect(legalDurakMoves(state, 2)).toEqual([]);
    expect(legalDurakMoves(state, 3)).toEqual([]);
    expect(() =>
      applyDurakMove(state, 2, { type: "attack", card: { suit: "diamonds", rank: 6 } }),
    ).toThrow("ILLEGAL_DURAK_MOVE");
    state = applyDurakMove(state, 0, { type: "pass" });
    expect(durakAttackSeats(state)).toEqual([2]);
    state = applyDurakMove(state, 2, { type: "attack", card: { suit: "diamonds", rank: 6 } });
    expect(durakAttackSeats(state)).toEqual([2]);
    expect(legalDurakMoves(state, 0)).toEqual([]);
    state = applyDurakMove(state, 1, {
      type: "defend",
      pair: 1,
      card: { suit: "diamonds", rank: 7 },
    });
    state = applyDurakMove(state, 2, { type: "pass" });
    expect(state.round).toBe(2);
    expect(state.passes).toEqual([]);
  });
  it("unlocks secondary after finish or primary's final card", () => {
    let state = applyDurakMove(scenario(), 0, { type: "attack", card: { suit: "clubs", rank: 6 } });
    state = applyDurakMove(state, 0, { type: "finish" });
    expect(legalDurakMoves(state, 2).some((move) => move.type === "attack")).toBe(true);
    const empty = scenario();
    empty.deck = [];
    empty.hands[0] = [empty.hands[0]![0]!];
    const after = applyDurakMove(empty, 0, { type: "attack", card: empty.hands[0]![0]! });
    expect(legalDurakMoves(after, 2).some((move) => move.type === "attack")).toBe(true);
  });
  it("resets priority after transfer and closes taking after both decline", () => {
    let state = scenario("perevodnoy");
    state.hands[1]!.push({ suit: "diamonds", rank: 6 });
    state.hands[2]!.push({ suit: "spades", rank: 10 });
    state = applyDurakMove(state, 0, { type: "attack", card: { suit: "clubs", rank: 6 } });
    state = applyDurakMove(state, 1, { type: "transfer", card: { suit: "diamonds", rank: 6 } });
    expect(state.defender).toBe(2);
    expect(durakAttackSeats(state)).toEqual([1]);
    state = applyDurakMove(state, 2, { type: "take" });
    state = applyDurakMove(state, 1, { type: "pass" });
    expect(durakAttackSeats(state)).toEqual([3]);
    state = applyDurakMove(state, 3, { type: "pass" });
    expect(state.round).toBe(2);
    expect(state.discard).toEqual([]);
  });
});

describe("DURAK persisted bot reaction budget", () => {
  it.each([2, 3, 4, 5, 6])("completes paced %i-seat matches in both variants", (players) => {
    for (const variant of ["podkidnoy", "perevodnoy"] as const) {
      let state = scheduleDurakBot(
        beginDurak(variant, players, () => 0.31),
        0,
      );
      const seats = Array.from({ length: players }, (_, index) => ({ index, occupant: "bot" }));
      let decisions = 0;
      for (let now = 850; now <= 850 * 5000 && !state.ended; now += 850) {
        const after = advanceDurakBot(state, seats, now);
        expect(after).not.toBe(state);
        expect(after.nextBotAt).toBe(now + 850);
        decisions++;
        state = after;
      }
      expect(state.ended).toBe(true);
      expect(decisions).toBeGreaterThan(10);
      expect(state.deck).toHaveLength(0);
    }
  });
  it("advances at most one move per deadline across rapid repeated polls", () => {
    let state = scheduleDurakBot(scenario(), 1000);
    expect(advanceDurakBot(state, bots, 1849)).toBe(state);
    state = advanceDurakBot(state, bots, 1850);
    expect(state.pairs).toHaveLength(1);
    expect(state.presentationSequence).toBe(1);
    const saved = JSON.parse(JSON.stringify(state));
    for (let now = 1851; now < 2700; now += 30)
      expect(advanceDurakBot(saved, bots, now)).toBe(saved);
    state = advanceDurakBot(saved, bots, 2700);
    expect(state.pairs[0]?.defense).toEqual({ suit: "clubs", rank: 7 });
    expect(state.presentationSequence).toBe(2);
    expect(state.nextBotAt).toBe(2700 + DURAK_BOT_REACTION_MS);
  });
  it("waits for a human defender and recovers old state without a deadline", () => {
    const initial = scenario();
    const attacked = applyDurakMove(initial, 0, {
      type: "attack",
      card: { suit: "clubs", rank: 6 },
    });
    const human = bots.map((seat) => ({ ...seat, occupant: seat.index === 1 ? "human" : "bot" }));
    expect(advanceDurakBot(attacked, human, 5000)).toBe(attacked);
    expect(advanceDurakBot(initial, bots, 5000).presentationSequence).toBe(1);
    const ended = { ...initial, ended: true };
    expect(advanceDurakBot(ended, bots, 5000)).toBe(ended);
  });
  it("does not make a bot take already covered cards while the human primary considers additions", () => {
    let state = applyDurakMove(scenario(), 0, { type: "attack", card: { suit: "clubs", rank: 6 } });
    state = applyDurakMove(state, 1, { type: "defend", card: { suit: "clubs", rank: 7 }, pair: 0 });
    const seats = bots.map((seat) => ({ ...seat, occupant: seat.index === 0 ? "human" : "bot" }));
    expect(advanceDurakBot(state, seats, 5000)).toBe(state);
    expect(state.taking).toBe(false);
  });
});
