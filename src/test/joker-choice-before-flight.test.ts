import { describe, expect, it } from "vitest";
import { applyGameplayCommand } from "@/domain/gameplayCommands";
import { projectGameForSeat } from "@/domain/projection";
import type { JokerSemantic } from "@/domain/engine";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import { projectionContainsPendingCard, type LocalPlayPresentation } from "@/components/table/localPlayPresentation";

const now = "2026-10-09T10:00:00.000Z";
const semantics: JokerSemantic[] = [
  { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "spades" },
  { context: "LEAD", mode: "SUIT_WINS", requestedSuit: "hearts" },
  { context: "OPEN_TRICK", mode: "COMPETE" },
  { context: "OPEN_TRICK", mode: "FROM_BELOW" },
];
function fixture(open: boolean) {
  const state = reconciliationFixture();
  state.progression.phase = "CARD_PLAY";
  state.progression.currentActorSeat = 0;
  state.cards.hands[0] = [{ id: "choice-joker", kind: "joker" }];
  state.cards.currentTrick = open ? [{ seatIndex: 3, card: { id: "lead", kind: "standard", suit: "clubs", rank: "A" } }] : [];
  delete state.timing.turnPresentation;
  return state;
}
describe("choose before throwing, authoritative atomic Joker command", () => {
  it("requires the chosen semantic in confirmation and accepts reordered JSONB keys", () => {
    const presentation = { actorSeat: 0, cardId: "choice-joker", jokerSemantic: semantics[0] } as LocalPlayPresentation;
    const card = { id: "choice-joker", kind: "joker" } as const;
    expect(projectionContainsPendingCard(presentation, [{ seatIndex: 0, card }], [])).toBe(false);
    expect(projectionContainsPendingCard(presentation, [{ seatIndex: 0, card, joker: { requestedSuit: "spades", mode: "HIGHER_SUIT", context: "LEAD" } }], [])).toBe(true);
    expect(projectionContainsPendingCard(presentation, [{ seatIndex: 0, card, joker: semantics[1]! }], [])).toBe(false);
  });
  it.each(semantics)("uses exactly the existing rules for $context / $mode, with one CAS", semantic => {
    const state = fixture(semantic.context === "OPEN_TRICK");
    const before = structuredClone(state);
    const intent = applyGameplayCommand({ state, seat: 0, command: { type: "play_card", cardId: "choice-joker" }, serverNow: now });
    if (!intent.ok) throw Error(intent.code);
    const legacy = applyGameplayCommand({ state: intent.state, seat: 0, command: { type: "choose_joker_semantic", semantic }, serverNow: now });
    const atomic = applyGameplayCommand({ state, seat: 0, command: { type: "play_card", cardId: "choice-joker", jokerSemantic: semantic }, serverNow: now });
    if (!atomic.ok || !legacy.ok) throw Error("Failed valid Joker choice");
    expect(atomic.state).toEqual({ ...legacy.state, stateVersion: state.stateVersion + 1 });
    expect(state).toEqual(before);
    expect(atomic.state.cards.currentTrick.at(-1)?.joker).toEqual(semantic);
    expect(atomic.state.cards.hands[0]).toEqual([]);
  });
  it("provides contextual options before submission; rejects the wrong context without removing the card", () => {
    for (const open of [false, true]) {
      const state = fixture(open);
      const action = projectGameForSeat(state, 0).local.legalActions.find(a => a.type === "play_card");
      expect(action?.type === "play_card" && action.jokerOptions?.length).toBe(open ? 2 : 8);
      const invalid = open ? semantics[0]! : semantics[2]!;
      expect(applyGameplayCommand({ state, seat: 0, command: { type: "play_card", cardId: "choice-joker", jokerSemantic: invalid }, serverNow: now })).toEqual({ ok: false, code: "INVALID_JOKER_CHOICE" });
      expect(state.cards.hands[0][0]?.id).toBe("choice-joker");
    }
  });
  it("cannot attach Joker semantics to a normal card or bypass actor/controller checks", () => {
    const state = fixture(false);
    state.cards.hands[0] = [{ id: "normal", kind: "standard", suit: "clubs", rank: "A" }];
    expect(applyGameplayCommand({ state, seat: 0, command: { type: "play_card", cardId: "normal", jokerSemantic: semantics[0]! }, serverNow: now })).toEqual({ ok: false, code: "INVALID_JOKER_CHOICE" });
    expect(applyGameplayCommand({ state, seat: 1, command: { type: "play_card", cardId: "normal", jokerSemantic: semantics[0]! }, serverNow: now })).toEqual({ ok: false, code: "NOT_CURRENT_ACTOR" });
  });
});
