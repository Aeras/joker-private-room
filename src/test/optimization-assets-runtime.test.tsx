import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let images: FakeImage[];
class FakeImage {
  static cached = true;
  decoding = ""; onload: (() => void) | null = null; onerror: (() => void) | null = null;
  complete = FakeImage.cached; naturalWidth = FakeImage.cached ? 100 : 0; private url = "";
  resolve!: () => void; reject!: (error: Error) => void;
  decode = vi.fn(() => new Promise<void>((resolve, reject) => { this.resolve = resolve; this.reject = reject; }));
  set src(value: string) { this.url = value; images.push(this); }
  get src() { return this.url; }
}
const image = (url: string) => images.filter(item => item.src === url).at(-1)!;
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); images = []; FakeImage.cached = true; vi.stubGlobal("Image", FakeImage); localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("decoded artwork readiness and slow-device recovery", () => {
  it("keeps a cached canonical surface visible before paint while shared decode is pending", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(100);
    const { PlayingCard } = await import("@/components/joker/PlayingCard");
    const cache = await import("@/assets/cardPreload");
    const { assets } = await import("@/assets/registry");
    const card = { kind: "standard" as const, id: "8-clubs", suit: "clubs" as const, rank: "8" as const };
    const pending = cache.preloadCardAsset(assets.cardFace(card)!);
    const view = render(<PlayingCard card={card} />);
    expect(cache.isCardAssetReady(assets.cardFace(card)!)).toBe(false);
    expect(view.container.querySelector("img")).toHaveAttribute("data-card-artwork-loaded", "true");
    expect(view.container.querySelector("img")).toHaveClass("opacity-100");
    view.unmount();
    const canonical = render(<PlayingCard card={card} />);
    expect(canonical.container.querySelector("img")).toHaveAttribute("data-card-artwork-loaded", "true");
    expect(canonical.container.querySelector("[data-card-semantic-fallback]")).toBeNull();
    image(cache.resolvedCardArtwork(assets.cardFace(card)!)).resolve();
    await act(async () => { await pending; });
  });

  it("cached load waits for decode and coalesces duplicate requests", async () => {
    const cache = await import("@/assets/cardPreload");
    const first = cache.preloadCardAsset("/test.png");
    expect(cache.preloadCardAsset("/test.png")).toBe(first);
    expect(cache.isCardAssetReady("/test.png")).toBe(false);
    image("/test.png").resolve(); await first;
    expect(cache.cardAssetStatus("/test.png")).toBe("decoded-ready");
    expect(await cache.preloadCardAsset("/test.png")).toBe(true);
    expect(images.filter(item => item.src === "/test.png")).toHaveLength(1);
  });
  it("decode rejection after valid load is renderable, not a permanent fallback", async () => {
    const cache = await import("@/assets/cardPreload"); const request = cache.preloadCardAsset("/decode.png");
    image("/decode.png").reject(new Error("Memory pressure"));
    expect(await request).toBe(true); expect(cache.cardAssetStatus("/decode.png")).toBe("renderable-ready");
  });
  it("a hung decode of a loaded image has a bounded renderable completion", async () => {
    const cache = await import("@/assets/cardPreload"); const request = cache.preloadCardAsset("/hung.png");
    await vi.advanceTimersByTimeAsync(cache.CARD_DECODE_TIMEOUT_MS);
    expect(await request).toBe(true); expect(cache.cardAssetStatus("/hung.png")).toBe("renderable-ready");
  });
  it("slow transfers survive the old 2.5s deadline", async () => {
    FakeImage.cached = false;
    const cache = await import("@/assets/cardPreload"); const request = cache.preloadCardAsset("/slow.png");
    const slow = image("/slow.png");
    await vi.advanceTimersByTimeAsync(3000);
    expect(cache.cardAssetStatus("/slow.png")).toBe("loading");
    slow.complete = true; slow.naturalWidth = 100; slow.onload!();
    slow.resolve();
    expect(await request).toBe(true);
  });
  it("an unavailable image has a bounded fallback rather than a deadlock", async () => {
    FakeImage.cached = false;
    const cache = await import("@/assets/cardPreload"); const request = cache.preloadCardAsset("/offline.png");
    await vi.advanceTimersByTimeAsync(cache.CARD_LOAD_TIMEOUT_MS * 2 + 250);
    expect(await request).toBe(false); expect(cache.cardAssetStatus("/offline.png")).toBe("failed");
  });
  it("network failures retry twice, then can recover after cooldown", async () => {
    const cache = await import("@/assets/cardPreload"); const request = cache.preloadCardAsset("/fail.png");
    image("/fail.png").onerror!(); expect(cache.cardAssetStatus("/fail.png")).toBe("retryable");
    await vi.advanceTimersByTimeAsync(250); image("/fail.png").onerror!();
    expect(await request).toBe(false); expect(await cache.preloadCardAsset("/fail.png")).toBe(false);
    await vi.advanceTimersByTimeAsync(cache.CARD_RETRY_COOLDOWN_MS);
    const recovered = cache.preloadCardAsset("/fail.png"); image("/fail.png").resolve();
    expect(await recovered).toBe(true);
  });
  it("optimized PNG failure falls back to the preserved original", async () => {
    const cache = await import("@/assets/cardPreload"); const url = "/cards/runtime-png/backs/blue_back.png";
    const request = cache.preloadCardAsset(url);
    image("/cards/optimized-png/backs/blue_back.png").onerror!();
    await vi.advanceTimersByTimeAsync(250); image(url).resolve();
    expect(await request).toBe(true); expect(cache.resolvedCardArtwork(url)).toBe(url);
    expect(images.some(item => item.src.endsWith(".webp"))).toBe(false);
  });
  it("background warming starts only two requests; critical artwork bypasses warming", async () => {
    const cache = await import("@/assets/cardPreload");
    await vi.advanceTimersByTimeAsync(50);
    expect(images).toHaveLength(2);
    const critical = cache.preloadCardAsset("/critical.png"); expect(images).toHaveLength(3);
    image("/critical.png").resolve(); expect(await critical).toBe(true);
  });
  it("critical hook gates until decode completes", async () => {
    const { useCriticalCardArtwork } = await import("@/components/table/useCriticalCardArtwork");
    function Harness() { return <div>{useCriticalCardArtwork(["/critical.png"]) ? "settled" : "waiting"}</div>; }
    const view = render(<Harness />); expect(view.container.textContent).toBe("waiting");
    await act(async () => { image("/critical.png").resolve(); await Promise.resolve(); });
    expect(view.container.textContent).toBe("settled");
  });
  it("a DOM load restores artwork even if the preload failed; changed artwork gets fresh readiness", async () => {
    const { PlayingCard } = await import("@/components/joker/PlayingCard");
    const view = render(<PlayingCard card={{ kind: "standard", id: "8-clubs", suit: "clubs", rank: "8" }} />);
    const node = view.container.querySelector("img")!;
    fireEvent.error(node); expect(view.container.querySelector("[data-card-semantic-fallback]")).not.toBeNull();
    fireEvent.load(node); expect(view.container.querySelector("[data-card-semantic-fallback]")).toBeNull();
    expect(node).toHaveAttribute("data-card-artwork-loaded", "true");
    view.rerender(<PlayingCard card={{ kind: "standard", id: "9-clubs", suit: "clubs", rank: "9" }} />);
    expect(view.container.querySelector("img")).not.toBe(node);
    expect(view.container.querySelector("img")).toHaveAttribute("data-card-artwork-loaded", "false");
  });
});
describe("bounded timing capture", () => {
  it("animation callbacks capture memory; one batched write bounds history and preserves monotonic seq", async () => {
    const diagnostics = await import("@/lib/timingDiagnostics"); const writes = vi.spyOn(Storage.prototype, "setItem"); const reads = vi.spyOn(Storage.prototype, "getItem");
    diagnostics.startTimingDiagnosticSession("runtime");
    for (let index = 0; index < 1000; index++) diagnostics.recordTimingDiagnostic("landing", { index });
    expect(writes).not.toHaveBeenCalled(); expect(reads).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(writes).toHaveBeenCalledTimes(2);
    const events = JSON.parse(localStorage.getItem("joker:timing-diagnostics:v1")!);
    expect(events).toHaveLength(800); expect(events.at(-1).seq).toBe(1001);
  });
  it("storage failure cannot throw from session, capture or flush", async () => {
    const diagnostics = await import("@/lib/timingDiagnostics"); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Denied"); });
    expect(() => { diagnostics.startTimingDiagnosticSession("denied"); diagnostics.recordTimingDiagnostic("flight"); diagnostics.flushTimingDiagnostics(); }).not.toThrow();
  });
});
