import { describe, expect, it } from "vitest";
import type { Room } from "@/domain/players";
import type { PlayerGameProjection } from "@/domain/projection";
import { isCoherentTableSnapshot } from "@/components/table/tableConnectionModel";

const room = {
  code: "ABCD",
  hostId: "p1",
  rulesetId: "popular",
  botSettings: { botsTalk: false, allowProfanity: false, aiEnabled: false, intensity: "normal" },
  seats: [
    { index: 0, occupant: { type: "human", connected: true, player: { id: "p1", displayName: "P1", role: "host" } } },
    { index: 1, occupant: { type: "bot", bot: { id: "b1", displayName: "B1", personalityId: "b1" } } },
    { index: 2, occupant: { type: "bot", bot: { id: "b2", displayName: "B2", personalityId: "b2" } } },
    { index: 3, occupant: { type: "bot", bot: { id: "b3", displayName: "B3", personalityId: "b3" } } },
  ],
  status: "playing",
  gameId: "game-1",
} satisfies Room;

const projection = {
  gameId: "game-1",
  roomId: "room-1",
  rulesetId: "popular",
  viewerSeat: 0,
} as PlayerGameProjection;

describe("JK-004 reconnect readiness", () => {
  it("accepts a coherent room/game/viewer snapshot", () => {
    expect(isCoherentTableSnapshot({ room, projection, expectedGameId: "game-1" })).toBe(true);
  });

  it("fails closed on mismatched game identity", () => {
    expect(isCoherentTableSnapshot({ room, projection, expectedGameId: "other-game" })).toBe(false);
  });

  it("fails closed when viewer seat mapping is missing", () => {
    const missingViewer = { ...room, seats: room.seats.map((seat) => seat.index === 0 ? { index: 0, occupant: { type: "empty" as const } } : seat) };
    expect(isCoherentTableSnapshot({ room: missingViewer, projection, expectedGameId: "game-1" })).toBe(false);
  });
});
