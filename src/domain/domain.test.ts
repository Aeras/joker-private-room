import { describe, expect, it } from "vitest";
import { createDeck, DECK_SIZE } from "./cards";
import { DEALS, TOTAL_DEALS } from "./gameConfig";
import { scoreDeal } from "./scoring";

describe("scoring", () => {
  it("exact declarations", () => {
    expect(scoreDeal({ declared: 0, taken: 0, tricksInDeal: 5 })).toBe(50);
    expect(scoreDeal({ declared: 1, taken: 1, tricksInDeal: 5 })).toBe(100);
    expect(scoreDeal({ declared: 4, taken: 4, tricksInDeal: 9 })).toBe(250);
  });
  it("all tricks", () => {
    expect(scoreDeal({ declared: 2, taken: 2, tricksInDeal: 2 })).toBe(200);
    expect(scoreDeal({ declared: 5, taken: 5, tricksInDeal: 5 })).toBe(500);
    expect(scoreDeal({ declared: 9, taken: 9, tricksInDeal: 9 })).toBe(900);
  });
  it("missed", () => {
    expect(scoreDeal({ declared: 3, taken: 4, tricksInDeal: 9 })).toBe(40);
    expect(scoreDeal({ declared: 3, taken: 2, tricksInDeal: 9 })).toBe(20);
    expect(scoreDeal({ declared: 0, taken: 2, tricksInDeal: 9 })).toBe(20);
  });
  it("zero-trick penalty", () => {
    expect(scoreDeal({ declared: 3, taken: 0, tricksInDeal: 9 })).toBe(-200);
  });
});

describe("deck & config", () => {
  it("36 cards, no 6♠/6♣, 2 jokers", () => {
    const d = createDeck();
    expect(d).toHaveLength(DECK_SIZE);
    expect(d.filter((c) => c.kind === "joker")).toHaveLength(2);
    expect(d.some((c) => c.id === "6-spades" || c.id === "6-clubs")).toBe(false);
  });
  it("24 deals", () => {
    expect(TOTAL_DEALS).toBe(24);
    expect(DEALS.at(-1)?.dealNumber).toBe(24);
  });
});
