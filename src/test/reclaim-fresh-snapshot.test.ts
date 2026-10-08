import { describe, expect, it, vi } from "vitest";
import { reclaimWithFreshSnapshot } from "@/components/table/reclaimWithFreshSnapshot";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import type { ReclaimGameControlResult } from "@/services/gameProjectionFunctions";

function fixture() {
  const state = reconciliationFixture(); state.seats[0].owner = { type: "human", playerId: "returning-player" }; state.seats[0].controller = "temporary_bot"; state.seats[0].reclaimable = true;
  const projection = projectGameForSeat(state, 0);
  const send = vi.fn<(input: { data: { gameId: string; actionId: string; expectedStateVersion: number } }) => Promise<ReclaimGameControlResult>>();
  return { projection, send };
}
describe("bounded control recovery under bot CAS races", () => {
  it("refreshes after a definitive stale rejection and submits the admitted version with a fresh action ID", async () => {
    const { projection, send } = fixture();
    send.mockResolvedValueOnce({ ok: false, code: "STALE_STATE" }).mockResolvedValueOnce({ ok: true, projection, replayed: false });
    const refresh = vi.fn(async () => { projection.stateVersion += 2; });
    const result = await reclaimWithFreshSnapshot({ gameId: projection.gameId, current: () => projection, refresh, send });
    expect(result?.ok).toBe(true); expect(refresh).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[1]![0].data.expectedStateVersion).toBe(send.mock.calls[0]![0].data.expectedStateVersion + 2);
    expect(send.mock.calls[1]![0].data.actionId).not.toBe(send.mock.calls[0]![0].data.actionId);
  });
  it("bounds repeated bot races to three attempts", async () => {
    const { projection, send } = fixture(); send.mockResolvedValue({ ok: false, code: "STALE_STATE" });
    const refresh = vi.fn(async () => { projection.stateVersion++; });
    expect(await reclaimWithFreshSnapshot({ gameId: projection.gameId, current: () => projection, refresh, send })).toEqual({ ok: false, code: "STALE_STATE" });
    expect(send).toHaveBeenCalledTimes(3); expect(refresh).toHaveBeenCalledTimes(2);
  });
  it.each(["NOT_AUTHENTICATED", "RECLAIM_NOT_AVAILABLE"] as const)("does not retry %s", async code => {
    const { projection, send } = fixture(); send.mockResolvedValue({ ok: false, code }); const refresh = vi.fn();
    await reclaimWithFreshSnapshot({ gameId: projection.gameId, current: () => projection, refresh, send });
    expect(send).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled();
  });
  it("does not redeliver an ambiguous failure with a new ID", async () => {
    const { projection, send } = fixture(); send.mockRejectedValue(new Error("offline")); const refresh = vi.fn();
    await expect(reclaimWithFreshSnapshot({ gameId: projection.gameId, current: () => projection, refresh, send })).rejects.toThrow("offline");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each(["route", "ended", "reclaimed", "offline"])("cancels retry when refresh changes %s", async change => {
    const { projection, send } = fixture(); send.mockResolvedValue({ ok: false, code: "STALE_STATE" });
    let current: typeof projection | null = projection;
    const refresh = async () => { if (change === "route") projection.gameId = "other"; if (change === "ended") projection.lifecycle = "complete"; if (change === "reclaimed") projection.local.reclaimAvailable = false; if (change === "offline") current = null; };
    const originalId = projection.gameId;
    expect(await reclaimWithFreshSnapshot({ gameId: originalId, current: () => current, refresh, send })).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
