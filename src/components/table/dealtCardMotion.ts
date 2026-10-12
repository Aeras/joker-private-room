import type { Point } from "./useTableGeometry";

export const HAND_LANDING_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
export const COLLECTION_EXIT_EASING = "cubic-bezier(0.4, 0, 1, 1)";
export const DEAL_FLIGHT_EASING = "cubic-bezier(0.2, 0.75, 0.25, 1)";
export const DEAL_LAUNCH_SCALE = 0.9;

function dealProgress(time: number): number {
  if (time === 0 || time === 1) return time;
  const curve = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2;
    if (curve(mid, 0.2, 0.25) < time) low = mid;
    else high = mid;
  }
  return curve((low + high) / 2, 0.75, 1);
}

/** Small table-space arc. Endpoints remain identical to the measured pile positions. */
export function dealtCardPose(start: Point, end: Point, startRotation: number, endRotation: number, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const dx = end.x - start.x, dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const bow = Math.min(16, distance * 0.035);
  const arc = 4 * t * (1 - t);
  const flourish = distance > 0 && t > 0 && t < 1 ? Math.sin(Math.PI * t) * 3 : 0;
  return {
    point: {
      x: start.x + dx * t + (distance ? -dy / distance : 0) * bow * arc,
      y: start.y + dy * t + (distance ? dx / distance : 0) * bow * arc,
    },
    rotation: startRotation + (endRotation - startRotation) * t + flourish,
    scale: t === 1 ? 1 : DEAL_LAUNCH_SCALE + (1 - DEAL_LAUNCH_SCALE) * t,
  };
}

/** CSS owns interpolation; React never drives individual animation frames. */
export function dealtCardFrames(start: Point, end: Point, startRotation: number, endRotation: number) {
  return Array.from({ length: 21 }, (_, index) => {
    const time = index / 20;
    // Sample easing once across the whole flight; segment easing would create 20 tiny pauses.
    const pose = dealtCardPose(start, end, startRotation, endRotation, dealProgress(time));
    return `${time * 100}%{transform:translate(calc(-50% + ${pose.point.x - start.x}px),calc(-50% + ${pose.point.y - start.y}px)) scale(${pose.scale}) rotate(${pose.rotation}deg)}`;
  }).join("");
}
