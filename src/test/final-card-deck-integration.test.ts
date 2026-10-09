import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assets } from "@/assets/registry";
import { CARD_ASSET_URLS } from "@/assets/cardPreload";
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
  it("contains 52 standard runtime PNGs, two Jokers and one blue back", () => {
    const faces = readdirSync("public/cards/runtime-png/faces").filter((name) => name.endsWith(".png")).sort();
    const backs = readdirSync("public/cards/runtime-png/backs").filter((name) => name.endsWith(".png")).sort();
    const expectedFaces = [
      "joker_black.png",
      "joker_red.png",
      ...SUITS.flatMap((suit) => ["2", "3", "4", "5", ...RANKS.map(rank => rankAssetName[rank])].map(rank => `${suit}_${rank}.png`)),
    ].sort();

    expect(faces).toEqual(expectedFaces);
    expect(faces).toHaveLength(54);
    expect(backs).toEqual(["blue_back.png"]);
    for (const file of faces) expect(statSync(`public/cards/runtime-png/faces/${file}`).size).toBeGreaterThan(0);
    expect(statSync("public/cards/runtime-png/backs/blue_back.png").size).toBeGreaterThan(0);
  });

  it("retains matching SVG source assets", () => {
    const faces = readdirSync("public/cards/sources-svg/faces").filter((name) => name.endsWith(".svg"));
    expect(faces).toHaveLength(54);
    expect(existsSync("public/cards/sources-svg/backs/blue_back.svg")).toBe(true);
  });

  it("maps every normal gameplay card identity to its matching runtime PNG", () => {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const card: Card = { kind: "standard", id: `${rank}-${suit}`, suit, rank };
        const expected = `/cards/runtime-png/faces/${suit}_${rankAssetName[rank]}.png`;
        expect(assets.cardFace(card)).toBe(expected);
        expect(assets.cardArtwork(expected)).toBe(expected.replace("/runtime-png/", "/optimized-png/"));
        expect(existsSync(publicPath(expected))).toBe(true);
      }
    }
  });

  it("maps both canonical Jokers and the shared blue card back", () => {
    expect(assets.cardFace({ kind: "joker", id: "joker-1" })).toBe("/cards/runtime-png/faces/joker_red.png");
    expect(assets.cardFace({ kind: "joker", id: "joker-2" })).toBe("/cards/runtime-png/faces/joker_black.png");
    expect(assets.cardBack).toBe("/cards/runtime-png/backs/blue_back.png");
    expect(existsSync(publicPath(assets.cardBack))).toBe(true);
  });

  it("has artwork for every card that can enter the canonical 36-card gameplay deck", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(36);
    for (const card of deck) {
      const face = assets.cardFace(card);
      expect(face, card.id).toBeTruthy();
      if (!face) throw new Error(`Missing face: ${card.id}`);
      expect(existsSync(publicPath(face)), card.id).toBe(true);
      expect(assets.cardArtwork(face)).toBe(face.replace("/runtime-png/", "/optimized-png/"));
    }
  });

  it("retains ranks 2–5 for future games without expanding current gameplay preloading", () => {
    for (const suit of SUITS) for (const rank of ["2", "3", "4", "5"]) {
      const url = `/cards/runtime-png/faces/${suit}_${rank}.png`;
      expect(existsSync(publicPath(url))).toBe(true);
      expect(CARD_ASSET_URLS).not.toContain(url);
    }
    expect(createDeck("popular36")).toHaveLength(36);
    expect(createDeck("classic38")).toHaveLength(38);
    expect(CARD_ASSET_URLS).toHaveLength(39);
    for (const url of CARD_ASSET_URLS) expect(assets.cardArtwork(url)).toBe(url.replace("/runtime-png/", "/optimized-png/"));
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
    expect(registry).toContain('cardBack: `${RUNTIME_CARD_ROOT}/backs/blue_back.png`');
  });
});
