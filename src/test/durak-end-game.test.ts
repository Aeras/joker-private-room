import { describe, expect, it, vi } from "vitest";
import { endDurakGame } from "../../supabase/functions/durak-commands/end-game";
function client(player: string | null, host: string, code = "ABC123") {
  const filters: Record<string, string> = {};
  let deleted = false;
  const query = {
    eq: vi.fn((key: string, value: string) => {
      filters[key] = value;
      return query;
    }),
    select: vi.fn(async () => {
      deleted = filters["code"] === code && filters["host_player_id"] === host;
      return { data: deleted ? [{ id: "room" }] : [], error: null };
    }),
  };
  const admin = {
    rpc: vi.fn(async () => ({ data: player ? [{ id: player }] : [], error: null })),
    from: vi.fn(() => ({ delete: () => query })),
  };
  return { admin, query, deleted: () => deleted };
}
describe("DURAK authenticated host termination", () => {
  it("authenticates the session and deletes only its host's selected DURAK room", async () => {
    const c = client("host", "host");
    expect(await endDurakGame(c.admin, "session", "ABC123")).toEqual({ ok: true, cancelled: true });
    expect(c.admin.rpc).toHaveBeenCalledWith("validate_player_session_internal", {
      p_session_token: "session",
    });
    expect(c.admin.from).toHaveBeenCalledExactlyOnceWith("durak_rooms");
    expect(c.query.eq).toHaveBeenCalledWith("code", "ABC123");
    expect(c.query.eq).toHaveBeenCalledWith("host_player_id", "host");
  });
  it("denies a non-host without deleting the room", async () => {
    const c = client("guest", "host");
    expect(await endDurakGame(c.admin, "session", "ABC123")).toEqual({
      ok: false,
      code: "HOST_ONLY",
    });
    expect(c.deleted()).toBe(false);
  });
  it("denies a missing session before accessing rooms", async () => {
    const c = client(null, "host");
    expect(await endDurakGame(c.admin, "invalid", "ABC123")).toEqual({
      ok: false,
      code: "NOT_AUTHENTICATED",
    });
    expect(c.admin.from).not.toHaveBeenCalled();
  });
  it("does not delete another room or report a false success", async () => {
    const c = client("host", "host");
    expect(await endDurakGame(c.admin, "session", "OTHER1")).toEqual({
      ok: false,
      code: "HOST_ONLY",
    });
    expect(c.deleted()).toBe(false);
  });
  it("fails closed on auth transport errors", async () => {
    const c = client("host", "host");
    c.admin.rpc.mockResolvedValue({ data: [], error: Error("failed") } as never);
    expect(await endDurakGame(c.admin, "session", "ABC123")).toEqual({
      ok: false,
      code: "SERVICE_UNAVAILABLE",
    });
    expect(c.admin.from).not.toHaveBeenCalled();
  });
});
