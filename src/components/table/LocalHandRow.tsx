import { useEffect, useState } from "react";
import type { Card } from "@/domain/cards";
import { PlayingCard } from "../joker/PlayingCard";
import { DraggableHandCard } from "./DraggableHandCard";
import { localHandCenterOffset } from "./tableControlModel";
import type { RectLike, TableGeometry } from "./useTableGeometry";

function RevealingHand({ cards }: { cards: readonly Card[] }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
    const first = window.requestAnimationFrame(() => {
      const second = window.requestAnimationFrame(() => setRevealed(true));
      return () => window.cancelAnimationFrame(second);
    });
    return () => window.cancelAnimationFrame(first);
  }, [cards.map((card) => card.id).join("|")]);

  const center = (cards.length - 1) / 2;
  const spread = Math.min(46, Math.max(28, 260 / Math.max(1, cards.length - 1)));

  return (
    <div className="relative h-[calc(var(--card-w,4.5rem)*1.4)] w-[min(92vw,36rem)] [perspective:900px]" data-hand-reveal="true">
      {cards.map((card, index) => {
        const offset = (index - center) * spread;
        return (
          <div
            key={card.id}
            className="absolute bottom-0 left-1/2 transition-[transform,opacity] duration-[620ms] ease-out"
            style={{
              opacity: revealed ? 1 : 0.96,
              transform: revealed
                ? `translateX(calc(-50% + ${offset}px)) rotateY(0deg) translateY(0px)`
                : "translateX(-50%) rotateY(180deg) translateY(4px)",
              transformStyle: "preserve-3d",
              zIndex: index,
            }}
          >
            <div className="relative" style={{ transformStyle: "preserve-3d" }}>
              <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <PlayingCard faceDown />
              </div>
              <div className="[backface-visibility:hidden]">
                <PlayingCard card={card} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

  return (
    <div
      className="flex w-full items-end justify-center px-3 transition-transform duration-200"
      style={{ transform: `translateX(${offset}px)` }}
      data-hand-center-offset={offset}
    >
      <div className="flex justify-center overflow-visible pt-2 [--card-w:clamp(3rem,7.2vw,5rem)]">
        {visible ? (
          revealing ? (
            <RevealingHand cards={cards} />
          ) : (
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
          )
        ) : (
          <div className="rounded-lg bg-black/65 px-4 py-2 text-xs text-white/65">
            Τα φύλλα σου δεν είναι ακόμη ορατά.
          </div>
        )}
      </div>
    </div>
  );
}
