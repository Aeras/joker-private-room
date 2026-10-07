import { presentationWasCompleted } from "./presentationCompletion";
export const NORMAL_DEAL_STAGGER_MS = 350;
export const NORMAL_DEAL_TRAVEL_MS = 308;
export const NORMAL_DEAL_SETTLE_MS = 520;
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
