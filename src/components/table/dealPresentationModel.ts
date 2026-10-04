export const NORMAL_DEAL_STAGGER_MS = 130;
export const REDUCED_DEAL_STAGGER_MS = 45;
export const NORMAL_DEAL_TAIL_MS = 280;
export const REDUCED_DEAL_TAIL_MS = 100;

export function dealPresentationTiming(reducedMotion: boolean) {
  return reducedMotion
    ? { staggerMs: REDUCED_DEAL_STAGGER_MS, tailMs: REDUCED_DEAL_TAIL_MS }
    : { staggerMs: NORMAL_DEAL_STAGGER_MS, tailMs: NORMAL_DEAL_TAIL_MS };
}
