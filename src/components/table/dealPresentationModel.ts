import { presentationWasCompleted } from "./presentationCompletion";
export const NORMAL_DEAL_STAGGER_MS = 350;
export const NORMAL_DEAL_TRAVEL_MS = 308;
// Piles travel visibly before fading; the hand rises during the fade.
export const NORMAL_DEAL_HANDOFF_TRAVEL_MS = 750;
export const NORMAL_DEAL_HANDOFF_FADE_DELAY_MS = NORMAL_DEAL_HANDOFF_TRAVEL_MS;
export const NORMAL_DEAL_HANDOFF_FADE_MS = 250;
export const LOCAL_HAND_ENTRANCE_MS = 250;
export const NORMAL_DEAL_SETTLE_MS = NORMAL_DEAL_HANDOFF_FADE_DELAY_MS + LOCAL_HAND_ENTRANCE_MS;
export const NORMAL_DEAL_TAIL_MS = 72;

export function dealPresentationTiming(_reducedMotion: boolean) {
  return { staggerMs: NORMAL_DEAL_STAGGER_MS, settleMs: NORMAL_DEAL_SETTLE_MS, tailMs: NORMAL_DEAL_TAIL_MS };
}

export function dealPresentationStageKey(
  gameId: string,
  dealNumber: number,
  dealerSeat: number | null,
  stage: "initial" | "remaining" | "full",
): string {
  return `${gameId}:${dealNumber}:${dealerSeat ?? "none"}:${stage}`;
}

export function dealPresentationStorageKey(stageKey: string): string {
  return `joker:deal-presented:${stageKey}`;
}

export function dealPresentationWasCompleted(stageKey: string): boolean { return presentationWasCompleted(dealPresentationStorageKey(stageKey)); }

