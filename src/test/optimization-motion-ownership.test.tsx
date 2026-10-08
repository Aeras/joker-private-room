import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { LocalFlightCard } from "@/components/table/LocalFlightCard";
import { TrickPresentation } from "@/components/table/TrickPresentation";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { LocalPlayPresentation } from "@/components/table/localPlayPresentation";
import type { PlayerGameProjection } from "@/domain/projection";
import type { PlayedCard } from "@/domain/engine";

vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({ useCriticalCardArtwork: () => true }));
const rect = { left: 40, top: 40, right: 760, bottom: 290, width: 720, height: 250 };
const geometry = { ...computeTableGeometry({ feltRect: rect, viewportWidth: 800, viewportHeight: 400 }), epoch: 1 };
const cards: PlayedCard[] = [0, 1, 2, 3].map((seatIndex) => ({ seatIndex: seatIndex as 0 | 1 | 2 | 3, card: { kind: "standard", id: "card" + seatIndex, suit: "hearts", rank: "A" } }));
const token: LocalPlayPresentation = { gameId: "g", dealNumber: 2, actorSeat: 3, card: cards[3]!.card, cardId: "card3", sourceStateVersion: 1, acceptedStateVersion: null, geometryEpoch: 1, releaseRect: { ...rect, width: 60, height: 88 }, status: "submitted" };
function finish(element: Element) {
  if (element.closest('[data-trick-departing-stage="stacking"]') && (element as HTMLElement).style.animationName !== "none") { const animation = new Event("animationend", { bubbles: true }); Object.defineProperty(animation, "animationName", { value: (element as HTMLElement).style.animationName }); fireEvent(element, animation); return; } const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: "transform" });
  fireEvent(element, event);
}
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 16)); vi.stubGlobal("cancelAnimationFrame", window.clearTimeout); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("local motion ownership", () => {
  it.each([0, 50, 250, 600, 1500])("acceptance at %i ms does not relaunch or clear before landing", (delay) => {
    const done = vi.fn();
    const props = { geometry, viewerSeat: 0, reducedMotion: false, onSettled: done };
    const view = render(<LocalFlightCard {...props} presentation={token} />);
    tick(16);
    const flight = view.container.querySelector<HTMLElement>("[data-local-flight-card]")!;
    const pose = flight.style.transform;
    if (delay >= 300) { tick(300); finish(flight); expect(done).not.toHaveBeenCalled(); tick(delay - 300); }
    else tick(delay);
    view.rerender(<LocalFlightCard {...props} presentation={{ ...token, status: "accepted", acceptedStateVersion: 2 }} />);
    expect(flight.style.transform).toBe(pose);
    if (delay < 300) { expect(done).not.toHaveBeenCalled(); tick(300 - delay); finish(flight); }
    expect(done).toHaveBeenCalledTimes(1);
    tick(1000); expect(done).toHaveBeenCalledTimes(1);
  });
  it("rejection owns a return transition and has a bounded fallback", () => {
    const done = vi.fn(); const props = { geometry, viewerSeat: 0, reducedMotion: false, onSettled: done };
    const view = render(<LocalFlightCard {...props} presentation={token} />);
    tick(66);
    view.rerender(<LocalFlightCard {...props} presentation={{ ...token, status: "rejected" }} />);
    expect(done).not.toHaveBeenCalled(); tick(299); expect(done).not.toHaveBeenCalled();
    finish(view.container.querySelector("[data-local-flight-card]")!); expect(done).toHaveBeenCalledTimes(1);
    tick(1000); expect(done).toHaveBeenCalledTimes(1);
  });
  it("local fourth card lands before hold; flip and collection await all card completions", () => {
    const initial = { gameId: "g", viewerSeat: 0, progression: { dealNumber: 2 }, cards: { currentTrick: cards.slice(0, 3), completedTricks: [] } } as unknown as PlayerGameProjection;
    function Harness({ projection }: { projection: PlayerGameProjection }) {
      const [flight, setFlight] = useState<LocalPlayPresentation | null>({ ...token, status: "accepted", acceptedStateVersion: 2 });
      return <TrickPresentation projection={projection} geometry={geometry} localPlayPresentation={flight} onLocalFlightSettled={() => setFlight(null)} />;
    }
    const view = render(<Harness projection={initial} />); tick(16);
    view.rerender(<Harness projection={{ ...initial, cards: { ...initial.cards, currentTrick: [], completedTricks: [{ cards, winnerSeat: 1 }] } }} />);
    expect(view.container.querySelector('[data-trick-departing-stage="holding"]')).toBeNull();
    const flight = view.container.querySelector("[data-local-flight-card]")!; tick(300); finish(flight);
    expect(view.container.querySelector('[data-trick-departing-stage="holding"]')).not.toBeNull();
    const root = view.container.querySelector("[data-trick-presentation-id]")!;
    const localCanonical = root.lastElementChild as HTMLElement;
    expect(localCanonical.style.transform).toContain("scale(1)"); // No second seat-origin entry.
    tick(850);
    expect(root.getAttribute("data-trick-departing-stage")).toBe("stacking");
    const surfaces = Array.from(root.children).filter(el => (el as HTMLElement).style.transitionDuration);
    expect(surfaces).toHaveLength(4);
    expect(surfaces.every(el => (el as HTMLElement).style.transitionDuration === "400ms")).toBe(true);
    surfaces.slice(0, 3).forEach(finish); expect(root.getAttribute("data-trick-departing-stage")).toBe("stacking");
    finish(surfaces[3]!); expect(root.getAttribute("data-trick-departing-stage")).toBe("collecting");
    expect(surfaces.every(el => (el as HTMLElement).style.transitionDuration === "600ms, 120ms")).toBe(true);
    expect(surfaces.every(el => (el as HTMLElement).style.transitionTimingFunction === "linear")).toBe(true);
    surfaces.slice(0, 3).forEach(finish); expect(root.isConnected).toBe(true);
    finish(surfaces[3]!); expect(view.container.querySelector("[data-trick-presentation-id]")).toBeNull();
  });
});

