import type { SeatIndex } from "@/domain/dealing";
import type { PlayedCard } from "@/domain/engine";
import { cardFlightPose } from "../cardFlightMotion";
import { pinnedStackPose, stackRotation, trickExitPoint } from "../trickCollectionMotion";
import { TRICK_CARD_ROTATION, trickPresentationTiming } from "../trickPresentationModel";
import { COLLECTION_FADE_MS, REDUCED_MOTION_DISTANCE_PX } from "../presentationTiming";
import type { TableGeometry, VisualSeat } from "../useTableGeometry";
import { fromBelow, jokerPose } from "./jokerMotion";
import { NORMAL_FROM_BELOW_FLIGHT_MS } from "../presentationTiming";
import type { SpritePose } from "./types";

export type TrickStage = "landing" | "holding" | "stacking" | "collecting";
function collectionProgress(time: number) {
  if (time === 0 || time === 1) return time;
  const curve = (t: number, a: number, b: number) =>
    3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0,
    high = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (low + high) / 2;
    if (curve(mid, 0.4, 1) < time) low = mid;
    else high = mid;
  }
  return curve((low + high) / 2, 0, 1);
}
export function trickSpriteMotion(
  play: PlayedCard,
  viewer: SeatIndex,
  geometry: TableGeometry,
  stage: TrickStage,
  winner: SeatIndex | null,
  reduced: boolean,
) {
  const pos = ((play.seatIndex - viewer + 4) % 4) as VisualSeat;
  const winnerPos = winner == null ? pos : (((winner - viewer + 4) % 4) as VisualSeat);
  const landing = geometry.trickSlots[pos],
    target = geometry.trickSlots[winnerPos];
  const rotation = TRICK_CARD_ROTATION[pos];
  const timing = trickPresentationTiming(reduced);
  const duration =
    stage === "stacking"
      ? timing.stackMs
      : stage === "collecting"
        ? timing.collectMs
        : fromBelow(play.joker) && !reduced
          ? NORMAL_FROM_BELOW_FLIGHT_MS
          : timing.settleMs;
  const absolute = (
    point: { x: number; y: number },
    angle: number,
    scale = 1,
    opacity = 1,
    flip = 0,
  ): SpritePose => ({
    x: geometry.feltRect.left + point.x,
    y: geometry.feltRect.top + point.y,
    width: geometry.trickCardSize.width * scale,
    height: geometry.trickCardSize.height * scale,
    rotation: angle,
    opacity,
    flip,
  });
  const exit = trickExitPoint(target, winnerPos, {
    ...geometry,
    dealCenter: {
      x: window.innerWidth / 2 - geometry.feltRect.left,
      y: window.innerHeight / 2 - geometry.feltRect.top,
    },
  });
  const motion = {
    duration,
    resting: absolute(landing, rotation),
    sample: (time: number): SpritePose => {
      const t = Math.max(0, Math.min(1, time));
      if (stage === "holding") return absolute(landing, rotation);
      if (stage === "landing") {
        if (t === 1) return absolute(landing, rotation);
        const eased = 1 - (1 - t) ** 2;
        if (reduced)
          return absolute(
            { x: landing.x, y: landing.y + REDUCED_MOTION_DISTANCE_PX * (1 - eased) },
            rotation,
            1,
            eased,
          );
        const pose = cardFlightPose(
          geometry.seatOrigins[pos],
          landing,
          rotation - 6,
          rotation,
          eased,
        );
        return absolute(pose.point, pose.rotation, 0.92 + 0.08 * eased);
      }
      if (reduced)
        return {
          ...absolute(landing, rotation, 1, stage === "collecting" ? 1 - t : 1, 0),
          ...(stage === "collecting"
            ? { backBlend: Math.min(1, (duration * t) / COLLECTION_FADE_MS) }
            : {}),
        };
      if (stage === "stacking") {
        const pose = pinnedStackPose(
          landing,
          target,
          pos,
          winnerPos,
          geometry.trickCardSize.height,
          (1 - Math.cos(t * Math.PI)) / 2,
        );
        return absolute(pose.point, pose.rotation);
      }
      // Accelerating exit, preserving duration and the existing final fade window.
      const eased = collectionProgress(t);
      const fade = Math.max(0, Math.min(1, (duration * (1 - t)) / COLLECTION_FADE_MS));
      return {
        ...absolute(
          { x: target.x + (exit.x - target.x) * eased, y: target.y + (exit.y - target.y) * eased },
          stackRotation(pos, winnerPos),
          1,
          fade,
          0,
        ),
        backBlend: Math.min(1, (duration * t) / COLLECTION_FADE_MS),
      };
    },
  };
  const resting = fromBelow(play.joker)
    ? { ...motion.resting, ...jokerPose(play.joker, 1, duration, reduced) }
    : motion.resting;
  return {
    duration,
    resting,
    sample(time: number): SpritePose {
      const pose = motion.sample(time);
      if (!fromBelow(play.joker)) return pose;
      if (stage === "landing")
        return { ...pose, ...jokerPose(play.joker, time, duration, reduced) };
      return { ...pose, flip: reduced ? 0 : 180, backBlend: reduced ? 1 : 0, layer: 0 };
    },
  };
}
