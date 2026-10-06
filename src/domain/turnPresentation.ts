import type { CanonicalGameState } from "./gameState";
import type { SeatIndex } from "./dealing";
import { humanDeadlineFromServerTime } from "./controller";

/** Public event identity is frozen when the play commits; acknowledgement versions
 * are deliberately not event identities. No card/winner is computed by a client. */
export interface TurnPresentationBoundary {
  token: number;
  requiredSeats: SeatIndex[];
  completedSeats: SeatIndex[];
  fallbackAt: string;
}
export const TURN_PRESENTATION_FALLBACK_MS = 30_000;

export function holdPlayedEvent(state: CanonicalGameState, serverNow: string): CanonicalGameState {
  const requiredSeats = state.seats
    .filter((seat) => seat.owner.type === "human")
    .map((seat) => seat.seatIndex);
  if (!requiredSeats.length) return state;
  return {
    ...state,
    timing: {
      ...state.timing,
      currentHumanDeadline: null,
      turnPresentation: {
        token: state.stateVersion,
        requiredSeats,
        completedSeats: [],
        fallbackAt: new Date(Date.parse(serverNow) + TURN_PRESENTATION_FALLBACK_MS).toISOString(),
      },
    },
  };
}

export function releasePlayedEvent(
  state: CanonicalGameState,
  serverNow: string,
): CanonicalGameState {
  if (!state.timing.turnPresentation) return state;
  const actor = state.progression.currentActorSeat;
  const { turnPresentation: _completed, ...timing } = state.timing;
  return {
    ...state,
    stateVersion: state.stateVersion + 1,
    timing: {
      ...timing,
      currentHumanDeadline:
        actor != null &&
        state.seats[actor].controller === "human" &&
        !state.seats[actor].reclaimable
          ? humanDeadlineFromServerTime(serverNow)
          : null,
    },
  };
}

export function acknowledgePlayedEvent(
  state: CanonicalGameState,
  seat: SeatIndex,
  token: number,
  serverNow: string,
) {
  const boundary = state.timing.turnPresentation;
  if (!boundary || token < boundary.token || boundary.completedSeats.includes(seat))
    return { state, replayed: true };
  if (token !== boundary.token || !boundary.requiredSeats.includes(seat))
    throw new Error("Invalid presentation acknowledgement");
  const completedSeats = [...boundary.completedSeats, seat].sort() as SeatIndex[];
  const next = {
    ...state,
    stateVersion: state.stateVersion + 1,
    timing: { ...state.timing, turnPresentation: { ...boundary, completedSeats } },
  };
  if (boundary.requiredSeats.every((index) => completedSeats.includes(index))) {
    const released = releasePlayedEvent(next, serverNow);
    return { state: { ...released, stateVersion: next.stateVersion }, replayed: false };
  }
  return { state: next, replayed: false };
}
