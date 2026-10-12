import { presentationWidth } from "./useCanvasArtwork";
import { useRef, useState, type RefObject } from "react";
import type { Card } from "@/domain/cards";
import { assets } from "@/assets/registry";
import type { Point } from "../useTableGeometry";
import { TRUMP_FLIP_MS, TRUMP_DECK_MOVE_MS } from "../presentationTiming";
import { dealProgress } from "../dealtCardMotion";
import { useReducedMotion } from "../useReducedMotion";
import { CanvasPresentation, type PresentationSprite } from "./CanvasPresentation";

export function CanvasTrumpMotion({
  card,
  source,
  rotation,
  targetRef,
  onPlaced,
  onFailure,
}: {
  card: Card;
  source: Point;
  rotation: number;
  targetRef?: RefObject<HTMLDivElement | null> | undefined;
  onPlaced: () => void;
  onFailure: () => void;
}) {
  const reduced = useReducedMotion();
  const [frozen] = useState(() => ({
    width: presentationWidth("var(--desktop-deal-card-w,clamp(3.4rem,8vw,5.5rem))", 54.4),
    source: { ...source },
    rotation,
  }));
  const [destination, setDestination] = useState<{ x: number; y: number; width: number } | null>(
    null,
  );
  const placed = useRef(false),
    callback = useRef(onPlaced);
  callback.current = onPlaced;
  const center = frozen.source;
  const flipComplete = () => {
    const box = targetRef?.current?.getBoundingClientRect();
    const width = box?.width || Math.max(51.2, Math.min(innerWidth * 0.064, 80));
    setDestination({
      width,
      x: box?.width ? box.left + width / 2 : innerWidth * 0.72,
      y: box?.width ? box.top + width * 0.7 : innerHeight * 0.1 + 17 + width * 0.7,
    });
  };
  const finish = () => {
    if (!placed.current) {
      placed.current = true;
      callback.current();
    }
  };
  const sprites: PresentationSprite[] = [2, 1, 0].map((layer) => ({
    id: `trump:${layer}`,
    url: layer === 0 ? assets.cardFace(card)! : assets.cardBack,
    ...(layer === 0 ? { backUrl: assets.cardBack } : {}),
    layer: 29 - layer,
    phase: destination ? "moving" : "flipping",
    duration: destination ? TRUMP_DECK_MOVE_MS : TRUMP_FLIP_MS,
    sample: (t) => {
      const eased = dealProgress(t);
      const width =
        destination && reduced
          ? destination.width
          : destination
            ? frozen.width + (destination.width - frozen.width) * eased
            : frozen.width;
      return {
        x:
          destination && reduced
            ? destination.x + layer * 3
            : destination && !reduced
              ? center.x + (destination.x - center.x) * eased + layer * 3
              : center.x + layer * 3,
        y:
          destination && reduced
            ? destination.y - layer * 2
            : destination && !reduced
              ? center.y + (destination.y - center.y) * eased - layer * 2
              : center.y - layer * 2,
        width,
        height: width * 1.4,
        rotation: destination ? frozen.rotation * (1 - eased) : frozen.rotation,
        opacity: destination && reduced ? t : 1,
        flip: layer === 0 && !destination && !reduced ? 180 * (1 - t) : 0,
        ...(layer === 0 && !destination && reduced ? { backBlend: 1 - t } : {}),
      };
    },
    ...(layer === 0 ? { onComplete: destination ? finish : flipComplete } : {}),
  }));
  return (
    <div data-trump-deck-motion={destination ? "moving" : "flipping"}>
      <CanvasPresentation name="trump" sprites={sprites} onFailure={onFailure} />
    </div>
  );
}
