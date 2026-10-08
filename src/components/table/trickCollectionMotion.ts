import type { Point, TableGeometry, VisualSeat } from "./useTableGeometry";
import { TRICK_CARD_ROTATION } from "./trickPresentationModel";

export function stackRotation(pos: VisualSeat, winner: VisualSeat): number {
  const start = TRICK_CARD_ROTATION[pos];
  return start + ((TRICK_CARD_ROTATION[winner] - start + 540) % 360 - 180);
}
function rotate(point: Point, degrees: number): Point {
  const angle = degrees * Math.PI / 180;
  return { x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle) };
}
/** Swing around the winner's top edge; ease the small anchor differences into alignment. */
export function pinnedStackPose(start: Point, target: Point, pos: VisualSeat, winner: VisualSeat, height: number, progress: number) {
  const startRotation = TRICK_CARD_ROTATION[pos];
  const delta = stackRotation(pos, winner) - startRotation;
  const top = rotate({ x: 0, y: -height / 2 }, TRICK_CARD_ROTATION[winner]);
  const pivot = { x: target.x + top.x, y: target.y + top.y };
  const offset = { x: start.x - pivot.x, y: start.y - pivot.y };
  const orbit = rotate(offset, delta * progress);
  const end = rotate(offset, delta);
  return {
    point: { x: pivot.x + orbit.x + progress * (target.x - pivot.x - end.x), y: pivot.y + orbit.y + progress * (target.y - pivot.y - end.y) },
    rotation: startRotation + delta * progress,
  };
}
/** Exit along the winning seat's axis, completely past the visible screen edge. */
export function trickExitPoint(stack: Point, winner: VisualSeat, geometry: TableGeometry | null): Point {
  const left = geometry?.feltRect.left ?? 0; const top = geometry?.feltRect.top ?? 0;
  const width = geometry ? 2 * (left + geometry.dealCenter.x) : window.innerWidth;
  const height = geometry ? 2 * (top + geometry.dealCenter.y) : window.innerHeight;
  const margin = (geometry?.trickCardSize.height ?? 100) + 24;
  return winner === 0 ? { x: stack.x, y: height - top + margin }
    : winner === 2 ? { x: stack.x, y: -top - margin }
    : winner === 1 ? { x: -left - margin, y: stack.y }
    : { x: width - left + margin, y: stack.y };
}
