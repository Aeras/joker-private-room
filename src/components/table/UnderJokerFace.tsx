import type { Card } from "@/domain/cards";
import { PlayingCard } from "../joker/PlayingCard";

/** The two faces share one surface throughout travel and canonical handoff. */
export function UnderJokerFace({ card, flipped, duration }: { card: Card; flipped: boolean; duration: number }) {
  return <div style={{ perspective: "700px" }}>
    <style>{"@keyframes joker-under-layer{0%,49%{z-index:40}50%,100%{z-index:0}}"}</style>
    <div data-joker-under-flip={flipped ? "back" : "face"} style={{ position: "relative", transformStyle: "preserve-3d", transform: `rotateY(${flipped ? 180 : 0}deg)`, transition: `transform ${duration}ms linear` }}>
      <div style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}><PlayingCard card={card} /></div>
      <div style={{ position: "absolute", inset: 0, transform: "rotateY(180deg)", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}><PlayingCard faceDown /></div>
    </div>
  </div>;
}
