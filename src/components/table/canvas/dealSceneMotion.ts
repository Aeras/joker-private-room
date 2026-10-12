import { assets } from "@/assets/registry";
import type { Card } from "@/domain/cards";
import { dealtCardPose, dealProgress } from "../dealtCardMotion";
import {
  NORMAL_DEAL_TRAVEL_MS,
  NORMAL_DEAL_HANDOFF_TRAVEL_MS,
  NORMAL_DEAL_HANDOFF_FADE_DELAY_MS,
  NORMAL_DEAL_HANDOFF_FADE_MS,
} from "../dealPresentationModel";
import type { Point, TableGeometry, VisualSeat } from "../useTableGeometry";
import type { PresentationSprite } from "./CanvasPresentation";
import type { SpritePose } from "./types";
export type CanvasDealBeat = { id: string; seat: number; stackIndex: number; card?: Card };
export const dealRotation = [0, 90, 180, -90] as const;
export function dealSource(geometry: TableGeometry, dealer: VisualSeat) {
  const origin = geometry.seatOrigins[dealer],
    center = geometry.dealCenter;
  const dx = center.x - origin.x,
    dy = center.y - origin.y,
    length = Math.hypot(dx, dy) || 1;
  const distance = Math.max(24, Math.min(44, geometry.trickCardSize.height * 0.42));
  return {
    x: geometry.feltRect.left + origin.x + (dx / length) * distance,
    y: geometry.feltRect.top + origin.y + (dy / length) * distance,
  };
}
export function dealSprite(
  beat: CanvasDealBeat,
  geometry: TableGeometry,
  viewer: number,
  dealer: VisualSeat,
  width: number,
  mode: "deal" | "selection",
  settling = false,
  retained = false,
  reduced = false,
): PresentationSprite {
  const pos = ((beat.seat - viewer + 4) % 4) as VisualSeat;
  const source =
    mode === "selection"
      ? {
          x: geometry.feltRect.left + geometry.dealCenter.x,
          y: geometry.feltRect.top + geometry.dealCenter.y,
        }
      : dealSource(geometry, dealer);
  const target = {
    x:
      geometry.feltRect.left +
      geometry.dealTargets[pos].x +
      (pos === 3 ? -1 : 1) * beat.stackIndex * 6,
    y: geometry.feltRect.top + geometry.dealTargets[pos].y + beat.stackIndex * 2,
  };
  const startRotation = mode === "selection" ? 0 : dealRotation[dealer],
    rotation = mode === "selection" ? 0 : dealRotation[pos];
  const base = (point: Point, angle: number, scale = 1, opacity = 1): SpritePose => ({
    x: point.x,
    y: point.y,
    width: width * scale,
    height: width * 1.4 * scale,
    rotation: angle,
    opacity,
    flip: 0,
  });
  return {
    id: beat.id,
    url: beat.card ? assets.cardFace(beat.card)! : assets.cardBack,
    layer: 30 + beat.stackIndex,
    phase: settling ? "handoff" : retained ? "retained" : "flight",
    duration: settling
      ? NORMAL_DEAL_HANDOFF_FADE_DELAY_MS + NORMAL_DEAL_HANDOFF_FADE_MS
      : retained
        ? 0
        : NORMAL_DEAL_TRAVEL_MS,
    sample: (t) => {
      if (retained && !settling) return base(target, rotation);
      if (settling) {
        const elapsed = t * (NORMAL_DEAL_HANDOFF_FADE_DELAY_MS + NORMAL_DEAL_HANDOFF_FADE_MS),
          travel = Math.min(1, elapsed / NORMAL_DEAL_HANDOFF_TRAVEL_MS);
        const edge = geometry.dealExitTargets?.[pos] ?? {
          x:
            pos === 1
              ? -geometry.feltRect.left
              : pos === 3
                ? geometry.feltRect.left + 2 * geometry.dealCenter.x
                : geometry.dealTargets[pos].x,
          y:
            pos === 0
              ? geometry.feltRect.top + 2 * geometry.dealCenter.y
              : pos === 2
                ? -geometry.feltRect.top
                : geometry.dealTargets[pos].y,
        };
        const margin = width * 0.7 + beat.stackIndex * 6 + 24;
        const end = {
          x:
            geometry.feltRect.left +
            edge.x +
            (pos === 1 ? -margin : pos === 3 ? margin : 0) +
            (pos === 3 ? -1 : 1) * beat.stackIndex * 6,
          y:
            geometry.feltRect.top +
            edge.y +
            (pos === 0 ? margin : pos === 2 ? -margin : 0) +
            beat.stackIndex * 2,
        };
        return base(
          reduced
            ? target
            : {
                x: target.x + (end.x - target.x) * travel,
                y: target.y + (end.y - target.y) * travel,
              },
          rotation,
          1,
          1 -
            Math.max(
              0,
              Math.min(
                1,
                (elapsed - NORMAL_DEAL_HANDOFF_FADE_DELAY_MS) / NORMAL_DEAL_HANDOFF_FADE_MS,
              ),
            ),
        );
      }
      if (reduced) return base({ x: target.x, y: target.y + 12 * (1 - t) }, rotation, 1, t);
      const pose = dealtCardPose(source, target, startRotation, rotation, dealProgress(t));
      return base(pose.point, pose.rotation, pose.scale);
    },
  };
}
