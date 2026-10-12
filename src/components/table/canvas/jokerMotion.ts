import type { JokerSemantic, PlayedCard } from "@/domain/engine";
import { NORMAL_FROM_BELOW_FLIP_MS } from "../presentationTiming";
/** Visual metadata only. Canonical legality/winner decisions stay on the server. */
export function fromBelow(semantic?: JokerSemantic): boolean {
  return semantic?.context === "OPEN_TRICK" && semantic.mode === "FROM_BELOW";
}
export function jokerPose(
  semantic: JokerSemantic | undefined,
  time: number,
  duration: number,
  reduced: boolean,
) {
  if (!fromBelow(semantic)) return { flip: 0, layer: 10 };
  const progress = Math.min(1, Math.max(0, (time * duration) / NORMAL_FROM_BELOW_FLIP_MS));
  return reduced
    ? { flip: 0, backBlend: time, layer: 0 }
    : { flip: (180 * (1 - Math.cos(Math.PI * progress))) / 2, layer: progress < 0.5 ? 40 : 0 };
}
export function publicVisualPlay(play: PlayedCard): boolean {
  return play.card.kind !== "joker" || play.joker != null;
}
