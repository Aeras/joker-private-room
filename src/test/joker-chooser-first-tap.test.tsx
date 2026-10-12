import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameTable } from "@/components/table/GameTable";
import { JokerChoicePicker } from "@/components/table/JokerChoicePicker";
import { TAP_CLICK_SUPPRESS_MS } from "@/components/table/tapActivation";
import { projectGameForSeat } from "@/domain/projection";
import type { Room } from "@/domain/players";
import { reconciliationFixture } from "./fixtures/reconciliationGame";

vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({ useCriticalCardArtwork: () => true }));
vi.mock("@/components/table/DealerSelectionPresentation", () => ({ DealerSelectionPresentation: () => null }));
vi.mock("@/components/table/DealPresentation", () => ({ DealPresentation: () => null }));
vi.mock("@/components/table/Scoreboard", () => ({ Scoreboard: () => null }));
vi.mock("@/components/table/SoundToggle", () => ({ SoundToggle: () => null }));
vi.mock("@/components/table/TableUtilityMenu", () => ({ TableUtilityMenu: () => null }));
vi.mock("@/components/table/useTableGeometry", async (importOriginal) => {
  const module = await importOriginal<typeof import("@/components/table/useTableGeometry")>();
  return {
    ...module,
    useTableGeometry: () => ({
      geometry: {
        ...module.computeTableGeometry({ feltRect: { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }, viewportWidth: 1280, viewportHeight: 800 }),
        epoch: 1,
      },
    }),
  };
});

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? "";
    this.isPrimary = init.isPrimary ?? true;
  }
}

const OPEN = [
  { context: "OPEN_TRICK", mode: "COMPETE" },
  { context: "OPEN_TRICK", mode: "FROM_BELOW" },
] as const;
const LEAD = [
  { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "hearts" },
  { context: "LEAD", mode: "SUIT_WINS", requestedSuit: "hearts" },
] as const;

function tableProps(options: readonly object[] = OPEN) {
  const state = reconciliationFixture();
  state.progression.phase = "CARD_PLAY";
  const p = projectGameForSeat(state, 0);
  p.initialDealerSelection = { status: "pending" } as typeof p.initialDealerSelection;
  p.cards.currentTrick = options === OPEN ? [{ seatIndex: 3, card: { id: "h-K", kind: "standard", suit: "hearts", rank: "K" } }] : [];
  p.cards.completedTricks = [];
  p.cards.ownHand = [{ id: "joker-1", kind: "joker" }, ...p.cards.ownHand.filter((c) => c.kind !== "joker").slice(0, 3)];
  p.cards.ownHandVisible = true;
  p.progression.currentActorSeat = 0;
  (p.seats[0] as { controller: string }).controller = "human";
  p.local.legalActions = [{ type: "play_card", cardIds: p.cards.ownHand.map((c) => c.id), jokerOptions: options as never }];
  const room = {
    code: "TEST",
    hostId: "host",
    seats: state.seats.map((_, index) => ({ index, occupant: index === 0 ? { type: "human", player: { id: "me", displayName: "Me" } } : { type: "bot", bot: { id: String(index), displayName: `Seat ${index}` } } })),
  } as Room;
  const onCommand = vi.fn(async () => null as never);
  return { room, projection: p, busy: false, error: null, onCommand, onReclaim: vi.fn(), onEndGame: vi.fn(), onNineCardPresentationComplete: vi.fn() };
}

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

function touchDrag(el: Element) {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0, pointerType: "touch", clientX: 100, clientY: 500 });
  for (let i = 1; i <= 8; i++) fireEvent.pointerMove(el, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 500 - i * 12 });
  fireEvent.pointerUp(el, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 404 });
}
function tapWithoutClick(el: Element, pointerId = 2) {
  fireEvent.pointerDown(el, { pointerId, button: 0, pointerType: "touch" });
  fireEvent.pointerUp(el, { pointerId, pointerType: "touch" });
}

function mountTable(options: readonly object[] = OPEN) {
  const props = tableProps(options);
  const root = document.createElement("div");
  root.id = "table-fullscreen-root";
  document.body.appendChild(root);
  const view = render(<GameTable {...props} />, { container: root.appendChild(document.createElement("div")) });
  tick(2000);
  return { ...view, props };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 16));
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
});
afterEach(() => {
  cleanup();
  document.getElementById("table-fullscreen-root")?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Joker chooser after a touch drag: the first tap counts", () => {
  it("plays the Joker on the first tap even when the browser never synthesises a click", async () => {
    const { container, props } = mountTable();
    const joker = container.querySelector('[data-hand-card="joker-1"]')!.closest('[role="button"]')!;
    touchDrag(joker);
    tick(40);
    expect((joker as HTMLElement).style.transform).toBe("");
    expect(props.onCommand).not.toHaveBeenCalled();
    const button = document.querySelector<HTMLButtonElement>("[data-joker-choice-layer] button:last-of-type")!;
    expect(button.textContent).toBe("Τζόκερ από πάνω");
    // Portalled out of the footer's stacking context into the fullscreen root.
    expect(button.closest("footer")).toBeNull();
    expect(button.closest("#table-fullscreen-root")).not.toBeNull();
    await act(async () => { tapWithoutClick(button); });
    expect(props.onCommand).toHaveBeenCalledTimes(1);
    expect(props.onCommand).toHaveBeenCalledWith({ type: "play_card", cardId: "joker-1", jokerSemantic: OPEN[0] });
  });

  it("does not double-submit when the synthetic click does follow the tap", async () => {
    const { container, props } = mountTable();
    touchDrag(container.querySelector('[data-hand-card="joker-1"]')!.closest('[role="button"]')!);
    tick(40);
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-joker-choice-layer] button")).find((b) => b.textContent === "Τζόκερ από κάτω")!;
    await act(async () => { tapWithoutClick(button); fireEvent.click(button); });
    expect(props.onCommand).toHaveBeenCalledTimes(1);
    expect(props.onCommand).toHaveBeenCalledWith({ type: "play_card", cardId: "joker-1", jokerSemantic: OPEN[1] });
  });

  it("selects a lead choice on the first tap", async () => {
    const { container, props } = mountTable(LEAD);
    touchDrag(container.querySelector('[data-hand-card="joker-1"]')!.closest('[role="button"]')!);
    tick(40);
    const button = document.querySelector<HTMLButtonElement>('[aria-label="Παίρνουν κούπες"]')!;
    await act(async () => { tapWithoutClick(button); });
    expect(props.onCommand).toHaveBeenCalledWith({ type: "play_card", cardId: "joker-1", jokerSemantic: LEAD[1] });
  });

  it("outside touch dismisses on the first tap, keeps the Joker, and swallows the trailing click", async () => {
    const { container, props } = mountTable();
    const jokerEl = container.querySelector('[data-hand-card="joker-1"]')!.closest('[role="button"]')!;
    touchDrag(jokerEl);
    tick(40);
    const catcher = document.querySelector("[data-joker-choice-dismiss]")!;
    const underlying = vi.fn();
    const other = container.querySelector<HTMLElement>("[data-hand-card]:not([data-hand-card='joker-1'])")!.closest<HTMLElement>('[role="button"]')!;
    other.addEventListener("click", underlying);
    await act(async () => { tapWithoutClick(catcher); });
    expect(document.querySelector("[data-joker-choice-dismiss]")).toBeNull();
    // A late synthetic click lands on whatever is now under the finger; it must not activate it.
    fireEvent.click(other);
    expect(underlying).not.toHaveBeenCalled();
    expect(props.onCommand).not.toHaveBeenCalled();
    expect(container.querySelector('[data-hand-card="joker-1"]')).not.toBeNull();
    tick(TAP_CLICK_SUPPRESS_MS + 10);
    fireEvent.click(other);
    expect(underlying).toHaveBeenCalledTimes(1);
  });
});

describe("chooser activation paths", () => {
  it("mouse and keyboard keep using click", () => {
    const onSelect = vi.fn();
    const r = render(<JokerChoicePicker options={OPEN as never} busy={false} onSelect={onSelect} onDismiss={vi.fn()} />);
    const button = r.getByText("Τζόκερ από πάνω");
    fireEvent.pointerDown(button, { pointerId: 9, pointerType: "mouse" });
    fireEvent.pointerUp(button, { pointerId: 9, pointerType: "mouse" });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("a touch that starts elsewhere and ends on a choice does not select", () => {
    const onSelect = vi.fn();
    const r = render(<JokerChoicePicker options={OPEN as never} busy={false} onSelect={onSelect} onDismiss={vi.fn()} />);
    fireEvent.pointerUp(r.getByText("Τζόκερ από πάνω"), { pointerId: 3, pointerType: "touch" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("busy choices ignore taps", () => {
    const onSelect = vi.fn();
    const r = render(<JokerChoicePicker options={OPEN as never} busy onSelect={onSelect} />);
    tapWithoutClick(r.getByText("Τζόκερ από πάνω"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
