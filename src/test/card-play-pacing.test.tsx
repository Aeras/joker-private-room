import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrickPresentation } from "@/components/table/TrickPresentation";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { PlayerGameProjection } from "@/domain/projection";
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({
  useCriticalCardArtwork: () => true,
}));
vi.mock("@/lib/timingDiagnostics", () => ({ recordTimingDiagnostic: vi.fn() }));
const geometry = {
  ...computeTableGeometry({
    feltRect: { left: 0, top: 0, right: 900, bottom: 420, width: 900, height: 420 },
    viewportWidth: 900,
    viewportHeight: 420,
  }),
  epoch: 1,
};
const cards = [0, 1].map((seatIndex) => ({
  seatIndex,
  card: { id: `pacing-${seatIndex}`, kind: "standard", suit: "spades", rank: "A" },
}));
const snapshot = (count: number) =>
  ({
    gameId: "pacing",
    viewerSeat: 0,
    stateVersion: count,
    progression: { dealNumber: 2 },
    cards: { currentTrick: cards.slice(0, count), completedTricks: [] },
  }) as unknown as PlayerGameProjection;
const props = { geometry, localPlayPresentation: null, onLocalFlightSettled: vi.fn() };
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) =>
    window.setTimeout(() => fn(0), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("card play readability deadlines", () => {
  it("unchanged polls do not add a wait to an already landed card", () => {
    const v = render(<TrickPresentation {...props} projection={snapshot(1)} />);
    v.rerender(<TrickPresentation {...props} projection={snapshot(2)} />);
    const count = () => v.container.querySelectorAll("[data-trick-seat]").length;
    tick(0); expect(count()).toBe(2);
    tick(100);
    const unchanged = structuredClone(snapshot(2));
    v.rerender(<TrickPresentation {...props} projection={unchanged} />);
    tick(40);
    v.rerender(<TrickPresentation {...props} projection={unchanged} />);
    tick(19);
    tick(0); expect(count()).toBe(2);
    tick(1);
    expect(count()).toBe(2);
  });
  it("a late card launches immediately after an already elapsed readability beat", () => {
    const v = render(<TrickPresentation {...props} projection={snapshot(1)} />);
    tick(2000);
    v.rerender(<TrickPresentation {...props} projection={snapshot(2)} />);
    tick(0);
    expect(v.container.querySelectorAll("[data-trick-seat]")).toHaveLength(2);
  });
  it("a snapshot following an already landed card launches without a beat", () => {
    const v = render(<TrickPresentation {...props} projection={snapshot(1)} />);
    tick(100);
    v.rerender(<TrickPresentation {...props} projection={snapshot(2)} />);
    tick(59);
    expect(v.container.querySelectorAll("[data-trick-seat]")).toHaveLength(2);
    tick(1);
    expect(v.container.querySelectorAll("[data-trick-seat]")).toHaveLength(2);
  });
  it("a live remote card gates the next launch until its motion completes", () => {
    const v = render(<TrickPresentation {...props} projection={snapshot(0)} />);
    v.rerender(<TrickPresentation {...props} projection={snapshot(2)} />);
    tick(0);
    tick(16);
    const first = v.container.querySelector("[data-trick-seat]")!;
    const landed = new Event("animationend", { bubbles: true });
    Object.defineProperty(landed, "animationName", { value: (first as HTMLElement).style.animationName });
    expect(v.container.querySelectorAll("[data-trick-seat]")).toHaveLength(1);
    fireEvent(first, landed);
    tick(100);
    v.rerender(<TrickPresentation {...props} projection={structuredClone(snapshot(2))} />);
    tick(59);
    expect(v.container.querySelectorAll("[data-trick-seat]")).toHaveLength(2);
    tick(1);
    expect(v.container.querySelectorAll("[data-trick-seat]")).toHaveLength(2);
  });
  it.each(["human", "permanent_bot"])("releases the next %s interaction immediately after real landing", _controller => {
    const busy = vi.fn();
    const v = render(<TrickPresentation {...props} onBusyChange={busy} projection={snapshot(0)} />);
    const next = snapshot(1);
    // Controller identity must not change the shared presentation/input clock.
    next.seats = [{ controller: _controller }] as unknown as PlayerGameProjection["seats"];
    v.rerender(<TrickPresentation {...props} onBusyChange={busy} projection={next} />);
    tick(0); tick(16);
    expect(busy).toHaveBeenLastCalledWith(true);
    const first = v.container.querySelector("[data-trick-seat]")!;
    const landed = new Event("animationend", { bubbles: true });
    Object.defineProperty(landed, "animationName", { value: (first as HTMLElement).style.animationName }); fireEvent(first, landed);
    expect(busy).toHaveBeenLastCalledWith(false);
    tick(80);
    v.rerender(<TrickPresentation {...props} onBusyChange={busy} projection={structuredClone(next)} geometry={{ ...geometry, epoch: 8 }} />);
    tick(79); expect(busy).toHaveBeenLastCalledWith(false);
    tick(1); expect(busy).toHaveBeenLastCalledWith(false);
  });
  it("hidden/visible recovery consumes an elapsed beat without adding another pause", () => {
    const busy = vi.fn();
    const v = render(<TrickPresentation {...props} onBusyChange={busy} projection={snapshot(1)} />);
    tick(150); fireEvent.blur(window); tick(2000); fireEvent.focus(window);
    expect(busy).toHaveBeenLastCalledWith(false);
    v.rerender(<TrickPresentation {...props} onBusyChange={busy} projection={snapshot(2)} />);
    tick(0); expect(v.container.querySelectorAll("[data-trick-seat]")).toHaveLength(2);
  });

});
