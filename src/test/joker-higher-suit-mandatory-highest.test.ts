import { describe, expect, it } from "vitest";
import { legalMoves, type PlayedCard, type PlayerView } from "@/domain/engine";
import type { Card, Suit, Rank } from "@/domain/cards";

const normal = (rank: Rank, suit: Suit): Card => ({ kind: "standard", id: `${rank}-${suit}`, rank, suit });
const joker: Card = { kind: "joker", id: "joker-2" };
const lead = (mode: "HIGHER_SUIT" | "SUIT_WINS", suit: Suit): PlayedCard => ({
  seatIndex: 0, card: { kind: "joker", id: "joker-1" },
  joker: { context: "LEAD", mode, requestedSuit: suit },
});
const view = (hand: Card[], trick: PlayedCard[], trump: Suit | null): PlayerView => ({
  seatIndex: 1, hand, cardsPerPlayer: 9, trump,
  declarations: [1, 1, 1, 1], tricksTaken: [0, 0, 0, 0],
  currentTrick: trick, history: { completedTricks: [] },
});
const ids = (hand: Card[]) => legalMoves(view(hand, [lead("HIGHER_SUIT", "hearts")], "hearts")).map(c => c.id);

describe("leading Joker HIGHER_SUIT: strongest held requested suit", () => {
  it("requires the Ace when requested suit is trump and keeps a held Joker available", () => {
    expect(ids([normal("7", "hearts"), normal("A", "hearts"), normal("K", "hearts"), joker])).toEqual(["A-hearts", "joker-2"]);
  });
  it("requires the highest available card even without an Ace and with non-trump requested suit", () => {
    expect(legalMoves(view([normal("9", "spades"), normal("Q", "spades"), normal("A", "clubs")], [lead("HIGHER_SUIT", "spades")], "hearts")).map(c => c.id)).toEqual(["Q-spades"]);
  });
  it("retains forced any-trump fallback if void in requested non-trump suit", () => {
    expect(legalMoves(view([normal("7", "hearts"), normal("A", "hearts"), joker], [lead("HIGHER_SUIT", "spades")], "hearts")).map(c => c.id)).toEqual(["7-hearts", "A-hearts", "joker-2"]);
  });
  it("permits free discard if void without trump", () => {
    expect(legalMoves(view([normal("7", "clubs"), normal("A", "diamonds")], [lead("HIGHER_SUIT", "spades")], null)).map(c => c.id)).toEqual(["7-clubs", "A-diamonds"]);
  });
  it("preserves the original request after a competing follower Joker", () => {
    const second: PlayedCard = { seatIndex: 1, card: joker, joker: { context: "OPEN_TRICK", mode: "COMPETE" } };
    expect(legalMoves(view([normal("8", "spades"), normal("A", "spades")], [lead("HIGHER_SUIT", "spades"), second], "hearts")).map(c => c.id)).toEqual(["A-spades"]);
  });
  it("does not alter SUIT_WINS or ordinary suit-following", () => {
    const hand = [normal("8", "hearts"), normal("A", "hearts")];
    expect(legalMoves(view(hand, [lead("SUIT_WINS", "hearts")], "hearts")).map(c => c.id)).toEqual(["8-hearts", "A-hearts"]);
    expect(legalMoves(view(hand, [{ seatIndex: 0, card: normal("7", "hearts") }], "hearts")).map(c => c.id)).toEqual(["8-hearts", "A-hearts"]);
  });
});
