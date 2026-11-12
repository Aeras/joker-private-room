import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NineCardTrumpFlight } from "@/components/table/NineCardTrumpFlight";
import { TrumpIndicator } from "@/components/table/TrumpIndicator";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import { assets } from "@/assets/registry";
import type { PlayerGameProjection } from "@/domain/projection";

vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));

const geometry = {
  ...computeTableGeometry({
    feltRect: { left: 40, top: 40, right: 760, bottom: 290, width: 720, height: 250 },
    viewportWidth: 800,
    viewportHeight: 400,
  }),
  epoch: 1,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 16));
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NineCardTrumpFlight and TrumpIndicator Plaque", () => {
  it.each(["spades", "hearts", "diamonds", "clubs", null] as const)(
    "renders the custom luxury plaque asset for %s",
    (suit) => {
      const trump = { status: "resolved" as const, suit, chooserSeat: 1 };
      const view = render(<TrumpIndicator trump={trump} exposedTrumpCard={null} />);
      const img = view.container.querySelector<HTMLImageElement>("img");
      expect(img).not.toBeNull();
      expect(img?.src).toContain(`trump_${suit ?? "notrump"}.svg`);
      expect(view.container.querySelector(`[data-trump-indicator="${suit ?? "no-trump"}"]`)).not.toBeNull();
    }
  );

  it.each([0, 1, 2, 3] as const)(
    "launches flight from chooser seat %i and settles on target",
    (chooserPos) => {
      const onPlaced = vi.fn();
      const targetRef = { current: document.createElement("div") };
      targetRef.current.getBoundingClientRect = () => ({
        left: 576,
        top: 40,
        right: 656,
        bottom: 160,
        width: 80,
        height: 120,
        x: 576,
        y: 40,
        toJSON: () => {},
      });

      const view = render(
        <NineCardTrumpFlight
          suit="spades"
          chooserPos={chooserPos}
          geometry={geometry}
          targetRef={targetRef}
          onPlaced={onPlaced}
        />
      );

      expect(onPlaced).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(16));
      expect(onPlaced).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(650));
      expect(onPlaced).toHaveBeenCalledOnce();
    }
  );
});
