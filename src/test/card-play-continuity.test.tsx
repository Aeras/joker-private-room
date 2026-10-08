import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalFlightCard } from "@/components/table/LocalFlightCard";
import { TrickPresentation } from "@/components/table/TrickPresentation";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { PlayedCard } from "@/domain/engine";
import type { PlayerGameProjection } from "@/domain/projection";
import type { LocalPlayPresentation } from "@/components/table/localPlayPresentation";
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({
  useCriticalCardArtwork: () => true,
}));
const geom = (width = 900, height = 420) => ({
  ...computeTableGeometry({
    feltRect: {
      left: 40,
      top: 35,
      right: width - 40,
      bottom: height - 35,
      width: width - 80,
      height: height - 70,
    },
    viewportWidth: width,
    viewportHeight: height,
  }),
  epoch: width,
});
const card = { id: "continuity", kind: "standard", suit: "spades", rank: "A" } as const;
const snap = (
  cards: PlayedCard[] = [],
  completed: PlayerGameProjection["cards"]["completedTricks"] = [],
) =>
  ({
    gameId: "continuity",
    viewerSeat: 0,
    progression: { dealNumber: 1 },
    cards: { currentTrick: cards, completedTricks: completed },
  }) as PlayerGameProjection;
const tick = (n: number) => act(() => vi.advanceTimersByTime(n));
const finish = (el: Element) => {
  const e = new Event("transitionend", { bubbles: true });
  Object.defineProperty(e, "propertyName", { value: "transform" });
  fireEvent(el, e);
};
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
it.each([-8, 0, 8])("uses physical dimensions and retains release rotation %i", (rotation) => {
  const g = geom(),
    releaseRect = {
      left: 250,
      top: 280,
      right: 378,
      bottom: 445,
      width: 128,
      height: 165,
      cardWidth: 108,
      cardHeight: 151.2,
      rotation,
    };
  const presentation: LocalPlayPresentation = {
    gameId: "continuity",
    dealNumber: 1,
    actorSeat: 0,
    sourceStateVersion: 1,
    acceptedStateVersion: null,
    geometryEpoch: 1,
    card,
    cardId: card.id,
    releaseRect,
    status: "submitted",
  };
  const v = render(
    <LocalFlightCard
      presentation={presentation}
      geometry={g}
      viewerSeat={0}
      reducedMotion={false}
      onSettled={vi.fn()}
    />,
  );
  const el = v.container.querySelector<HTMLElement>("[data-local-flight-card]")!;
  expect(el.style.getPropertyValue("--card-w")).toBe("108px");
  expect(el.style.transform).toContain(`rotate(${rotation}deg)`);
  tick(16);
  expect(el.style.transform).toContain(
    `translate(${40 + g.trickSlots[0].x - 54}px, ${35 + g.trickSlots[0].y - 75.6}px)`,
  );
});
it.each([0, 1, 2, 3])("keeps remote seat %i at its landing through geometry revision", (seat) => {
  const g = geom(),
    props = { geometry: g, localPlayPresentation: null, onLocalFlightSettled: vi.fn() };
  const v = render(<TrickPresentation {...props} projection={snap()} />);
  v.rerender(<TrickPresentation {...props} projection={snap([{ seatIndex: seat, card }])} />);
  tick(0);
  tick(16);
  const el = v.container.querySelector<HTMLElement>("[data-trick-seat]")!;
  const pose = [
    el.style.left,
    el.style.top,
    el.style.transform,
    el.style.getPropertyValue("--card-w"),
  ];
  v.rerender(
    <TrickPresentation
      {...props}
      geometry={geom(1100, 560)}
      projection={snap([{ seatIndex: seat, card }])}
    />,
  );
  finish(el);
  expect([
    el.style.left,
    el.style.top,
    el.style.transform,
    el.style.getPropertyValue("--card-w"),
  ]).toEqual(pose);
});
it("uses the latest geometry on a new trick after collection", () => {
  const g = geom(),
    g2 = geom(1100, 560),
    props = { localPlayPresentation: null, onLocalFlightSettled: vi.fn() };
  const plays = [0, 1, 2, 3].map((seatIndex) => ({
    seatIndex,
    card: { ...card, id: `done-${seatIndex}` },
  }));
  const v = render(<TrickPresentation {...props} geometry={g} projection={snap(plays)} />);
  v.rerender(
    <TrickPresentation
      {...props}
      geometry={g2}
      projection={snap([], [{ cards: plays, winnerSeat: 0 }])}
    />,
  );
  tick(850);
  tick(520);
  tick(720);
  v.rerender(
    <TrickPresentation
      {...props}
      geometry={g2}
      projection={snap([{ seatIndex: 1, card }], [{ cards: plays, winnerSeat: 0 }])}
    />,
  );
  tick(0);
  tick(16);
  tick(460);
  const el = v.container.querySelector<HTMLElement>("[data-trick-seat]")!;
  expect(el.style.left).toBe(`${g2.feltRect.left + g2.usableCenter.x}px`);
});
