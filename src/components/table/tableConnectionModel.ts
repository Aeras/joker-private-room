import type { Room } from "@/domain/players";
import type { PlayerGameProjection } from "@/domain/projection";

export type TableConnectionStatus = "initial-loading" | "ready" | "reconnecting" | "failed";

/**
 * Strongest client-visible snapshot coherence check available without adding a
 * second server contract. Game projection remains gameplay authority; room is
 * accepted only when it points at the same game/ruleset and has a real occupant
 * for the authoritative viewer seat.
 */
export function isCoherentTableSnapshot(input: {
  room: Room;
  projection: PlayerGameProjection;
  expectedGameId: string;
}): boolean {
  const { room, projection, expectedGameId } = input;
  if (projection.gameId !== expectedGameId) return false;
  if (room.gameId !== expectedGameId) return false;
  if (room.status !== "playing") return false;
  if (room.rulesetId !== projection.rulesetId) return false;
  if (!projection.roomId) return false;
  const viewerSeat = room.seats[projection.viewerSeat];
  if (!viewerSeat || viewerSeat.index !== projection.viewerSeat) return false;
  if (viewerSeat.occupant.type === "empty") return false;
  return true;
}
