import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Card } from "@/domain/cards";
import { sortHandForDisplay } from "@/domain/projection";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const hand: Card[] = [
  { kind: "standard", id: "J-hearts", suit: "hearts", rank: "J" },
  { kind: "standard", id: "10-spades", suit: "spades", rank: "10" },
  { kind: "joker", id: "joker-1" },
  { kind: "standard", id: "6-hearts", suit: "hearts", rank: "6" },
  { kind: "standard", id: "A-spades", suit: "spades", rank: "A" },
  { kind: "standard", id: "K-hearts", suit: "hearts", rank: "K" },
  { kind: "standard", id: "Q-diamonds", suit: "diamonds", rank: "Q" },
];

describe("JK-006 local hand presentation", () => {
  it("orders jokers first, then trump, then grouped suits with descending ranks", () => {
    expect(sortHandForDisplay(hand, "spades").map((card) => card.id)).toEqual([
      "joker-1",
      "A-spades",
      "10-spades",
      "K-hearts",
      "J-hearts",
      "6-hearts",
      "Q-diamonds",
    ]);
  });

  it("keeps multiple jokers first and leaves the source hand unchanged", () => {
    const source: Card[] = [
      { kind: "standard", id: "A-clubs", suit: "clubs", rank: "A" },
      { kind: "joker", id: "joker-2" },
      { kind: "joker", id: "joker-1" },
      { kind: "standard", id: "K-clubs", suit: "clubs", rank: "K" },
    ];
    const before = source.map((card) => card.id);
    expect(sortHandForDisplay(source, "clubs").map((card) => card.id)).toEqual([
      "joker-1",
      "joker-2",
      "A-clubs",
      "K-clubs",
    ]);
    expect(source.map((card) => card.id)).toEqual(before);
  });

  it("does not fade cards merely because they are not currently legal", () => {
    const draggable = read("src/components/table/DraggableHandCard.tsx");
    expect(draggable).not.toContain('legal ? "touch-none" : "opacity-70"');
    expect(draggable).not.toContain('!legal && "opacity-70"');
    expect(draggable).toContain('legal && "touch-none"');
    expect(draggable).toContain('pending && "pointer-events-none opacity-0"');
  });
});
