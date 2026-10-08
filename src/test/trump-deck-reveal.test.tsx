import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DealPresentation } from "@/components/table/DealPresentation";
import { TRUMP_FLIP_MS, TRUMP_DECK_MOVE_MS } from "@/components/table/TrumpDeckMotion";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/lib/timingDiagnostics", () => ({ recordTimingDiagnostic: vi.fn(), startTimingDiagnosticSession: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({ useCriticalCardArtwork: () => true }));
const geometry = { ...computeTableGeometry({ feltRect: { left: 30, top: 30, right: 870, bottom: 330, width: 840, height: 300 }, viewportWidth: 900, viewportHeight: 420 }), epoch: 1 };
let testGeneration = 0;
function fixture(dealerSeat: 0 | 1 | 2 | 3 = 0) {
  const projection = projectGameForSeat(reconciliationFixture(), 0);
  projection.gameId = `reveal-${testGeneration}-${dealerSeat}`;
  projection.progression.phase = "DEAL_PRESENTATION";
  projection.progression.dealNumber = 2;
  projection.progression.cardsPerPlayer = 1;
  projection.progression.dealerSeat = dealerSeat;
  projection.cards.ownHandVisible = true;
  projection.cards.exposedTrumpCard = { id: "public-trump", kind: "standard", suit: "hearts", rank: "7" };
  return projection;
}
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
function finish(element: Element | null) {
  if (!element) throw Error("Missing motion surface");
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: "transform" }); fireEvent(element, event);
}
beforeEach(() => { testGeneration++; vi.useFakeTimers(); sessionStorage.clear(); vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 16)); vi.stubGlobal("cancelAnimationFrame", window.clearTimeout); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("ordinary deal trump reveal and deck placement", () => {
  it.each([0, 1, 2, 3] as const)("dealer %i: flips, moves the whole deck, then begins the unchanged handoff", dealer => {
    const projection = fixture(dealer), placed = vi.fn(), complete = vi.fn(), settling = vi.fn();
    const props = { geometry, projection, onTrumpPlaced: placed, onPresentationComplete: complete, onSettlingChange: settling };
    const view = render(<DealPresentation {...props} />);
    tick(1357); expect(view.container.querySelector("[data-trump-deck-motion]")).toBeNull();
    tick(1); tick(16);
    const flip = view.container.querySelector<HTMLElement>("[data-trump-flip]")!;
    expect(flip.style.transform).toBe("rotateY(180deg)");
    expect(flip.style.transition).toContain(`${TRUMP_FLIP_MS}ms`);
    expect(view.container.querySelector("[data-trump-deck-motion]")?.getAttribute("data-trump-deck-motion")).toBe("flipping");
    const piles = () => Array.from(view.container.querySelectorAll<HTMLElement>("[data-deal-traveling-card]"));
    expect(piles().every(card => card.style.opacity === "1")).toBe(true);
    const oldFlip = flip;
    view.rerender(<DealPresentation {...props} projection={structuredClone(projection)} geometry={{ ...geometry, epoch: 3 }} />);
    expect(view.container.querySelector("[data-trump-flip]")).toBe(oldFlip);
    finish(flip);
    const deck = view.container.querySelector<HTMLElement>("[data-trump-deck-motion]")!;
    expect(deck.getAttribute("data-trump-deck-motion")).toBe("moving");
    expect(deck.style.transition).toContain(`${TRUMP_DECK_MOVE_MS}ms`);
    expect(placed).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
    expect(piles().every(card => card.style.opacity === "1")).toBe(true);
    finish(deck); expect(placed).toHaveBeenCalledExactlyOnceWith(`${projection.gameId}:2`);
    expect(piles().every(card => card.style.opacity === "0")).toBe(true);
    expect(piles().every(card => card.style.transitionDuration.startsWith("600ms"))).toBe(true);
    tick(599); expect(settling).not.toHaveBeenCalledWith(true);
    tick(1); expect(settling).toHaveBeenLastCalledWith(true);
    tick(671); expect(complete).not.toHaveBeenCalled(); tick(1); expect(complete).toHaveBeenCalledOnce();
  });
  it("uses bounded completion fallbacks when native motion events are absent", () => {
    const placed = vi.fn(), complete = vi.fn();
    const view = render(<DealPresentation projection={fixture()} geometry={geometry} onTrumpPlaced={placed} onPresentationComplete={complete} />);
    tick(1358); tick(16); tick(TRUMP_FLIP_MS + 120);
    expect(view.container.querySelector("[data-trump-deck-motion]")?.getAttribute("data-trump-deck-motion")).toBe("moving");
    tick(TRUMP_DECK_MOVE_MS + 119); expect(placed).not.toHaveBeenCalled();
    tick(1); expect(placed).toHaveBeenCalledOnce(); tick(1272); expect(complete).toHaveBeenCalledOnce();
  });
  it.each(["flipping", "moving"])("cancelled %s cannot acknowledge; same-key resume finishes once", stage => {
    const complete = vi.fn(), placed = vi.fn(); const projection = fixture();
    const view = render(<DealPresentation projection={projection} geometry={geometry} onTrumpPlaced={placed} onPresentationComplete={complete} />);
    tick(1358); tick(16); if (stage === "moving") finish(view.container.querySelector("[data-trump-flip]"));
    fireEvent.blur(window); tick(10000); expect(placed).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
    view.rerender(<DealPresentation projection={structuredClone(projection)} geometry={{ ...geometry, epoch: 9 }} onTrumpPlaced={placed} onPresentationComplete={complete} />);
    fireEvent.focus(window); tick(1358); tick(16); finish(view.container.querySelector("[data-trump-flip]")); finish(view.container.querySelector("[data-trump-deck-motion]"));
    tick(1272); expect(complete).toHaveBeenCalledOnce(); expect(placed).toHaveBeenCalledOnce();
  });
  it("startup waits for trump placement, then canonical hand visibility, before handoff", () => {
    const projection = fixture(); projection.lifecycle = "starting"; projection.progression.phase = "DEAL_SETUP"; projection.cards.ownHandVisible = false; projection.cards.ownHand = [];
    const sequence = vi.fn(), complete = vi.fn();
    const props = { geometry, onSequenceComplete: sequence, onPresentationComplete: complete };
    const view = render(<DealPresentation {...props} projection={projection} />);
    tick(1358); tick(16); expect(sequence).not.toHaveBeenCalled(); finish(view.container.querySelector("[data-trump-flip]"));
    expect(sequence).not.toHaveBeenCalled(); finish(view.container.querySelector("[data-trump-deck-motion]"));
    expect(sequence).toHaveBeenCalledOnce(); expect(view.container.querySelector("[data-deal-settling]")?.getAttribute("data-deal-settling")).toBe("false");
    const next = structuredClone(projection); next.lifecycle = "active"; next.progression.phase = "DEAL_PRESENTATION"; next.cards.ownHandVisible = true; next.cards.ownHand = [{ id: "own", kind: "standard", suit: "spades", rank: "A" }];
    view.rerender(<DealPresentation {...props} projection={next} />);
    expect(view.container.querySelector("[data-deal-settling]")?.getAttribute("data-deal-settling")).toBe("true");
    tick(1272); expect(complete).toHaveBeenCalledTimes(2); expect(sequence).toHaveBeenCalledOnce();
  });
  it("hides the prior placed deck when an interrupted handoff replays", () => {
    const placed = vi.fn(), complete = vi.fn(), projection = fixture();
    const view = render(<DealPresentation projection={projection} geometry={geometry} onTrumpPlaced={placed} onPresentationComplete={complete} />);
    tick(1358); tick(16); finish(view.container.querySelector("[data-trump-flip]")); finish(view.container.querySelector("[data-trump-deck-motion]"));
    expect(placed).toHaveBeenLastCalledWith(`${projection.gameId}:2`);
    tick(200); fireEvent.blur(window); tick(3000); expect(complete).not.toHaveBeenCalled();
    fireEvent.focus(window); expect(placed).toHaveBeenLastCalledWith(null);
    tick(1358); tick(16); finish(view.container.querySelector("[data-trump-flip]")); finish(view.container.querySelector("[data-trump-deck-motion]"));
    expect(placed.mock.calls.map(call => call[0])).toEqual([`${projection.gameId}:2`, null, `${projection.gameId}:2`]);
    tick(1272); expect(complete).toHaveBeenCalledOnce();
  });

});
