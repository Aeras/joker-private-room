/** Client presentation only. These values never select actors or advance game rules.
 * Keep the approved normal pacing unchanged; CSS and completion fallbacks import
 * the same durations. Server scheduling/timeout policy remains server-owned.
 */
export const LOCAL_FLIGHT_MS = 300;
export const REDUCED_LOCAL_FLIGHT_MS = 75;
export const MOTION_FALLBACK_SLACK_MS = 120;
export const NORMAL_TRICK_SETTLE_MS = 340;
export const NORMAL_FROM_BELOW_FLIGHT_MS = 450;
export const NORMAL_FROM_BELOW_FLIP_MS = 300;
export const NORMAL_TRICK_INTER_PLAY_BEAT_MS = 0;
export const NORMAL_TRICK_PLAY_SPACING_MS =
  NORMAL_TRICK_SETTLE_MS + NORMAL_TRICK_INTER_PLAY_BEAT_MS;
export const REDUCED_TRICK_SETTLE_MS = 80;
export const REDUCED_TRICK_INTER_PLAY_BEAT_MS = 120;
export const REDUCED_TRICK_PLAY_SPACING_MS =
  REDUCED_TRICK_SETTLE_MS + REDUCED_TRICK_INTER_PLAY_BEAT_MS;
export const NORMAL_TRICK_HOLD_MS = 550;
export const NORMAL_TRICK_STACK_MS = 250;
export const NORMAL_TRICK_COLLECT_MS = 380;
export const REDUCED_TRICK_HOLD_MS = 180;
export const REDUCED_TRICK_STACK_MS = 80;
export const REDUCED_TRICK_COLLECT_MS = 120;
export const COLLISION_FAST_FORWARD_MS = 160;
export const COLLECTION_FADE_MS = 120;
export const JOKER_ANNOUNCEMENT_MS = 3_000;
export const DECLARATION_BUBBLE_MS = 2_000;
export const NORMAL_DEAL_STAGGER_MS = 350;
export const NORMAL_DEAL_TRAVEL_MS = 308;
export const NORMAL_DEAL_HANDOFF_TRAVEL_MS = 600;
export const NORMAL_DEAL_HANDOFF_FADE_DELAY_MS = NORMAL_DEAL_HANDOFF_TRAVEL_MS;
export const NORMAL_DEAL_HANDOFF_FADE_MS = 350;
export const LOCAL_HAND_ENTRANCE_MS = 600;
export const NORMAL_DEAL_SETTLE_MS = NORMAL_DEAL_HANDOFF_FADE_DELAY_MS + LOCAL_HAND_ENTRANCE_MS;
export const NORMAL_DEAL_TAIL_MS = 72;
export const DEALER_START_CUE_MS = 350;
export const DEALER_SELECTION_STAGGER_MS = 350;
export const DEALER_SELECTION_CARD_TRAVEL_MS = 308;
export const DEALER_SELECTION_WINNER_HOLD_MS = 490;
export const NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS = 1_800;
export const TRUMP_FLIP_MS = 400;
export const TRUMP_DECK_MOVE_MS = 500;
export const HAND_REVEAL_SPREAD_MS = 520;
export const HAND_REFLOW_MS = 250;
export const REDUCED_MOTION_DISTANCE_PX = 12;
