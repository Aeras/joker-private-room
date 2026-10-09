import { describe, expect, it } from "vitest";
import { createDeck } from "@/domain/cards";
import { chooseExactProtectionPlay } from "./competitiveV3";

const deck = createDeck();
const card = (id: string) => {
  const found = deck.find(c => c.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe("staged competitive-v3 exact protection", () => {
  it("discards the dangerous high follower after reaching exact bid", () => {
    const selected = chooseExactProtectionPlay({
      hand: [card("7-hearts"), card("Q-hearts")],
      trick: [
        { seatIndex: 0, card: card("A-hearts") },
        { seatIndex: 1, card: card("8-hearts") },
        { seatIndex: 2, card: card("9-hearts") },
      ],
      trump: null, seat: 3, bid: 1, taken: 1, remaining: 2,
    });
    expect(selected.card.id).toBe("Q-hearts");
  });

  it("uses a winning card when every remaining trick is required", () => {
    const selected = chooseExactProtectionPlay({
      hand: [card("7-hearts"), card("A-hearts")],
      trick: [
        { seatIndex: 0, card: card("K-hearts") },
        { seatIndex: 1, card: card("8-hearts") },
        { seatIndex: 2, card: card("9-hearts") },
      ],
      trump: null, seat: 3, bid: 2, taken: 0, remaining: 2,
    });
    expect(selected.card.id).toBe("A-hearts");
  });

  it("never invents a card or invalid Joker action", () => {
    const hand = [card("joker-1"), card("8-spades")];
    const action = chooseExactProtectionPlay({
      hand, trick: [], trump: "hearts", seat: 0, bid: 0, taken: 0, remaining: 2,
    });
    expect(hand.map(c => c.id)).toContain(action.card.id);
    if (action.card.kind === "joker") expect(action.joker?.context).toBe("LEAD");
  });
});
