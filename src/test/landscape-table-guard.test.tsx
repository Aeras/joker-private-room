import { act, cleanup, fireEvent, render, screen as ui } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandscapeTableGuard } from "@/components/table/LandscapeTableGuard";
import { enterGameDisplayMode, maintainGameLandscape } from "@/lib/gameDisplayMode";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("landscape-only table", () => {
  it("keeps children mounted but inert through portrait and resumes the same table", async () => {
    let portrait = false;
    const listeners = new Set<() => void>();
    const orientationMedia = { get matches() { return portrait; }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
    vi.stubGlobal("matchMedia", vi.fn((query: string) => query.includes("orientation") ? orientationMedia : { matches: true }));
    const lock = vi.fn(async () => {}); const unlock = vi.fn();
    vi.stubGlobal("screen", { orientation: { lock, unlock } });
    const view = render(<LandscapeTableGuard><button data-testid="table-card">Card</button></LandscapeTableGuard>);
    const card = ui.getByTestId("table-card"); const content = card.parentElement!;
    expect(content).not.toHaveAttribute("inert");
    act(() => { portrait = true; listeners.forEach(fn => fn()); });
    expect(content).toHaveAttribute("inert"); expect(content).toHaveAttribute("aria-hidden", "true"); expect(ui.getByTestId("table-card")).toBe(card);
    act(() => { portrait = false; listeners.forEach(fn => fn()); });
    expect(content).not.toHaveAttribute("inert"); expect(ui.getByTestId("table-card")).toBe(card);
    await act(async () => { fireEvent(document, new Event("fullscreenchange")); fireEvent.focus(window); });
    expect(lock.mock.calls.length).toBeGreaterThanOrEqual(3);
    view.unmount(); expect(listeners.size).toBe(0); expect(unlock).toHaveBeenCalledOnce();
  });
  it("requests the table fullscreen root before locking landscape", async () => {
    const order: string[] = []; const root = document.createElement("div");
    root.requestFullscreen = vi.fn(async () => { order.push("fullscreen"); });
    vi.stubGlobal("screen", { orientation: { lock: vi.fn(async () => { order.push("landscape"); }) } });
    await enterGameDisplayMode(root); expect(order).toEqual(["fullscreen", "landscape"]);
  });
  it("handles missing and denied orientation lock without rejecting", async () => {
    vi.stubGlobal("screen", {}); await expect(maintainGameLandscape()).resolves.toBe(false);
    await expect(enterGameDisplayMode()).resolves.toMatchObject({ lockedLandscape: false });
    vi.stubGlobal("screen", { orientation: { lock: vi.fn(async () => { throw new Error("unsupported"); }) } });
    await expect(maintainGameLandscape()).resolves.toBe(false);
  });
});
