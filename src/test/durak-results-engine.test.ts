import { describe, expect, it } from "vitest";
import { applyDurakMove, beginDurak, legalDurakMoves, type DurakMatch } from "@/durak/engine";
import { applyDurakMove as serverApply } from "../../supabase/functions/durak-commands/engine";
import { chooseDurakBotMove } from "@/durak/bot";
import type { DurakVariant, DurakRank } from "@/durak/rules";
const c = (rank: DurakRank) => ({ suit: "clubs" as const, rank });
function fixture(variant: DurakVariant): DurakMatch {
  const m = beginDurak(variant, 4, () => 0.3);
  Object.assign(m, {
    hands: [[c(6)], [c(7), c(9)], [c(8)], [c(10)]],
    deck: [],
    trump: "hearts",
    primaryAttacker: 0,
    attacker: 0,
    defender: 1,
    defenderStartingHand: 2,
    firstAttack: false,
  });
  return m;
}
describe("DURAK confirmed exit order", () => {
  it.each(["podkidnoy", "perevodnoy"] as const)(
    "settles last-card order and survives JSONB/reconnect in %s",
    (variant) => {
      const original = fixture(variant);
      let m = applyDurakMove(original, 0, { type: "attack", card: c(6) });
      expect(original.pendingFinishOrder).toEqual([]);
      expect(m.finishOrder).toEqual([]);
      expect(m.pendingFinishOrder).toEqual([0]);
      m = applyDurakMove(JSON.parse(JSON.stringify(m)), 1, { type: "take" });
      // Empty attackers aren't required to finish; the remaining adjacent attacker is.
      m = applyDurakMove(m, 2, { type: "finish" });
      if (legalDurakMoves(m, 3).some((move) => move.type === "finish"))
        m = applyDurakMove(m, 3, { type: "finish" });
      expect(m.finishOrder).toEqual([0]);
      expect(m.pendingFinishOrder).toEqual([]);
      expect(m.hands[1]).toHaveLength(3);
      expect(m.finishOrderComplete).toBe(true);
    },
  );
  it("does not rank an empty defender who picks up the table", () => {
    let m = fixture("podkidnoy");
    m.hands[1] = [c(7)];
    m.defenderStartingHand = 2;
    m = applyDurakMove(m, 0, { type: "attack", card: c(6) });
    m = applyDurakMove(m, 1, { type: "defend", card: c(7), pair: 0 });
    expect(m.pendingFinishOrder).toEqual([0, 1]);
    m = applyDurakMove(m, 1, { type: "take" });
    m = applyDurakMove(m, 2, { type: "finish" });
    if (legalDurakMoves(m, 3).some((move) => move.type === "finish"))
      m = applyDurakMove(m, 3, { type: "finish" });
    expect(m.finishOrder).toEqual([0]);
    expect(m.hands[1]).toHaveLength(2);
  });
  it("does not rank a hand replenished from the deck", () => {
    let m = fixture("podkidnoy");
    m.deck = [c(14)];
    m = applyDurakMove(m, 0, { type: "attack", card: c(6) });
    m = applyDurakMove(m, 1, { type: "take" });
    m = applyDurakMove(m, 0, { type: "finish" });
    m = applyDurakMove(m, 2, { type: "finish" });
    if (legalDurakMoves(m, 3).some((move) => move.type === "finish"))
      m = applyDurakMove(m, 3, { type: "finish" });
    expect(m.finishOrder).toEqual([]);
    expect(m.hands[0]).toEqual([c(14)]);
  });
  it("marks historical missing exits unknown rather than inventing ranks", () => {
    let m = fixture("podkidnoy");
    delete m.finishOrder;
    delete m.finishOrderComplete;
    m.hands[3] = [];
    m = applyDurakMove(m, 0, { type: "attack", card: c(6) });
    m = applyDurakMove(m, 1, { type: "take" });
    m = applyDurakMove(m, 2, { type: "finish" });
    if (legalDurakMoves(m, 3).some((move) => move.type === "finish"))
      m = applyDurakMove(m, 3, { type: "finish" });
    expect(m.finishOrderComplete).toBe(false);
    expect(m.finishOrder).toEqual([0]);
  });
  it("keeps client/server engines identical on confirmed exits", () => {
    const m = fixture("perevodnoy"),
      move = { type: "attack" as const, card: c(6) };
    expect(serverApply(m, 0, move)).toEqual(applyDurakMove(m, 0, move));
  });
  it.each(["podkidnoy", "perevodnoy"] as const)(
    "records complete rankings in full %s matches for 2–6 seats",
    (variant) => {
      for (let n = 2; n <= 6; n++) {
        let m = beginDurak(variant, n, () => 0.27);
        for (let step = 0; step < 3000 && !m.ended; step++) {
          const seat = m.hands.findIndex((_, i) => legalDurakMoves(m, i).length > 0);
          expect(seat).toBeGreaterThanOrEqual(0);
          const move = chooseDurakBotMove(m, seat, "balanced")!;
          m = applyDurakMove(m, seat, move);
        }
        expect(m.ended).toBe(true);
        expect(m.finishOrderComplete).toBe(true);
        expect(m.finishOrder).toHaveLength(n - (m.fool === null ? 0 : 1));
        expect(new Set(m.finishOrder).size).toBe(m.finishOrder!.length);
        expect(m.finishOrder!.every((seat) => m.hands[seat]!.length === 0)).toBe(true);
        if (m.fool !== null) expect(m.finishOrder).not.toContain(m.fool);
      }
    },
  );
});
