import { describe, expect, it } from "vitest";
import { confirmedLocalDiscard, confirmedLocalDraw, projectCardRect } from "./localCardMotion";
import type { BiribaGameView } from "@/services/biribaFunctions";
import type { BiribaCard } from "./rules";

const card = (id: string): BiribaCard => ({ id, suit: "hearts", rank: 7 });
function game(): BiribaGameView {
  return {
    roundNumber: 1, revision: 4, seat: 0, seats: 2, turn: 0, phase: "draw",
    stockCount: 10, myHand: [card("held")], discards: [card("old")],
    publicActionSequence: 0, publicActions: [],
  } as unknown as BiribaGameView;
}

describe("Biriba local card flight admission", () => {
  it("reveals only the one newly authorized card after a real stock draw", () => {
    const before = game();
    const next = { ...before, revision: 5, phase: "meld" as const, stockCount: 9,
      myHand: [...before.myHand, card("drawn")] };
    expect(confirmedLocalDraw(before, next)?.id).toBe("drawn");
    expect(confirmedLocalDraw(before, { ...next, stockCount: 10 })).toBeNull();
    expect(confirmedLocalDraw(before, { ...next, revision: 4 })).toBeNull();
    expect(confirmedLocalDraw(before, { ...next, myHand: [...next.myHand, card("extra")] })).toBeNull();
    expect(confirmedLocalDraw(before, { ...next, roundNumber: 2 })).toBeNull();
  });

  it("keeps a local discard identifiable even when bots change the final pile", () => {
    const before = { ...game(), phase: "meld" as const };
    const next = { ...before, revision: 5, myHand: [], discards: [card("bot-top")],
      publicActionSequence: 2, publicActions: [
        { sequence: 1, round: 1, actorSeat: 0, kind: "discard" as const, cards: [card("held")] },
        { sequence: 2, round: 1, actorSeat: 1, kind: "discard" as const, cards: [card("bot-top")] },
      ] };
    expect(confirmedLocalDiscard(before, next, "held")?.id).toBe("held");
    expect(confirmedLocalDiscard(before, { ...next, publicActions: [] }, "held")).toBeNull();
    expect(confirmedLocalDiscard(before, { ...next, revision: 4 }, "held")).toBeNull();
  });

  it("maps the real DOM source rect into the Pixi table coordinate space", () => {
    const cardRect = { left: 300, top: 400, width: 100, height: 150 } as DOMRect;
    const table = { left: 100, top: 100, width: 1000, height: 600 } as DOMRect;
    expect(projectCardRect(cardRect, table)).toEqual({ x: 256, y: 360, width: 128, height: 180 });
    expect(projectCardRect(cardRect, { ...table, width: 0 } as DOMRect)).toBeNull();
  });
});
