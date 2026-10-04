export const NORMAL_DEAL_STAGGER_MS = 350;
export const REDUCED_DEAL_STAGGER_MS = 90;
export const NORMAL_DEAL_TAIL_MS = 320;
export const REDUCED_DEAL_TAIL_MS = 120;

export function dealPresentationTiming(reducedMotion: boolean) {
  return reducedMotion
    ? { staggerMs: REDUCED_DEAL_STAGGER_MS, tailMs: REDUCED_DEAL_TAIL_MS }
    : { staggerMs: NORMAL_DEAL_STAGGER_MS, tailMs: NORMAL_DEAL_TAIL_MS };
}
