import { describe, expect, it, vi } from "vitest";
import type { BiribaRoomView } from "@/services/biribaFunctions";
import { createAfterFinishedGame } from "./finishedGameActions";

const room = {
  code: "ABC123",
  capacity: 4,
  target: 5000,
  timerEnabled: true,
} as BiribaRoomView;

describe("Biriba finished-game restart", () => {
  it("closes the old room before creating a fresh waiting room without join commands", async () => {
    const waiting = { ...room, code: "NEW456", lifecycle: "waiting", seats: [] };
    const command = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, cancelled: true })
      .mockResolvedValueOnce({ ok: true, room: waiting });
    const result = await createAfterFinishedGame(room, command);
    expect(command.mock.calls).toEqual([
      [{ data: { action: "end_game", code: "ABC123" } }],
      [{ data: { action: "create", capacity: 4, target: 5000, timerEnabled: true } }],
    ]);
    expect(result).toEqual({ ok: true, room: waiting });
  });

  it("does not create a new room if closing the prior one is rejected", async () => {
    const command = vi.fn().mockResolvedValue({ ok: false, code: "HOST_ONLY" });
    expect(await createAfterFinishedGame(room, command)).toEqual({ ok: false, code: "HOST_ONLY" });
    expect(command).toHaveBeenCalledTimes(1);
  });
});
