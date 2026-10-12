import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DealPresentation, NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS } from "@/components/table/DealPresentation";
import { assets } from "@/assets/registry";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import { computeTableGeometry } from "@/components/table/useTableGeometry";

const mocks = vi.hoisted(() => ({ artwork: vi.fn(() => true) }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({ useCriticalCardArtwork: mocks.artwork }));
vi.mock("@/components/joker/PlayingCard", () => ({
  PlayingCard: ({ faceDown }: { faceDown?: boolean }) => <span data-card-face={faceDown ? "back" : "front"} />,
}));
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/lib/timingDiagnostics", () => ({ recordTimingDiagnostic: vi.fn(), startTimingDiagnosticSession: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.artwork.mockClear();
  sessionStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 16));
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("rendered dealing privacy contract", () => {
  it("keeps the same measured CSS flight through polling and cancels it with its owner", () => {
    const projection = projectGameForSeat(reconciliationFixture(), 0);
    projection.progression.phase = "DEAL_PRESENTATION";
    projection.progression.cardsPerPlayer = 1;
    projection.cards.exposedTrumpCard = null;
    const geometry = { ...computeTableGeometry({ feltRect: { left: 0, top: 0, right: 844, bottom: 390, width: 844, height: 390 }, viewportWidth: 844, viewportHeight: 390 }), epoch: 1 };
    const complete = vi.fn();
    const view = render(<DealPresentation projection={projection} geometry={geometry} onPresentationComplete={complete} />);
    act(() => vi.advanceTimersByTime(50));
    const first = view.container.querySelector<HTMLElement>("[data-deal-traveling-card]")!;
    const name = first.style.animationName;
    expect(name).toMatch(/^deal-flight-/);
    expect(first.style.animationDuration).toBe("308ms");
    expect(first.style.animationTimingFunction).toBe("linear");
    expect(first.style.transitionProperty).toBe("opacity");
    view.rerender(<DealPresentation projection={{ ...projection }} geometry={{ ...geometry, epoch: 2 }} onPresentationComplete={complete} />);
    expect(view.container.querySelector("[data-deal-traveling-card]")).toBe(first);
    expect(first.style.animationName).toBe(name);
    view.unmount();
    act(() => vi.advanceTimersByTime(10000));
    expect(complete).not.toHaveBeenCalled();
  });
  it.each(["DEAL_PRESENTATION", "NINE_CARD_INITIAL_DEAL_ALL_SEATS", "NINE_CARD_REMAINING_DEAL"] as const)(
    "renders traveling backs, while decoding only visible viewer artwork (%s)", phase => {
      const projection = projectGameForSeat(reconciliationFixture(), 0);
      projection.progression.phase = phase;
      projection.progression.dealNumber = 2;
      projection.progression.cardsPerPlayer = phase === "DEAL_PRESENTATION" ? 1 : 9;
      projection.cards.ownHandVisible = phase !== "NINE_CARD_INITIAL_DEAL_ALL_SEATS";
      const ownFaces = projection.cards.ownHand.map(card => assets.cardFace(card));
      const view = render(<DealPresentation projection={projection} />);
      act(() => vi.advanceTimersByTime(phase === "NINE_CARD_REMAINING_DEAL" ? NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS + 100 : 1000));
      const traveling = view.container.querySelectorAll("[data-deal-traveling-card]");
      expect(traveling.length).toBeGreaterThan(0);
      expect(view.container.querySelector("[data-card-face='front']")).toBeNull();
      traveling.forEach(card => expect(card.querySelector("[data-card-face='back']")).not.toBeNull());
      expect(mocks.artwork).toHaveBeenCalledWith([assets.cardBack, ...(projection.cards.exposedTrumpCard ? [assets.cardFace(projection.cards.exposedTrumpCard)] : [])]);
      expect(mocks.artwork).toHaveBeenCalledWith(projection.cards.ownHandVisible ? ownFaces : []);
    },
  );
});
