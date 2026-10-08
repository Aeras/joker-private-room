import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DealPresentation, NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS } from "@/components/table/DealPresentation";
import { NORMAL_DEAL_STAGGER_MS, NORMAL_DEAL_TRAVEL_MS, dealPresentationTiming } from "@/components/table/dealPresentationModel";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { SeatIndex } from "@/domain/dealing";
vi.mock("@/components/table/useCriticalCardArtwork", () => ({ useCriticalCardArtwork: () => true }));
vi.mock("@/components/joker/PlayingCard", () => ({ PlayingCard: () => <span data-card-back /> }));
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/lib/timingDiagnostics", () => ({ recordTimingDiagnostic: vi.fn(), startTimingDiagnosticSession: vi.fn() }));
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const geometry = { ...computeTableGeometry({ feltRect: { left: 40, top: 40, right: 760, bottom: 290, width: 720, height: 250 }, viewportWidth: 800, viewportHeight: 400 }), epoch: 1 };
const initialSettleAt = 11 * NORMAL_DEAL_STAGGER_MS + NORMAL_DEAL_TRAVEL_MS;
const { settleMs, tailMs } = dealPresentationTiming(false);
function initial(viewer: SeatIndex) {
  const projection = projectGameForSeat(reconciliationFixture(), viewer);
  projection.gameId = `nine-choice-${viewer}`;
  projection.progression.phase = "NINE_CARD_INITIAL_DEAL_ALL_SEATS";
  projection.progression.cardsPerPlayer = 9;
  projection.progression.dealNumber = 2;
  projection.progression.dealerSeat = 0;
  projection.progression.firstDeclarerSeat = 1;
  projection.trump = { status: "chooser_pending", chooserSeat: 1 };
  projection.cards.ownHandVisible = viewer === 1;
  return projection;
}
beforeEach(() => {
  vi.useFakeTimers(); sessionStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 16));
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("nine-card choice piles", () => {
  it.each([0, 1, 2, 3] as const)("only chooser leaves; other piles survive choice and remaining deal (viewer %i)", viewer => {
    const projection = initial(viewer); const complete = vi.fn();
    const view = render(<DealPresentation geometry={geometry} projection={projection} onPresentationComplete={complete} />);
    tick(initialSettleAt); tick(16);
    const cards = () => Array.from(view.container.querySelectorAll<HTMLElement>("[data-deal-traveling-card]"));
    expect(cards()).toHaveLength(12);
    const chooserPos = (1 - viewer + 4) % 4;
    cards().forEach(card => expect(card.style.opacity).toBe(card.dataset['dealVisualSeat'] === String(chooserPos) ? "0" : "1"));
    const retained = cards().filter(card => card.dataset['dealVisualSeat'] !== String(chooserPos));
    const transforms = retained.map(card => card.style.transform);
    tick(settleMs + tailMs);
    expect(complete).toHaveBeenCalledExactlyOnceWith("initial");
    expect(cards()).toEqual(retained);
    expect(cards().map(card => card.style.transform)).toEqual(transforms);
    const choice = { ...projection, progression: { ...projection.progression, phase: "NINE_CARD_TRUMP_CHOICE" as const } };
    view.rerender(<DealPresentation geometry={geometry} projection={choice} onPresentationComplete={complete} />);
    expect(cards()).toEqual(retained);
    view.rerender(<DealPresentation geometry={geometry} projection={{ ...choice }} onPresentationComplete={complete} />);
    tick(2000); expect(cards()).toEqual(retained);
    const remaining = { ...choice, trump: { status: "resolved" as const, suit: null }, progression: { ...choice.progression, phase: "NINE_CARD_REMAINING_DEAL" as const } };
    view.rerender(<DealPresentation geometry={geometry} projection={remaining} onPresentationComplete={complete} />);
    tick(NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS + 23 * NORMAL_DEAL_STAGGER_MS + NORMAL_DEAL_TRAVEL_MS);
    expect(cards()).toHaveLength(33); // Three retained piles plus six new backs per seat.
    retained.forEach(card => expect(cards()).toContain(card));
    cards().forEach(card => expect(card.style.opacity).toBe("0"));
    tick(settleMs + tailMs); expect(cards()).toHaveLength(0);
    expect(complete).toHaveBeenLastCalledWith("remaining");
  });
  it("restores only public closed piles on reconnect during choice", () => {
    const projection = initial(2); projection.progression.phase = "NINE_CARD_TRUMP_CHOICE";
    const complete = vi.fn();
    const view = render(<DealPresentation geometry={geometry} projection={projection} onPresentationComplete={complete} />);
    const cards = view.container.querySelectorAll<HTMLElement>("[data-deal-traveling-card]");
    expect(cards).toHaveLength(9);
    cards.forEach(card => { expect(card.style.opacity).toBe("1"); expect(card.style.transform).toContain("scale(1)"); });
    tick(20000); expect(complete).not.toHaveBeenCalled();
  });
});