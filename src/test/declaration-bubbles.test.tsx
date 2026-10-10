import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDeclarationBubbles } from "@/components/table/useDeclarationBubbles";
import { TableSeat } from "@/components/table/TableSeat";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import { projectGameForSeat } from "@/domain/projection";
import type { Seat } from "@/domain/players";

const projection = () => {
  const p = projectGameForSeat(reconciliationFixture(), 0);
  p.declarations.values = [null, null, null, null];
  return p;
};
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("announces all newly observed public bids, including the last bid entering play", () => {
  const p = projection();
  const view = renderHook(({ p }) => useDeclarationBubbles(p, null), { initialProps: { p } });
  expect(view.result.current).toEqual({});
  const accepted = { ...p, progression: { ...p.progression, phase: "CARD_PLAY" as const }, declarations: { ...p.declarations, values: [0, 1, 4, 9] as typeof p.declarations.values } };
  view.rerender({ p: accepted });
  expect([0, 1, 2, 3].map(seat => view.result.current[seat]?.value)).toEqual([0, 1, 4, 9]);
  tick(1500);
  view.rerender({ p: structuredClone(accepted) });
  tick(499); expect(Object.keys(view.result.current)).toHaveLength(4);
  tick(1); expect(view.result.current).toEqual({});
  view.rerender({ p: structuredClone(accepted) });
  expect(view.result.current).toEqual({});
});

it("announces local tap immediately and acceptance does not restart its two seconds", () => {
  const p = projection();
  const view = renderHook(({ p, pending }) => useDeclarationBubbles(p, pending), { initialProps: { p, pending: null as number | null } });
  view.rerender({ p, pending: 0 });
  expect(view.result.current[0]?.value).toBe(0);
  tick(1500);
  view.rerender({ p: { ...p, declarations: { ...p.declarations, values: [0, null, null, null] } }, pending: null });
  tick(500); expect(view.result.current).toEqual({});
});

it("removes a rejected local bid and allows a later retry", () => {
  const p = projection();
  const view = renderHook(({ pending }) => useDeclarationBubbles(p, pending), { initialProps: { pending: null as number | null } });
  view.rerender({ pending: 3 }); expect(view.result.current[0]?.value).toBe(3);
  view.rerender({ pending: null }); expect(view.result.current).toEqual({});
  view.rerender({ pending: 3 }); expect(view.result.current[0]?.value).toBe(3);
});

it("expires each seat independently without idle loops or historical replay on reconnect", () => {
  const p = projection(); p.declarations.values[1] = 2;
  const view = renderHook(({ p }) => useDeclarationBubbles(p, null), { initialProps: { p } });
  expect(view.result.current).toEqual({});
  expect(vi.getTimerCount()).toBe(0);
  const first = { ...p, declarations: { ...p.declarations, values: [null, 2, 3, null] as typeof p.declarations.values } };
  view.rerender({ p: first }); tick(500);
  view.rerender({ p: { ...first, declarations: { ...first.declarations, values: [null, 2, 3, 4] } } });
  tick(1500); expect(view.result.current[2]).toBeUndefined(); expect(view.result.current[3]?.value).toBe(4);
  tick(500); expect(view.result.current).toEqual({}); expect(vi.getTimerCount()).toBe(0);
  view.rerender({ p: { ...p, progression: { ...p.progression, dealNumber: p.progression.dealNumber + 1 } } });
  expect(view.result.current).toEqual({});
});

it("clears announcements at game/deal changes and renders a dash for zero at every seat", () => {
  const p = projection();
  const view = renderHook(({ p }) => useDeclarationBubbles(p, null), { initialProps: { p } });
  view.rerender({ p: { ...p, declarations: { ...p.declarations, values: [1, null, null, null] } } });
  expect(view.result.current[0]?.value).toBe(1);
  view.rerender({ p: { ...p, gameId: "another-game" } }); expect(view.result.current).toEqual({});
  const seat = { index: 0, occupant: { type: "bot", bot: { id: "test", displayName: "Bot" } } } as Seat;
  for (const visualSeat of [0, 1, 2, 3] as const) {
    const card = render(<TableSeat seat={seat} visualSeat={visualSeat} local={visualSeat === 0} orientation="vertical" declarationBubble={0} stats={{ totalScore: 0, declaration: 0, tricksTaken: 0, isActive: false, isDealer: false, cardCount: 0 }} />);
    expect(card.getByRole("status")).toHaveTextContent("—");
    expect(card.getByRole("status")).toHaveAttribute("aria-label", "Δήλωση: Πάσο");
    card.unmount();
  }
});
