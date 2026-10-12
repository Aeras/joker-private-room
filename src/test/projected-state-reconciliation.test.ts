import { describe, expect, it, vi } from "vitest";
import { loadReconciledStateWithDependencies, type ProjectedStateDependencies } from "@/server/projectedStateReconciliation";
import { advanceGameUntilBlockedWithDependencies } from "@/server/reconciliationCore";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import type { LoadGameStateResult } from "@/server/gamePersistence";

function memory(ruleset: "popular" | "classic" | "minus" = "popular") {
  let state = reconciliationFixture(ruleset);
  const load = vi.fn(async (): Promise<LoadGameStateResult> => ({ ok: true, gameId: state.gameId, roomId: state.roomId, viewerSeat: 2, rulesetId: state.rulesetId, rulesVersion: state.rulesVersion, stateSchemaVersion: state.stateSchemaVersion, stateVersion: state.stateVersion, lifecycle: state.lifecycle, canonicalState: structuredClone(state) }));
  const persist = vi.fn<ProjectedStateDependencies["persist"]>(async (input) => {
    if (input.expectedStateVersion !== state.stateVersion) return { ok: false, code: "STALE_STATE", currentStateVersion: state.stateVersion };
    state = structuredClone(input.newState);
    return { ok: true, gameId: state.gameId, stateVersion: state.stateVersion, lifecycle: state.lifecycle, replayed: false };
  });
  const dependencies: ProjectedStateDependencies = { load, persist, finalize: persist, bootstrap: vi.fn<ProjectedStateDependencies["bootstrap"]>(async () => ({ ok: true })), actionId: async (_id, label) => label, randomUnits: async (_seed, _label, count) => Array.from({ length: count }, () => .3), now: () => new Date().toISOString() };
  return { dependencies, load, persist, get state() { return state; } };
}

describe("request-local authenticated projection reads", () => {
  it("removes two read round-trips from the previous live request path", async () => {
    const old = memory(), optimized = memory();
    // Previous handler: bootstrap check, reconciler initial/final reads, projection read.
    await old.load();
    await advanceGameUntilBlockedWithDependencies(old.state.gameId, 1, old.dependencies);
    const previousResult = await old.load();
    const result = await loadReconciledStateWithDependencies(optimized.state.gameId, 1, optimized.dependencies);
    expect(old.load).toHaveBeenCalledTimes(4);
    expect(optimized.load).toHaveBeenCalledTimes(2);
    expect(old.persist).toHaveBeenCalledTimes(1);
    expect(optimized.persist).toHaveBeenCalledTimes(1);
    expect(result).toEqual(previousResult);
  });
  it.each(["popular", "classic", "minus"] as const)("keeps the exact bot command in %s, with two reads and one write", async (ruleset) => {
    const optimized = memory(ruleset), baseline = memory(ruleset);
    const result = await loadReconciledStateWithDependencies(optimized.state.gameId, 1, optimized.dependencies);
    await advanceGameUntilBlockedWithDependencies(baseline.state.gameId, 1, baseline.dependencies);
    expect(result.ok).toBe(true);
    expect(optimized.load).toHaveBeenCalledTimes(2);
    expect(optimized.persist).toHaveBeenCalledTimes(1);
    expect(optimized.persist.mock.calls[0]![0].commandPayload).toEqual(baseline.persist.mock.calls[0]![0].commandPayload);
    expect(result.ok && result.viewerSeat).toBe(2);
    expect(result.ok && result.canonicalState).toEqual(optimized.state);
    expect(optimized.dependencies.bootstrap).not.toHaveBeenCalled();
  });
  it("uses one fresh read when waiting for a human, without caching across requests", async () => {
    const m = memory();
    const actor = m.state.progression.currentActorSeat!;
    m.state.seats[actor].controller = "human";
    m.state.seats[actor].owner = { type: "human", playerId: "viewer" };
    for (let i = 0; i < 2; i++) expect((await loadReconciledStateWithDependencies(m.state.gameId, 1, m.dependencies)).ok).toBe(true);
    expect(m.load).toHaveBeenCalledTimes(2);
    expect(m.persist).not.toHaveBeenCalled();
  });
  it("does not bootstrap or advance an unauthorized request", async () => {
    const m = memory();
    m.load.mockResolvedValue({ ok: false, code: "NOT_AUTHENTICATED" });
    expect(await loadReconciledStateWithDependencies(m.state.gameId, 1, m.dependencies)).toEqual({ ok: false, code: "NOT_AUTHENTICATED" });
    expect(m.persist).not.toHaveBeenCalled();
    expect(m.dependencies.bootstrap).not.toHaveBeenCalled();
  });
  it("returns fresh authorization failure after a successful write", async () => {
    const m = memory();
    const initial = await m.load(); m.load.mockClear();
    m.load.mockResolvedValueOnce(initial).mockResolvedValueOnce({ ok: false, code: "NOT_AUTHENTICATED" });
    expect(await loadReconciledStateWithDependencies(m.state.gameId, 1, m.dependencies)).toEqual({ ok: false, code: "NOT_AUTHENTICATED" });
    expect(m.persist).toHaveBeenCalledTimes(1);
  });
  it("keeps the CAS loser synchronized without spending another bot step", async () => {
    const m = memory();
    const results = await Promise.all([loadReconciledStateWithDependencies(m.state.gameId, 1, m.dependencies), loadReconciledStateWithDependencies(m.state.gameId, 1, m.dependencies)]);
    expect(m.persist).toHaveBeenCalledTimes(2);
    expect(m.persist.mock.calls[0]![0].expectedStateVersion).toBe(m.persist.mock.calls[1]![0].expectedStateVersion);
    expect(results.every(r => r.ok && r.stateVersion === m.state.stateVersion && r.canonicalState.declarations.declarations.filter(v => v != null).length === 1)).toBe(true);
    expect(m.load).toHaveBeenCalledTimes(4);
  });
  it("reads authoritative state again on replay rather than returning the proposed write", async () => {
    const m = memory();
    m.persist.mockImplementation(async () => { m.state.stateVersion++; return { ok: true, gameId: m.state.gameId, stateVersion: m.state.stateVersion, lifecycle: m.state.lifecycle, replayed: true }; });
    const result = await loadReconciledStateWithDependencies(m.state.gameId, 1, m.dependencies);
    expect(result.ok && result.canonicalState.declarations.declarations.every(v => v == null)).toBe(true);
    expect(m.load).toHaveBeenCalledTimes(2);
  });
  it("prepares only an uninitialized game and preserves bootstrap failure", async () => {
    const m = memory();
    m.load.mockResolvedValue({ ok: false, code: "GAME_STATE_NOT_INITIALIZED" });
    m.dependencies.bootstrap = vi.fn<ProjectedStateDependencies["bootstrap"]>(async () => ({ ok: false, code: "GAME_NOT_FOUND" }));
    expect(await loadReconciledStateWithDependencies(m.state.gameId, 1, m.dependencies)).toEqual({ ok: false, code: "GAME_NOT_FOUND" });
    expect(m.load).toHaveBeenCalledTimes(1);
    expect(m.dependencies.bootstrap).toHaveBeenCalledTimes(1);
    expect(m.persist).not.toHaveBeenCalled();
  });
  it("continues normal reconciliation after successful bootstrap", async () => {
    const m = memory();
    m.load.mockResolvedValueOnce({ ok: false, code: "GAME_STATE_NOT_INITIALIZED" });
    const result = await loadReconciledStateWithDependencies(m.state.gameId, 1, m.dependencies);
    expect(result.ok).toBe(true);
    expect(m.dependencies.bootstrap).toHaveBeenCalledTimes(1);
    expect(m.load).toHaveBeenCalledTimes(3);
    expect(m.persist).toHaveBeenCalledTimes(1);
  });
});
