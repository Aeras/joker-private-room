import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JokerChoicePicker } from "@/components/table/JokerChoicePicker";
import { planAutomaticGameplayStep } from "@/bots/progression";
import { selectCompetitiveCommand } from "@/bots/competitiveRuntime";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
afterEach(cleanup);
describe("Joker choice transport", () => {
  it("puts FROM_BELOW left and COMPETE right without changing their commands", () => {
    const below = { context: "OPEN_TRICK", mode: "FROM_BELOW" } as const;
    const above = { context: "OPEN_TRICK", mode: "COMPETE" } as const;
    const select = vi.fn();
    const view = render(<JokerChoicePicker options={[above, below]} busy={false} onSelect={select} />);
    const buttons = view.getAllByRole("button");
    expect(buttons.map(button => button.textContent?.trim())).toEqual(["Τζόκερ από κάτω", "Τζόκερ από πάνω"]);
    fireEvent.click(buttons[0]!); fireEvent.click(buttons[1]!);
    expect(select.mock.calls.map(call => call[0])).toEqual([below, above]);
  });
  it.each([false, true])("bot Joker is one validated CAS action, open=%s", open => {
    const state = reconciliationFixture();
    state.progression.phase = "CARD_PLAY"; state.progression.currentActorSeat = 0;
    state.cards.hands[0] = [{ id: "joker-1", kind: "joker" }];
    state.cards.currentTrick = open ? [{ seatIndex: 3, card: { id: "clubs-8", kind: "standard", suit: "clubs", rank: "8" } }] : [];
    const plan = planAutomaticGameplayStep(state, "2026-10-09T20:00:00Z");
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.command.type).toBe("play_card");
    if (plan.command.type !== "play_card") return;
    expect(plan.command.jokerSemantic?.context).toBe(open ? "OPEN_TRICK" : "LEAD");
    expect(plan.nextState.stateVersion).toBe(state.stateVersion + 1);
    expect(plan.nextState.progression.phase).not.toBe("JOKER_DECISION");
    expect(plan.nextState.cards.currentTrick.at(-1)?.joker).toEqual(plan.command.jokerSemantic);
    expect(plan.nextState.cards.hands[0]).toEqual([]);
  });
  it("temporary bot also submits a complete Joker meaning", () => {
    const state = reconciliationFixture("popular", true);
    state.progression.phase = "CARD_PLAY"; state.progression.currentActorSeat = 1;
    state.cards.hands[1] = [{ id: "joker-1", kind: "joker" }]; state.cards.currentTrick = [];
    const choice = selectCompetitiveCommand(projectGameForSeat(state, 1));
    expect(choice?.controller).toBe("temporary_bot");
    expect(choice?.command.type).toBe("play_card");
    if (choice?.command.type === "play_card") expect(choice.command.jokerSemantic?.context).toBe("LEAD");
  });
});
