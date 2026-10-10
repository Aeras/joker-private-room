import type { Point } from "./useTableGeometry";

/** Presentation-only quadratic arc; endpoints and canonical card orientation stay exact. */
export function cardFlightPose(start: Point, end: Point, startRotation: number, endRotation: number, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const bow = Math.min(32, length * 0.075);
  const normal = length ? { x: -dy / length, y: dx / length } : { x: 0, y: 0 };
  const arc = 4 * t * (1 - t);
  return {
    point: { x: start.x + dx * t + normal.x * bow * arc, y: start.y + dy * t + normal.y * bow * arc },
    rotation: startRotation + (endRotation - startRotation) * t + Math.sin(Math.PI * t) * 7,
  };
}

/** Ease-out sampled into keyframes; no React frame loop or independent timing clock. */
export function cardFlightFrames(transform: (point: Point, rotation: number, t: number) => string, start: Point, end: Point, startRotation: number, endRotation: number): string {
  return Array.from({ length: 21 }, (_, index) => {
    const time = index / 20;
    const t = 1 - Math.pow(1 - time, 2);
    const pose = cardFlightPose(start, end, startRotation, endRotation, t);
    return `${time * 100}%{transform:${transform(pose.point, pose.rotation, t)}}`;
  }).join("");
}
