/** DURAK opening: six closed cards per seat, then trump flip and stock placement.
 * Fast pipelined deal cadence matching Joker: snappy flight, overlapping beats,
 * single messy stack per player, and smooth handoff landing.
 */
export const DURAK_DEAL_STAGGER_MS = 70;
export const DURAK_DEAL_FLIGHT_MS = 220;
export const DURAK_TRUMP_FLIP_MS = 320;
export const DURAK_TRUMP_PLACE_MS = 350;
export const DURAK_STOCK_PLACE_MS = 350;
export const DURAK_HAND_EXIT_MS = 240;
export const DURAK_HAND_ENTRANCE_MS = 500;
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
