import { assets } from "@/assets/registry";
import type { Suit } from "@/domain/cards";
import { playGameSound } from "@/lib/gameAudio";
import { useReducedMotion } from "./useReducedMotion";
import { useCallback, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Point, TableGeometry, VisualSeat } from "./useTableGeometry";
import { PlayingCard } from "../joker/PlayingCard";

const FLIGHT_MS = 600;

function viewportPoint(geometry: TableGeometry, local: Point): Point {
  return { x: geometry.feltRect.left + local.x, y: geometry.feltRect.top + local.y };
}

export function NineCardTrumpFlight({
  suit,
  chooserPos,
  geometry,
  targetRef,
  onPlaced,
}: {
  suit: Suit | null;
  chooserPos: VisualSeat;
  geometry: TableGeometry | null;
  targetRef?: RefObject<HTMLDivElement | null>;
  onPlaced: () => void;
}) {
  const reduced = useReducedMotion();
  const [arrived, setArrived] = useState(false);
  const placed = useRef(false);
  const onPlacedRef = useRef(onPlaced);
  onPlacedRef.current = onPlaced;

  // Source seat origin in viewport coordinates
  const source: Point = geometry
    ? viewportPoint(geometry, geometry.seatOrigins[chooserPos])
    : chooserPos === 0
    ? { x: window.innerWidth * 0.5, y: window.innerHeight * 0.85 }
    : chooserPos === 1
    ? { x: window.innerWidth * 0.12, y: window.innerHeight * 0.5 }
    : chooserPos === 2
    ? { x: window.innerWidth * 0.5, y: window.innerHeight * 0.15 }
    : { x: window.innerWidth * 0.88, y: window.innerHeight * 0.5 };

  // Destination in viewport coordinates
  const targetRect = targetRef?.current?.getBoundingClientRect();
  const targetX = targetRect && targetRect.width > 0 ? targetRect.left + targetRect.width / 2 : window.innerWidth * 0.72;
  const targetY = targetRect && targetRect.height > 0 ? targetRect.top + targetRect.height / 2 : window.innerHeight * 0.1 + 25;
  const targetW = targetRect?.width || Math.max(51.2, Math.min(window.innerWidth * 0.064, 80));
  const targetH = targetW * (265 / 180);

  const deltaX = targetX - source.x;
  const deltaY = targetY - source.y;

  const handleComplete = useCallback(() => {
    if (placed.current) return;
    placed.current = true;
    onPlacedRef.current();
  }, []);

  useLayoutEffect(() => {
    playGameSound("deal", "trump-reveal");
    const frame = window.requestAnimationFrame(() => setArrived(true));
    const timer = window.setTimeout(handleComplete, FLIGHT_MS + 50);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [handleComplete]);

  const plaqueUrl = assets.trumpPlaque(suit);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[70] overflow-hidden"
    >
      <div
        style={{
          position: "absolute",
          left: source.x,
          top: source.y,
          width: targetW,
          height: targetH,
          marginLeft: -targetW / 2,
          marginTop: -targetH / 2,
          transform: `translate(${arrived ? deltaX : 0}px, ${arrived ? deltaY : 0}px) scale(${arrived ? 1 : 0.85})`,
          transition: reduced
            ? `opacity ${FLIGHT_MS}ms ease-out`
            : `transform ${FLIGHT_MS}ms cubic-bezier(0.18, 0.9, 0.32, 1)`,
          perspective: 1000,
        }}
        onTransitionEnd={handleComplete}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
            transform: arrived || reduced ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: reduced ? "none" : `transform ${FLIGHT_MS}ms ease-in-out`,
          }}
        >
          {/* Back side (visible at launch) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          >
            <PlayingCard faceDown />
          </div>

          {/* Front side (revealed after flip) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <img
              src={plaqueUrl}
              alt="Ατού"
              className="h-full w-full object-contain select-none drop-shadow-[0_8px_16px_rgba(0,0,0,0.7)]"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
