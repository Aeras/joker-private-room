import { useEffect } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameTable } from "@/components/table/GameTable";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import type { Room } from "@/domain/players";
const artwork = vi.hoisted(() => ({ settled: false }));
const deal = vi.hoisted(() => ({ settling: false }));
vi.mock("@/components/table/useCriticalCardArtwork", () => ({ useCriticalCardArtwork: () => artwork.settled }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/components/table/DealerSelectionPresentation", () => ({ DealerSelectionPresentation: () => null }));
vi.mock("@/components/table/DealPresentation", () => ({ DealPresentation: ({ onPresentationComplete, onSettlingChange }: { onPresentationComplete: (stage: string) => void; onSettlingChange: (value: boolean) => void }) => { useEffect(() => { onSettlingChange(deal.settling); if (!deal.settling) onPresentationComplete("full"); }, [onPresentationComplete, onSettlingChange, deal.settling]); return null; } }));
vi.mock("@/components/table/TrickPresentation", () => ({ TrickPresentation: () => null }));
vi.mock("@/components/table/TableSeat", () => ({ TableSeat: ({ local, stats }: { local: boolean; stats: { declaration: number | null } }) => local ? <div data-local-declaration={stats.declaration ?? "none"} /> : null }));
vi.mock("@/components/table/Scoreboard", () => ({ Scoreboard: () => null }));
vi.mock("@/components/table/SoundToggle", () => ({ SoundToggle: () => null }));
vi.mock("@/components/table/TableUtilityMenu", () => ({ TableUtilityMenu: () => null }));
vi.mock("@/components/table/LocalHandRow", () => ({ LocalHandRow: ({ visible, revealing, blocked }: { visible: boolean; revealing: boolean; blocked: boolean }) => <div data-hand-ready={visible} data-blocked={blocked} data-revealing={revealing} /> }));
afterEach(() => { cleanup(); deal.settling = false; vi.useRealTimers(); });
describe("hand artwork and acknowledgement integration", () => {
  it("waits for immediate decoded/fallback readiness, then reveal; polling does not restart ack", () => {
    vi.useFakeTimers(); artwork.settled = false;
    const state = reconciliationFixture(); state.progression.dealNumber = 2; state.progression.phase = "DEAL_PRESENTATION"; state.progression.currentActorSeat = null;
    const projection = projectGameForSeat(state, 0); projection.initialDealerSelection = { status: "pending" } as typeof projection.initialDealerSelection;
    const room = { code: "TEST", hostId: "host", seats: state.seats.map((seat, index) => ({ index, occupant: { type: "bot", bot: { id: String(index), displayName: String(index) } } })) } as Room;
    const ack = vi.fn().mockResolvedValue(projection); const props = { room, projection, busy: false, error: null, onCommand: vi.fn(), onReclaim: vi.fn(), onEndGame: vi.fn(), onNineCardPresentationComplete: ack };
    const view = render(<GameTable {...props} />);
    act(() => vi.advanceTimersByTime(10000)); expect(ack).not.toHaveBeenCalled(); expect(view.container.querySelector('[data-hand-ready="false"]')).not.toBeNull();
    artwork.settled = true; view.rerender(<GameTable {...props} />);
    expect(view.container.querySelector('[data-revealing="false"]')).not.toBeNull();
    expect(view.container.querySelector('[data-hand-ready="false"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(40)); expect(ack).toHaveBeenCalledOnce(); expect(ack).toHaveBeenCalledWith("full", 2);
    const interactiveProjection = { ...projection, progression: { ...projection.progression, phase: "DECLARATION" as const } };
    view.rerender(<GameTable {...props} projection={interactiveProjection} />);
    expect(view.container.querySelector('[data-revealing="true"]')).not.toBeNull();
    expect(view.container.querySelector('[data-hand-ready="true"]')).not.toBeNull();
  });
});

function tableFixture() {
  const state = reconciliationFixture(); state.progression.phase = "DECLARATION";
  const projection = projectGameForSeat(state, 0);
  projection.initialDealerSelection = { status: "pending" } as typeof projection.initialDealerSelection;
  projection.local.legalActions = [{ type: "declare", values: [0, 1, 2] }];
  projection.declarations.values[0] = null;
  const room = { code: "TEST", hostId: "host", seats: state.seats.map((_, index) => ({ index, occupant: { type: "bot", bot: { id: String(index), displayName: String(index) } } })) } as Room;
  return { room, projection, busy: false, error: null, onReclaim: vi.fn(), onEndGame: vi.fn(), onNineCardPresentationComplete: vi.fn(), onCommand: vi.fn() };
}
describe("settle reveal and optimistic declaration feedback", () => {
  it("shows available authoritative hand during settle but keeps input blocked", () => {
    vi.useFakeTimers(); artwork.settled = true; deal.settling = true;
    const props = tableFixture(); props.projection.progression.phase = "DEAL_PRESENTATION";
    const view = render(<GameTable {...props} />);
    expect(view.container.querySelector('[data-hand-ready="true"][data-blocked="true"][data-revealing="true"]')).not.toBeNull();
    expect(props.onNineCardPresentationComplete).not.toHaveBeenCalled();
  });
  it("does not release the deal barrier while the overlapping hand rise is still active", () => {
    vi.useFakeTimers(); artwork.settled = true; deal.settling = true;
    const props = tableFixture(); props.projection.progression.phase = "DEAL_PRESENTATION";
    const view = render(<GameTable {...props} />);
    act(() => vi.advanceTimersByTime(592));
    deal.settling = false;
    view.rerender(<GameTable {...props} projection={{...props.projection}} />);
    act(() => vi.advanceTimersByTime(40));
    expect(props.onNineCardPresentationComplete).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-revealing="true"][data-blocked="true"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(28));
    expect(props.onNineCardPresentationComplete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(40));
    expect(props.onNineCardPresentationComplete).toHaveBeenCalledExactlyOnceWith("full", props.projection.progression.dealNumber);
    view.rerender(<GameTable {...props} projection={{...props.projection, stateVersion: props.projection.stateVersion+1}} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(props.onNineCardPresentationComplete).toHaveBeenCalledTimes(1);
  });
  it.each(["null", "throw"])("immediately displays declaration and closes picker, then rolls back on %s", async failure => {
    vi.useFakeTimers(); artwork.settled = true;
    const props = tableFixture(); let reject: ((error: Error) => void) | undefined; let resolve: ((value: null) => void) | undefined;
    props.onCommand.mockImplementation(() => new Promise<null>((yes, no) => { resolve = yes; reject = no; }));
    const view = render(<GameTable {...props} />); act(() => vi.advanceTimersByTime(660));
    fireEvent.click(view.getByRole("button", { name: "Δήλωση 2" }));
    expect(props.onCommand).toHaveBeenCalledWith({ type: "declare", value: 2 });
    expect(view.container.querySelector('[data-local-declaration="2"]')).not.toBeNull();
    expect(view.queryByRole("button", { name: "Δήλωση 2" })).toBeNull();
    expect(view.queryByText("Η δήλωση καταχωρείται…")).toBeNull();
    await act(async () => { if (failure === "null") resolve?.(null); else reject?.(new Error("failed")); });
    expect(view.container.querySelector('[data-local-declaration="none"]')).not.toBeNull();
    expect(view.getByRole("button", { name: "Δήλωση 2" })).not.toBeNull();
  });
  it.each(["matching", "action removed"])("reconciles optimism when authoritative %s arrives", async mode => {
    vi.useFakeTimers(); artwork.settled = true;
    const props = tableFixture(); props.onCommand.mockReturnValue(new Promise(() => {}));
    const view = render(<GameTable {...props} />); act(() => vi.advanceTimersByTime(660));
    fireEvent.click(view.getByRole("button", { name: "Δήλωση 2" }));
    const next = { ...props.projection, stateVersion: props.projection.stateVersion + 1, declarations: { ...props.projection.declarations, values: [mode === "matching" ? 2 : 1, null, null, null] as typeof props.projection.declarations.values }, local: { ...props.projection.local, legalActions: mode === "matching" ? props.projection.local.legalActions : [] } };
    view.rerender(<GameTable {...props} projection={next} />);
    expect(view.container.querySelector(`[data-local-declaration="${mode === "matching" ? 2 : 1}"]`)).not.toBeNull();
    if (mode === "matching") expect(view.getByRole("button", { name: "Δήλωση 2" })).not.toBeNull();
    else expect(view.queryByRole("button", { name: "Δήλωση 2" })).toBeNull();
  });
});

