import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assets } from "@/assets/registry";
import { createDeck, RANKS, SUITS, type Card, type Rank } from "@/domain/cards";

const rankAssetName: Record<Rank, string> = {
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  J: "jack",
  Q: "queen",
  K: "king",
  A: "ace",
};

function publicPath(assetPath: string): string {
  return `public${assetPath}`;
}

describe("JK-001 final card deck integration", () => {
  it("contains exactly the 39 final PNG assets", () => {
    const files = readdirSync("public/cards").filter((name) => name.endsWith(".png")).sort();
    const expected = [
      "card_back.png",
      "joker_black.png",
      "joker_red.png",
      ...SUITS.flatMap((suit) => RANKS.map((rank) => `${suit}_${rankAssetName[rank]}.png`)),
    ].sort();

    expect(files).toEqual(expected);
    expect(files).toHaveLength(39);
    for (const file of files) {
      expect(statSync(`public/cards/${file}`).size).toBeGreaterThan(0);
    }
  });

  it("maps every normal card identity to its matching PNG", () => {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const card: Card = { kind: "standard", id: `${rank}-${suit}`, suit, rank };
        const expected = `/cards/${suit}_${rankAssetName[rank]}.png`;
        expect(assets.cardFace(card)).toBe(expected);
        expect(existsSync(publicPath(expected))).toBe(true);
      }
    }
  });

  it("maps both canonical Jokers and the shared card back", () => {
    expect(assets.cardFace({ kind: "joker", id: "joker-1" })).toBe("/cards/joker_red.png");
    expect(assets.cardFace({ kind: "joker", id: "joker-2" })).toBe("/cards/joker_black.png");
    expect(assets.cardBack).toBe("/cards/card_back.png");
    expect(existsSync(publicPath(assets.cardBack))).toBe(true);
  });

  it("has artwork for every card that can enter the canonical 36-card gameplay deck", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(36);
    for (const card of deck) {
      const face = assets.cardFace(card);
      expect(face, card.id).toBeTruthy();
      expect(existsSync(publicPath(face!)), card.id).toBe(true);
    }
  });

  it("routes hand, trick and dealing/back rendering through PlayingCard and the shared registry", () => {
    const playingCard = readFileSync("src/components/joker/PlayingCard.tsx", "utf8");
    const hand = readFileSync("src/components/table/DraggableHandCard.tsx", "utf8");
    const trick = readFileSync("src/components/table/TrickPresentation.tsx", "utf8");
    const deal = readFileSync("src/components/table/DealPresentation.tsx", "utf8");

    expect(playingCard).toContain("assets.cardFace(card)");
    expect(playingCard).toContain("assets.cardBack");
    expect(hand).toMatch(/<PlayingCard\s+card=\{card\}/);
    expect(trick).toContain("<PlayingCard card={play.card} />");
    expect(deal).toContain("<PlayingCard faceDown />");
  });

  it("does not leave the registry in placeholder mode", () => {
    const registry = readFileSync("src/assets/registry.ts", "utf8");
    expect(registry).not.toContain("cardBack: undefined");
    expect(registry).not.toContain("cardFace: (_card: Card): string | undefined => undefined");
    expect(registry).toContain('cardBack: "/cards/card_back.png"');
  });
});
