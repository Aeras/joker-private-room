import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalFlightCard } from "@/components/table/LocalFlightCard";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { LocalPlayPresentation } from "@/components/table/localPlayPresentation";
import { playGameSound } from "@/lib/gameAudio";

vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
const rect = { left: 0, top: 0, right: 900, bottom: 400, width: 900, height: 400 };
const geometry = { ...computeTableGeometry({ feltRect: rect, viewportWidth: 900, viewportHeight: 400 }), epoch: 1 };
const pending: LocalPlayPresentation = {
  gameId: "g", dealNumber: 1, actorSeat: 0, sourceStateVersion: 1,
  acceptedStateVersion: null, geometryEpoch: 1,
  card: { kind: "standard", suit: "spades", rank: "A", id: "A-spades" },
  cardId: "A-spades", releaseRect: { ...rect, width: 70, height: 98 }, status: "submitted",
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 16));
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
  vi.mocked(playGameSound).mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("sounds once at physical landing even when server confirmation arrives later", () => {
  const settled = vi.fn();
  const props = { presentation: pending, geometry, viewerSeat: 0, reducedMotion: false, onSettled: settled };
  const view = render(<LocalFlightCard {...props} />);
  act(() => vi.advanceTimersByTime(16));
  act(() => vi.advanceTimersByTime(420));
  expect(playGameSound).toHaveBeenCalledTimes(1);
  expect(playGameSound).toHaveBeenCalledWith("play", "g:1:local-flight:A-spades:1");
  expect(settled).not.toHaveBeenCalled();
  view.rerender(<LocalFlightCard {...props} presentation={{ ...pending, status: "accepted", acceptedStateVersion: 2 }} />);
  expect(settled).toHaveBeenCalledOnce();
  expect(playGameSound).toHaveBeenCalledTimes(1);
});
