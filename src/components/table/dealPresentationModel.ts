import { presentationWasCompleted } from "./presentationCompletion";
import { NORMAL_DEAL_STAGGER_MS, NORMAL_DEAL_SETTLE_MS, NORMAL_DEAL_TAIL_MS } from "./presentationTiming";
export { NORMAL_DEAL_STAGGER_MS, NORMAL_DEAL_TRAVEL_MS, NORMAL_DEAL_HANDOFF_TRAVEL_MS, NORMAL_DEAL_HANDOFF_FADE_DELAY_MS, NORMAL_DEAL_HANDOFF_FADE_MS, LOCAL_HAND_ENTRANCE_MS, NORMAL_DEAL_SETTLE_MS, NORMAL_DEAL_TAIL_MS } from "./presentationTiming";
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
