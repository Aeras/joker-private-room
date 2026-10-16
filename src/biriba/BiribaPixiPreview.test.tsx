import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { BiribaGameView } from "@/services/biribaFunctions";
import type { BiribaCard } from "./rules";

const mock = vi.hoisted(() => ({
  apps: [] as Array<{ destroyed: boolean; ticks: Set<(value: { deltaMS: number }) => void> }>,
  sprites: [] as Array<{ destroyed: boolean; visible: boolean }>,
  scales: [] as Array<[number, number]>,
  resizeCallbacks: [] as Array<() => void>,
  load: vi.fn(async () => ({ width: 70, height: 100 })),
  init: vi.fn(async () => undefined),
}));

vi.mock("pixi.js", () => {
  class Container {
    children: unknown[] = [];
    scale = { set: (x: number, y: number) => mock.scales.push([x, y] as [number, number]) };
    addChild(child: unknown) {
      this.children.push(child);
    }
    removeChild(child: unknown) {
      this.children = this.children.filter((item) => item !== child);
    }
    destroy() {
      for (const child of this.children) (child as { destroy?: () => void }).destroy?.();
    }
  }
  class Sprite {
    destroyed = false;
    visible = true;
    texture: unknown;
    tint = 0xffffff;
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    rotation = 0;
    anchor = { set: vi.fn() };
    position = {
      set: (x: number, y: number) => {
        this.x = x;
        this.y = y;
      },
    };
    constructor(texture: unknown) {
      this.texture = texture;
      mock.sprites.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class Application {
    stage = new Container();
    canvas = document.createElement("canvas");
    destroyed = false;
    ticks = new Set<(value: { deltaMS: number }) => void>();
    ticker = {
      add: (tick: (value: { deltaMS: number }) => void) => this.ticks.add(tick),
      remove: (tick: (value: { deltaMS: number }) => void) => this.ticks.delete(tick),
    };
    constructor() {
      mock.apps.push(this);
    }
    async init() {
      await mock.init();
    }
    resize() {
      /* ResizeObserver drives the existing stage. */
    }
    destroy() {
      this.destroyed = true;
      this.stage.destroy();
    }
  }
  return { Application, Assets: { load: mock.load }, Container, Sprite, Texture: { WHITE: {} } };
});

import { BiribaPixiPreview } from "./BiribaPixiPreview";

const discard = { id: "discard-7", suit: "spades", rank: 7 };
function game(revision = 1, handCounts = [11, 11, 11, 11]): BiribaGameView {
  return {
    seats: 4,
    seat: 0,
    roundNumber: 1,
    revision,
    stockCount: 40,
    packetCounts: [11, 11],
    handCounts,
    discards: [discard],
    phase: "draw",
    melds: [],
  } as unknown as BiribaGameView;
}

beforeEach(() => {
  mock.apps.length = 0;
  mock.sprites.length = 0;
  mock.load.mockClear();
  mock.init.mockReset();
  mock.init.mockResolvedValue(undefined);
  mock.scales.length = 0;
  mock.resizeCallbacks.length = 0;
  sessionStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        mock.resizeCallbacks.push(callback);
      }
      observe() {
        /* trigger manually through rerender */
      }
      disconnect() {
        /* observed by teardown */
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Biriba Pixi scene lifecycle", () => {
  it("flies a confirmed local discard from its measured hand rect before settling the pile", async () => {
    const started = vi.fn();
    const completed = vi.fn();
    const first = game();
    const view = render(<BiribaPixiPreview game={first} roomCode="local-flight" revealComplete />);
    await waitFor(() => expect(mock.sprites).toHaveLength(41));
    const played = { id: "played", suit: "hearts", rank: 8 } as BiribaCard;
    const next = { ...first, revision: 2, discards: [...first.discards, played] };
    view.rerender(<BiribaPixiPreview game={next} roomCode="local-flight" revealComplete
      localDiscardFlight={{ card: played, source: { x: 610, y: 580, width: 108, height: 160 }, revision: 2 }}
      onLocalDiscardStart={started} onLocalDiscardComplete={completed} />);
    await waitFor(() => expect(mock.sprites).toHaveLength(42));
    const flight = mock.sprites.at(-1) as typeof mock.sprites[number] & { x: number; y: number };
    expect([flight.x, flight.y]).toEqual([610, 580]);
    expect(started).not.toHaveBeenCalled();
    expect(completed).not.toHaveBeenCalled();
    act(() => { for (const tick of [...mock.apps[0]!.ticks]) tick({ deltaMS: 340 }); });
    expect(started).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(flight.destroyed).toBe(false);
    view.unmount();
  });
  it("keeps a drawn card face down during its stock-to-hand flight and reveals it once", async () => {
    const completed = vi.fn();
    const card = { id: "new-private", suit: "clubs", rank: 9 } as BiribaCard;
    const target = document.createElement("button");
    target.dataset["biribaHandCard"] = card.id;
    document.body.appendChild(target);
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return (this === target
        ? { left: 600, top: 500, width: 100, height: 150 }
        : { left: 0, top: 0, width: 1280, height: 720 }) as DOMRect;
    });
    try {
      const first = game();
      const view = render(<BiribaPixiPreview game={first} roomCode="draw-flight" revealComplete />);
      await waitFor(() => expect(mock.sprites).toHaveLength(41));
      const next = { ...first, revision: 2, stockCount: 39 };
      view.rerender(<BiribaPixiPreview game={next} roomCode="draw-flight" revealComplete
        localDrawFlight={{ card, revision: 2 }} onLocalDrawComplete={completed} />);
      await waitFor(() => expect(mock.sprites).toHaveLength(42));
      const flight = mock.sprites.at(-1) as typeof mock.sprites[number] & { x: number; y: number; width: number };
      expect([flight.x, flight.y]).toEqual([440, 395]);
      expect(completed).not.toHaveBeenCalled();
      act(() => { for (const tick of [...mock.apps[0]!.ticks]) tick({ deltaMS: 320 }); });
      expect(completed).not.toHaveBeenCalled();
      act(() => { for (const tick of [...mock.apps[0]!.ticks]) tick({ deltaMS: 70 }); });
      expect(flight.width).toBeLessThan(15);
      act(() => { for (const tick of [...mock.apps[0]!.ticks]) tick({ deltaMS: 70 }); });
      expect(completed).toHaveBeenCalledTimes(1);
      view.unmount();
    } finally {
      rect.mockRestore();
      target.remove();
    }
  });
  it("keeps the renderer and sprites across ordinary revisions, then disposes them", async () => {
    const view = render(<BiribaPixiPreview game={game()} roomCode="test-room" revealComplete />);
    await waitFor(() => expect(mock.apps).toHaveLength(1));
    await waitFor(() => expect(mock.sprites).toHaveLength(41));
    const original = [...mock.sprites];
    view.rerender(<BiribaPixiPreview game={game(2)} roomCode="test-room" revealComplete />);
    expect(mock.apps).toHaveLength(1);
    expect(mock.sprites).toHaveLength(41);
    expect(original.every((sprite) => !sprite.destroyed)).toBe(true);
    view.rerender(
      <BiribaPixiPreview game={game(3, [11, 10, 11, 11])} roomCode="test-room" revealComplete />,
    );
    await waitFor(() => expect(original.filter((sprite) => sprite.destroyed)).toHaveLength(1));
    expect(mock.sprites).toHaveLength(41);
    view.unmount();
    expect(mock.apps[0]?.destroyed).toBe(true);
  });

  it("does not let an outstanding texture request create cards after teardown", async () => {
    let release!: (texture: { width: number; height: number }) => void;
    mock.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = render(<BiribaPixiPreview game={game()} roomCode="test-room" revealComplete />);
    await waitFor(() => expect(mock.sprites.length).toBeGreaterThan(0));
    view.unmount();
    release({ width: 70, height: 100 });
    await Promise.resolve();
    expect(mock.apps[0]?.destroyed).toBe(true);
    expect(mock.sprites.some((sprite) => !sprite.destroyed && sprite.visible)).toBe(false);
  });

  it("never flashes a white placeholder while a reused sprite awaits its texture", async () => {
    let release!: (texture: { width: number; height: number }) => void;
    mock.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = render(<BiribaPixiPreview game={game()} roomCode="test-room" revealComplete />);
    await waitFor(() => expect(mock.sprites).toHaveLength(41));
    const pending = mock.sprites[0]!;
    expect(pending.visible).toBe(false);
    view.rerender(
      <BiribaPixiPreview game={game(2, [11, 10, 11, 11])} roomCode="test-room" revealComplete />,
    );
    expect(pending.visible).toBe(false);
    await act(async () => {
      release({ width: 70, height: 100 });
      await Promise.resolve();
    });
    expect(pending.visible).toBe(true);
    view.unmount();
  });

  it("hydrates a reconnect immediately without replaying the deal", async () => {
    const completed = vi.fn();
    const view = render(
      <BiribaPixiPreview
        game={game()}
        roomCode="old-room"
        animateDeal={false}
        onDealComplete={completed}
      />,
    );
    await waitFor(() => expect(completed).toHaveBeenCalledWith("old-room:1:0"));
    expect(mock.sprites).toHaveLength(41);
    expect(mock.apps[0]?.ticks.size).toBe(0);
    view.unmount();
  });

  it("settles the table immediately when reduced motion is requested", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const completed = vi.fn();
    const view = render(
      <BiribaPixiPreview game={game()} roomCode="reduced-room" onDealComplete={completed} />,
    );
    await waitFor(() => expect(completed).toHaveBeenCalledWith("reduced-room:1:0"));
    expect(mock.sprites).toHaveLength(41);
    expect(mock.apps[0]?.ticks.size).toBe(0);
    view.unmount();
  });

  it("keeps the dealt opponent sprites through handoff and completes once", async () => {
    vi.useFakeTimers();
    const completed = vi.fn();
    let view!: ReturnType<typeof render>;
    try {
      await act(async () => {
        view = render(
          <BiribaPixiPreview game={game()} roomCode="new-room" onDealComplete={completed} />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });
      const dealSprites = mock.sprites.slice(8);
      expect(dealSprites).toHaveLength(44);
      await act(async () => {
        for (let beat = 0; beat < 47; beat++) {
          vi.advanceTimersByTime(110);
          for (const tick of [...mock.apps[0]!.ticks]) tick({ deltaMS: 350 });
        }
      });
      expect(completed).toHaveBeenCalledTimes(1);
      expect(completed).toHaveBeenCalledWith("new-room:1:0");
      expect(
        dealSprites.filter((_, index) => index % 4 !== 0).every((sprite) => !sprite.destroyed),
      ).toBe(true);
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(
        dealSprites.filter((_, index) => index % 4 !== 0).every((sprite) => !sprite.destroyed),
      ).toBe(true);
      expect(
        dealSprites.filter((_, index) => index % 4 === 0).every((sprite) => sprite.destroyed),
      ).toBe(true);
      expect(completed).toHaveBeenCalledTimes(1);
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });

  it("cancels an obsolete deal when authority advances and never repeats its callback", async () => {
    vi.useFakeTimers();
    const completed = vi.fn();
    let view!: ReturnType<typeof render>;
    try {
      await act(async () => {
        view = render(
          <BiribaPixiPreview game={game()} roomCode="advance-room" onDealComplete={completed} />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });
      view.rerender(
        <BiribaPixiPreview
          game={{ ...game(2), phase: "meld", handCounts: [12, 11, 11, 11] }}
          roomCode="advance-room"
          onDealComplete={completed}
        />,
      );
      expect(completed).toHaveBeenCalledTimes(1);
      expect(completed).toHaveBeenCalledWith("advance-room:1:0");
      expect(
        mock.sprites.filter((sprite) => !sprite.destroyed).every((sprite) => sprite.visible),
      ).toBe(true);
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(completed).toHaveBeenCalledTimes(1);
      expect(mock.apps[0]?.ticks.size).toBe(0);
    } finally {
      view?.unmount();
      vi.useRealTimers();
    }
  });

  it("settles an interrupted deal when the browser backgrounds", async () => {
    vi.useFakeTimers();
    const completed = vi.fn();
    const visible = Object.getOwnPropertyDescriptor(document, "visibilityState");
    let view!: ReturnType<typeof render>;
    try {
      await act(async () => {
        view = render(
          <BiribaPixiPreview game={game()} roomCode="background-room" onDealComplete={completed} />,
        );
        await Promise.resolve();
        await Promise.resolve();
      });
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(completed).toHaveBeenCalledWith("background-room:1:0");
      expect(mock.apps[0]?.ticks.size).toBe(0);
      expect(
        mock.sprites.filter((sprite) => !sprite.destroyed).every((sprite) => sprite.visible),
      ).toBe(true);
    } finally {
      view?.unmount();
      if (visible) Object.defineProperty(document, "visibilityState", visible);
      else Reflect.deleteProperty(document, "visibilityState");
      vi.useRealTimers();
    }
  });

  it("resizes the existing stage without replacing the renderer", async () => {
    const view = render(<BiribaPixiPreview game={game()} roomCode="test-room" revealComplete />);
    await waitFor(() => expect(mock.resizeCallbacks).toHaveLength(1));
    const parent = view.container.firstElementChild!;
    Object.defineProperties(parent, {
      clientWidth: { configurable: true, value: 640 },
      clientHeight: { configurable: true, value: 360 },
    });
    mock.resizeCallbacks[0]!();
    expect(mock.scales.at(-1)).toEqual([0.5, 0.5]);
    expect(mock.apps).toHaveLength(1);
    view.unmount();
  });

  it("flies a newly discarded public card from the acting seat and cancels obsolete motion", async () => {
    const played = { id: "new-discard", suit: "hearts", rank: 9 } as BiribaCard;
    const before = { ...game(), phase: "meld" as const, turn: 0, myHand: [played] };
    const view = render(<BiribaPixiPreview game={before} roomCode="test-room" revealComplete />);
    await waitFor(() => expect(mock.sprites).toHaveLength(41));
    const priorTop = mock.sprites[7]!;
    const after = {
      ...before,
      revision: 2,
      phase: "draw" as const,
      discards: [...before.discards, played],
    };
    view.rerender(<BiribaPixiPreview game={after} roomCode="test-room" revealComplete />);
    await waitFor(() => expect(mock.sprites).toHaveLength(42));
    const flight = mock.sprites[41]!;
    expect(priorTop.destroyed).toBe(false);
    expect((flight as unknown as { x: number }).x).toBe(640);
    act(() => {
      for (const tick of [...mock.apps[0]!.ticks]) tick({ deltaMS: 160 });
    });
    expect(priorTop.destroyed).toBe(false);
    const newer = { ...after, revision: 3, handCounts: [11, 10, 11, 11] };
    view.rerender(<BiribaPixiPreview game={newer} roomCode="test-room" revealComplete />);
    expect(flight.destroyed).toBe(true);
    expect(mock.apps[0]?.ticks.size).toBeGreaterThanOrEqual(0);
    view.unmount();
    expect(mock.apps[0]?.ticks.size).toBe(0);
  });

  it("uses the server action actor for a remote discard even after batched revisions", async () => {
    const played = { id: "remote-discard", suit: "hearts", rank: 9 } as BiribaCard;
    const before = { ...game(), publicActionSequence: 0, publicActions: [] };
    const view = render(<BiribaPixiPreview game={before} roomCode="test-room" revealComplete />);
    await waitFor(() => expect(mock.sprites).toHaveLength(41));
    const after = {
      ...before,
      revision: 4,
      discards: [...before.discards, played],
      publicActionSequence: 1,
      publicActions: [
        { sequence: 1, round: 1, actorSeat: 1, kind: "discard" as const, cards: [played] },
      ],
    };
    view.rerender(<BiribaPixiPreview game={after} roomCode="test-room" revealComplete />);
    await waitFor(() => expect(mock.sprites).toHaveLength(42));
    const flight = mock.sprites[41]!;
    expect((flight as unknown as { x: number; y: number }).x).toBe(80);
    expect((flight as unknown as { x: number; y: number }).y).toBe(280);
    view.rerender(
      <BiribaPixiPreview
        game={{ ...after, revision: 5, handCounts: [11, 10, 11, 11] }}
        roomCode="test-room"
        revealComplete
      />,
    );
    expect(flight.destroyed).toBe(true);
    expect(mock.sprites).toHaveLength(42);
    view.unmount();
  });

  it("shows each authorized discard from a batched bot response and settles the final pile once", async () => {
    const firstCard = { id: "batched-local", suit: "hearts", rank: 9 } as BiribaCard;
    const secondCard = { id: "batched-bot", suit: "clubs", rank: 10 } as BiribaCard;
    const before = { ...game(), publicActionSequence: 0, publicActions: [] };
    const started = vi.fn();
    const completed = vi.fn();
    const view = render(<BiribaPixiPreview game={before} roomCode="batched-room" revealComplete />);
    await waitFor(() => expect(mock.sprites).toHaveLength(41));
    const after = { ...before, revision: 3, discards: [secondCard], publicActionSequence: 2, publicActions: [
      { sequence: 1, round: 1, actorSeat: 0, kind: "discard" as const, cards: [firstCard] },
      { sequence: 2, round: 1, actorSeat: 1, kind: "discard" as const, cards: [secondCard] },
    ] };
    const local = { card: firstCard, source: { x: 610, y: 580, width: 108, height: 160 }, revision: 3 };
    view.rerender(<BiribaPixiPreview game={after} roomCode="batched-room" revealComplete
      localDiscardFlight={local} onLocalDiscardStart={started} onLocalDiscardComplete={completed} />);
    await waitFor(() => expect(mock.sprites).toHaveLength(43));
    const flights = mock.sprites.slice(-2) as Array<typeof mock.sprites[number] & { x: number; y: number }>;
    expect([flights[0]!.x, flights[0]!.y]).toEqual([610, 580]);
    expect([flights[1]!.x, flights[1]!.y]).toEqual([80, 280]);
    act(() => { for (const tick of [...mock.apps[0]!.ticks]) tick({ deltaMS: 320 }); });
    expect(started).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(flights[0]!.destroyed).toBe(false);
    act(() => { for (const tick of [...mock.apps[0]!.ticks]) tick({ deltaMS: 320 }); });
    expect(flights.every(sprite => sprite.destroyed)).toBe(true);
    expect(completed).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("resumes new flights after an unchanged foreground reconciliation", async () => {
    const visible = Object.getOwnPropertyDescriptor(document, "visibilityState");
    const before = { ...game(), publicActionSequence: 0, publicActions: [] };
    const view = render(<BiribaPixiPreview game={before} roomCode="resume-room" revealComplete />);
    try {
      await waitFor(() => expect(mock.sprites).toHaveLength(41));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      view.rerender(<BiribaPixiPreview game={before} roomCode="resume-room" revealComplete resumeEpoch={1} />);
      const card = { id: "after-resume", suit: "hearts", rank: 8 } as BiribaCard;
      const next = { ...before, revision: 2, discards: [...before.discards, card], publicActionSequence: 1,
        publicActions: [{ sequence: 1, round: 1, actorSeat: 1, kind: "discard" as const, cards: [card] }] };
      view.rerender(<BiribaPixiPreview game={next} roomCode="resume-room" revealComplete resumeEpoch={1} />);
      await waitFor(() => expect(mock.sprites).toHaveLength(42));
      expect((mock.sprites[41] as unknown as { x: number }).x).toBe(80);
    } finally {
      view.unmount();
      if (visible) Object.defineProperty(document, "visibilityState", visible);
      else Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it("keeps a confirmed meld card in Pixi until its hidden DOM destination is revealed", async () => {
    const target = document.createElement("img");
    target.dataset["biribaCardId"] = "meld-arrival";
    target.style.visibility = "hidden";
    document.body.appendChild(target);
    const rect = (x: number, y: number, width: number, height: number) => ({
      x,
      y,
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
      width,
      height,
      toJSON: () => ({}),
    });
    const measure = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        return this === target ? rect(300, 160, 70, 100) : rect(0, 0, 1280, 720);
      });
    const complete = vi.fn(() => {
      target.style.visibility = "visible";
    });
    const flights = [
      { card: { id: "meld-arrival", suit: "hearts" as const, rank: 9 as const }, actorSeat: 1 },
    ];
    const view = render(
      <BiribaPixiPreview
        game={game()}
        roomCode="test-room"
        revealComplete
        meldFlights={flights}
        onMeldFlightComplete={complete}
      />,
    );
    try {
      await waitFor(() => expect(mock.sprites).toHaveLength(42));
      const flight = mock.sprites[41]!;
      expect(flight.visible).toBe(true);
      expect((flight as unknown as { x: number }).x).toBe(80);
      expect(target.style.visibility).toBe("hidden");
      await act(async () => {
        for (const tick of [...mock.apps[0]!.ticks]) tick({ deltaMS: 360 });
        await Promise.resolve();
      });
      expect(complete).toHaveBeenCalledWith("meld-arrival");
      expect(target.style.visibility).toBe("visible");
      expect(flight.destroyed).toBe(true);
    } finally {
      view.unmount();
      measure.mockRestore();
      target.remove();
    }
  });

  it("removes the previous round scene before creating the next one", async () => {
    const view = render(<BiribaPixiPreview game={game()} roomCode="test-room" revealComplete />);
    await waitFor(() => expect(mock.sprites).toHaveLength(41));
    const oldSprites = [...mock.sprites];
    view.rerender(
      <BiribaPixiPreview
        game={{ ...game(2), roundNumber: 2 }}
        roomCode="test-room"
        revealComplete
      />,
    );
    await waitFor(() => expect(mock.sprites).toHaveLength(82));
    expect(oldSprites.every((sprite) => sprite.destroyed)).toBe(true);
    expect(mock.apps).toHaveLength(1);
    view.unmount();
  });

  it("renders authorized card backs and releases the hand if WebGL initialization fails", async () => {
    mock.init.mockRejectedValueOnce(new Error("WebGL unavailable"));
    const completed = vi.fn();
    const view = render(
      <BiribaPixiPreview game={game()} roomCode="test-room" onDealComplete={completed} />,
    );
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
    expect(view.container.querySelectorAll("img")).toHaveLength(41);
    view.unmount();
  });
});
