import { describe, expect, it } from "vitest";
import {
  admitBiribaRevision,
  biribaDealKey,
  biribaVisualCards,
  newDiscardFromSingleMove,
  newMeldCardsFromSingleMove,
  shouldAnimateFreshDeal,
  visibleOpponentSides,
  type BiribaVisualGame,
} from "./biribaVisualModel";
import type { BiribaCard } from "./rules";

const discard: BiribaCard = { id: "discard-1", suit: "spades", rank: 7 };
function game(seats: 2 | 4 = 4): BiribaVisualGame {
  return {
    seats,
    seat: 0,
    roundNumber: 1,
    revision: 1,
    stockCount: 40,
    packetCounts: [11, 11],
    handCounts: Array(seats).fill(11),
    discards: [discard],
  };
}

describe("Biriba Pixi authoritative projection", () => {
  it("uses one deal identity for the renderer and the local hand reveal", () => {
    expect(biribaDealKey("ABC123", 2, 1)).toBe("ABC123:2:1");
  });
  it("keeps card identities stable across unrelated revisions and changes only removed backs", () => {
    const before = game();
    const initial = biribaVisualCards(before);
    const scoreOnly = biribaVisualCards({ ...before, revision: 2 });
    expect(scoreOnly).toEqual(initial);
    const after = biribaVisualCards({
      ...before,
      revision: 3,
      handCounts: [11, 10, 11, 11],
      stockCount: 2,
    });
    const priorIds = new Set(initial.map((card) => card.id));
    const nextIds = new Set(after.map((card) => card.id));
    expect(after.every((card) => priorIds.has(card.id))).toBe(true);
    expect([...priorIds].filter((id) => !nextIds.has(id))).toEqual(["stock:2", "fan:left:10"]);
    expect(nextIds.size).toBe(after.length);
  });

  it("uses only the real opponents for 2 and 4 seats", () => {
    expect(visibleOpponentSides(game(2)).map((item) => item.side)).toEqual(["top"]);
    expect(visibleOpponentSides(game(4)).map((item) => item.side)).toEqual([
      "top",
      "left",
      "right",
    ]);
    expect(biribaVisualCards(game(2)).some((card) => card.id.startsWith("fan:left:"))).toBe(false);
    expect(biribaVisualCards(game(4)).filter((card) => card.id.startsWith("fan:"))).toHaveLength(
      33,
    );
  });

  it("never admits a stale or repeated revision over newer play", () => {
    const current = { ...game(), revision: 9 };
    expect(admitBiribaRevision(current, { ...current, revision: 8 })).toBe(false);
    expect(admitBiribaRevision(current, current)).toBe(false);
    expect(admitBiribaRevision(current, { ...current, revision: 10 })).toBe(true);
    expect(admitBiribaRevision(current, { ...current, roundNumber: 2, revision: 10 })).toBe(true);
    expect(admitBiribaRevision(current, { ...current, roundNumber: 0, revision: 100 })).toBe(false);
  });

  it("starts dealing only from a fresh round snapshot", () => {
    const fresh = { ...game(), phase: "draw", melds: [] };
    expect(shouldAnimateFreshDeal(fresh)).toBe(true);
    expect(shouldAnimateFreshDeal({ ...fresh, phase: "meld" })).toBe(false);
    expect(
      shouldAnimateFreshDeal({
        ...fresh,
        melds: [{ ownerSeat: 0, suit: "hearts", highAce: false, cards: [] }],
      }),
    ).toBe(false);
    expect(shouldAnimateFreshDeal({ ...fresh, handCounts: [12, 11, 11, 11] })).toBe(false);
  });

  it("recognizes only a confirmed single-revision discard, not a pickup or batched update", () => {
    const nextCard: BiribaCard = { id: "discard-2", suit: "hearts", rank: 9 };
    const previous = { ...game(), phase: "meld", turn: 0, myHand: [nextCard] };
    const next = { ...previous, revision: 2, discards: [...previous.discards, nextCard] };
    expect(newDiscardFromSingleMove(previous, next)).toEqual(nextCard);
    expect(newDiscardFromSingleMove(previous, { ...next, revision: 3 })).toBeNull();
    expect(newDiscardFromSingleMove(previous, { ...next, discards: [] })).toBeNull();
    expect(newDiscardFromSingleMove({ ...previous, phase: "draw" }, next)).toBeNull();
    expect(newDiscardFromSingleMove({ ...previous, turn: 1 }, next)).toBeNull();
  });

  it("detects public meld additions from the authoritative next revision", () => {
    const meld = {
      ownerSeat: 1,
      suit: "hearts" as const,
      highAce: false,
      cards: [7, 8, 9].map((rank) => ({
        card: {
          id: `h${rank}`,
          suit: "hearts" as const,
          rank: rank as 7 | 8 | 9,
        },
        value: rank,
      })),
    };
    const previous = {
      ...game(),
      phase: "meld",
      turn: 0,
      melds: [],
      myHand: meld.cards.map((item) => item.card),
    };
    const next = { ...previous, revision: 2, melds: [meld] };
    expect(newMeldCardsFromSingleMove(previous, next).map((flight) => flight.card.id)).toEqual([
      "h7",
      "h8",
      "h9",
    ]);
    expect(newMeldCardsFromSingleMove(previous, { ...next, revision: 4 })).toEqual([]);
    expect(newMeldCardsFromSingleMove({ ...previous, turn: 1 }, next)).toEqual([]);
    expect(newMeldCardsFromSingleMove(null, next)).toEqual([]);
  });
});
