/** DURAK opening: six closed cards per seat, then trump flip and stock placement.
 * Elegant human deal cadence matching Joker: rhythmic overlapping flight,
 * single neat stack per player, smooth edge handoff, and 3D card flips.
 */
export const DURAK_DEAL_STAGGER_MS = 180;
export const DURAK_DEAL_FLIGHT_MS = 350;
export const DURAK_TRUMP_FLIP_MS = 650;
export const DURAK_TRUMP_PLACE_MS = 600;
export const DURAK_STOCK_PLACE_MS = 500;
export const DURAK_HAND_EXIT_MS = 700;
export const DURAK_HAND_ENTRANCE_MS = 850;

export function durakDealTiming(players: number) {
  const revealAt = (players * 6 - 1) * DURAK_DEAL_STAGGER_MS + DURAK_DEAL_FLIGHT_MS + 120;
  const placeAt = revealAt + DURAK_TRUMP_FLIP_MS;
  const stockAt = placeAt + DURAK_TRUMP_PLACE_MS;
  const exitAt = stockAt + DURAK_STOCK_PLACE_MS + 120;
  const handAt = exitAt + DURAK_HAND_EXIT_MS;
  const duration = handAt + DURAK_HAND_ENTRANCE_MS + 120;

  return {
    revealAt,
    placeAt,
    stockAt,
    exitAt,
    handAt,
    duration,
  };
}
