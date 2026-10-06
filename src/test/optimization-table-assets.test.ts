import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assets } from "@/assets/registry";
const manifest = JSON.parse(readFileSync("docs/table-asset-derivatives.json", "utf8")) as Array<{ source: string; derivative: string; sourceDimensions: number[]; derivativeDimensions: number[]; sameDimensionsPixelExact: boolean }>;
describe("reviewed table artwork resolution", () => {
  it("keeps all originals; card/background derivatives preserve dimensions", () => {
    expect(manifest).toHaveLength(49);
    for (const item of manifest) {
      expect(existsSync("public" + item.source)).toBe(true); expect(existsSync("public" + item.derivative)).toBe(true);
      if (!item.source.startsWith("/avatars/")) { expect(item.derivativeDimensions).toEqual(item.sourceDimensions); expect(item.sameDimensionsPixelExact).toBe(true); }
    }
  });
  it("maps only reviewed local avatars, retaining arbitrary/external identity URLs", () => {
    for (const item of manifest.filter(item => item.source.startsWith("/avatars/"))) {
      expect(assets.tableAvatar(item.source)).toBe(item.derivative); expect(item.derivativeDimensions).toEqual([256, 256]);
    }
    expect(assets.tableAvatar("https://example.com/avatars/giobis.png")).toBe("https://example.com/avatars/giobis.png");
    expect(assets.tableAvatar("//example.com/avatars/git.png")).toBe("//example.com/avatars/git.png");
    expect(assets.tableAvatar("/avatars/custom.png")).toBe("/avatars/custom.png");
  });
  it("keeps canonical card registry identities and coalesced artwork URL resolution", () => {
    expect(assets.cardBack).toBe("/cards/card_back.png");
    expect(assets.cardArtwork(assets.cardBack)).toBe("/cards/optimized/card_back.webp");
    for (const suit of ["spades", "clubs"] as const) expect(assets.cardArtwork(assets.cardFace({ id: `${suit}-6`, kind: "standard", suit, rank: "6" })!)).toBe(`/cards/optimized/${suit}_6.webp`);
  });
});
