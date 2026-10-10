import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameTable } from "@/components/table/GameTable";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import type { Room } from "@/domain/players";
import type { PlayedCard } from "@/domain/engine";

vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({ useCriticalCardArtwork: () => true }));
vi.mock("@/components/table/DealerSelectionPresentation", () => ({ DealerSelectionPresentation: () => null }));
vi.mock("@/components/table/DealPresentation", () => ({ DealPresentation: () => null }));
vi.mock("@/components/table/Scoreboard", () => ({ Scoreboard: () => null }));
vi.mock("@/components/table/SoundToggle", () => ({ SoundToggle: () => null }));
vi.mock("@/components/table/TableUtilityMenu", () => ({ TableUtilityMenu: () => null }));
vi.mock("@/components/table/useTableGeometry", async importOriginal => {
  const module = await importOriginal<typeof import("@/components/table/useTableGeometry")>();
  return { ...module, useTableGeometry: () => ({ geometry: { ...module.computeTableGeometry({ feltRect: { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }, viewportWidth: 1280, viewportHeight: 800 }), epoch: 1 } }) };
});

const cards: PlayedCard[] = [0, 1, 2, 3].map(seatIndex => ({ seatIndex: seatIndex as 0 | 1 | 2 | 3, card: { id: `play-${seatIndex}`, kind: "standard", suit: "hearts", rank: "A" } }));
function fixture() {
  const state = reconciliationFixture();
  state.progression.phase = "CARD_PLAY";
  const projection = projectGameForSeat(state, 0);
  projection.initialDealerSelection = { status: "pending" } as typeof projection.initialDealerSelection;
  projection.cards.currentTrick = [];
  projection.cards.completedTricks = [];
  projection.local.legalActions = [];
  projection.declarations.values = [2, 2, 2, 2];
  projection.score.tricksTaken = [0, 0, 0, 0];
  projection.score.cumulativeTotals = [100, 200, 300, 400];
  const room = { code: "TEST", hostId: "host", seats: state.seats.map((_, index) => ({ index, occupant: { type: "bot", bot: { id: String(index), displayName: `Seat ${index}` } } })) } as Room;
  return { room, projection, busy: false, error: null, onCommand: vi.fn(), onReclaim: vi.fn(), onEndGame: vi.fn(), onNineCardPresentationComplete: vi.fn() };
}
function finish(element: Element | undefined) {
  if (!element) throw new Error("Missing trick motion surface");
  if ((element as HTMLElement).style.animationName && (element as HTMLElement).style.animationName !== "none") { const animation = new Event("animationend", { bubbles: true }); Object.defineProperty(animation, "animationName", { value: (element as HTMLElement).style.animationName }); fireEvent(element, animation); return; }
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: "transform" });
  fireEvent(element, event);
}
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 16)); vi.stubGlobal("cancelAnimationFrame", window.clearTimeout); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("real table score presentation integration", () => {
  it.each([false, true])("latches all four seats until collection lands (final deal: %s)", finalDeal => {
    const props = fixture();
    if (finalDeal) props.projection.score.tricksTaken = [1, 2, 3, 2];
    const view = render(<GameTable {...props} />);
    const info = () => Array.from(view.container.querySelectorAll<HTMLElement>("[data-seat-info-layout]"));
    const displayedScores = () => info().map(panel => [panel.querySelector("span[title='Συνολικό σκορ']")?.textContent, panel.querySelector("span[title='Δήλωση / Μπάζες']")?.textContent]);
    const before = displayedScores();
    const next = structuredClone(props.projection);
    next.stateVersion++;
    next.cards.completedTricks = [{ winnerSeat: 2, cards }];
    next.score.tricksTaken = [0, 0, 1, 0];
    if (finalDeal) {
      next.declarations.values = [null, null, null, null];
      next.progression.dealNumber++;
      next.progression.phase = "DEAL_PRESENTATION";
      next.cards.completedTricks = [];
      next.cards.presentationTail = [{ winnerSeat: 2, cards, dealNumber: props.projection.progression.dealNumber, ordinal: 1 }];
      next.score.tricksTaken = [0, 0, 0, 0];
      next.score.cumulativeTotals = [150, 250, 450, 450];
    }
    view.rerender(<GameTable {...props} projection={next} />);
    const surfaces = () => Array.from(view.container.querySelectorAll<HTMLElement>("[data-trick-presentation-id] > div")).filter(el => el.style.transitionDuration);
    for (let card = 0; card < 4; card++) {
      tick(card ? 1000 : 0); tick(16); finish(surfaces().at(-1));
      expect(displayedScores()).toEqual(before);
    }
    tick(850);
    expect(displayedScores()).toEqual(before);
    surfaces().forEach(finish);
    expect(displayedScores()).toEqual(before);
    // A fresher projection during collection must be read by the callback.
    const latest = structuredClone(next); latest.stateVersion++;
    if (finalDeal) latest.score.cumulativeTotals[2] = 500;
    view.rerender(<GameTable {...props} projection={latest} />);
    fireEvent.blur(window); tick(5000);
    expect(displayedScores()).toEqual(before);
    fireEvent.focus(window);
    surfaces().slice(0, 3).forEach(finish);
    expect(displayedScores()).toEqual(before);
    finish(surfaces()[3]);
    const top = info().find(panel => panel.textContent?.includes("Seat 2"));
    expect(top?.textContent).toContain(finalDeal ? "500" : "2 / 1");
    if (finalDeal) {
      for (const panel of info()) {
        const seat = [0, 1, 2, 3].find(index => panel.textContent?.includes(`Seat ${index}`));
        if (seat == null) throw new Error("Missing seat identity");
        expect(panel.textContent).toContain(String(latest.score.cumulativeTotals[seat]));
        expect(panel.textContent).toContain("— / 0");
      }
    }
    expect(top?.getAttribute("data-seat-info-layout")).toBe("below");
    expect(top?.className).toContain("joker-seat-info");
    expect(info().filter(panel => panel.dataset['seatInfoLayout'] === "below")).toHaveLength(4);
  });

  it("initializes settled reconnects, reconciles idle scores, and resets on a new game", () => {
    const props = fixture();
    props.projection.cards.completedTricks = [{ winnerSeat: 2, cards }];
    props.projection.score.tricksTaken[2] = 1;
    const view = render(<GameTable {...props} />);
    const top = () => Array.from(view.container.querySelectorAll("[data-seat-info-layout]")).find(panel => panel.textContent?.includes("Seat 2"));
    expect(top()?.textContent).toContain("2 / 1");
    expect(view.container.querySelector("[data-trick-presentation-id]")).toBeNull();
    const next = structuredClone(props.projection);
    next.score.cumulativeTotals[2] = 700;
    view.rerender(<GameTable {...props} projection={next} />);
    expect(top()?.textContent).toContain("700");
    next.gameId = "new-game"; next.score.tricksTaken[2] = 0; next.score.cumulativeTotals[2] = 0;
    view.rerender(<GameTable {...props} projection={{ ...next }} />);
    expect(top()?.textContent).toContain("2 / 0");
    expect(top()?.textContent).not.toContain("700");
  });
});