import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrickPresentation } from "@/components/table/TrickPresentation";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import type { PlayedCard } from "@/domain/engine";
import type { RulesetId } from "@/domain/rulesets";
const flags = vi.hoisted(() => ({ available: true, fail: false }));
vi.mock("@/components/table/canvas/assetCache", () => ({
  canvasFlightAvailable: () => flags.available,
  canvasCardAssets: { peek: () => (flags.fail ? null : {}), warm: async () => ({}) },
}));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({
  useCriticalCardArtwork: () => true,
}));
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
const geometry = {
  ...computeTableGeometry({
    feltRect: { left: 0, top: 0, right: 844, bottom: 390, width: 844, height: 390 },
    viewportWidth: 844,
    viewportHeight: 390,
  }),
  epoch: 1,
};
const cards: PlayedCard[] = [0, 1, 2, 3].map((seatIndex) => ({
  seatIndex: seatIndex as 0 | 1 | 2 | 3,
  card: { kind: "standard", id: `standard-${seatIndex}`, rank: "A", suit: "spades" },
}));
const flush = async (ms = 0) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
};
beforeEach(() => {
  flags.available = true;
  flags.fail = false;
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
function projection(ruleset: RulesetId = "popular") {
  const p = projectGameForSeat(reconciliationFixture(ruleset), 0);
  p.cards.currentTrick = [];
  p.cards.completedTricks = [];
  p.cards.presentationTail = [];
  return p;
}
function props() {
  return {
    geometry,
    localPlayPresentation: null,
    onLocalFlightSettled: vi.fn(),
    onCollectionComplete: vi.fn(),
    onScorePresentationActiveChange: vi.fn(),
  };
}
it.each(["popular", "classic", "minus"] as const)(
  "serializes batched public cards and collects once in %s",
  async (ruleset) => {
    const p = projection(ruleset),
      callbacks = props(),
      view = render(<TrickPresentation projection={p} {...callbacks} />);
    await flush();
    view.rerender(
      <TrickPresentation
        projection={{
          ...p,
          stateVersion: p.stateVersion + 1,
          cards: { ...p.cards, currentTrick: [], completedTricks: [{ cards, winnerSeat: 2 }] },
        }}
        {...callbacks}
      />,
    );
    await flush();
    const lengths: number[] = [];
    for (let i = 0; i < 50; i++) {
      await flush(60);
      const el = view.container.querySelector<HTMLElement>("[data-canvas-trick-cards]");
      if (el) lengths.push(el.dataset["canvasTrickCards"]!.split(",").length);
      expect(view.container.querySelectorAll("[data-trick-seat]")).toHaveLength(0);
    }
    expect(new Set(lengths)).toEqual(new Set([1, 2, 3, 4]));
    expect(callbacks.onCollectionComplete).toHaveBeenCalledOnce();
    expect(view.container.querySelector("canvas")).toBeNull();
    expect(callbacks.onScorePresentationActiveChange).toHaveBeenLastCalledWith(false);
  },
);
it("hydrates settled cards without replay and keeps historical completed tricks absent", async () => {
  const p = projection(),
    callbacks = props();
  p.cards.currentTrick = cards.slice(0, 2);
  p.cards.completedTricks = [{ cards, winnerSeat: 0 }];
  const view = render(<TrickPresentation projection={p} {...callbacks} />);
  await flush();
  await flush(1200);
  expect(view.container.querySelector("canvas")?.getAttribute("data-canvas-trick-cards")).toBe(
    "0:standard-0,1:standard-1",
  );
  expect(callbacks.onCollectionComplete).not.toHaveBeenCalled();
});
it("waits for bitmap preparation before choosing a hydrated scene renderer", async () => {
  const p = projection();
  p.cards.currentTrick = cards.slice(0, 2);
  flags.fail = true;
  const view = render(<TrickPresentation projection={p} {...props()} />);
  flags.fail = false;
  await flush();
  expect(view.container.querySelector("[data-renderer='canvas-trick']")).not.toBeNull();
  expect(view.container.querySelectorAll("[data-trick-seat]")).toHaveLength(0);
});
it("retains cold DOM fallback and hydrates a resolved FROM_BELOW Joker on Canvas", async () => {
  const p = projection();
  flags.fail = true;
  p.cards.currentTrick = cards.slice(0, 2);
  const view = render(<TrickPresentation projection={p} {...props()} />);
  await flush();
  expect(view.container.querySelector("canvas")).toBeNull();
  expect(view.container.querySelectorAll("[data-trick-seat]")).toHaveLength(2);
  view.unmount();
  flags.fail = false;
  p.cards.currentTrick = [
    {
      seatIndex: 1,
      card: { kind: "joker", id: "joker-test" },
      joker: { context: "OPEN_TRICK", mode: "FROM_BELOW" },
    },
  ];
  const joker = render(<TrickPresentation projection={p} {...props()} />);
  await flush();
  expect(joker.container.querySelector("canvas")).not.toBeNull();
  expect(joker.container.querySelectorAll("[data-trick-seat]")).toHaveLength(0);
});

it.each(["popular", "classic", "minus"] as const)(
  "serializes a batched two-Joker mixed trick through Canvas collection in %s",
  async (ruleset) => {
    const p = projection(ruleset),
      callbacks = props(),
      view = render(<TrickPresentation projection={p} {...callbacks} />);
    await flush();
    const mixed: PlayedCard[] = [
      {
        seatIndex: 0,
        card: { kind: "joker", id: "joker-1" },
        joker: { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "spades" },
      },
      cards[1]!,
      {
        seatIndex: 2,
        card: { kind: "joker", id: "joker-2" },
        joker: { context: "OPEN_TRICK", mode: "FROM_BELOW" },
      },
      cards[3]!,
    ];
    view.rerender(
      <TrickPresentation
        projection={{
          ...p,
          stateVersion: p.stateVersion + 1,
          cards: {
            ...p.cards,
            currentTrick: [],
            completedTricks: [{ cards: mixed, winnerSeat: 0 }],
          },
        }}
        {...callbacks}
      />,
    );
    await flush();
    const lengths = new Set<number>();
    for (let i = 0; i < 65; i++) {
      await flush(60);
      const el = view.container.querySelector<HTMLElement>("[data-canvas-trick-cards]");
      if (el) lengths.add(el.dataset["canvasTrickCards"]!.split(",").length);
      expect(view.container.querySelectorAll("[data-trick-seat]")).toHaveLength(0);
    }
    expect(lengths).toEqual(new Set([1, 2, 3, 4]));
    expect(callbacks.onCollectionComplete).toHaveBeenCalledOnce();
  },
);
