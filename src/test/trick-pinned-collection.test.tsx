import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrickPresentation } from "@/components/table/TrickPresentation";
import { pinnedStackPose, trickExitPoint } from "@/components/table/trickCollectionMotion";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { PlayerGameProjection } from "@/domain/projection";
import type { SeatIndex } from "@/domain/dealing";
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({ useCriticalCardArtwork: () => true }));
const geometry = { ...computeTableGeometry({ feltRect: { left: 40, top: 40, right: 760, bottom: 290, width: 720, height: 250 }, viewportWidth: 800, viewportHeight: 400 }), epoch: 1 };
const cards = [0, 1, 2, 3].map(seatIndex => ({ seatIndex, card: { id: `pin-${seatIndex}`, kind: "standard", suit: "spades", rank: "A" } }));
function snapshot(winnerSeat?: SeatIndex) { return { gameId: "pin", viewerSeat: 0, progression: { dealNumber: 2 }, cards: { currentTrick: winnerSeat == null ? cards : [], completedTricks: winnerSeat == null ? [] : [{ cards, winnerSeat }] } } as unknown as PlayerGameProjection; }
function animateDone(el: HTMLElement) { const event = new Event("animationend", { bubbles: true }); Object.defineProperty(event, "animationName", { value: el.style.animationName }); fireEvent(el, event); }
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("pinned trick collection", () => {
  it.each([0, 1, 2, 3] as const)("keeps winner %i stationary and overlap unchanged, then exits only after all three swings", winner => {
    const collected = vi.fn(); const props = { geometry, localPlayPresentation: null, onLocalFlightSettled: vi.fn(), onCollectionComplete: collected };
    const view = render(<TrickPresentation {...props} projection={snapshot()} />);
    const surfaces = Array.from(view.container.querySelectorAll<HTMLElement>("[data-trick-seat]"));
    const pose = surfaces[winner]!.style.transform; const layers = surfaces.map(el => el.className);
    view.rerender(<TrickPresentation {...props} projection={snapshot(winner)} />);
    expect(surfaces.map(el => el.className)).toEqual(layers); expect(surfaces[winner]!.style.transform).toBe(pose);
    act(() => vi.advanceTimersByTime(850));
    expect(surfaces[winner]!.style.transform).toBe(pose); expect(surfaces[winner]!.style.animationName).toBe("none");
    const moving = surfaces.filter((_, seat) => seat !== winner);
    expect(moving.every(el => el.querySelector("style")?.textContent?.includes("50%{transform:"))).toBe(true);
    const beforeResize = surfaces.map(el => el.style.transform);
    view.rerender(<TrickPresentation {...props} geometry={{ ...geometry, epoch: 2, usableCenter: { x: 20, y: 20 } }} projection={snapshot(winner)} />);
    expect(surfaces.map(el => el.style.transform)).toEqual(beforeResize);
    moving.slice(0, 2).forEach(animateDone); expect(view.container.querySelector('[data-trick-departing-stage="collecting"]')).toBeNull();
    animateDone(moving[2]!); expect(surfaces.every(el => el.dataset['trickCollecting'] === "true")).toBe(true);
    expect(surfaces.map(el => el.className)).toEqual(layers); expect(collected).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(600 + 120)); expect(collected).toHaveBeenCalledOnce();
  });
  it("starts at each exact landing, aligns at the winner and exits past each screen edge", () => {
    for (const winner of [0, 1, 2, 3] as const) {
      const target = geometry.trickSlots[winner];
      for (const pos of [0, 1, 2, 3] as const) {
        const start = geometry.trickSlots[pos];
        const first = pinnedStackPose(start, target, pos, winner, geometry.trickCardSize.height, 0);
        const last = pinnedStackPose(start, target, pos, winner, geometry.trickCardSize.height, 1);
        expect(first.point.x).toBeCloseTo(start.x); expect(first.point.y).toBeCloseTo(start.y);
        expect(last.point.x).toBeCloseTo(target.x); expect(last.point.y).toBeCloseTo(target.y);
        if (pos === winner) expect(pinnedStackPose(start, target, pos, winner, geometry.trickCardSize.height, .5).point).toEqual(target);
      }
      const exit = trickExitPoint(target, winner, geometry);
      if (winner === 0) { expect(exit.x).toBe(target.x); expect(exit.y + 40).toBeGreaterThan(400); }
      if (winner === 2) { expect(exit.x).toBe(target.x); expect(exit.y + 40).toBeLessThan(0); }
      if (winner === 1) { expect(exit.y).toBe(target.y); expect(exit.x + 40).toBeLessThan(0); }
      if (winner === 3) { expect(exit.y).toBe(target.y); expect(exit.x + 40).toBeGreaterThan(800); }
    }
  });
});
