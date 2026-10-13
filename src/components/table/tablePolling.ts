import type { PlayerGameProjection } from "@/domain/projection";
export const BOT_PROJECTION_POLL_MS = 200;
export const REMOTE_HUMAN_PLAY_POLL_MS = 350;
export const IDLE_PROJECTION_POLL_MS = 1500;
/** Public-state scheduling only. Foreground checks and the single-flight lock
 * remain in the route; this never advances a turn or authorizes a move. */
export function tablePollInterval(projection: PlayerGameProjection | null): number {
  const actor = projection?.progression.currentActorSeat;
  if (
    !projection ||
    projection.lifecycle !== "active" ||
    actor == null ||
    projection.timing?.turnPresentation
  )
    return IDLE_PROJECTION_POLL_MS;
  if (projection.seats[actor].controller !== "human") return BOT_PROJECTION_POLL_MS;
  if (actor !== projection.viewerSeat && projection.progression.phase === "CARD_PLAY")
    return REMOTE_HUMAN_PLAY_POLL_MS;
  return IDLE_PROJECTION_POLL_MS;
}
