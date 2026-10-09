import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assets } from "@/assets/registry";
const manifest = JSON.parse(readFileSync("docs/table-asset-derivatives.json", "utf8")) as Array<{ source: string; derivative: string; sourceDimensions: number[]; derivativeDimensions: number[]; sameDimensionsPixelExact: boolean }>;
describe("reviewed table artwork resolution", () => {
  it("keeps all originals; card/background derivatives preserve dimensions", () => {
    expect(manifest).toHaveLength(10);
    expect(manifest.some(item => item.source.startsWith("/cards/"))).toBe(false);
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
  it("renders the live table from CSS/SVG instead of the raster room background", () => {
    const gameTable = readFileSync("src/components/table/GameTable.tsx", "utf8");
    const tableSurface = readFileSync("src/components/table/TableSurface.tsx", "utf8");
    const styles = readFileSync("src/styles.css", "utf8");
    expect(gameTable).toContain("<TableSurface />");
    expect(gameTable).not.toContain("assets.tableArt && <img");
    expect(tableSurface).toContain('viewBox="0 0 1600 720"');
    expect(tableSurface).toContain("joker-table-shell");
    expect(styles).toContain(".joker-table-surface");
    expect(styles).toContain("@media (min-aspect-ratio: 19/9)");
  });

  it("keeps canonical card registry identities and coalesced artwork URL resolution", () => {
    expect(assets.cardBack).toBe("/cards/runtime-png/backs/blue_back.png");
    expect(assets.cardArtwork(assets.cardBack)).toBe("/cards/optimized-png/backs/blue_back.png");
    for (const suit of ["spades", "clubs"] as const) {
      const face = assets.cardFace({ id: `${suit}-6`, kind: "standard", suit, rank: "6" });
      expect(face).toBeDefined();
      if (face) expect(assets.cardArtwork(face)).toBe(`/cards/optimized-png/faces/${suit}_6.png`);
    }
  });
});
