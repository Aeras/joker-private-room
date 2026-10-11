/** DURAK opening: six closed cards per seat, then trump flip and stock placement. */
export const DURAK_DEAL_STAGGER_MS = 200;
export const DURAK_DEAL_FLIGHT_MS = 420;
export const DURAK_TRUMP_FLIP_MS = 550;
export const DURAK_TRUMP_PLACE_MS = 600;
export const DURAK_STOCK_PLACE_MS = 600;
export const DURAK_HAND_EXIT_MS = 400;
export const DURAK_HAND_ENTRANCE_MS = 420;
export function durakDealTiming(players: number) {
  const revealAt = (players * 6 - 1) * DURAK_DEAL_STAGGER_MS + DURAK_DEAL_FLIGHT_MS + 120;
  const exitAt = revealAt + DURAK_TRUMP_FLIP_MS + DURAK_TRUMP_PLACE_MS + DURAK_STOCK_PLACE_MS + 120;
  return {
    revealAt,
    placeAt: revealAt + DURAK_TRUMP_FLIP_MS,
    stockAt: revealAt + DURAK_TRUMP_FLIP_MS + DURAK_TRUMP_PLACE_MS,
    exitAt,
    handAt: exitAt + DURAK_HAND_EXIT_MS,
    duration: exitAt + DURAK_HAND_EXIT_MS + DURAK_HAND_ENTRANCE_MS + 120,
  };
}
