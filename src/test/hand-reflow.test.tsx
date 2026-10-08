import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalHandRow } from "@/components/table/LocalHandRow";
import type { Card } from "@/domain/cards";
vi.mock("@/components/joker/PlayingCard", () => ({ PlayingCard: () => <div /> }));
const cards: Card[] = Array.from({ length: 5 }, (_, i) => ({
  kind: "standard",
  id: `c${i}`,
  suit: "hearts",
  rank: "A",
}));
const motions: {
  node: HTMLElement;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  cancel: ReturnType<typeof vi.fn>;
  onfinish: (() => void) | null;
}[] = [];
let residual = 0;
const props = {
  visible: true,
  legalCardIds: [],
  blocked: true,
  pendingCardId: null,
  authorityKey: "deal",
  geometry: null,
  onCommit: vi.fn(),
};
beforeEach(() => {
  motions.length = 0;
  residual = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const nodes = Array.from(this.parentElement?.querySelectorAll("[data-hand-layout-card]") ?? []);
    const index = nodes.indexOf(this);
    const left = index < 0 ? 0 : (5 - nodes.length) * 30 + index * 60 + residual;
    return {
      left,
      right: left + 80,
      top: 0,
      bottom: 100,
      width: 80,
      height: 100,
      x: left,
      y: 0,
      toJSON: () => ({}),
    };
  });
  vi.stubGlobal("getComputedStyle", () => ({ transform: `matrix(1, 0, 0, 1, ${residual}, 0)` }));
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: function (this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
      const motion = { node: this, frames, options, cancel: vi.fn(), onfinish: null };
      motions.push(motion);
      return motion;
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});
describe("280ms hand reflow", () => {
  it.each([0, 2, 4])(
    "slides every surviving card from its prior position when card %i is removed",
    (removed) => {
      const view = render(<LocalHandRow {...props} cards={cards} />);
      expect(motions).toHaveLength(0);
      const oldNodes = new Map(
        Array.from(view.container.querySelectorAll<HTMLElement>("[data-hand-layout-card]")).map(
          (n) => [n.dataset["handLayoutCard"], n],
        ),
      );
      view.rerender(<LocalHandRow {...props} cards={cards.filter((_, i) => i !== removed)} />);
      expect(motions).toHaveLength(4);
      for (const motion of motions) {
        const oldIndex = Number(motion.node.dataset["handLayoutCard"]!.slice(1));
        const newIndex = oldIndex < removed ? oldIndex : oldIndex - 1;
        expect(motion.frames[0]?.["transform"]).toBe(
          `translateX(${oldIndex * 60 - (30 + newIndex * 60)}px)`,
        );
        expect(motion.frames[1]?.["transform"]).toBe("translateX(0px)");
        expect(motion.options.duration).toBe(280);
        expect(motion.node).toBe(oldNodes.get(motion.node.dataset["handLayoutCard"]));
      }
      view.rerender(<LocalHandRow {...props} cards={[...cards.filter((_, i) => i !== removed)]} />);
      expect(motions).toHaveLength(4);
      expect(motions.every((m) => !m.cancel.mock.calls.length)).toBe(true);
    },
  );
  it("retargets from the in-flight visual position and cancels removed motions", () => {
    const view = render(<LocalHandRow {...props} cards={cards} />);
    view.rerender(<LocalHandRow {...props} cards={cards.slice(1)} />);
    const first = [...motions];
    residual = 10;
    view.rerender(<LocalHandRow {...props} cards={cards.slice(2)} />);
    expect(first.every((m) => m.cancel.mock.calls.length === 1)).toBe(true);
    const c2 = motions.slice(4).find((m) => m.node.dataset["handLayoutCard"] === "c2")!;
    expect(c2.frames[0]?.["transform"]).toBe("translateX(40px)");
  });
  it("animates survivors on rejection reinsertion but never gives the restored card a second flight", () => {
    const view = render(<LocalHandRow {...props} cards={cards.slice(0, 4)} />);
    view.rerender(<LocalHandRow {...props} cards={cards} />);
    expect(motions).toHaveLength(4);
    expect(motions.some((m) => m.node.dataset["handLayoutCard"] === "c4")).toBe(false);
  });
  it("keeps pending cards in their existing slots and does not replay layout for unrelated updates", () => {
    const view = render(<LocalHandRow {...props} cards={cards} />);
    view.rerender(
      <LocalHandRow {...props} cards={cards} pendingCardId="c2" authorityKey="new-version" />,
    );
    expect(motions).toHaveLength(0);
  });
  it("does not reflow during the deal entrance and cancels animation on unmount", async () => {
    const view = render(<LocalHandRow {...props} cards={cards} revealing />);
    view.rerender(<LocalHandRow {...props} cards={cards.slice(1)} revealing />);
    expect(motions).toHaveLength(0);
    view.rerender(<LocalHandRow {...props} cards={cards.slice(1)} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    view.rerender(<LocalHandRow {...props} cards={cards.slice(2)} />);
    expect(motions).toHaveLength(3);
    view.unmount();
    expect(motions.every((m) => m.cancel.mock.calls.length === 1)).toBe(true);
  });
});
