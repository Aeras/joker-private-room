import { expect, it } from "vitest";
import { DURAK_SEAT_POSITIONS } from "@/durak/rules";
import { beginDurak, applyDurakMove, legalDurakMoves } from "@/durak/engine";

it.each(["podkidnoy", "perevodnoy"] as const)(
  "matches clockwise visual neighbors and primary priority in %s",
  (variant) => {
    expect(DURAK_SEAT_POSITIONS[4]).toEqual(["bottom", "left", "top", "right"]);
    for (let opening = 0; opening < 4; opening++) {
      const defender = (opening + 1) % 4;
      const secondary = (opening + 2) % 4;
      const excluded = (opening + 3) % 4;
      let state = beginDurak(variant, 4, () => 0.31);
      state.hands = state.hands.map(() => [
        { suit: "clubs", rank: 6 },
        { suit: "diamonds", rank: 6 },
        { suit: "clubs", rank: 7 },
      ]);
      state.attacker = state.primaryAttacker = opening;
      state.defender = defender;
      state.defenderStartingHand = 3;
      state = applyDurakMove(state, opening, { type: "attack", card: { suit: "clubs", rank: 6 } });
      state = applyDurakMove(state, defender, {
        type: "defend",
        pair: 0,
        card: { suit: "clubs", rank: 7 },
      });
      expect(legalDurakMoves(state, secondary)).toEqual([]);
      expect(legalDurakMoves(state, excluded)).toEqual([]);
      state = applyDurakMove(state, opening, { type: "pass" });
      expect(legalDurakMoves(state, secondary).some((move) => move.type === "attack")).toBe(true);
      expect(legalDurakMoves(state, excluded)).toEqual([]);
      // From the defender's view the excluded seat is physically opposite.
      expect(DURAK_SEAT_POSITIONS[4]![(excluded - defender + 4) % 4]).toBe("top");
    }
  },
);
