import { assets } from "@/assets/registry";
import type { Card } from "@/domain/cards";
import { dealtCardPose, dealProgress } from "../dealtCardMotion";
import {
  NORMAL_DEAL_TRAVEL_MS,
  NORMAL_DEAL_STAGGER_MS,
  NORMAL_DEAL_HANDOFF_TRAVEL_MS,
  NORMAL_DEAL_HANDOFF_FADE_DELAY_MS,
  NORMAL_DEAL_HANDOFF_FADE_MS,
} from "../dealPresentationModel";
import { STACK_SCATTER_OFFSET, STACK_SCATTER_TILT, dealerCardOrientation, SEAT_ROTATION } from "../DealPresentation";
import type { Point, TableGeometry, VisualSeat } from "../useTableGeometry";
import type { PresentationSprite } from "./CanvasPresentation";
import type { SpritePose } from "./types";
export type CanvasDealBeat = { id: string; seat: number; stackIndex: number; card?: Card };
export const dealRotation = [0, 90, 180, -90] as const;
export function dealSource(geometry: TableGeometry, dealer: VisualSeat) {
  const cardW = geometry.trickCardSize.width * 1.22;
  const cardH = geometry.trickCardSize.height * 1.22;
  const viewportBottom = geometry.dealExitTargets?.[0]
    ? geometry.feltRect.top + geometry.dealExitTargets[0].y
    : geometry.feltRect.top + geometry.feltRect.height + cardH * 0.5;
  const viewportTop = geometry.dealExitTargets?.[2]
    ? geometry.feltRect.top + geometry.dealExitTargets[2].y
    : 0;
  const viewportLeft = geometry.dealExitTargets?.[1]
    ? geometry.feltRect.left + geometry.dealExitTargets[1].x
    : 0;
  const viewportRight = geometry.dealExitTargets?.[3]
    ? geometry.feltRect.left + geometry.dealExitTargets[3].x
    : geometry.feltRect.left + geometry.feltRect.width + cardH * 0.5;

  if (dealer === 0) {
    const centerX = geometry.feltRect.left + geometry.dealCenter.x;
    const x = Math.max(viewportLeft + cardW * 0.6, centerX * 0.48);
    const y = viewportBottom - cardH * 0.18;
    return { x, y };
  }
  if (dealer === 2) {
    const x = geometry.feltRect.left + geometry.dealCenter.x - cardW * 1.3;
    const y = geometry.feltRect.top - cardH * 0.15;
    return { x, y };
  }
  if (dealer === 1) {
    const x = Math.max(0, viewportLeft) + cardH * 0.36;
    const y = geometry.feltRect.top + geometry.dealCenter.y;
    return { x, y };
  }
  if (dealer === 3) {
    const x = viewportRight - cardH * 0.15;
    const y = geometry.feltRect.top + geometry.dealCenter.y;
    return { x, y };
  }
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
  finalAce = false,
): PresentationSprite {
  const pos = ((beat.seat - viewer + 4) % 4) as VisualSeat;
  const source = dealSource(geometry, dealer);
  const scatter = STACK_SCATTER_OFFSET[beat.stackIndex % STACK_SCATTER_OFFSET.length];
  const clearanceOffset: Record<VisualSeat, Point> = {
    0: { x: 0, y: 18 },
    1: { x: -14, y: 0 },
    2: { x: 0, y: -18 },
    3: { x: 14, y: 0 },
  };
  const clearance = mode === "selection" ? clearanceOffset[pos] : { x: 0, y: 0 };
  const target = {
    x: geometry.feltRect.left + geometry.dealTargets[pos].x + scatter.x + clearance.x,
    y: geometry.feltRect.top + geometry.dealTargets[pos].y + scatter.y + clearance.y,
  };
  const dealerBaseRotation = dealerCardOrientation(dealer);
  const targetBaseRotation = mode === "selection" ? SEAT_ROTATION[pos] : dealerBaseRotation;
  const tilt = mode === "selection" ? 0 : STACK_SCATTER_TILT[beat.stackIndex % STACK_SCATTER_TILT.length];
  const startRotation = dealerBaseRotation;
  const rotation = targetBaseRotation + tilt;
  const base = (
    point: Point,
    angle: number,
    scale = 1,
    opacity = 1,
    shadowBlur?: number,
    shadowOffsetY?: number,
    shadowOffsetX?: number,
    flip = 0,
    emphasis = false,
  ): SpritePose => ({
    x: point.x,
    y: point.y,
    width: width * scale,
    height: width * 1.4 * scale,
    rotation: angle,
    opacity,
    flip,
    shadowBlur,
    shadowOffsetY,
    shadowOffsetX,
    emphasis,
  });
  const flightDuration = NORMAL_DEAL_TRAVEL_MS;
  return {
    id: beat.id,
    url: beat.card ? assets.cardFace(beat.card)! : assets.cardBack,
    backUrl: mode === "selection" ? assets.cardBack : undefined,
    layer: settling ? 20 + beat.stackIndex : retained ? 25 + beat.stackIndex : 60,
    phase: settling ? "handoff" : retained ? "retained" : "flight",
    duration: settling
      ? NORMAL_DEAL_HANDOFF_FADE_DELAY_MS + NORMAL_DEAL_HANDOFF_FADE_MS
      : retained
        ? 0
        : flightDuration,
    sample: (t) => {
      if (retained && !settling) return base(target, rotation, 1, 1, finalAce ? 18 : 4, 2, 0, 0, finalAce);
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
          4,
          2,
          0,
        );
      }
      if (reduced) return base({ x: target.x, y: target.y + 12 * (1 - t) }, rotation, 1, t, 4, 2, 0, 0, finalAce);
      const p = dealProgress(t);
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      // Straight flight trajectory across the table
      const point = {
        x: source.x + dx * p,
        y: source.y + dy * p,
      };
      // 3D Parabolic elevation: peaks at 1.0 at mid-flight
      const arc = 4 * p * (1 - p);
      const angle = startRotation + (rotation - startRotation) * p;
      // Scale: starts at 1.22x, lifts to ~1.35x at apex, descends smoothly to 1.0x at landing
      const scale = p === 1 ? 1 : 1.22 - 0.22 * p + 0.16 * arc;
      // 3D Altitude Shadow: separates below (offset & scale) while keeping blur bounded for mobile GPU efficiency
      const shadowBlur = Math.round(3 + 3 * arc + 2 * (1 - p));
      const shadowOffsetY = Math.round(3 + 18 * arc + 4 * (1 - p));
      const shadowOffsetX = Math.round(-3 * (1 - p));
      const flip = mode === "selection" ? Math.max(0, (1 - p * 2) * 180) : 0;
      return base(point, angle, scale, 1, shadowBlur, shadowOffsetY, shadowOffsetX, flip, finalAce && p === 1);
    },
  };
}
