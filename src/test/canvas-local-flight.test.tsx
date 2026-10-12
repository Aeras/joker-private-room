import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalFlightCard } from "@/components/table/LocalFlightCard";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { LocalPlayPresentation } from "@/components/table/localPlayPresentation";
const mocks = vi.hoisted(() => ({ ready: true, enabled: true, sound: vi.fn() }));
vi.mock("@/components/table/canvas/assetCache", () => ({
  canvasFlightAvailable: () => mocks.enabled,
  canvasCardAssets: { peek: () => (mocks.ready ? {} : null) },
}));
vi.mock("@/lib/gameAudio", () => ({ playGameSound: mocks.sound }));
vi.mock("@/components/joker/PlayingCard", () => ({ PlayingCard: () => <div data-dom-card /> }));
function props() {
  const projection = projectGameForSeat(reconciliationFixture(), 0);
  const card = {
    kind: "standard" as const,
    id: "h-A",
    suit: "hearts" as const,
    rank: "A" as const,
  };
  projection.cards.ownHand = [card];
  projection.cards.ownHandVisible = true;
  const geometry = {
    ...computeTableGeometry({
      feltRect: { left: 0, top: 0, width: 844, height: 390, right: 844, bottom: 390 },
      viewportWidth: 844,
      viewportHeight: 390,
    }),
    epoch: 1,
  };
  const presentation: LocalPlayPresentation = {
    gameId: projection.gameId,
    dealNumber: projection.progression.dealNumber,
    actorSeat: 0,
    sourceStateVersion: projection.stateVersion,
    acceptedStateVersion: null,
    geometryEpoch: 1,
    card,
    cardId: card.id,
    status: "submitted",
    releaseRect: { left: 310, top: 300, right: 375, bottom: 391, width: 65, height: 91 },
  };
  return {
    projection,
    presentation,
    geometry,
    viewerSeat: 0,
    reducedMotion: false,
    onSettled: vi.fn(),
    onLanded: vi.fn(),
  };
}
const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(Date.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
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
    context as unknown as CanvasRenderingContext2D,
  );
  mocks.ready = true;
  mocks.enabled = true;
  mocks.sound.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("real local Canvas ownership", () => {
  it.each([0, 50, 600])(
    "authority after %i ms does not restart motion or settle early",
    (delay) => {
      const p = props(),
        view = render(<LocalFlightCard {...p} />),
        surface = view.container.querySelector("canvas")!;
      expect(surface).not.toBeNull();
      expect(view.container.querySelector("[data-dom-card]")).toBeNull();
      tick(delay);
      view.rerender(
        <LocalFlightCard
          {...p}
          presentation={{
            ...p.presentation,
            status: "accepted",
            acceptedStateVersion: p.projection.stateVersion + 1,
          }}
        />,
      );
      expect(view.container.querySelector("canvas")).toBe(surface);
      if (delay < 300) {
        expect(p.onSettled).not.toHaveBeenCalled();
        tick(320 - delay);
      }
      expect(p.onLanded).toHaveBeenCalledOnce();
      expect(p.onSettled).toHaveBeenCalledOnce();
      tick(1000);
      expect(p.onSettled).toHaveBeenCalledOnce();
      expect(mocks.sound).toHaveBeenCalledOnce();
    },
  );
  it("returns rejected motion and never interprets landing as acceptance", () => {
    const p = props(),
      view = render(<LocalFlightCard {...p} />);
    tick(100);
    view.rerender(
      <LocalFlightCard {...p} presentation={{ ...p.presentation, status: "rejected" }} />,
    );
    expect(view.container.querySelector("canvas")?.getAttribute("data-canvas-phase")).toBe(
      "returning",
    );
    tick(330);
    expect(p.onSettled).toHaveBeenCalledOnce();
    expect(p.onLanded).not.toHaveBeenCalled();
    expect(mocks.sound).not.toHaveBeenCalled();
  });
  it("holds the landed card indefinitely until authority arrives", () => {
    const p = props(),
      view = render(<LocalFlightCard {...p} />);
    tick(2000);
    expect(p.onLanded).toHaveBeenCalledOnce();
    expect(p.onSettled).not.toHaveBeenCalled();
    expect(view.container.querySelector("canvas")).not.toBeNull();
  });
  it("resumes elapsed work after blur and cleans up on unmount", () => {
    const p = props(),
      view = render(
        <LocalFlightCard {...p} presentation={{ ...p.presentation, status: "accepted" }} />,
      );
    tick(80);
    fireEvent.blur(window);
    tick(1000);
    expect(p.onLanded).not.toHaveBeenCalled();
    fireEvent.focus(window);
    tick(32);
    expect(p.onSettled).toHaveBeenCalledOnce();
    view.unmount();
    tick(1000);
    expect(p.onSettled).toHaveBeenCalledOnce();
  });
  it("keeps cold assets on DOM for the entire flight and supports the internal switch", () => {
    const p = props();
    mocks.ready = false;
    const view = render(<LocalFlightCard {...p} />);
    expect(view.container.querySelector("canvas")).toBeNull();
    mocks.ready = true;
    view.rerender(<LocalFlightCard {...p} />);
    expect(view.container.querySelector("canvas")).toBeNull();
    view.unmount();
    mocks.enabled = false;
    const fallback = render(<LocalFlightCard {...p} />);
    expect(fallback.container.querySelector("canvas")).toBeNull();
  });
  it("falls back on lost/null context without double landing delivery", () => {
    const p = props(),
      view = render(<LocalFlightCard {...p} />);
    tick(330);
    fireEvent(view.container.querySelector("canvas")!, new Event("contextlost"));
    expect(view.container.querySelector("canvas")).toBeNull();
    expect(view.container.querySelector("[data-dom-card]")).not.toBeNull();
    view.rerender(
      <LocalFlightCard {...p} presentation={{ ...p.presentation, status: "accepted" }} />,
    );
    tick(32);
    tick(1000);
    expect(p.onLanded).toHaveBeenCalledOnce();
    expect(p.onSettled).toHaveBeenCalledOnce();
    view.unmount();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const nullContext = render(<LocalFlightCard {...props()} />);
    expect(nullContext.container.querySelector("canvas")).toBeNull();
  });
  it("retains Joker behavior on DOM and reduced flight waits for authority", () => {
    const p = props();
    const joker = { kind: "joker" as const, id: "joker-1" };
    p.projection.cards.ownHand = [joker];
    const view = render(
      <LocalFlightCard
        {...p}
        presentation={{
          ...p.presentation,
          card: joker,
          cardId: joker.id,
          jokerSemantic: { context: "OPEN_TRICK", mode: "FROM_BELOW" },
        }}
      />,
    );
    expect(view.container.querySelector("canvas")).toBeNull();
    view.unmount();
    const reduced = props();
    render(<LocalFlightCard {...reduced} reducedMotion />);
    tick(96);
    expect(reduced.onLanded).toHaveBeenCalledOnce();
    expect(reduced.onSettled).not.toHaveBeenCalled();
  });
});
