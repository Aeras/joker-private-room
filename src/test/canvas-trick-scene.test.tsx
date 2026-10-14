import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasTrickScene } from "@/components/table/canvas/CanvasTrickScene";
import { trickSpriteMotion } from "@/components/table/canvas/trickSceneMotion";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { PlayedCard } from "@/domain/engine";
const bitmap = {};
vi.mock("@/components/table/canvas/assetCache", () => ({
  canvasCardAssets: { peek: () => bitmap },
}));
const geometry = {
  ...computeTableGeometry({
    feltRect: { left: 20, top: 15, right: 824, bottom: 375, width: 804, height: 360 },
    viewportWidth: 844,
    viewportHeight: 390,
  }),
  epoch: 1,
};
const cards: PlayedCard[] = [0, 1, 2, 3].map((seat) => ({
  seatIndex: seat as 0 | 1 | 2 | 3,
  card: { kind: "standard", id: `c-${seat}`, rank: "A", suit: "clubs" },
}));
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  const context = Object.fromEntries(
    [
      "setTransform",
      "clearRect",
      "save",
      "restore",
      "translate",
      "rotate",
      "scale",
      "beginPath",
      "moveTo",
      "lineTo",
      "quadraticCurveTo",
      "closePath",
      "fill",
      "clip",
      "drawImage",
    ].map((name) => [name, vi.fn()]),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as ReturnType<HTMLCanvasElement["getContext"]>,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function props() {
  return {
    cards,
    viewerSeat: 0 as const,
    geometry,
    stage: "landing" as const,
    winnerSeat: 2 as const,
    settled: () => false,
    reducedMotion: false,
    paused: false,
    onComplete: vi.fn(),
    onFailure: vi.fn(),
  };
}
describe("one shared trick scene", () => {
  it("owns four sprites in one canvas and completes each landing once despite unrelated rerenders", () => {
    const p = props(),
      view = render(<CanvasTrickScene {...p} />);
    tick(100);
    view.rerender(<CanvasTrickScene {...p} cards={[...cards]} />);
    tick(260);
    expect(view.container.querySelectorAll("canvas")).toHaveLength(1);
    expect(p.onComplete).toHaveBeenCalledTimes(4);
    tick(1000);
    expect(p.onComplete).toHaveBeenCalledTimes(4);
  });
  it.each([0, 1, 2, 3] as const)(
    "keeps winner %i stationary, stacks the other three, then collects all four",
    (winnerSeat) => {
      const p = { ...props(), winnerSeat },
        view = render(<CanvasTrickScene {...p} />);
      tick(360);
      p.onComplete.mockClear();
      view.rerender(<CanvasTrickScene {...p} stage="holding" settled={() => true} />);
      tick(550);
      expect(p.onComplete).not.toHaveBeenCalled();
      view.rerender(<CanvasTrickScene {...p} stage="stacking" settled={() => true} />);
      tick(270);
      expect(p.onComplete.mock.calls.map((call) => call[0].seatIndex).sort()).toEqual(
        [0, 1, 2, 3].filter((seat) => seat !== winnerSeat),
      );
      p.onComplete.mockClear();
      view.rerender(<CanvasTrickScene {...p} stage="collecting" settled={() => true} />);
      tick(400);
      expect(p.onComplete).toHaveBeenCalledTimes(4);
      expect(p.onComplete.mock.calls.every((call) => call[1] === "collecting")).toBe(true);
    },
  );
  it("does not replay hydrated cards and leaves no idle RAF", () => {
    const p = props();
    render(<CanvasTrickScene {...p} settled={() => true} />);
    tick(1000);
    expect(p.onComplete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("suspends callbacks and settles elapsed motion once on foreground return", () => {
    const p = props(),
      view = render(<CanvasTrickScene {...p} />);
    tick(100);
    view.rerender(<CanvasTrickScene {...p} paused />);
    tick(1000);
    expect(p.onComplete).not.toHaveBeenCalled();
    view.rerender(<CanvasTrickScene {...p} />);
    tick(20);
    expect(p.onComplete).toHaveBeenCalledTimes(4);
  });
  it("cancels replaced stages and unmount prevents stale callbacks", () => {
    const p = props(),
      view = render(<CanvasTrickScene {...p} />);
    tick(100);
    view.rerender(<CanvasTrickScene {...p} stage="collecting" />);
    tick(400);
    expect(p.onComplete.mock.calls.every((call) => call[1] === "collecting")).toBe(true);
    view.unmount();
    p.onComplete.mockClear();
    tick(1000);
    expect(p.onComplete).not.toHaveBeenCalled();
  });
  it("reports context loss once and disposes pending frames", () => {
    const p = props(),
      view = render(<CanvasTrickScene {...p} />);
    fireEvent(view.container.querySelector("canvas")!, new Event("contextlost"));
    fireEvent(view.container.querySelector("canvas")!, new Event("contextlost"));
    tick(1000);
    expect(p.onFailure).toHaveBeenCalledOnce();
    expect(p.onComplete).not.toHaveBeenCalled();
  });
});
describe("renderer independent trick geometry", () => {
  it.each([0, 1, 2, 3] as const)(
    "preserves exact origins/endpoints and winner-directed exit for viewer %i",
    (viewer) => {
      for (const play of cards) {
        const pos = ((play.seatIndex - viewer + 4) % 4) as 0 | 1 | 2 | 3;
        const flight = trickSpriteMotion(play, viewer, geometry, "landing", 2, false);
        expect(flight.sample(0).x).toBeCloseTo(20 + geometry.seatOrigins[pos].x);
        expect(flight.sample(1)).toEqual(flight.resting);
        for (const winner of [0, 1, 2, 3] as const) {
          const winnerPos = ((winner - viewer + 4) % 4) as 0 | 1 | 2 | 3;
          const stack = trickSpriteMotion(play, viewer, geometry, "stacking", winner, false);
          expect(stack.sample(0).x).toBeCloseTo(flight.resting.x);
          expect(stack.sample(1).x).toBeCloseTo(20 + geometry.trickSlots[winnerPos].x);
          const exit = trickSpriteMotion(play, viewer, geometry, "collecting", winner, false);
          expect(exit.sample(0).x).toBeCloseTo(stack.sample(1).x);
          expect(exit.sample(1).opacity).toBe(0);
          expect(exit.sample(0.5).opacity).toBe(1);
        }
      }
    },
  );
  it("reduced motion preserves the landing and avoids long collection travel", () => {
    const motion = trickSpriteMotion(cards[1]!, 0, geometry, "collecting", 3, true);
    expect(motion.sample(0).x).toBe(motion.sample(1).x);
    expect(motion.sample(1).opacity).toBe(0);
  });
});

it("flips FROM_BELOW in 300ms, moves in 450ms, preserves position and back through collection", () => {
  const joker: PlayedCard = {
    seatIndex: 1,
    card: { kind: "joker", id: "joker-2" },
    joker: { context: "OPEN_TRICK", mode: "FROM_BELOW" },
  };
  const motion = trickSpriteMotion(joker, 0, geometry, "landing", 2, false);
  expect(motion.duration).toBe(450);
  expect(motion.sample(0).flip).toBe(0);
  expect(motion.sample(1 / 3).flip).toBeCloseTo(90);
  expect(motion.sample(2 / 3).flip).toBe(180);
  expect(motion.sample(1).layer).toBe(0);
  expect(motion.sample(1)).toEqual(motion.resting);
  for (const stage of ["holding", "stacking", "collecting"] as const)
    expect(trickSpriteMotion(joker, 0, geometry, stage, 2, false).sample(0.3).flip).toBe(180);
  const reduced = trickSpriteMotion(joker, 0, geometry, "landing", 2, true);
  expect(reduced.sample(0.5).flip).toBe(0);
  expect(reduced.sample(1).backBlend).toBe(1);
});
