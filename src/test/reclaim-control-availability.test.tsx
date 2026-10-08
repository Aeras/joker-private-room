import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameTable } from "@/components/table/GameTable";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import type { Room } from "@/domain/players";

const presentation = vi.hoisted(() => ({ dealer: false, deal: false, trick: false, decoded: true }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({ useCriticalCardArtwork: () => presentation.decoded }));
vi.mock("@/components/table/DealerSelectionPresentation", () => ({ DealerSelectionPresentation: ({ onActiveChange }: { onActiveChange: (active: boolean) => void }) => { useEffect(() => onActiveChange(presentation.dealer), [onActiveChange]); return null; } }));
vi.mock("@/components/table/DealPresentation", () => ({ DealPresentation: ({ onActiveChange }: { onActiveChange: (active: boolean) => void }) => { useEffect(() => onActiveChange(presentation.deal), [onActiveChange]); return null; } }));
vi.mock("@/components/table/TrickPresentation", () => ({ TrickPresentation: ({ onBusyChange }: { onBusyChange: (active: boolean) => void }) => { useEffect(() => onBusyChange(presentation.trick), [onBusyChange]); return null; } }));
vi.mock("@/components/table/Scoreboard", () => ({ Scoreboard: () => null }));
vi.mock("@/components/table/SoundToggle", () => ({ SoundToggle: () => null }));
vi.mock("@/components/table/TableUtilityMenu", () => ({ TableUtilityMenu: () => null }));
vi.mock("@/components/table/useTableGeometry", async importOriginal => {
  const module = await importOriginal<typeof import("@/components/table/useTableGeometry")>();
  return { ...module, useTableGeometry: () => ({ geometry: null }) };
});

function fixture() {
  const state = reconciliationFixture();
  state.seats[0].owner = { type: "human", playerId: "returning-player" }; state.seats[0].controller = "temporary_bot";
  state.seats[0].reclaimable = true;
  const projection = projectGameForSeat(state, 0);
  const room = { code: "TEST", hostId: "host", seats: state.seats.map((_, index) => ({ index, occupant: { type: "bot", bot: { id: String(index), displayName: `Seat ${index}` } } })) } as Room;
  return { room, projection, busy: false, error: null, onCommand: vi.fn(), onReclaim: vi.fn(async () => {}), onEndGame: vi.fn(), onNineCardPresentationComplete: vi.fn() };
}
beforeEach(() => { Object.assign(presentation, { dealer: false, deal: false, trick: false, decoded: true }); });
afterEach(cleanup);

describe("control recovery is independent from card interaction barriers", () => {
  it.each(["dealer", "deal", "trick", "decoded"] as const)("keeps recovery available during %s presentation/readiness", stage => {
    presentation[stage] = stage !== "decoded";
    const props = fixture();
    const view = render(<GameTable {...props} />);
    const button = screen.getByRole("button", { name: "Πάρε ξανά τον έλεγχο" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(props.onReclaim).toHaveBeenCalledTimes(1);
    // Same-key bot polling does not hide the recovery control.
    view.rerender(<GameTable {...props} projection={{ ...props.projection, stateVersion: props.projection.stateVersion + 1 }} />);
    expect(screen.getByRole("button", { name: "Πάρε ξανά τον έλεγχο" })).toBe(button);
  });
  it("keeps a pending request visible and disabled, then removes it after authority confirms recovery", () => {
    const props = fixture();
    const view = render(<GameTable {...props} busy />);
    const button = screen.getByRole("button", { name: "Πάρε ξανά τον έλεγχο" });
    expect(button).toBeDisabled(); fireEvent.click(button); expect(props.onReclaim).not.toHaveBeenCalled();
    view.rerender(<GameTable {...props} projection={{ ...props.projection, local: { ...props.projection.local, reclaimAvailable: false } }} />);
    expect(screen.queryByRole("button", { name: "Πάρε ξανά τον έλεγχο" })).toBeNull();
  });
  it("does not offer recovery for a terminal game even if the last local flag remains true", () => {
    const props = fixture(); props.projection.lifecycle = "complete";
    render(<GameTable {...props} />);
    expect(screen.queryByRole("button", { name: "Πάρε ξανά τον έλεγχο" })).toBeNull();
  });
});
