import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { CanvasPresentation } from "@/components/table/canvas/CanvasPresentation";
import { dealSprite } from "@/components/table/canvas/dealSceneMotion";
import { handTrackPose, updateHandTrack } from "@/components/table/canvas/handSceneMotion";
import { LocalHandRow } from "@/components/table/LocalHandRow";
import { DealPresentation } from "@/components/table/DealPresentation";
import { DealerSelectionPresentation } from "@/components/table/DealerSelectionPresentation";
import { assets } from "@/assets/registry";
import { CanvasTrumpMotion } from "@/components/table/canvas/CanvasTrumpMotion";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
const mocks = vi.hoisted(() => ({ warm: vi.fn(async (_url: string) => ({})), ready: true }));
vi.mock("@/components/table/canvas/assetCache", () => ({
  canvasFlightAvailable: () => true,
  canvasCardAssets: { warm: mocks.warm, peek: () => (mocks.ready ? {} : null) },
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
const pose = { x: 300, y: 340, width: 65, height: 91, rotation: 0, flip: 180, opacity: 1 };
async function tick(ms = 0) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}
beforeEach(() => {
  mocks.ready = true;
  mocks.warm.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  const ctx = Object.fromEntries(
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
    ctx as unknown as ReturnType<HTMLCanvasElement["getContext"]>,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 300,
    top: 300,
    right: 365,
    bottom: 391,
    width: 65,
    height: 91,
    x: 300,
    y: 300,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
});
it.each([0, 1, 2, 3] as const)(
  "keeps measured deal endpoints and seat mapping for viewer %i",
  (viewer) => {
    for (let seat = 0; seat < 4; seat++) {
      const sprite = dealSprite(
        { id: "back", seat, stackIndex: 0 },
        geometry,
        viewer,
        2,
        65,
        "deal",
      );
      const pos = (seat - viewer + 4) % 4;
      expect(sprite.sample(1).x).toBeCloseTo(geometry.dealTargets[pos as 0 | 1 | 2 | 3].x);
      expect(sprite.sample(1).opacity).toBe(1);
      const exit = dealSprite(
        { id: "back", seat, stackIndex: 0 },
        geometry,
        viewer,
        2,
        65,
        "deal",
        true,
      );
      expect(exit.duration).toBe(950);
      expect(exit.sample(600 / 950).opacity).toBe(1);
      expect(exit.sample(1).opacity).toBe(0);
    }
  },
);
it("preserves independent position and flip clocks during reveal, reflow and direct input", () => {
  const visual = { id: "own", pose, faceUp: false, dragging: false, index: 0 };
  let track = updateHandTrack(undefined, visual, 0, 600, 340);
  track = updateHandTrack(track, { ...visual, pose: { ...pose, y: 200 } }, 10, 600, 340);
  const before = handTrackPose(track, 140);
  track = updateHandTrack(
    track,
    { ...visual, pose: { ...pose, y: 200 }, faceUp: true },
    140,
    600,
    340,
  );
  expect(handTrackPose(track, 140).y).toBe(before.y);
  expect(track.position.at).toBe(10);
  expect(handTrackPose(track, 610).flip).toBe(0);
  expect(handTrackPose(track, 610).y).toBe(200);
  track = updateHandTrack(
    track,
    { ...visual, pose: { ...pose, x: 370 }, faceUp: true, dragging: true },
    700,
    250,
    340,
  );
  expect(handTrackPose(track, 700).x).toBe(370);
});
it("retains one shared scene, no idle RAF, and disposes motion on context loss", async () => {
  const failed = vi.fn(),
    done = vi.fn();
  const sprite = {
    id: "back",
    url: "back",
    layer: 0,
    phase: "flight",
    duration: 308,
    sample: () => pose,
    onComplete: done,
  };
  const view = render(<CanvasPresentation sprites={[sprite]} name="test" onFailure={failed} />);
  await tick(320);
  expect(done).toHaveBeenCalledOnce();
  fireEvent(view.container.querySelector("canvas")!, new Event("contextlost"));
  await tick(1000);
  expect(failed).toHaveBeenCalledOnce();
  expect(done).toHaveBeenCalledOnce();
});
it("direct pointer poses cancel reflow instead of being overwritten by its next frame", async () => {
  const done = vi.fn(),
    sprite = {
      id: "own",
      url: "face",
      layer: 0,
      phase: "reflow",
      duration: 250,
      sample: () => pose,
      onComplete: done,
    };
  const view = render(<CanvasPresentation sprites={[sprite]} name="hand" onFailure={vi.fn()} />);
  await tick(32);
  view.rerender(
    <CanvasPresentation
      sprites={[{ ...sprite, phase: "drag", duration: 0, sample: () => ({ ...pose, x: 420 }) }]}
      name="hand"
      onFailure={vi.fn()}
    />,
  );
  await tick(400);
  expect(done).not.toHaveBeenCalled();
});
it("supports the 36-card handoff without silently failing the former 32-motion budget", async () => {
  const failed = vi.fn(),
    done = vi.fn(),
    sprites = Array.from({ length: 36 }, (_, index) => ({
      id: "handoff-" + index,
      url: "back",
      layer: index,
      phase: "handoff",
      duration: 950,
      sample: () => pose,
      onComplete: done,
    }));
  render(<CanvasPresentation sprites={sprites} name="deal" onFailure={failed} />);
  await tick(960);
  expect(failed).not.toHaveBeenCalled();
  expect(done).toHaveBeenCalledTimes(36);
});
it("starts the trump flip at the exact preceding deck center and places it once", async () => {
  const done = vi.fn();
  const view = render(
    <CanvasTrumpMotion
      card={{ id: "public-trump", kind: "standard", suit: "hearts", rank: "A" }}
      source={{ x: 500, y: 200 }}
      rotation={180}
      onPlaced={done}
      onFailure={vi.fn()}
    />,
  );
  const context = vi.mocked(HTMLCanvasElement.prototype.getContext).mock.results.at(-1)!
    .value as CanvasRenderingContext2D;
  expect(
    vi.mocked(context.translate).mock.calls.some((call) => call[0] === 500 && call[1] === 200),
  ).toBe(true);
  await tick(416);
  await tick(520);
  expect(done).toHaveBeenCalledOnce();
  view.unmount();
  await tick(1000);
  expect(done).toHaveBeenCalledOnce();
});
it.each(["popular", "classic", "minus"] as const)(
  "runs the real %s deal without DOM duplicate cards and completes once",
  async (ruleset) => {
    const p = projectGameForSeat(reconciliationFixture(ruleset), 0);
    p.gameId = "canvas-deal-" + ruleset;
    p.progression.phase = "DEAL_PRESENTATION";
    p.progression.cardsPerPlayer = 1;
    p.cards.exposedTrumpCard = null;
    const done = vi.fn(),
      view = render(
        <DealPresentation projection={p} geometry={geometry} onPresentationComplete={done} />,
      );
    await tick();
    for (let i = 0; i < 40; i++) await tick(80);
    expect(done).toHaveBeenCalledOnce();
    expect(view.container.querySelector("[data-deal-traveling-card]")).toBeNull();
  },
);
it("never warms or paints a concealed own hand, even if malformed input includes faces", async () => {
  const card = {
    id: "own-A",
    kind: "standard" as const,
    suit: "hearts" as const,
    rank: "A" as const,
  };
  render(
    <LocalHandRow
      cards={[card]}
      visible={false}
      legalCardIds={[]}
      blocked
      pendingCardId={null}
      authorityKey="private:1"
      geometry={geometry}
      onCommit={vi.fn()}
    />,
  );
  await tick();
  expect(mocks.warm).not.toHaveBeenCalled();
  expect(document.querySelector('[data-canvas-presentation="hand"]')).toBeNull();
});
it("keeps DOM input and artwork together when the platform cannot prevent clipped-hand focus scrolling", async () => {
  vi.stubGlobal("CSS", { supports: () => false });
  const card = {
    id: "own-A",
    kind: "standard" as const,
    suit: "hearts" as const,
    rank: "A" as const,
  };
  const view = render(
    <LocalHandRow
      cards={[card]}
      visible
      legalCardIds={[card.id]}
      blocked={false}
      pendingCardId={null}
      authorityKey="unsupported:1"
      geometry={geometry}
      onCommit={vi.fn()}
    />,
  );
  await tick();
  expect(document.querySelector('[data-canvas-presentation="hand"]')).toBeNull();
  expect(view.container.querySelector<HTMLElement>("[data-hand-card]")!.style.visibility).not.toBe(
    "hidden",
  );
});
it("reproduces the public first-Ace dealer sequence, deduplicates it and never chooses a dealer", async () => {
  const p = projectGameForSeat(reconciliationFixture(), 0);
  p.gameId = "canvas-ace";
  const publicSelection = p.initialDealerSelection;
  if (publicSelection?.status !== "resolved") throw Error("fixture missing resolved selection");
  const active = vi.fn(),
    view = render(
      <DealerSelectionPresentation projection={p} geometry={geometry} onActiveChange={active} />,
    );
  await tick();
  for (let i = 0; i < 10; i++) await tick(100);
  expect(
    view.container.querySelector('[data-canvas-presentation="dealer-selection"]'),
  ).not.toBeNull();
  const permitted = new Set([
    assets.cardBack,
    ...publicSelection.revealedSelectionCards.map((card) => assets.cardFace(card)),
    publicSelection.openingCard ? assets.cardFace(publicSelection.openingCard) : undefined,
  ]);
  expect(mocks.warm.mock.calls.every((call) => permitted.has(call[0]))).toBe(true);
  for (let i = 0; i < 150; i++) await tick(100);
  expect(active).toHaveBeenLastCalledWith(false);
  view.rerender(
    <DealerSelectionPresentation
      projection={{ ...p }}
      geometry={geometry}
      onActiveChange={active}
    />,
  );
  await tick(500);
  expect(view.container.querySelector("canvas")).toBeNull();
});
it("keeps nine-card retained piles through choice, then deals the remaining 24 backs with separate acknowledgements", async () => {
  const p = projectGameForSeat(reconciliationFixture(), 0);
  p.gameId = "canvas-nine";
  p.progression.dealNumber = 9;
  p.progression.cardsPerPlayer = 9;
  p.progression.phase = "NINE_CARD_INITIAL_DEAL_ALL_SEATS";
  p.progression.firstDeclarerSeat = 0;
  p.trump = { status: "chooser_pending", chooserSeat: 0 };
  p.cards.exposedTrumpCard = null;
  p.cards.ownHandVisible = false;
  const done = vi.fn(),
    view = render(
      <DealPresentation projection={p} geometry={geometry} onPresentationComplete={done} />,
    );
  await tick();
  for (let i = 0; i < 65; i++) await tick(100);
  expect(done).toHaveBeenCalledWith("initial");
  const sameDealCanvas = view.container.querySelector("canvas");
  view.rerender(
    <DealPresentation
      projection={{ ...p, progression: { ...p.progression, phase: "NINE_CARD_TRUMP_CHOICE" } }}
      geometry={geometry}
      onPresentationComplete={done}
    />,
  );
  await tick();
  expect(view.container.querySelector("canvas")?.getAttribute("data-canvas-sprite-count")).toBe(
    "9",
  );
  expect(view.container.querySelector("canvas")).toBe(sameDealCanvas);
  view.rerender(
    <DealPresentation
      projection={{
        ...p,
        progression: { ...p.progression, phase: "NINE_CARD_REMAINING_DEAL" },
        trump: { status: "resolved", suit: "hearts" },
      }}
      geometry={geometry}
      onPresentationComplete={done}
    />,
  );
  await tick();
  for (let i = 0; i < 180; i++) await tick(100);
  expect(done.mock.calls.map((call) => call[0])).toEqual(["initial", "remaining"]);
});
it("keeps intentional invisible DOM input targets for legal cards and Joker; invalid keys do not submit", async () => {
  const cards = [
    { id: "own-A", kind: "standard" as const, suit: "hearts" as const, rank: "A" as const },
    { id: "own-joker", kind: "joker" as const },
  ];
  const commit = vi.fn(async () => {});
  const view = render(
    <LocalHandRow
      cards={cards}
      visible
      legalCardIds={[cards[1]!.id]}
      blocked={false}
      pendingCardId={null}
      authorityKey="public:1"
      geometry={geometry}
      onCommit={commit}
    />,
  );
  await tick();
  expect(document.querySelector('[data-canvas-presentation="hand"]')).not.toBeNull();
  const inputs = view.getAllByRole("button");
  fireEvent.keyDown(inputs[0]!, { key: "Enter" });
  expect(commit).not.toHaveBeenCalled();
  fireEvent.keyDown(inputs[1]!, { key: "Enter" });
  expect(commit).toHaveBeenCalledOnce();
  expect(view.container.querySelector<HTMLElement>("[data-hand-card]")!.style.visibility).toBe(
    "hidden",
  );
});
