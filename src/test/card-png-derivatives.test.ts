import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { expect, it } from "vitest";
import { CARD_ASSET_URLS } from "@/assets/cardPreload";
import { assets } from "@/assets/registry";

/** Decode the actual 8-bit noninterlaced RGB/RGBA files, not manifest claims. */
function rgba(file: Buffer) {
  const width = file.readUInt32BE(16), height = file.readUInt32BE(20);
  expect(file[24]).toBe(8); expect([2, 6]).toContain(file[25]); expect(file[28]).toBe(0);
  const channels = file[25] === 6 ? 4 : 3;
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < file.length;) {
    const size = file.readUInt32BE(offset);
    if (file.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(file.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels;
  const pixels = Buffer.alloc(height * stride), result = Buffer.alloc(width * height * 4);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, aa = Math.abs(p - a), bb = Math.abs(p - b), cc = Math.abs(p - c);
    return aa <= bb && aa <= cc ? a : bb <= cc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, a = x >= channels ? pixels[index - channels]! : 0;
      const b = y ? pixels[index - stride]! : 0, c = y && x >= channels ? pixels[index - stride - channels]! : 0;
      const prediction = filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : 0;
      pixels[index] = (raw[y * (stride + 1) + x + 1]! + prediction) & 255;
    }
  }
  for (let index = 0; index < width * height; index++) {
    for (let channel = 0; channel < 3; channel++) result[index * 4 + channel] = pixels[index * channels + channel]!;
    result[index * 4 + 3] = channels === 4 ? pixels[index * channels + 3]! : 255;
  }
  return { width, height, pixels: result };
}
it("all 55 PNG derivatives preserve every original pixel, dimension and registry target", () => {
  const manifest = JSON.parse(readFileSync("docs/card-png-derivatives.json", "utf8")) as Array<{ source: string; derivative: string; sourceSha256: string; derivativeSha256: string }>;
  expect(manifest).toHaveLength(55);
  for (const item of manifest) {
    const original = readFileSync("public" + item.source), optimized = readFileSync("public" + item.derivative);
    expect(createHash("sha256").update(original).digest("hex")).toBe(item.sourceSha256);
    expect(createHash("sha256").update(optimized).digest("hex")).toBe(item.derivativeSha256);
    expect(optimized.length).toBeLessThanOrEqual(original.length);
    const a = rgba(original), b = rgba(optimized);
    expect([b.width, b.height]).toEqual([a.width, a.height]);
    expect(b.pixels.equals(a.pixels)).toBe(true);
  }
  for (const url of CARD_ASSET_URLS) expect(manifest.some(item => item.source === url && item.derivative === assets.cardArtwork(url))).toBe(true);
}, 30_000);
