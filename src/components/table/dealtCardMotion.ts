import type { Point } from "./useTableGeometry";

export const HAND_LANDING_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
export const COLLECTION_EXIT_EASING = "cubic-bezier(0.4, 0, 1, 1)";
export const DEAL_FLIGHT_EASING = "cubic-bezier(0.2, 0.75, 0.25, 1)";
export const DEAL_LAUNCH_SCALE = 0.9;

export function bezierProgress(time: number, x1:number,y1:number,x2:number,y2:number): number {
  if (time === 0 || time === 1) return time;
  const curve = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2;
    if (curve(mid, x1, x2) < time) low = mid;
    else high = mid;
  }
  return curve((low + high) / 2, y1, y2);
}
export function dealProgress(time:number) {return bezierProgress(time,.2,.75,.25,1);}

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

/** 3D Parabolic Deal Flight with Dynamic Altitude Shadow & Scale Curve. */
export function dealtCard3DFlightFrames(start: Point, end: Point, startRotation: number, endRotation: number) {
  const dx = end.x - start.x, dy = end.y - start.y;

  return Array.from({ length: 25 }, (_, index) => {
    const time = index / 24;
    const t = dealProgress(time);
    const arc = 4 * t * (1 - t);
    const px = start.x + dx * t;
    const py = start.y + dy * t;
    const scale = 1.0 + 0.22 * (1 - t) + 0.16 * arc;
    const rotation = startRotation + (endRotation - startRotation) * t;

    const shadowY = 3 + 24 * arc + 6 * (1 - t);
    const shadowX = -3 * (1 - t);
    const shadowBlur = 4 + 20 * arc + 6 * (1 - t);
    const shadowOpacity = 0.38 + 0.20 * arc + 0.08 * (1 - t);

    return `${(time * 100).toFixed(1)}%{transform:translate(calc(-50% + ${px - start.x}px),calc(-50% + ${py - start.y}px)) scale(${scale.toFixed(3)}) rotate(${rotation.toFixed(2)}deg);filter:drop-shadow(${shadowX.toFixed(1)}px ${shadowY.toFixed(1)}px ${shadowBlur.toFixed(1)}px rgba(0,0,0,${shadowOpacity.toFixed(2)}))}`;
  }).join("");
}
