import { useEffect, useState } from "react";
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
  const [entranceSettled, setEntranceSettled] = useState(!revealing);
  useEffect(() => {
    if (!revealing || !visible) {
      setEntranceSettled(true);
      return;
    }
    setEntranceSettled(false);
    let second: number | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntranceSettled(true));
    });
    return () => {
      cancelAnimationFrame(first);
      if (second != null) cancelAnimationFrame(second);
    };
  }, [revealing, visible, authorityKey]);
  const offset = localHandCenterOffset(geometry);
  const laneWidth = geometry?.localHandBounds?.width;
  const cardWidth = "clamp(3.4rem, min(9.6vw, 22vh), 6.75rem)";
  const cardOverlap = cards.length <= 3 ? 0.18 : cards.length <= 5 ? 0.28 : cards.length <= 7 ? 0.36 : 0.42;

  return (
    <div
      className="flex w-full items-end justify-center px-3 transition-[transform,opacity] duration-[500ms] ease-out motion-reduce:duration-75"
      style={{
        "--card-w": cardWidth,
        transform: `translateX(${offset}px) translateY(calc(var(--card-w) * 0.52 + ${entranceSettled ? 0 : 32}px))`,
        opacity: entranceSettled ? 1 : 0.05,
      } as React.CSSProperties}
      data-hand-center-offset={offset}
      data-hand-entrance={revealing && !entranceSettled ? "entering" : "settled"}
    >
      <div
        className="flex justify-center overflow-visible pt-2"
        style={{ "--card-w": cardWidth, "--card-overlap": cardOverlap } as React.CSSProperties}
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
              dropRect={geometry?.feltRect ?? null}
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
