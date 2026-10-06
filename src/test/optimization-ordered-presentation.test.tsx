import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrickPresentationJournal } from "@/components/table/trickPresentationJournal";
import { TrickPresentation } from "@/components/table/TrickPresentation";
import { DealPresentation } from "@/components/table/DealPresentation";
import { DealerSelectionPresentation } from "@/components/table/DealerSelectionPresentation";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import { settleCanonicalLifecycle } from "@/domain/gameLifecycle";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import { retainedPresentationTail } from "@/domain/presentationTail";
import type { PlayerGameProjection } from "@/domain/projection";
import type { CanonicalGameState } from "@/domain/gameState";
import type { PlayedCard } from "@/domain/engine";
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({ useCriticalCardArtwork: () => true }));
vi.mock("@/lib/timingDiagnostics", () => ({ recordTimingDiagnostic: vi.fn(), startTimingDiagnosticSession: vi.fn() }));
const rect = { left: 40, top: 40, right: 760, bottom: 290, width: 720, height: 250 };
const geometry = { ...computeTableGeometry({ feltRect: rect, viewportWidth: 800, viewportHeight: 400 }), epoch: 1 };
const trick = (n: number) => ({ winnerSeat: 2 as const, cards: [0, 1, 2, 3].map(seat => ({ seatIndex: seat, card: { kind: "standard", id: `${n}-${seat}`, suit: "hearts", rank: "A" } })) as PlayedCard[] });
const snapshot = (count = 0, current: PlayedCard[] = [], dealNumber = 2) => ({ gameId: "ordered", viewerSeat: 0, rulesetId: "popular", progression: { dealNumber, dealerSeat: 0, cardsPerPlayer: 1, phase: "DEAL_SETUP" }, cards: { currentTrick: current, completedTricks: Array.from({ length: count }, (_, index) => trick(index + 1)) } }) as unknown as PlayerGameProjection;
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
function finish(el: Element) { const event = new Event("transitionend", { bubbles: true }); Object.defineProperty(event, "propertyName", { value: "transform" }); fireEvent(el, event); }
beforeEach(() => { vi.useFakeTimers(); sessionStorage.clear(); vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 16)); vi.stubGlobal("cancelAnimationFrame", window.clearTimeout); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("ordered public trick journal", () => {
  it("canonical next-deal transition and projection retain the authoritative outgoing winner", () => {
    const state = reconciliationFixture();
    state.progression.phase = "DEAL_RESULT"; state.cards.hands = [[], [], [], []]; state.cards.currentTrick = []; state.cards.completedTricks = [trick(1)]; state.declarations.declarations = [0, 0, 1, 0]; state.score.tricksTaken = [0, 0, 1, 0];
    const result = settleCanonicalLifecycle({ state, serverNow: new Date().toISOString(), nextDealRandom: () => .42 });
    expect(result.ok && result.changed).toBe(true);
    if (!result.ok) return;
    const projected = projectGameForSeat(result.state, 0);
    expect(projected.cards.completedTricks).toEqual([]); expect(projected.cards.presentationTail?.[0]).toMatchObject({ dealNumber: 1, ordinal: 1, winnerSeat: 2 });
    expect(projected.cards.presentationTail?.[0]?.cards).toEqual(trick(1).cards);
  });
  it.each([2, 3])("keeps every trick in a 0 → %i jump and deduplicates polling", count => {
    const journal = new TrickPresentationJournal(); journal.ingest(snapshot()); journal.ingest(snapshot(count)); journal.ingest(snapshot(count));
    expect(journal.queue.map(unit => unit.ordinal)).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    expect(journal.queue.every(unit => unit.winnerSeat === 2)).toBe(true);
  });
  it("keeps a holding completion and next-trick cards until collection", () => {
    const journal = new TrickPresentationJournal(); journal.ingest(snapshot(0, trick(1).cards)); journal.ingest(snapshot(1, trick(2).cards.slice(0, 1)));
    const first = journal.active!; journal.ingest(snapshot(2, trick(3).cards.slice(0, 1)));
    expect(journal.active).toBe(first); expect(journal.queue).toHaveLength(3);
    journal.collect("wrong"); expect(journal.active).toBe(first);
    journal.collect(first.id); expect(journal.active?.ordinal).toBe(2);
  });
  it("retains outgoing final trick from public tail across a deal boundary", () => {
    const journal = new TrickPresentationJournal(); journal.ingest(snapshot());
    const next = snapshot(0, [], 3); next.cards.presentationTail = [{ ...trick(1), dealNumber: 2, ordinal: 1 }];
    journal.ingest(next); expect(journal.active?.id).toBe("ordered:2:1"); expect(journal.active?.winnerSeat).toBe(2);
    const tail = retainedPresentationTail({ progression: { dealNumber: 2 }, cards: { completedTricks: [trick(1)], deck: ["secret"], hands: ["secret"] } } as unknown as CanonicalGameState);
    expect(Object.keys(tail[0]!)).toEqual(["winnerSeat", "cards", "dealNumber", "ordinal"]);
  });
});

describe("presentation interruption and geometry", () => {
  it.each(["visibility", "orientation"])("deal recovers from %s interruption without early acknowledgement", interruption => {
    const complete = vi.fn(); const projection = snapshot(); projection.gameId = `recovery-${interruption}`;
    const view = render(<DealPresentation projection={projection} geometry={geometry} onPresentationComplete={complete} />);
    tick(500);
    if (interruption === "visibility") {
      const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      fireEvent(document, new Event("visibilitychange")); tick(10000); expect(complete).not.toHaveBeenCalled();
      view.rerender(<DealPresentation projection={{ ...projection }} geometry={{ ...geometry, epoch: 3 }} onPresentationComplete={complete} />);
      visible.mockReturnValue("visible"); fireEvent(document, new Event("visibilitychange"));
    } else { fireEvent(window, new Event("orientationchange")); }
    tick(2320); expect(complete).toHaveBeenCalledOnce();
  });
  it.each([["NINE_CARD_INITIAL_DEAL_ALL_SEATS", 12, 6000], ["NINE_CARD_REMAINING_DEAL", 24, 14000]] as const)("%s presents %i backs without private identities", (phase, count, elapsed) => {
    const projection = snapshot(); projection.gameId = `private-stage-${phase}`; projection.progression.phase = phase; projection.progression.cardsPerPlayer = 9;
    const complete = vi.fn(); const view = render(<DealPresentation projection={projection} geometry={geometry} onPresentationComplete={complete} />);
    tick(elapsed);
    expect(view.container.querySelectorAll('[aria-label="Κλειστό φύλλο"]')).toHaveLength(count);
    expect(view.container.querySelectorAll('img[alt]:not([alt=""])')).toHaveLength(0);
    expect(complete).not.toHaveBeenCalled(); tick(320); expect(complete).toHaveBeenCalledOnce();
  });
  it("already-dealt first hand acknowledges reveal scope without replaying the deal", () => {
    const complete = vi.fn(); const projection = snapshot(); projection.gameId = "firststage-reveal";
    const view = render(<DealPresentation projection={projection} geometry={geometry} onPresentationComplete={complete} />);
    tick(2320); expect(complete).toHaveBeenCalledTimes(1);
    view.rerender(<DealPresentation projection={{ ...projection, lifecycle: "active", progression: { ...projection.progression, phase: "DEAL_PRESENTATION" } }} geometry={geometry} onPresentationComplete={complete} />);
    expect(complete).toHaveBeenCalledTimes(2); expect(view.container.childElementCount).toBe(0);
    tick(5000); expect(complete).toHaveBeenCalledTimes(2);
  });
  it("presents a three-trick batch exactly once; resize/blur/collection keep cursor", () => {
    const props = { geometry, localPlayPresentation: null, onLocalFlightSettled: vi.fn() };
    const view = render(<TrickPresentation {...props} projection={snapshot()} />);
    view.rerender(<TrickPresentation {...props} projection={snapshot(3)} />);
    const visited: string[] = [];
    for (let ordinal = 1; ordinal <= 3; ordinal++) {
      for (let card = 0; card < 4; card++) {
        tick(card ? 1000 : 0); tick(16);
        const root = view.container.querySelector("[data-trick-presentation-id]")!;
        const surfaces = Array.from(root.children).filter(el => (el as HTMLElement).style.transitionDuration);
        expect(surfaces).toHaveLength(card + 1);
        if (ordinal === 1 && card === 0) {
          const pose = (surfaces[0] as HTMLElement).style.transform;
          view.rerender(<TrickPresentation {...props} geometry={{ ...geometry, epoch: 2, feltRect: { ...rect, left: 80 } }} projection={snapshot(3)} />);
          expect((surfaces[0] as HTMLElement).style.transform).toBe(pose);
        }
        finish(surfaces.at(-1)!);
      }
      const root = view.container.querySelector("[data-trick-presentation-id]")!;
      visited.push(root.getAttribute("data-trick-presentation-id")!);
      if (ordinal === 1) { fireEvent.blur(window); tick(3000); expect(root.getAttribute("data-trick-departing-stage")).toBe("holding"); fireEvent.focus(window); }
      tick(850); expect(root.getAttribute("data-trick-departing-stage")).toBe("flipping");
      const surfaces = Array.from(root.children).filter(el => (el as HTMLElement).style.transitionDuration);
      surfaces.forEach(finish); expect(root.getAttribute("data-trick-departing-stage")).toBe("collecting");
      view.rerender(<TrickPresentation {...props} geometry={{ ...geometry, epoch: ordinal + 2 }} projection={snapshot(3)} />);
      expect(view.container.querySelector("[data-trick-departing-stage='collecting']")).not.toBeNull();
      surfaces.forEach(finish);
    }
    expect(visited).toEqual(["ordered:2:1", "ordered:2:2", "ordered:2:3"]);
    expect(view.container.querySelector("[data-trick-presentation-id]")).toBeNull();
  });
  it("deal resumes after blur with same-key polling; cancelled stage never acknowledges", () => {
    const complete = vi.fn(); const active = vi.fn(); const projection = snapshot();
    const view = render(<DealPresentation projection={projection} geometry={geometry} onPresentationComplete={complete} onActiveChange={active} />);
    tick(500); fireEvent.blur(window); tick(5000); expect(complete).not.toHaveBeenCalled();
    view.rerender(<DealPresentation projection={{ ...projection }} geometry={geometry} onPresentationComplete={complete} onActiveChange={active} />);
    fireEvent.focus(window); tick(2320); expect(complete).toHaveBeenCalledTimes(1);
    fireEvent.blur(window); fireEvent.focus(window); tick(5000); expect(complete).toHaveBeenCalledTimes(1);
  });
  it("server fallback phase change clears an interrupted nine-card overlay", () => {
    const complete = vi.fn(); const active = vi.fn(); const projection = snapshot(); projection.progression.cardsPerPlayer = 9; projection.progression.phase = "NINE_CARD_INITIAL_DEAL_ALL_SEATS";
    const view = render(<DealPresentation projection={projection} geometry={geometry} onPresentationComplete={complete} onActiveChange={active} />);
    tick(500);
    view.rerender(<DealPresentation projection={{ ...projection, progression: { ...projection.progression, phase: "NINE_CARD_TRUMP_CHOICE" } }} geometry={geometry} onPresentationComplete={complete} onActiveChange={active} />);
    tick(10000); expect(complete).not.toHaveBeenCalled(); expect(active).toHaveBeenLastCalledWith(false); expect(view.container.childElementCount).toBe(0);
  });
  it("dealer resumes after blur without a projection-key change", () => {
    const projection = snapshot(); projection.initialDealerSelection = { status: "resolved", firstRecipientSeat: 0, selectedDealerSeat: 0, revealedSelectionCards: [trick(1).cards[0]!.card], resolvedAtStateVersion: 1 };
    const active = vi.fn(); render(<DealerSelectionPresentation projection={projection} geometry={geometry} onActiveChange={active} />);
    tick(32); tick(500); fireEvent.blur(window); tick(5000); expect(active).toHaveBeenLastCalledWith(true);
    fireEvent.focus(window); tick(32); tick(1700); expect(active).toHaveBeenLastCalledWith(false);
  });
});
