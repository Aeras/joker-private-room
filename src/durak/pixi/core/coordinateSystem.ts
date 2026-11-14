export type DurakViewport = {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly scale: number;
  readonly dpr: number;
};

/** Logical coordinate space: standard 16:9 logical space with aspect scaling */
export const LOGICAL_WIDTH = 1920;
export const LOGICAL_HEIGHT = 1080;

export function calculateViewport(
  containerWidth: number,
  containerHeight: number,
  devicePixelRatio: number = 1
): DurakViewport {
  const w = Math.max(320, containerWidth);
  const h = Math.max(180, containerHeight);

  // Responsive scale: Cover whole screen while preserving logical ratio for game objects
  const scale = Math.max(w / LOGICAL_WIDTH, h / LOGICAL_HEIGHT);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5); // Cap DPR to 2.5 for mobile performance

  return {
    screenWidth: w,
    screenHeight: h,
    logicalWidth: LOGICAL_WIDTH,
    logicalHeight: LOGICAL_HEIGHT,
    scale,
    dpr,
  };
}
