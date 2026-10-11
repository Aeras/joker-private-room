import { act, render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DurakDiscardFlight } from "@/durak/DurakDiscardFlight";
import type { DurakCollection } from "@/durak/useDurakPresentation";
vi.mock("@/components/joker/PlayingCard", () => ({ PlayingCard: () => <div data-back /> }));
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
it("flies a local take face-up to individual hand slots and keeps snapshots through poll rerenders", async () => {
  const motions: { resolve: () => void; frames: Keyframe[]; cancel: ReturnType<typeof vi.fn> }[] = [];
  const flip = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { left: this.hasAttribute("data-durak-card-key") ? 400 : 100, top: this.hasAttribute("data-durak-card-key") ? 260 : 120, width: 80, height: 112 } as DOMRect;
  });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: function(this: HTMLElement, frames: Keyframe[]) {
    let resolve = () => {};
    const finished = new Promise<void>(r => { resolve = r; });
    const cancel = vi.fn();
    if (this.hasAttribute("data-take-flight")) motions.push({ resolve, frames, cancel });
    else flip();
    return { finished, cancel };
  } });
  const collection: DurakCollection = { id: 5, kind: "take", receiver: 0, localSeat: 0, from: 12, to: 12,
    cards: [{ suit: "clubs", rank: 6 }, { suit: "clubs", rank: 7 }] };
  const done = vi.fn();
  function Fixture({ show }: {show: boolean}) {
    return <div className="durak-fullscreen">
      {show && <div data-durak-pair>{collection.cards.map(card => <span key={card.rank} className="durak-played-card"><div>Public {card.rank}</div></span>)}</div>}
      {collection.cards.map(card => <button key={card.rank} data-durak-card-key={`${card.suit}:${card.rank}`} />)}
      <DurakDiscardFlight collection={collection} onLand={() => {}} onComplete={done} />
    </div>;
  }
  const rendered = render(<Fixture show />);
  expect(motions).toHaveLength(2);
  expect(flip).not.toHaveBeenCalled();
  expect(String(motions[0]!.frames.at(-1)!["transform"])).toContain("translate(300px, 140px)");
  rendered.rerender(<Fixture show={false} />);
  expect(rendered.container.querySelectorAll("[data-take-flight]")).toHaveLength(2);
  expect(motions.every(motion => motion.cancel.mock.calls.length === 0)).toBe(true);
  await act(async () => motions[0]!.resolve());
  expect(done).not.toHaveBeenCalled();
  await act(async () => motions[1]!.resolve());
  expect(done).toHaveBeenCalledExactlyOnceWith(5);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, "animate", originalAnimate);
  else Reflect.deleteProperty(HTMLElement.prototype, "animate");
});
it("retains measured card snapshots and uncancelled flight after original table unmounts and poll rerenders", async () => {
  const movements: Array<{ resolve: () => void; cancel: ReturnType<typeof vi.fn> }> = [];
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return {
      left: this.classList.contains("durak-discard-mound") ? 500 : 100,
      top: 120,
      width: 80,
      height: 112,
      right: 180,
      bottom: 232,
      x: 100,
      y: 120,
      toJSON: () => ({}),
    };
  });
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: vi.fn(function (this: HTMLElement) {
      let resolve = () => {};
      const finished = new Promise<void>((r) => {
        resolve = r;
      });
      const cancel = vi.fn();
      if (this.classList.contains("durak-discard-flying-card")) movements.push({ resolve, cancel });
      return { finished, cancel };
    }),
  });
  const collection: DurakCollection = {
    id: 3,
    from: 0,
    to: 2,
    cards: [
      { suit: "clubs", rank: 6 },
      { suit: "clubs", rank: 7 },
    ],
  };
  const onLand = vi.fn(),
    onComplete = vi.fn();
  function Fixture({ show }: { show: boolean }) {
    return (
      <div className="durak-fullscreen">
        <div className="durak-discard-mound" />
        {show && (
          <div data-durak-pair>
            {[0, 1].map((i) => (
              <span className="durak-played-card" key={i}>
                <div>Original {i}</div>
              </span>
            ))}
          </div>
        )}
        <DurakDiscardFlight collection={collection} onLand={onLand} onComplete={onComplete} />
      </div>
    );
  }
  const { container, rerender } = render(<Fixture show />);
  expect(container.querySelectorAll("[data-discard-flight]")).toHaveLength(2);
  expect(movements).toHaveLength(2);
  rerender(<Fixture show={false} />);
  expect(container.querySelector("[data-durak-pair]")).toBeNull();
  expect(container.querySelector('[data-discard-flight="0"]')).toHaveTextContent("Original 0");
  movements.forEach((m) => expect(m.cancel).not.toHaveBeenCalled());
  await act(async () => {
    movements[0]!.resolve();
  });
  expect(onLand).toHaveBeenCalledWith(3, 0);
  expect(onComplete).not.toHaveBeenCalled();
  await act(async () => {
    movements[1]!.resolve();
  });
  expect(onLand).toHaveBeenCalledWith(3, 1);
  expect(onComplete).toHaveBeenCalledExactlyOnceWith(3);
});
describe("discard callback cancellation", () => {
  it("ignores late finished promises when the table is left", async () => {
    let resolve = () => {};
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(() => ({
        finished: new Promise<void>((r) => {
          resolve = r;
        }),
        cancel: vi.fn(),
      })),
    });
    const collection: DurakCollection = {
      id: 3,
      from: 0,
      to: 2,
      cards: [
        { suit: "clubs", rank: 6 },
        { suit: "clubs", rank: 7 },
      ],
    };
    const onLand = vi.fn(),
      onComplete = vi.fn();
    const { unmount } = render(
      <div className="durak-fullscreen">
        <div className="durak-discard-mound" />
        <div data-durak-pair>
          {[0, 1].map((i) => (
            <span className="durak-played-card" key={i}>
              <div>Card</div>
            </span>
          ))}
        </div>
        <DurakDiscardFlight collection={collection} onLand={onLand} onComplete={onComplete} />
      </div>,
    );
    unmount();
    await act(async () => {
      resolve();
    });
    expect(onLand).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
