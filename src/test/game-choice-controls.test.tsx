import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrumpChoicePicker, randomTrumpChoice } from "@/components/table/TrumpChoicePicker";
import { DeclarationPicker } from "@/components/table/DeclarationPicker";
import { TrickPresentation } from "@/components/table/TrickPresentation";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import type { Suit } from "@/domain/cards";
import type { JokerSemantic } from "@/domain/engine";
vi.mock("@/components/table/useCriticalCardArtwork", () => ({ useCriticalCardArtwork: () => true }));
vi.mock("@/lib/gameAudio", () => ({ playGameSound: vi.fn() }));
vi.mock("@/lib/timingDiagnostics", () => ({ recordTimingDiagnostic: vi.fn(), startTimingDiagnosticSession: vi.fn() }));
const choices: (Suit | null)[] = ["hearts", "diamonds", "clubs", "spades", null];
const geometry = { ...computeTableGeometry({ feltRect: { left: 0, top: 0, right: 800, bottom: 260, width: 800, height: 260 }, viewportWidth: 800, viewportHeight: 360 }), epoch: 1 };
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("responsive game choices", () => {
  it("selects all four suits and no trump through the same legal command contract", () => {
    const select = vi.fn(); render(<TrumpChoicePicker suits={choices} busy={false} onSelect={select} />);
    ["Κούπες", "Καρό", "Σπαθιά", "Μπαστούνια", "Χωρίς ατού"].forEach(label => fireEvent.click(screen.getByRole("button", { name: label })));
    expect(select.mock.calls.map(call => call[0])).toEqual(choices);
  });
  it("random includes no trump with equal-sized intervals and respects supplied legal choices", () => {
    expect(choices.map((_, i) => randomTrumpChoice(choices, () => (i + .5) / 5))).toEqual(choices);
    expect(randomTrumpChoice([null], () => .9)).toBeNull();
    const random = vi.spyOn(Math, "random").mockReturnValue(.99); const select = vi.fn();
    render(<TrumpChoicePicker suits={choices} busy={false} onSelect={select} />);
    fireEvent.click(screen.getByRole("button", { name: /Τυχαίο/ })); expect(select).toHaveBeenCalledWith(null); random.mockRestore();
  });
  it("locks busy choices and forbids unavailable declarations", () => {
    const select = vi.fn(); const view = render(<TrumpChoicePicker suits={choices} busy onSelect={select} />);
    screen.getAllByRole("button").forEach(button => { expect(button).toBeDisabled(); fireEvent.click(button); }); expect(select).not.toHaveBeenCalled();
    view.unmount(); render(<DeclarationPicker values={[0, 1, 2]} legalValues={[0, 2]} busy={false} onSelect={select} />);
    fireEvent.click(screen.getByRole("button", { name: "Δήλωση 1" })); expect(select).not.toHaveBeenCalled();
  });
});
describe("Joker semantic updates keep one visual identity", () => {
  it.each(["COMPETE", "FROM_BELOW", "HIGHER_SUIT", "SUIT_WINS"] as const)("holds unresolved %s in the hand and presents only the committed semantic", mode => {
    const projection = projectGameForSeat(reconciliationFixture(), 0); projection.gameId = `choice-${mode}`; projection.progression.phase = "JOKER_DECISION"; projection.cards.completedTricks = []; projection.cards.presentationTail = [];
    projection.cards.currentTrick = [{ seatIndex: 0, card: { id: "joker-test", kind: "joker" } }];
    const semantic: JokerSemantic = mode === "COMPETE" || mode === "FROM_BELOW" ? { context: "OPEN_TRICK", mode } : { context: "LEAD", mode, requestedSuit: "spades" };
    const props = { geometry, localPlayPresentation: null, onLocalFlightSettled: vi.fn() };
    const view = render(<TrickPresentation {...props} projection={projection} />);
    act(() => vi.advanceTimersByTime(20));
    expect(view.container.querySelector(".fixed")).toBeNull();
    view.rerender(<TrickPresentation {...props} projection={projection} pendingJokerChoice={{ cardId: "joker-test", semantic }} />);
    expect(view.container.querySelector(".fixed")).toBeNull();
    expect(Boolean(view.container.querySelector("[data-joker-announcement]"))).toBe(semantic.context === "LEAD");
    view.rerender(<TrickPresentation {...props} projection={projection} />);
    expect(view.container.querySelector(".fixed")).toBeNull();
    const accepted = { ...projection, stateVersion: projection.stateVersion + 1, cards: { ...projection.cards, currentTrick: [{ ...projection.cards.currentTrick[0]!, joker: semantic }] } };
    view.rerender(<TrickPresentation {...props} projection={accepted} />);
    act(() => vi.advanceTimersByTime(20));
    const surface = view.container.querySelector(".fixed");
    expect(surface).not.toBeNull();
    expect(surface?.getAttribute("data-joker-from-below")).toBe(mode === "FROM_BELOW" ? "true" : null);
    expect(Boolean(view.container.querySelector("[data-joker-announcement]"))).toBe(semantic.context === "LEAD");
    view.rerender(<TrickPresentation {...props} projection={{ ...accepted }} />);
    expect(view.container.querySelector(".fixed")).toBe(surface);
  });
});
