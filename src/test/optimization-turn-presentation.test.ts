import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgePlayedEvent,
  holdPlayedEvent,
  releasePlayedEvent,
} from "@/domain/turnPresentation";
import { applyGameplayCommand } from "@/domain/gameplayCommands";
import { applyOverdueTimeout, applyReclaimControl } from "@/domain/controller";
import { projectGameForSeat } from "@/domain/projection";
import { planAutomaticGameplayStep } from "@/bots/progression";
import {
  advanceGameUntilBlockedWithDependencies,
  type ReconciliationDependencies,
} from "@/server/reconciliationCore";
import { completeTurnPresentation } from "@/server/turnPresentation";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
const mocks = vi.hoisted(() => ({ load: vi.fn(), persist: vi.fn() }));
vi.mock("@/server/gamePersistence", () => ({
  loadCanonicalGameState: mocks.load,
  persistCanonicalGameState: mocks.persist,
}));
vi.mock("@/server/internalDeterminism", async (original) => ({
  ...(await original<typeof import("@/server/internalDeterminism")>()),
  stableInternalActionId: async (...parts: unknown[]) => parts.join(":"),
}));
const now = "2026-10-06T00:00:00.000Z";
function base() {
  const state = reconciliationFixture();
  state.progression.phase = "CARD_PLAY";
  state.progression.currentActorSeat = 0;
  for (const seat of [0, 1] as const) {
    state.seats[seat].owner = { type: "human", playerId: `human${seat}` };
    state.seats[seat].controller = "human";
  }
  return state;
}
beforeEach(() => vi.clearAllMocks());
describe("server turn presentation eligibility", () => {
  it("a committed play immediately makes the next authoritative human turn eligible", () => {
    const state = base();
    const card = state.cards.hands[0][0]!;
    const result = applyGameplayCommand({
      state,
      seat: 0,
      command: { type: "play_card", cardId: card.id },
      serverNow: now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.timing.turnPresentation).toBeUndefined();
    expect(result.state.timing.currentHumanDeadline).toBe("2026-10-06T00:00:30.000Z");
    expect(result.state.progression.currentActorSeat).toBe(1);
    expect(projectGameForSeat(result.state, 1).local.legalActions.some((action) => action.type === "play_card")).toBe(true);
    expect(planAutomaticGameplayStep(result.state, now)).toEqual({
      ok: false,
      stopReason: "HUMAN_ACTION_REQUIRED",
    });
  });
  it("retains first ack, excludes bots, and starts a full deadline only on the last actual ack", () => {
    const state = holdPlayedEvent(base(), now);
    const token = state.stateVersion;
    const first = acknowledgePlayedEvent(state, 0, token, now);
    expect(first.state.timing.turnPresentation?.completedSeats).toEqual([0]);
    expect(first.state.timing.currentHumanDeadline).toBeNull();
    expect(acknowledgePlayedEvent(first.state, 0, token, now).state).toBe(first.state);
    expect(() => acknowledgePlayedEvent(state, 2, token, now)).toThrow();
    const released = acknowledgePlayedEvent(
      first.state,
      1,
      token,
      "2026-10-06T00:00:25.000Z",
    ).state;
    expect(released.stateVersion).toBe(first.state.stateVersion + 1);
    expect(released.timing.turnPresentation).toBeUndefined();
    expect(released.timing.currentHumanDeadline).toBe("2026-10-06T00:00:55.000Z");
  });
  it("stale acknowledgements never release a newer play; future tokens fail", () => {
    const held = holdPlayedEvent(base(), now);
    expect(acknowledgePlayedEvent(held, 0, held.stateVersion - 1, now).state).toBe(held);
    expect(() => acknowledgePlayedEvent(held, 0, held.stateVersion + 1, now)).toThrow();
  });
  it("timeout read paths cannot take over a held turn; reclaim preserves its boundary", () => {
    const held = holdPlayedEvent(base(), now);
    held.timing.currentHumanDeadline = now;
    expect(applyOverdueTimeout(held, "2026-10-06T00:00:29.000Z")).toMatchObject({ changed: false });
    held.seats[0].controller = "temporary_bot";
    held.seats[0].reclaimable = true;
    const reclaimed = applyReclaimControl(held, 0, now);
    expect(reclaimed.ok).toBe(true);
    if (!reclaimed.ok) return;
    expect(reclaimed.state.timing.turnPresentation).toEqual(held.timing.turnPresentation);
    expect(reclaimed.state.timing.currentHumanDeadline).toBeNull();
  });
  it("all-bot games have no artificial presentation lease", () => {
    const bots = reconciliationFixture();
    expect(holdPlayedEvent(bots, now)).toBe(bots);
  });
  it.each(["CARD_PLAY", "DEAL_RESULT"] as const)(
    "worker releases a legacy %s presentation boundary immediately, before fallbackAt",
    async (phase) => {
      let state = holdPlayedEvent(base(), now);
      state.progression.phase = phase;
      const persist = vi.fn(async (args: { newState: typeof state }) => {
        state = args.newState;
        return {
          ok: true as const,
          gameId: state.gameId,
          stateVersion: state.stateVersion,
          lifecycle: state.lifecycle,
          replayed: false,
        };
      });
      const dependencies: ReconciliationDependencies = {
        load: async () => ({
          ok: true,
          gameId: state.gameId,
          stateVersion: state.stateVersion,
          canonicalState: state,
        }),
        persist,
        finalize: vi.fn(),
        actionId: async () => "id",
        randomUnits: async () => [],
        now: () => "2026-10-06T00:00:01.000Z",
      };
      expect(
        await advanceGameUntilBlockedWithDependencies(state.gameId, 1, dependencies),
      ).toMatchObject({ stopReason: "STEP_BOUND", steps: 1 });
      expect(state.timing.turnPresentation).toBeUndefined();
      expect(state.timing.currentHumanDeadline).toBe("2026-10-06T00:00:31.000Z");
      expect(persist).toHaveBeenCalledTimes(1);
      expect(persist.mock.calls[0]?.[0]).toMatchObject({
        commandType: "system_turn_presentation_release",
        commandPayload: { source: "legacy_nonblocking_release" },
      });
    },
  );
  it("authenticated CAS retry preserves the competing human acknowledgement", async () => {
    let state = holdPlayedEvent(base(), now);
    const token = state.stateVersion;
    mocks.load.mockImplementation(async () => ({
      ok: true,
      viewerSeat: 0,
      stateVersion: state.stateVersion,
      canonicalState: state,
    }));
    mocks.persist.mockImplementationOnce(async () => {
      state = acknowledgePlayedEvent(state, 1, token, now).state;
      return { ok: false, code: "STALE_STATE" };
    });
    mocks.persist.mockImplementation(async (args) => {
      expect(args.expectedStateVersion).toBe(state.stateVersion);
      state = args.newState;
      return { ok: true };
    });
    expect(await completeTurnPresentation(state.gameId, token)).toMatchObject({ ok: true });
    expect(state.timing.turnPresentation).toBeUndefined();
    expect(mocks.persist).toHaveBeenCalledTimes(2);
    await completeTurnPresentation(state.gameId, token);
    expect(mocks.persist).toHaveBeenCalledTimes(2);
  });
  it("release leaves an already paused human paused", () => {
    const state = holdPlayedEvent(base(), now);
    state.seats[0].reclaimable = true;
    expect(releasePlayedEvent(state, now).timing.currentHumanDeadline).toBeNull();
  });
  it("foreground recovery refreshes authority and remounts presentation-only state", () => {
    const route = readFileSync("src/routes/table.tsx", "utf8");
    const wake = readFileSync(
      "supabase/migrations/20261006182000_jk006_nonblocking_turn_presentation.sql",
      "utf8",
    );
    expect(route).toContain("returningFromBackground");
    expect(route).toContain("setTableEpoch((value) => value + 1)");
    expect(route).toContain("void refreshAll()");
    expect(route).toContain('window.addEventListener("focus", focus)');
    expect(wake).toContain("return p_server_now;");
    expect(wake).not.toContain("return coalesce(v_presentation_ready, p_server_now)");
  });
});
