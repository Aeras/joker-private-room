/** DURAK opening: six closed cards per seat, then trump flip and stock placement. */
export const DURAK_DEAL_STAGGER_MS = 55;
export const DURAK_DEAL_FLIGHT_MS = 320;
export const DURAK_TRUMP_FLIP_MS = 360;
export const DURAK_STOCK_PLACE_MS = 420;
export function durakDealTiming(players: number) {
  const revealAt = (players * 6 - 1) * DURAK_DEAL_STAGGER_MS + DURAK_DEAL_FLIGHT_MS + 120;
  return {
    revealAt,
    placeAt: revealAt + DURAK_TRUMP_FLIP_MS,
    duration: revealAt + DURAK_TRUMP_FLIP_MS + DURAK_STOCK_PLACE_MS + 120,
  };
}
