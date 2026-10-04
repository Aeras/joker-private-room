import { describe, expect, it } from "vitest";

import type { PlayerView } from "@/domain/engine";
import { placeholderStrategy } from "./strategy";

const view: PlayerView = {
  seatIndex: 0,
  hand: [{ kind: "joker", id: "joker-1" }],
  cardsPerPlayer: 9,
  trump: null,
  declarations: [null, null, null, null],
  tricksTaken: [0, 0, 0, 0],
  currentTrick: [],
  history: { completedTricks: [] },
};

describe("complete bot decision contract", () => {
  it("covers declaration, trump, card and both Joker semantic contexts", () => {
    expect(placeholderStrategy.chooseDeclaration(view, [0, 1])).toBe(0);
    expect(placeholderStrategy.chooseTrump(view, ["hearts", null])).toBe("hearts");
    expect(placeholderStrategy.chooseCard(view, view.hand).id).toBe("joker-1");
    expect(
      placeholderStrategy.chooseJokerSemantic(view, [
        { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "diamonds" },
      ]),
    ).toEqual({ context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "diamonds" });
    expect(
      placeholderStrategy.chooseJokerSemantic(view, [
        { context: "OPEN_TRICK", mode: "COMPETE" },
        { context: "OPEN_TRICK", mode: "FROM_BELOW" },
      ]),
    ).toEqual({ context: "OPEN_TRICK", mode: "COMPETE" });
  });
});
