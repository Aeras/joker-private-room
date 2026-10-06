import type { Card } from "@/domain/cards";
import { DraggableHandCard } from "./DraggableHandCard";
import { localHandCenterOffset } from "./tableControlModel";
import type { RectLike, TableGeometry } from "./useTableGeometry";

export function LocalHandRow({
  cards,
  visible,
  legalCardIds,
  blocked,
  pendingCardId,
  authorityKey,
  geometry,
  revealing = false,
  onCommit,
}: {
  cards: readonly Card[];
  visible: boolean;
  legalCardIds: readonly string[];
  blocked: boolean;
  pendingCardId: string | null;
  authorityKey: string;
  geometry: TableGeometry | null;
  revealing?: boolean;
  onCommit: (cardId: string, releaseRect: RectLike) => Promise<void>;
}) {
  const legal = new Set(legalCardIds);
  const offset = localHandCenterOffset(geometry);
  const laneWidth = geometry?.localHandBounds?.width;
  const fitWidth = laneWidth ? laneWidth / (1 + Math.max(0, cards.length - 1) * 0.64) : null;
  const cardWidth = fitWidth
    ? `min(clamp(2.7rem, min(7.2vw, 17vh), 5rem), ${fitWidth}px)`
    : "clamp(2.7rem, min(7.2vw, 17vh), 5rem)";

  return (
    <div
      className="flex w-full items-end justify-center px-3 transition-transform duration-200"
      style={{ transform: `translateX(${offset}px)` }}
      data-hand-center-offset={offset}
    >
      <div
        className="flex justify-center overflow-visible pt-2"
        style={{ "--card-w": cardWidth } as React.CSSProperties}
        data-hand-lane-width={laneWidth}
      >
        {visible ? (
          cards.map((card, index) => (
            <DraggableHandCard
              key={card.id}
              card={card}
              legal={legal.has(card.id)}
              blocked={blocked}
              revealing={revealing}
              pending={pendingCardId === card.id}
              authorityKey={authorityKey}
              zIndex={index}
              overlap={index > 0}
              onCommit={onCommit}
            />
          ))
        ) : (
          <div className="rounded-lg bg-black/65 px-4 py-2 text-xs text-white/65">
            Τα φύλλα σου δεν είναι ακόμη ορατά.
          </div>
        )}
      </div>
    </div>
  );
}
