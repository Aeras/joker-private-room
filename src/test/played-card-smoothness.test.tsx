import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardFlightFrames } from "@/components/table/cardFlightMotion";
import { LocalFlightCard } from "@/components/table/LocalFlightCard";
import { TrickPresentation } from "@/components/table/TrickPresentation";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import { TRICK_CARD_ROTATION } from "@/components/table/trickPresentationModel";
import type { PlayerGameProjection } from "@/domain/projection";
import type { LocalPlayPresentation } from "@/components/table/localPlayPresentation";

vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({
  useCriticalCardArtwork: () => true,
}));
const rect = { left: 40, top: 35, right: 860, bottom: 385, width: 820, height: 350 };
const geometry = {
  ...computeTableGeometry({ feltRect: rect, viewportWidth: 900, viewportHeight: 420 }),
  epoch: 1,
};
const card = { id: "smooth", kind: "standard", suit: "hearts", rank: "A" } as const;
const local: LocalPlayPresentation = {
  gameId: "smooth",
  dealNumber: 1,
  actorSeat: 0,
  sourceStateVersion: 1,
  acceptedStateVersion: null,
  geometryEpoch: 1,
  card,
  cardId: card.id,
  status: "submitted",
  releaseRect: { left: 400, top: 300, right: 470, bottom: 398, width: 70, height: 98 },
};
const snapshot = (seat?: 0 | 1 | 2 | 3) =>
  ({
    gameId: "smooth",
    viewerSeat: 0,
    progression: { dealNumber: 1 },
    cards: { currentTrick: seat == null ? [] : [{ seatIndex: seat, card }], completedTricks: [] },
  }) as unknown as PlayerGameProjection;
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
function finish(node: HTMLElement) {
  const event = new Event("animationend", { bubbles: true });
  Object.defineProperty(event, "animationName", { value: node.style.animationName });
  fireEvent(node, event);
}
function surface(container: HTMLElement, selector: string) {
  const node = container.querySelector<HTMLElement>(selector);
  if (!node) throw new Error("Missing flight surface");
  return node;
}
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

describe("played-card visual continuity", () => {
  it("samples the existing path more finely than a 120 Hz display without changing endpoints", () => {
    const frames = cardFlightFrames(
      (p, r, t) => `translate(${p.x}px,${p.y}px) rotate(${r}deg) scale(${t})`,
      { x: 10, y: 20 },
      { x: 300, y: 100 },
      -8,
      2,
    );
    expect(frames.match(/%\{/g)).toHaveLength(61);
    expect(340 / 60).toBeLessThan(1000 / 120);
    expect(frames).toMatch(/^0%\{transform:translate\(10px,20px\) rotate\(-8deg\) scale\(0\)\}/);
    expect(frames).toContain("100%{transform:translate(300px,100px)");
    expect(frames).not.toMatch(/NaN|Infinity/);
  });
  it("retains the local animation and stylesheet while landing waits for acceptance", () => {
    const landed = vi.fn(),
      settled = vi.fn();
    const props = {
      geometry,
      viewerSeat: 0,
      reducedMotion: false,
      onLanded: landed,
      onSettled: settled,
    };
    const view = render(<LocalFlightCard {...props} presentation={local} />);
    tick(16);
    const node = surface(view.container, "[data-local-flight-card]");
    const name = node.style.animationName,
      sheet = node.querySelector("style"),
      text = sheet?.textContent;
    finish(node);
    expect(landed).toHaveBeenCalledOnce();
    expect(settled).not.toHaveBeenCalled();
    expect(node.style.animationName).toBe(name);
    expect(node.querySelector("style")).toBe(sheet);
    expect(sheet?.textContent).toBe(text);
    view.rerender(
      <LocalFlightCard
        {...props}
        geometry={{ ...geometry, epoch: 2 }}
        presentation={{ ...local, status: "accepted", acceptedStateVersion: 2 }}
      />,
    );
    expect(node.style.animationName).toBe(name);
    expect(settled).toHaveBeenCalledOnce();
    finish(node);
    tick(1000);
    expect(landed).toHaveBeenCalledOnce();
    expect(settled).toHaveBeenCalledOnce();
  });
  it.each([0, 1, 2, 3] as const)(
    "seat %i has identical pre-launch and first-keyframe poses and retains its landed endpoint",
    (seat) => {
      const props = { geometry, localPlayPresentation: null, onLocalFlightSettled: vi.fn() };
      const view = render(<TrickPresentation {...props} projection={snapshot()} />);
      view.rerender(<TrickPresentation {...props} projection={snapshot(seat)} />);
      tick(0);
      const node = surface(view.container, "[data-trick-seat]");
      const initial = node.style.transform;
      expect(initial).toContain(`rotate(${TRICK_CARD_ROTATION[seat] - 6}deg)`);
      tick(16);
      const name = node.style.animationName,
        sheet = node.querySelector("style");
      expect(sheet?.textContent).toContain(`0%{transform:${initial}}`);
      finish(node);
      expect(node.style.animationName).toBe(name);
      expect(node.querySelector("style")).toBe(sheet);
      view.rerender(<TrickPresentation {...props} projection={structuredClone(snapshot(seat))} />);
      expect(surface(view.container, "[data-trick-seat]")).toBe(node);
      expect(node.style.animationName).toBe(name);
      expect(node.style.animationDuration).toBe("340ms");
    },
  );
  it("does not replay historical cards on initial hydration", () => {
    const view = render(
      <TrickPresentation
        geometry={geometry}
        localPlayPresentation={null}
        onLocalFlightSettled={vi.fn()}
        projection={snapshot(1)}
      />,
    );
    tick(16);
    expect(surface(view.container, "[data-trick-seat]").style.animationName).toBe("none");
  });
  it("keeps reduced local motion on its short transition rather than adding a curved flight", () => {
    const settled = vi.fn();
    const view = render(
      <LocalFlightCard
        geometry={geometry}
        viewerSeat={0}
        reducedMotion
        onSettled={settled}
        presentation={{ ...local, status: "accepted" }}
      />,
    );
    tick(16);
    const node = surface(view.container, "[data-local-flight-card]");
    expect(node.querySelector("style")).toBeNull();
    expect(node.style.transitionDuration).toBe("75ms");
    tick(195);
    expect(settled).toHaveBeenCalledOnce();
  });
});
