import { beforeEach, describe, expect, it, vi } from "vitest";
import { holdOrdinaryDealForPresentation, activateOrdinaryDealAfterPresentation, acknowledgePresentationBoundary } from "@/domain/dealPresentationBarrier";
import { holdNineCardInitialDealForPresentation, holdNineCardRemainingDealForPresentation } from "@/domain/nineCardPresentation";
import { projectGameForSeat } from "@/domain/projection";
import { planAutomaticGameplayStep } from "@/bots/progression";
import { advanceGameUntilBlockedWithDependencies, type ReconciliationDependencies } from "@/server/reconciliationCore";
import { completeNineCardPresentation } from "@/server/nineCardPresentation";
import { activateInitialDealAfterPresentation } from "@/server/dealerBootstrap";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import type { CanonicalGameState } from "@/domain/gameState";
const persistence = vi.hoisted(() => ({ load: vi.fn(), persist: vi.fn() }));
vi.mock("@/server/gamePersistence", () => ({ loadCanonicalGameState: persistence.load, persistCanonicalGameState: persistence.persist }));
vi.mock("@/server/internalDeterminism", async importOriginal => ({ ...await importOriginal<typeof import("@/server/internalDeterminism")>(), stableInternalActionId: vi.fn(async (...parts) => parts.join(":")) }));
const now = "2026-10-06T00:00:00.000Z";
function humanState() {
  const state = reconciliationFixture();
  state.seats[0].owner = { type: "human", playerId: "human0" }; state.seats[0].controller = "human";
  state.seats[1].owner = { type: "human", playerId: "human1" }; state.seats[1].controller = "human";
  return state;
}
beforeEach(() => vi.clearAllMocks());
describe("authoritative deal presentation boundaries", () => {
  it.each([0, 2])("ordinary deal with first actor %i has no deadline or bot eligibility until release", actor => {
    const state = humanState(); state.progression.firstDeclarerSeat = actor as 0 | 2; state.progression.currentActorSeat = actor as 0 | 2;
    const held = holdOrdinaryDealForPresentation(state, now);
    expect(held.progression.phase).toBe("DEAL_PRESENTATION"); expect(held.progression.currentActorSeat).toBeNull(); expect(held.timing.currentHumanDeadline).toBeNull();
    expect(projectGameForSeat(held, 0).local.legalActions).toEqual([]);
    expect(planAutomaticGameplayStep(held, now).ok).toBe(false);
    const released = activateOrdinaryDealAfterPresentation(held, now);
    expect(released.progression.currentActorSeat).toBe(actor); expect(Boolean(released.timing.currentHumanDeadline)).toBe(actor === 0);
  });
  it("waits for both humans, excludes bots, and idempotently retains completion", () => {
    const held = holdOrdinaryDealForPresentation(humanState(), now);
    expect(held.timing.presentationBoundary?.requiredSeats).toEqual([0, 1]);
    const first = acknowledgePresentationBoundary(held, 0, 1, "full"); expect(first.allComplete).toBe(false);
    expect(first.state.timing.currentHumanDeadline).toBeNull();
    expect(acknowledgePresentationBoundary(first.state, 0, 1, "full").replayed).toBe(true);
    expect(acknowledgePresentationBoundary(first.state, 1, 1, "full").allComplete).toBe(true);
    expect(() => acknowledgePresentationBoundary(held, 2, 1, "full")).toThrow();
    expect(() => acknowledgePresentationBoundary(held, 0, 2, "full")).toThrow();
  });
  it("all-bot simulations bypass the ordinary presentation barrier", () => {
    const state = reconciliationFixture(); expect(holdOrdinaryDealForPresentation(state, now)).toBe(state);
  });
  it("preserves nine initial and remaining stages with aggregate metadata and bounded fallback", () => {
    const state = humanState(); state.progression.cardsPerPlayer = 9; state.progression.phase = "NINE_CARD_TRUMP_CHOICE"; state.cards.hands = state.cards.hands.map(hand => [hand[0]!, hand[0]!, hand[0]!]) as CanonicalGameState["cards"]["hands"]; state.cards.hiddenPartialNineCardHands = true; state.trump = { status: "chooser_pending", chooserSeat: state.progression.firstDeclarerSeat! };
    const initial = holdNineCardInitialDealForPresentation(state, now);
    expect(initial.progression.phase).toBe("NINE_CARD_INITIAL_DEAL_ALL_SEATS"); expect(initial.timing.presentationBoundary?.stage).toBe("initial");
    state.progression.phase = "NINE_CARD_REMAINING_DEAL"; state.trump = { status: "resolved", suit: null }; state.cards.hiddenPartialNineCardHands = false; state.cards.hands = state.cards.hands.map(hand => Array.from({ length: 9 }, () => hand[0]!)) as CanonicalGameState["cards"]["hands"];
    const remaining = holdNineCardRemainingDealForPresentation(state, now);
    expect(remaining.timing.presentationBoundary?.stage).toBe("remaining"); expect(remaining.timing.currentHumanDeadline).toBeNull();
    expect(Date.parse(remaining.timing.presentationReadyAt!) - Date.parse(now)).toBe(45000);
  });
  it("zero-client fallback releases exactly one boundary and starts a fresh human deadline", async () => {
    let state = holdOrdinaryDealForPresentation(humanState(), now);
    state.progression.firstDeclarerSeat = 0;
    let clock = now; const commits: CanonicalGameState[] = [];
    const dependencies: ReconciliationDependencies = {
      load: async () => ({ ok: true, gameId: state.gameId, stateVersion: state.stateVersion, canonicalState: state }),
      persist: async input => { state = input.newState; commits.push(state); return { ok: true, gameId: state.gameId, stateVersion: state.stateVersion, lifecycle: state.lifecycle, replayed: false }; },
      finalize: vi.fn(), now: () => clock, randomUnits: vi.fn(), actionId: async () => "id",
    };
    const waiting = await advanceGameUntilBlockedWithDependencies(state.gameId, 1, dependencies);
    expect(waiting.ok && waiting.stopReason).toBe("PRESENTATION_BARRIER"); expect(commits).toHaveLength(0);
    clock = state.timing.presentationReadyAt!;
    await advanceGameUntilBlockedWithDependencies(state.gameId, 1, dependencies);
    expect(commits).toHaveLength(1); expect(state.progression.phase).toBe("DECLARATION");
    expect(Date.parse(state.timing.currentHumanDeadline!) - Date.parse(clock)).toBe(30000);
  });
});
describe("authenticated, scoped acknowledgement persistence", () => {
  function setup() {
    let state = holdOrdinaryDealForPresentation(humanState(), now), seat = 0;
    persistence.load.mockImplementation(async () => ({ ok: true, gameId: state.gameId, viewerSeat: seat, stateVersion: state.stateVersion, canonicalState: state }));
    persistence.persist.mockImplementation(async input => { expect(input.newState.stateVersion).toBe(state.stateVersion + 1); state = input.newState; return { ok: true, stateVersion: state.stateVersion, replayed: false }; });
    return { get: () => state, seat: (n: number) => { seat = n; }, state: (next: CanonicalGameState) => { state = next; } };
  }
  it("reconnecting first human replays; only final human activates", async () => {
    const harness = setup(); await completeNineCardPresentation(harness.get().gameId, 1, "full");
    expect(harness.get().progression.phase).toBe("DEAL_PRESENTATION");
    await completeNineCardPresentation(harness.get().gameId, 1, "full"); expect(persistence.persist).toHaveBeenCalledTimes(1);
    harness.seat(1); await completeNineCardPresentation(harness.get().gameId, 1, "full");
    expect(harness.get().progression.phase).toBe("DECLARATION"); expect(persistence.persist).toHaveBeenCalledTimes(2);
  });
  it("first deal releases the already-presented own hand before actor/deadline eligibility", async () => {
    const harness = setup(); const state = harness.get(); state.lifecycle = "starting"; state.progression.phase = "DEAL_SETUP";
    const result = await activateInitialDealAfterPresentation(state.gameId);
    expect(result.ok).toBe(true); expect(harness.get().progression.phase).toBe("DEAL_PRESENTATION");
    expect(harness.get().progression.currentActorSeat).toBeNull(); expect(harness.get().timing.currentHumanDeadline).toBeNull();
    expect(projectGameForSeat(harness.get(), 0).cards.ownHandVisible).toBe(true);
    expect(projectGameForSeat(harness.get(), 0).local.legalActions).toEqual([]);
  });
  it("late initial ack cannot release remaining barrier; old-deal ack cannot release new deal", async () => {
    const harness = setup(); const state = harness.get(); state.progression.phase = "NINE_CARD_REMAINING_DEAL";
    await completeNineCardPresentation(state.gameId, 1, "initial"); expect(persistence.persist).not.toHaveBeenCalled();
    state.progression.dealNumber = 2; state.progression.phase = "DEAL_PRESENTATION";
    await completeNineCardPresentation(state.gameId, 1, "full"); expect(persistence.persist).not.toHaveBeenCalled();
  });
  it("CAS race retries without losing another human's completion", async () => {
    const harness = setup();
    persistence.persist.mockImplementationOnce(async () => { harness.state(acknowledgePresentationBoundary(harness.get(), 1, 1, "full").state); return { ok: false, code: "STALE_STATE" }; });
    const result = await completeNineCardPresentation(harness.get().gameId, 1, "full");
    expect(result.ok).toBe(true); expect(harness.get().progression.phase).toBe("DECLARATION");
  });
});
