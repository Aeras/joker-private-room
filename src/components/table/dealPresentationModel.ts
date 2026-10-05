export const NORMAL_DEAL_STAGGER_MS = 500;
export const NORMAL_DEAL_TRAVEL_MS = 440;
export const NORMAL_DEAL_TAIL_MS = 320;

export function dealPresentationTiming(_reducedMotion: boolean) {
  return { staggerMs: NORMAL_DEAL_STAGGER_MS, tailMs: NORMAL_DEAL_TAIL_MS };
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

export function dealPresentationWasCompleted(stageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(dealPresentationStorageKey(stageKey)) === "1";
  } catch {
    return false;
  }
}
