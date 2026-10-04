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
  onCommit,
}: {
  cards: readonly Card[];
  visible: boolean;
  legalCardIds: readonly string[];
  blocked: boolean;
  pendingCardId: string | null;
  authorityKey: string;
  geometry: TableGeometry | null;
  onCommit: (cardId: string, releaseRect: RectLike) => Promise<void>;
}) {
  const legal = new Set(legalCardIds);
  const offset = localHandCenterOffset(geometry);

  return (
    <div
      className="flex w-full items-end justify-center px-3 transition-transform duration-200"
      style={{ transform: `translateX(${offset}px)` }}
      data-hand-center-offset={offset}
    >
      <div className="flex justify-center overflow-visible pt-2 [--card-w:clamp(3rem,7.2vw,5rem)]">
        {visible ? (
          cards.map((card, index) => (
            <DraggableHandCard
              key={card.id}
              card={card}
              legal={legal.has(card.id)}
              blocked={blocked}
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
