import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalFlightCard } from "@/components/table/LocalFlightCard";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { LocalPlayPresentation } from "@/components/table/localPlayPresentation";
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
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
it("landing is reported before late authority and never reported twice", () => {
  const rect = { left: 0, top: 0, right: 900, bottom: 400, width: 900, height: 400 };
  const geometry = {
    ...computeTableGeometry({ feltRect: rect, viewportWidth: 900, viewportHeight: 400 }),
    epoch: 1,
  };
  const presentation: LocalPlayPresentation = {
    gameId: "g",
    dealNumber: 1,
    actorSeat: 0,
    sourceStateVersion: 1,
    acceptedStateVersion: null,
    geometryEpoch: 1,
    releaseRect: { ...rect, width: 70, height: 98 },
    cardId: "A",
    card: { id: "A", kind: "standard", suit: "spades", rank: "A" },
    status: "submitted",
  };
  const onLanded = vi.fn(),
    onSettled = vi.fn();
  const props = { geometry, viewerSeat: 0, reducedMotion: false, onLanded, onSettled };
  const v = render(<LocalFlightCard {...props} presentation={presentation} />);
  act(() => vi.advanceTimersByTime(16));
  act(() => vi.advanceTimersByTime(420));
  expect(onLanded).toHaveBeenCalledOnce();
  expect(onSettled).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(2000));
  v.rerender(
    <LocalFlightCard
      {...props}
      presentation={{ ...presentation, status: "accepted", acceptedStateVersion: 2 }}
    />,
  );
  expect(onLanded).toHaveBeenCalledOnce();
  expect(onSettled).toHaveBeenCalledOnce();
});

