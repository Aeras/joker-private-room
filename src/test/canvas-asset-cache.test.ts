import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasCardAssets } from "@/components/table/canvas/assetCache";
const hooks = vi.hoisted(() => ({ ok: true, rejectDecode: false }));
vi.mock("@/assets/cardPreload", () => ({
  preloadCardAsset: async () => hooks.ok,
  resolvedCardArtwork: (url: string) => url + "-resolved",
}));
class ImageFixture {
  decoding = "";
  complete = true;
  naturalWidth = 360;
  onload: ((event: Event) => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  decode() {
    return hooks.rejectDecode ? Promise.reject(Error("low memory")) : Promise.resolve();
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  hooks.ok = true;
  hooks.rejectDecode = false;
});
describe("bounded Canvas bitmaps", () => {
  it("keeps active scene artwork while evicting idle images and releases it afterward", async () => {
    vi.stubGlobal("Image", ImageFixture);
    const cache = new CanvasCardAssets(2);
    const active = await cache.warm("active");
    const release = cache.retain("active");
    await cache.warm("idle");
    await cache.warm("next");
    expect(cache.peek("active")).toBe(active);
    expect(cache.peek("idle")).toBeNull();
    const releaseNext = cache.retain("next");
    expect(await cache.warm("over-capacity")).toBeNull();
    releaseNext(); release(); release();
    expect(await cache.warm("after-release")).not.toBeNull();
    cache.clear();
  });
  it("does not expose a bitmap before readiness and reuses one prepared image", async () => {
    vi.stubGlobal("Image", ImageFixture);
    const cache = new CanvasCardAssets();
    expect(cache.peek("face")).toBeNull();
    const pending = cache.warm("face");
    expect(cache.warm("face")).toBe(pending);
    const image = await pending;
    expect(image?.src).toBe("face-resolved");
    expect(cache.peek("face")).toBe(image);
    cache.clear();
    expect(cache.peek("face")).toBeNull();
  });
  it("keeps a renderable PNG on decode rejection and retains a strict cache bound", async () => {
    vi.stubGlobal("Image", ImageFixture);
    hooks.rejectDecode = true;
    const cache = new CanvasCardAssets(2);
    expect(await cache.warm("a")).not.toBeNull();
    await cache.warm("b");
    await cache.warm("c");
    expect(cache.peek("a")).toBeNull();
    expect(cache.peek("b")).not.toBeNull();
    expect(cache.peek("c")).not.toBeNull();
    cache.clear();
    expect(() => new CanvasCardAssets(-1)).toThrow();
  });
  it("fails closed on missing artwork or eviction while preload is pending", async () => {
    vi.stubGlobal("Image", ImageFixture);
    const cache = new CanvasCardAssets();
    hooks.ok = false;
    expect(await cache.warm("missing")).toBeNull();
    expect(cache.peek("missing")).toBeNull();
    hooks.ok = true;
    const pending = cache.warm("cancelled");
    cache.clear();
    expect(await pending).toBeNull();
  });
});
