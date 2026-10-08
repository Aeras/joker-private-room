import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { DraggableHandCard } from "@/components/table/DraggableHandCard";
import type { Card } from "@/domain/cards";
import { sortHandForDisplay } from "@/domain/projection";

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

  it("keeps illegal cards visible and locks only pending cards", () => {
    const props = {
      card: hand[0]!,
      legal: false,
      blocked: false,
      pending: false,
      authorityKey: "v1",
      zIndex: 0,
      overlap: false,
      onCommit: async () => {},
    };
    const { getByRole, rerender } = render(createElement(DraggableHandCard, props));
    const card = getByRole("button");
    expect(card).not.toHaveClass("opacity-70", "opacity-0");
    expect(card).toHaveAttribute("aria-disabled", "true");
    rerender(createElement(DraggableHandCard, { ...props, legal: true }));
    expect(card).toHaveClass("touch-none");
    expect(card).toHaveAttribute("aria-disabled", "false");
    rerender(createElement(DraggableHandCard, { ...props, legal: true, pending: true }));
    expect(card).toHaveClass("opacity-0", "pointer-events-none");
    expect(card).toHaveAttribute("aria-disabled", "true");
  });
});
