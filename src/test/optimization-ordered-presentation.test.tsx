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
function finish(el: Element | undefined) { if (!el) throw new Error("Missing motion surface"); const event = new Event("transitionend", { bubbles: true }); Object.defineProperty(event, "propertyName", { value: "transform" }); fireEvent(el, event); }
beforeEach(() => { vi.useFakeTimers(); sessionStorage.clear(); vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 16)); vi.stubGlobal("cancelAnimationFrame", window.clearTimeout); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("ordered public trick journal", () => {
  it("does not acknowledge a fourth-card boundary during landing, hold, flip or collection", async () => {
    const collected = vi.fn();
    const ready = vi.fn(async () => true);
    const props = { geometry, localPlayPresentation: null, onLocalFlightSettled: vi.fn(), onPresentationReady: ready, onCollectionComplete: collected };
    const view = render(<TrickPresentation {...props} projection={snapshot()} />);
    const projection = snapshot(1); projection.timing = { currentHumanDeadline: null, turnPresentation: { token: 10, requiredSeats: [0], completedSeats: [], fallbackAt: "2026-10-06T00:00:30.000Z" } };
    view.rerender(<TrickPresentation {...props} projection={projection} />);
    for (let card = 0; card < 4; card++) { tick(card ? 1000 : 0); tick(16); const surfaces = Array.from(view.container.querySelector("[data-trick-presentation-id]")!.children).filter(el => (el as HTMLElement).style.transitionDuration); finish(surfaces.at(-1)!); }
    expect(ready).not.toHaveBeenCalled(); tick(850); expect(ready).not.toHaveBeenCalled();
    const surfaces = Array.from(view.container.querySelector("[data-trick-presentation-id]")!.children).filter(el => (el as HTMLElement).style.transitionDuration);
    surfaces.forEach(finish); expect(ready).not.toHaveBeenCalled(); expect(collected).not.toHaveBeenCalled();
    fireEvent.blur(window); surfaces.forEach(finish); expect(ready).not.toHaveBeenCalled(); fireEvent.focus(window);
    surfaces.slice(0, 3).forEach(finish); expect(collected).not.toHaveBeenCalled();
    finish(surfaces[3]); expect(collected).toHaveBeenCalledOnce();
    surfaces.forEach(finish); expect(collected).toHaveBeenCalledOnce(); await act(async () => {}); expect(ready).toHaveBeenCalledExactlyOnceWith(10);
    view.rerender(<TrickPresentation {...props} geometry={{ ...geometry, epoch: 7 }} projection={{ ...projection }} />); tick(2000); expect(ready).toHaveBeenCalledTimes(1);
  });
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
  it.each([
    [0, "0deg"],
    [1, "90deg"],
    [2, "180deg"],
    [3, "-90deg"],
  ] as const)("anchors the dealer deck at visual seat %i and points its top toward table center", (dealerSeat, rotation) => {
    const projection = snapshot();
    projection.gameId = `dealer-origin-${dealerSeat}`;
    projection.progression.dealerSeat = dealerSeat;
    const view = render(<DealPresentation projection={projection} geometry={geometry} />);
    const stack = view.container.querySelector<HTMLElement>("[data-dealer-deck-stack]");
    expect(stack).not.toBeNull();
    expect(stack?.getAttribute("data-dealer-pos")).toBe(String(dealerSeat));
    expect(stack?.style.transform).toContain(`rotate(${rotation})`);
    expect(view.container.querySelector("[data-deal-geometry-epoch]")?.getAttribute("data-dealer-visual-pos")).toBe(String(dealerSeat));
  });

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
    tick(3000); expect(complete).toHaveBeenCalledOnce();
  });
  it.each([["NINE_CARD_INITIAL_DEAL_ALL_SEATS", 12, 4200], ["NINE_CARD_REMAINING_DEAL", 24, 10200]] as const)("%s presents %i backs without private identities", (phase, count, elapsed) => {
    const projection = snapshot(); projection.gameId = `private-stage-${phase}`; projection.progression.phase = phase; projection.progression.cardsPerPlayer = 9;
    const complete = vi.fn(); const view = render(<DealPresentation projection={projection} geometry={geometry} onPresentationComplete={complete} />);
    tick(elapsed);
    expect(view.container.querySelectorAll("[data-deal-traveling-card]")).toHaveLength(count);
    expect(view.container.querySelectorAll('img[alt]:not([alt=""])')).toHaveLength(0);
    expect(complete).not.toHaveBeenCalled(); tick(1600); expect(complete).toHaveBeenCalledOnce();
  });
  it("retains every back throughout settling and clears only after settle and tail", () => {
    const complete = vi.fn(); const settling = vi.fn(); const projection = snapshot();
    projection.gameId = "settle-retention";
    const view = render(<DealPresentation projection={projection} geometry={geometry} onSettlingChange={settling} onPresentationComplete={complete} />);
    tick(1050); tick(16); tick(291);
    expect(settling).not.toHaveBeenCalledWith(true);
    expect(view.container.querySelectorAll("[data-deal-traveling-card]")).toHaveLength(4);
    const cardsBeforeSettle = view.container.querySelectorAll<HTMLElement>("[data-deal-traveling-card]");
    const oldTransforms = Array.from(cardsBeforeSettle, card => card.style.transform);
    expect(Array.from(cardsBeforeSettle, card => card.style.opacity)).toEqual(["1", "1", "1", "1"]);
    tick(1);
    expect(settling).not.toHaveBeenCalledWith(true);
    expect(view.container.querySelector('[data-deal-settling="true"]')).not.toBeNull();
    const localCard = view.container.querySelector<HTMLElement>("[data-deal-handoff='local']");
    expect(localCard).not.toBeNull();
    expect(localCard?.style.transitionDuration).toBe("1000ms, 250ms");
    expect(localCard?.style.transitionDelay).toBe("0ms, 1000ms");
    // The target center must reach the 400px viewport bottom, not the
    // measured felt bottom (290px). This catches the formerly 1vh path.
    expect(localCard?.style.transform).toContain(`calc(-50% + ${400 - Number.parseFloat(localCard!.style.top)}px)`);
    expect(Array.from(cardsBeforeSettle, card => card.style.opacity)).toEqual(["0", "0", "0", "0"]);
    expect(new Set(Array.from(cardsBeforeSettle, card => card.dataset['dealVisualSeat']))).toEqual(new Set(["0", "1", "2", "3"]));
    expect(view.container.querySelector<HTMLElement>("[data-dealer-deck-stack]")?.style.opacity).toBe("0");
    view.rerender(<DealPresentation projection={{ ...projection }} geometry={{ ...geometry, epoch: 2 }} onSettlingChange={settling} onPresentationComplete={complete} />);
    expect(Array.from(view.container.querySelectorAll("[data-deal-traveling-card]"))).toEqual(Array.from(cardsBeforeSettle));
    expect(localCard?.style.transitionTimingFunction).toBe("linear");
    expect(Array.from(view.container.querySelectorAll<HTMLElement>("[data-deal-traveling-card]")).some((card, index) => card.style.transform !== oldTransforms[index])).toBe(true);
    tick(999); expect(settling).not.toHaveBeenCalledWith(true);
    tick(1); expect(settling).toHaveBeenLastCalledWith(true);
    tick(249);
    expect(complete).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll("[data-deal-traveling-card]")).toHaveLength(4);
    tick(72); expect(complete).not.toHaveBeenCalled();
    tick(1); expect(complete).toHaveBeenCalledOnce();
    expect(settling).toHaveBeenLastCalledWith(false);
    expect(view.container.childElementCount).toBe(0);
  });
  it("keeps the first dealt piles across startup release until the canonical hand arrives", () => {
    const complete = vi.fn(); const settling = vi.fn(); const sequenceComplete = vi.fn();
    const projection = snapshot(); projection.gameId = "first-hand-wait"; projection.lifecycle = "starting";
    projection.cards.ownHandVisible = false; projection.cards.ownHand = [];
    const props = {geometry, onPresentationComplete: complete, onSettlingChange: settling, onSequenceComplete: sequenceComplete};
    const view = render(<DealPresentation {...props} projection={projection} />);
    tick(1358); expect(sequenceComplete).toHaveBeenCalledOnce(); expect(complete).toHaveBeenCalledTimes(1);
    expect(settling).not.toHaveBeenCalledWith(true);
    const backs = Array.from(view.container.querySelectorAll<HTMLElement>("[data-deal-traveling-card]"));
    expect(backs).toHaveLength(4); tick(2000);
    expect(backs.every(back => back.style.opacity === "1")).toBe(true);
    const next = {...projection, lifecycle: "active" as const, progression: {...projection.progression, phase: "DEAL_PRESENTATION" as const}, cards: {...projection.cards, ownHandVisible:true, ownHand:[{kind:"standard" as const,id:"own",suit:"hearts" as const,rank:"A" as const}]}};
    view.rerender(<DealPresentation {...props} projection={next} />);
    expect(settling).not.toHaveBeenCalledWith(true);
    expect(Array.from(view.container.querySelectorAll("[data-deal-traveling-card]"))).toEqual(backs);
    expect(backs.every(back => back.style.opacity === "0")).toBe(true);
    view.rerender(<DealPresentation {...props} projection={{...next}} geometry={{...geometry,epoch:3}} />);
    tick(1000); expect(settling).toHaveBeenLastCalledWith(true);
    tick(321); expect(complete).toHaveBeenCalledTimes(1);
    tick(1); expect(complete).toHaveBeenCalledTimes(2); expect(sequenceComplete).toHaveBeenCalledOnce();
    expect(view.container.childElementCount).toBe(0);
  });
  it("interrupting settle cancels completion and resets settling before replay", () => {
    const complete = vi.fn(); const settling = vi.fn(); const projection = snapshot(); projection.gameId = "settle-interrupt";
    render(<DealPresentation projection={projection} geometry={geometry} onSettlingChange={settling} onPresentationComplete={complete} />);
    tick(2358); expect(settling).toHaveBeenLastCalledWith(true);
    fireEvent.blur(window); expect(settling).toHaveBeenLastCalledWith(false);
    tick(5000); expect(complete).not.toHaveBeenCalled();
    fireEvent.focus(window); tick(3000); expect(complete).toHaveBeenCalledOnce();
  });
  it("already-dealt first hand acknowledges reveal scope without replaying the deal", () => {
    const complete = vi.fn(); const projection = snapshot(); projection.gameId = "firststage-reveal";
    const view = render(<DealPresentation projection={projection} geometry={geometry} onPresentationComplete={complete} />);
    tick(3000); expect(complete).toHaveBeenCalledTimes(1);
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
      const collectingSurface = root.querySelector<HTMLElement>("[data-trick-collecting='true']");
      expect(collectingSurface?.style.transitionDuration).toBe("520ms");
      expect(collectingSurface?.style.transitionTimingFunction).toBe("cubic-bezier(0.22, 0.8, 0.24, 1)");
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
    fireEvent.focus(window); tick(3000); expect(complete).toHaveBeenCalledTimes(1);
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
