import type { SpritePose } from "./types";
import {bezierProgress} from "../dealtCardMotion";
export interface HandVisual {
  id: string;
  pose: SpritePose;
  faceUp: boolean;
  dragging: boolean;
  index: number;
  hitTarget?: HTMLElement;
  logicalCenter?: { x: number; y: number };
  revealing?:boolean;
}
type Axis = { from: SpritePose; to: SpritePose; at: number; duration: number; landing?:boolean };
export interface HandTrack {
  position: Axis;
  flip: Axis;
  revision: number;
  dragging: boolean;
}
function fraction(axis: Axis, time: number) {
  return axis.duration === 0 ? 1 : Math.max(0, Math.min(1, (time - axis.at) / axis.duration));
}
export function handTrackPose(track: HandTrack, time: number): SpritePose {
  const a = track.position,
    t = a.landing?bezierProgress(fraction(a,time),.22,1,.36,1):bezierProgress(fraction(a,time),0,0,.58,1),
    b = track.flip,
    f = fraction(b, time);
  const out = { ...a.to };
  for (const key of ["x", "y", "width", "height", "rotation", "opacity"] as const)
    out[key] = a.from[key] + (a.to[key] - a.from[key]) * t;
  out.flip = b.from.flip + (b.to.flip - b.from.flip) * bezierProgress(f,.22,1,.36,1);
  return out;
}
export function updateHandTrack(
  old: HandTrack | undefined,
  visual: HandVisual,
  time: number,
  duration: number,
  flipDuration: number,
): HandTrack {
  const target = { ...visual.pose, flip: visual.faceUp ? 0 : 180 };
  if (!old) {
    const axis = { from: target, to: target, at: time, duration: 0 };
    return { position: axis, flip: axis, revision: 0, dragging: visual.dragging };
  }
  const current = handTrackPose(old, time),
    positionChanged = (["x", "y", "width", "height", "rotation"] as const).some(
      (key) => Math.abs(old.position.to[key] - target[key]) > 0.01,
    );
  return {
    position: positionChanged
      ? { from: current, to: target, at: time, duration: visual.dragging ? 0 : duration,landing:visual.revealing??false }
      : { ...old.position, to: { ...old.position.to, emphasis: target.emphasis ?? 0 } },
    flip:
      old.flip.to.flip === target.flip
        ? old.flip
        : { from: current, to: target, at: time, duration: flipDuration },
    revision: old.revision + 1,
    dragging: visual.dragging,
  };
}
