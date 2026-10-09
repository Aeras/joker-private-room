import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PresentationRun, presentationTimeout } from "@/components/table/presentationRun";
import { DealPresentation } from "@/components/table/DealPresentation";
import { DealerSelectionPresentation } from "@/components/table/DealerSelectionPresentation";
import { LocalFlightCard } from "@/components/table/LocalFlightCard";
import { TrickPresentation } from "@/components/table/TrickPresentation";
import { LocalHandRow } from "@/components/table/LocalHandRow";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { PlayerGameProjection } from "@/domain/projection";
import type { LocalPlayPresentation } from "@/components/table/localPlayPresentation";
import { useReducedMotion } from "@/components/table/useReducedMotion";
import { dealPresentationTiming } from "@/components/table/dealPresentationModel";
import { StrictMode } from "react";
import { TrumpDeckMotion } from "@/components/table/TrumpDeckMotion";
import {
  LOCAL_FLIGHT_MS,
  NORMAL_TRICK_SETTLE_MS,
  NORMAL_TRICK_INTER_PLAY_BEAT_MS,
  NORMAL_TRICK_HOLD_MS,
  NORMAL_TRICK_COLLECT_MS,
} from "@/components/table/presentationTiming";

vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({
  useCriticalCardArtwork: () => true,
}));
vi.mock("@/lib/timingDiagnostics", () => ({
  recordTimingDiagnostic: vi.fn(),
  startTimingDiagnosticSession: vi.fn(),
}));
const rect = { left: 40, top: 40, right: 760, bottom: 290, width: 720, height: 250 };
const geometry = {
  ...computeTableGeometry({ feltRect: rect, viewportWidth: 800, viewportHeight: 400 }),
  epoch: 1,
};
const card = { kind: "standard", id: "A-hearts", suit: "hearts", rank: "A" } as const;
const projection = (gameId = "first") =>
  ({
    gameId,
    viewerSeat: 0,
    lifecycle: "active",
    rulesetId: "popular",
    progression: { dealNumber: 2, dealerSeat: 0, cardsPerPlayer: 1, phase: "DEAL_PRESENTATION" },
    cards: { ownHand: [], currentTrick: [], completedTricks: [] },
  }) as unknown as PlayerGameProjection;
const flight: LocalPlayPresentation = {
  gameId: "first",
  dealNumber: 2,
  actorSeat: 0,
  card,
  cardId: card.id,
  sourceStateVersion: 1,
  acceptedStateVersion: 2,
  geometryEpoch: 1,
  releaseRect: { ...rect, width: 60, height: 84 },
  status: "accepted",
};
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) =>
    window.setTimeout(() => fn(0), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("cancelled callbacks cannot affect a newer run, even if already queued", () => {
  const run = new PresentationRun();
  const change = vi.fn();
  const old = run.guard(change);
  run.invalidate();
  const current = run.guard(change);
  old();
  expect(change).not.toHaveBeenCalled();
  current();
  expect(change).toHaveBeenCalledOnce();
  const timeout = vi.spyOn(window, "setTimeout");
  const cancel = presentationTimeout(change, 100);
  const queued = timeout.mock.calls.at(-1)![0] as () => void;
  cancel();
  queued();
  expect(change).toHaveBeenCalledOnce();
});

it("old deal timers cannot expose cards or acknowledge the next game", () => {
  const spy = vi.spyOn(window, "setTimeout");
  const complete = vi.fn();
  const view = render(
    <DealPresentation
      projection={projection()}
      geometry={geometry}
      onPresentationComplete={complete}
    />,
  );
  const queued = spy.mock.calls
    .map((call) => call[0])
    .filter((fn): fn is () => void => typeof fn === "function");
  view.rerender(
    <DealPresentation
      projection={projection("second")}
      geometry={geometry}
      onPresentationComplete={complete}
    />,
  );
  act(() => queued.forEach((fn) => fn()));
  expect(complete).not.toHaveBeenCalled();
  expect(view.container.querySelectorAll("[data-deal-traveling-card]")).toHaveLength(0);
  tick(3500);
  expect(complete).toHaveBeenCalledOnce();
  expect(sessionStorage.getItem("joker:deal-presented:first:2:0:full")).toBeNull();
});

it("old dealer preparation frames cannot start a new game's selection", () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    frames.push(fn);
    return frames.length;
  });
  const selected = {
    status: "resolved",
    firstRecipientSeat: 0,
    selectedDealerSeat: 0,
    revealedSelectionCards: [card],
    resolvedAtStateVersion: 1,
  } as const;
  const first = {
    ...projection(),
    initialDealerSelection: selected,
  } as unknown as PlayerGameProjection;
  const view = render(
    <DealerSelectionPresentation projection={first} geometry={geometry} onActiveChange={vi.fn()} />,
  );
  const oldFrame = frames[0]!;
  view.rerender(
    <DealerSelectionPresentation
      projection={{ ...first, gameId: "second" }}
      geometry={geometry}
      onActiveChange={vi.fn()}
    />,
  );
  const length = frames.length;
  act(() => oldFrame(0));
  expect(frames).toHaveLength(length);
  expect(view.container.childElementCount).toBe(0);
});

it("reduced local flight fades near its final slot and still waits for authority", () => {
  const complete = vi.fn();
  const props = { geometry, viewerSeat: 0, reducedMotion: true, onSettled: complete };
  const view = render(
    <LocalFlightCard {...props} presentation={{ ...flight, status: "submitted" }} />,
  );
  const surface = view.container.querySelector<HTMLElement>("[data-local-flight-card]")!;
  expect(surface.style.opacity).toBe("0");
  const before = surface.style.transform;
  tick(16);
  expect(surface.style.opacity).toBe("1");
  expect(surface.style.transform).not.toBe(before);
  tick(195);
  expect(complete).not.toHaveBeenCalled();
  view.rerender(<LocalFlightCard {...props} presentation={flight} />);
  expect(complete).toHaveBeenCalledOnce();
  tick(1000);
  expect(complete).toHaveBeenCalledOnce();
});

it("reduced motion retains all four cards through hold/collection, collecting only once", () => {
  const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  const first = projection();
  const cards = [0, 1, 2, 3].map((seatIndex) => ({
    seatIndex,
    card: { ...card, id: `card-${seatIndex}` },
  }));
  const collected = vi.fn();
  const props = {
    geometry,
    localPlayPresentation: null,
    onLocalFlightSettled: vi.fn(),
    onCollectionComplete: collected,
  };
  const view = render(<TrickPresentation {...props} projection={first} />);
  view.rerender(
    <TrickPresentation
      {...props}
      projection={
        {
          ...first,
          cards: { ...first.cards, completedTricks: [{ cards, winnerSeat: 0 }] },
        } as PlayerGameProjection
      }
    />,
  );
  for (let n = 0; n < 6 && view.container.querySelectorAll("[data-trick-seat]").length < 4; n++) {
    tick(400);
    tick(16);
  }
  tick(201);
  const surfaces = () => view.container.querySelectorAll<HTMLElement>("[data-trick-seat]");
  expect(surfaces()).toHaveLength(4);
  tick(16);
  act(() =>
    surfaces().forEach((node) => {
      const event = new Event("transitionend", { bubbles: true });
      Object.defineProperty(event, "propertyName", { value: "transform" });
      fireEvent(node, event);
    }),
  );
  expect(
    view.container
      .querySelector("[data-trick-presentation-id]")
      ?.getAttribute("data-trick-departing-stage"),
  ).toBe("holding");
  tick(180);
  const poses = [...surfaces()].map((node) => node.style.transform);
  expect(view.container.querySelector('[data-trick-departing-stage="stacking"]')).not.toBeNull();
  tick(200);
  expect([...surfaces()].map((node) => node.style.transform)).toEqual(poses);
  expect(view.container.querySelector('[data-trick-departing-stage="collecting"]')).not.toBeNull();
  tick(241);
  expect(collected).toHaveBeenCalledOnce();
  expect(surfaces()).toHaveLength(0);
});

it("reduced hand reveal fades in its final lane instead of traversing the screen", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const view = render(
    <LocalHandRow
      cards={[card]}
      visible
      revealing
      legalCardIds={[]}
      blocked
      pendingCardId={null}
      authorityKey="g"
      geometry={geometry}
      onCommit={vi.fn()}
    />,
  );
  const surface = view.container.querySelector<HTMLElement>("[data-hand-entrance]")!;
  expect(surface.style.transform).not.toContain("100%");
  expect(surface.style.opacity).toBe("0");
  tick(32);
  expect(surface.style.opacity).toBe("1");
  expect(surface.dataset["handEntrance"]).toBe("settled");
});

it("preference changes are observed and listeners are released", () => {
  let listener = () => {};
  const remove = vi.fn();
  const media = {
    matches: false,
    addEventListener: (_: string, fn: () => void) => {
      listener = fn;
    },
    removeEventListener: remove,
  };
  vi.stubGlobal("matchMedia", () => media);
  function Indicator() {
    return <span>{String(useReducedMotion())}</span>;
  }
  const view = render(<Indicator />);
  expect(view.container.textContent).toBe("false");
  act(() => {
    media.matches = true;
    listener();
  });
  expect(view.container.textContent).toBe("true");
  view.unmount();
  expect(remove).toHaveBeenCalledOnce();
});

it("centralization preserves approved normal pacing and deal barrier duration", () => {
  expect([
    LOCAL_FLIGHT_MS,
    NORMAL_TRICK_SETTLE_MS,
    NORMAL_TRICK_INTER_PLAY_BEAT_MS,
    NORMAL_TRICK_HOLD_MS,
    NORMAL_TRICK_COLLECT_MS,
  ]).toEqual([300, 340, 160, 550, 380]);
  expect(dealPresentationTiming(true)).toEqual(dealPresentationTiming(false));
});

it("Strict Mode still completes one deal exactly once", () => {
  const complete = vi.fn();
  render(
    <StrictMode>
      <DealPresentation
        projection={projection("strict")}
        geometry={geometry}
        onPresentationComplete={complete}
      />
    </StrictMode>,
  );
  tick(1500);
  tick(1300);
  tick(5000);
  expect(complete).toHaveBeenCalledOnce();
});

it("reduced trump crossfade completes the original flip/placement stages once", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const placed = vi.fn();
  const view = render(
    <TrumpDeckMotion card={card} source={{ x: 40, y: 30 }} rotation={90} onPlaced={placed} />,
  );
  tick(16);
  expect(view.container.querySelector<HTMLElement>("[data-trump-flip]")!.style.transform).toBe(
    "none",
  );
  tick(520);
  expect(view.container.querySelector('[data-trump-deck-motion="moving"]')).not.toBeNull();
  expect(placed).not.toHaveBeenCalled();
  tick(16);
  tick(620);
  expect(placed).toHaveBeenCalledOnce();
  tick(2000);
  expect(placed).toHaveBeenCalledOnce();
});
