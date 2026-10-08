import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Card } from "@/domain/cards";
import { PlayingCard } from "../joker/PlayingCard";
import type { Point } from "./useTableGeometry";
import { recordTimingDiagnostic } from "@/lib/timingDiagnostics";

export const TRUMP_FLIP_MS = 400;
export const TRUMP_DECK_MOVE_MS = 500;
const COMPLETION_FALLBACK_MS = 120;
type Stage = "back" | "flipping" | "moving" | "placed";

/** One card/deck identity from dealer source to the measured persistent indicator.
 * Transform completion owns each boundary; timers only recover missing DOM events.
 */
export function TrumpDeckMotion({ card, source, rotation, targetRef, onPlaced }: {
  card: Card;
  source: Point;
  rotation: number;
  targetRef?: RefObject<HTMLDivElement | null> | undefined;
  onPlaced: () => void;
}) {
  const [stage, setStage] = useState<Stage>("back");
  const stageRef = useRef<Stage>("back");
  const [destination, setDestination] = useState({ x: 0, y: 0, scale: 1 });
  const cardRef = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const callback = useRef(onPlaced); callback.current = onPlaced;
  const advance = useCallback((completed: "flipping" | "moving") => {
    if (stageRef.current !== completed) return;
    if (completed === "flipping") {
      const width = cardRef.current?.offsetWidth || Math.max(54.4, Math.min(window.innerWidth * .08, 88));
      const height = width * 7 / 5;
      const target = targetRef?.current?.getBoundingClientRect();
      const targetWidth = target?.width || Math.max(51.2, Math.min(window.innerWidth * .064, 80));
      const left = target?.width ? target.left : window.innerWidth * .72 - targetWidth / 2;
      const top = target?.width ? target.top : window.innerHeight * .1 + 17;
      setDestination({ x: left - source.x, y: top - source.y, scale: targetWidth / width });
      stageRef.current = "moving"; setStage("moving");
      recordTimingDiagnostic("trump_deck_move_start", { travelMs: TRUMP_DECK_MOVE_MS, targetX: left, targetY: top, cardHeight: height });
    } else {
      stageRef.current = "placed"; setStage("placed");
    }
  }, [source.x, source.y, targetRef]);
  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      stageRef.current = "flipping"; setStage("flipping");
      recordTimingDiagnostic("trump_flip_start", { flipMs: TRUMP_FLIP_MS, cardId: card.id });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [card.id]);
  useLayoutEffect(() => {
    if (stage !== "flipping" && stage !== "moving") return;
    const timer = window.setTimeout(() => advance(stage),
      (stage === "flipping" ? TRUMP_FLIP_MS : TRUMP_DECK_MOVE_MS) + COMPLETION_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [stage, advance]);
  useLayoutEffect(() => {
    if (stage !== "placed" || placed.current) return;
    placed.current = true;
    recordTimingDiagnostic("trump_deck_placed", { cardId: card.id });
    callback.current();
  }, [stage, card.id]);
  const moving = stage === "moving" || stage === "placed";
  const flipped = stage !== "back";
  return <div data-trump-deck-motion={stage} className="absolute [--card-w:var(--desktop-deal-card-w,clamp(3.4rem,8vw,5.5rem))]"
    style={{ left: source.x, top: source.y, zIndex: 29, transformOrigin: "0 0",
      transform: moving ? `translate(${destination.x}px, ${destination.y}px) rotate(0deg) scale(${destination.scale})` : `rotate(${rotation}deg)`,
      transition: moving ? `transform ${TRUMP_DECK_MOVE_MS}ms cubic-bezier(.2,.75,.25,1)` : "none" }}
    onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === "transform") advance("moving"); }}>
    {[2, 1].map(layer => <div key={layer} className="absolute left-0 top-0" style={{ transform: `translate(${layer * 3}px, ${layer * -2}px)` }}><PlayingCard faceDown /></div>)}
    <div ref={cardRef} className="relative aspect-[5/7] w-[var(--card-w)]" style={{ perspective: "800px" }}>
      <div data-trump-flip style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `rotateY(${flipped ? 180 : 0}deg)`, transition: `transform ${TRUMP_FLIP_MS}ms ease-in-out` }}
        onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === "transform") advance("flipping"); }}>
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}><PlayingCard faceDown /></div>
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}><PlayingCard card={card} /></div>
      </div>
    </div>
  </div>;
}
