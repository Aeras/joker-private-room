import type { DurakGameView } from "@/services/durakRoomFunctions";
import type { DurakRenderState, DurakPlayerRenderState } from "../types/renderState";
import { assets } from "@/assets/registry";

export function createDurakRenderState(
  game: DurakGameView,
  seats: Array<{ index: number; name: string | null; occupant: string }>,
  isBusy = false,
  isDealing = false,
  isPresenting = false
): DurakRenderState {
  const localSeat = game.seat;
  const playerCount = game.handSizes.length as 2 | 3 | 4 | 5 | 6;

  // Build sanitized players array
  const players: DurakPlayerRenderState[] = game.handSizes.map((handCount, seatIndex) => {
    // Relative seat: distance clockwise from local player
    const relativeSeat = (seatIndex - localSeat + playerCount) % playerCount;
    const seatInfo = seats.find((s) => s.index === seatIndex);
    const displayName = seatInfo?.name || `Παίκτης ${seatIndex + 1}`;
    const avatarUrl = seatInfo?.name ? assets.avatar(seatInfo.occupant, seatInfo.name) : undefined;

    let role: "attacker" | "defender" | "idle" = "idle";
    if (seatIndex === game.attacker) role = "attacker";
    else if (seatIndex === game.defender) role = "defender";

    const isLocal = seatIndex === localSeat;
    const isActive = seatIndex === game.attacker || seatIndex === game.defender;

    return {
      seat: seatIndex,
      relativeSeat,
      displayName,
      avatarUrl,
      handCount,
      role,
      isLocal,
      isActive,
    };
  });

  return {
    revision: game.revision,
    round: game.round,
    localSeat,
    playerCount,
    players,
    localHand: game.myHand,
    stockCount: game.stock,
    trumpCard: game.trumpCard,
    trumpSuit: game.trump,
    pairs: game.pairs,
    discardCount: game.discardCount,
    legalMoves: game.legalMoves,
    isBusy,
    isDealing,
    isPresenting,
    isEnded: game.ended,
    variant: game.variant,
  };
}
