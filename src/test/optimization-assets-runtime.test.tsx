import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let images: FakeImage[];
let resolveDecode: () => void;
let rejectDecode: (error: Error) => void;
class FakeImage {
  decoding = ""; onload: (() => void) | null = null; onerror: (() => void) | null = null;
  complete = true; naturalWidth = 100; private url = "";
  decode = vi.fn(() => new Promise<void>((resolve, reject) => { resolveDecode = resolve; rejectDecode = reject; }));
  set src(value: string) { this.url = value; images.push(this); }
  get src() { return this.url; }
}
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); images = []; vi.stubGlobal("Image", FakeImage); localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("decoded artwork readiness", () => {
  it("cached load still waits for decode; duplicate requests coalesce and warm cache is ready", async () => {
    const cache = await import("@/assets/cardPreload");
    const first = cache.preloadCardAsset("/test.png"), second = cache.preloadCardAsset("/test.png");
    expect(second).toBe(first); expect(cache.isCardAssetReady("/test.png")).toBe(false);
    resolveDecode(); await first;
    expect(cache.cardAssetStatus("/test.png")).toBe("decoded-ready");
    expect(await cache.preloadCardAsset("/test.png")).toBe(true);
    expect(images.filter(image => image.src === "/test.png")).toHaveLength(1);
  });
  it("decode failure is retryable then bounded terminal failure", async () => {
    const cache = await import("@/assets/cardPreload"); const request = cache.preloadCardAsset("/fail.png");
    rejectDecode(new Error("Decode rejected")); await Promise.resolve(); expect(cache.cardAssetStatus("/fail.png")).toBe("retryable");
    vi.advanceTimersByTime(250); rejectDecode(new Error("Decode rejected")); await Promise.resolve();
    expect(await request).toBe(false); expect(cache.cardAssetStatus("/fail.png")).toBe("failed");
    expect(await cache.preloadCardAsset("/fail.png")).toBe(false);
    expect(images.filter(image => image.src === "/fail.png")).toHaveLength(2);
  });
  it("hung critical decode resolves to fallback without waiting indefinitely", async () => {
    const cache = await import("@/assets/cardPreload"); const request = cache.preloadCardAsset("/hung.png");
    await vi.advanceTimersByTimeAsync(5250); expect(await request).toBe(false);
  });
  it("optimized critical artwork can fall back to original PNG without a permanent blank", async () => {
    const cache = await import("@/assets/cardPreload"); const request = cache.preloadCardAsset("/cards/card_back.png");
    expect(cache.resolvedCardArtwork("/cards/card_back.png")).toBe("/cards/optimized/card_back.webp");
    rejectDecode(new Error("WebP unavailable")); await Promise.resolve(); vi.advanceTimersByTime(250);
    expect(images.at(-1)!.src).toBe("/cards/card_back.png"); resolveDecode();
    expect(await request).toBe(true); expect(cache.resolvedCardArtwork("/cards/card_back.png")).toBe("/cards/card_back.png");
  });
  it("critical hook gates presentation until decode completes", async () => {
    const { useCriticalCardArtwork } = await import("@/components/table/useCriticalCardArtwork");
    function Harness() { return <div>{useCriticalCardArtwork(["/critical.png"]) ? "settled" : "waiting"}</div>; }
    const view = render(<Harness />); expect(view.container.textContent).toBe("waiting");
    await act(async () => { resolveDecode(); await Promise.resolve(); });
    expect(view.container.textContent).toBe("settled");
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
