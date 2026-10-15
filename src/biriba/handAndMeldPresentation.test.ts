import { describe, expect, it } from "vitest";
import { biribaMeldDisplayLayout, sortedBiribaHand } from "./handAndMeldPresentation";
import type { BiribaCard, BiribaMeld, BiribaRank, BiribaSuit } from "./rules";

const card = (id: string, suit: BiribaSuit, rank: number): BiribaCard => ({
  id, suit, rank: rank as BiribaRank,
});
const meld = (seat: number): BiribaMeld => ({
  ownerSeat: seat, suit: "spades", highAce: false, cards: [],
});

describe("Biriba presentation order", () => {
  it("groups suits spades, hearts, diamonds, clubs and Jokers last without mutating the server hand", () => {
    const hand: BiribaCard[] = [
      card("club", "clubs", 4), { id: "joker", joker: true },
      card("heart2", "hearts", 2), card("diamond", "diamonds", 12),
      card("spadeAce", "spades", 1), card("heartAce", "hearts", 1),
      card("spade3", "spades", 3), card("heart5", "hearts", 5),
    ];
    const originalIds = hand.map(c => c.id);
    expect(sortedBiribaHand(hand).map(c => c.id)).toEqual([
      "spade3", "spadeAce", "heart2", "heart5", "heartAce", "diamond", "club", "joker",
    ]);
    expect(hand.map(c => c.id)).toEqual(originalIds);
  });

  it("keeps the relative order of identical cards from the two decks", () => {
    expect(sortedBiribaHand([
      card("heart7B", "hearts", 7),
      card("heart7A", "hearts", 7),
      { id: "joker2", joker: true },
      { id: "joker1", joker: true },
    ]).map(c => c.id)).toEqual(["heart7B", "heart7A", "joker2", "joker1"]);
  });

  it("numbers interleaved teams locally but retains server indexes", () => {
    const layout = biribaMeldDisplayLayout([
      meld(0), meld(1), meld(2), meld(3), meld(0), meld(1), meld(2),
    ], 4);
    expect(layout.byTeam).toEqual([[0, 2, 4, 6], [1, 3, 5]]);
    expect([...layout.numberByGlobalIndex.entries()]).toEqual([
      [0, 1], [1, 1], [2, 2], [3, 2], [4, 3], [5, 3], [6, 4],
    ]);
  });

  it("continues team numbering on the next 3x2 page (7 to 12)", () => {
    const layout = biribaMeldDisplayLayout(Array.from({ length: 12 }, () => meld(0)), 2);
    expect(layout.byTeam[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(layout.numberByGlobalIndex.get(6)).toBe(7);
    expect(layout.numberByGlobalIndex.get(11)).toBe(12);
  });
});
