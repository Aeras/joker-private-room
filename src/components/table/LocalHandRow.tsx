import { useLayoutEffect, useRef, useState } from "react";
import type { Card } from "@/domain/cards";
import { LOCAL_HAND_ENTRANCE_MS } from "./dealPresentationModel";
import { useHandReflow } from "./useHandReflow";
import { DraggableHandCard } from "./DraggableHandCard";
import { localHandCenterOffset } from "./tableControlModel";
import type { CardReleaseRect, TableGeometry } from "./useTableGeometry";

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
  onCommit: (cardId: string, releaseRect: CardReleaseRect) => Promise<void>;
}) {
  const legal = new Set(legalCardIds);
  const [entranceSettled, setEntranceSettled] = useState(visible && !revealing);
  const entered = useRef(visible && !revealing);
  useLayoutEffect(() => {
    if (!visible) {
      entered.current = false;
      setEntranceSettled(false);
      return;
    }
    if (entered.current) return;
    setEntranceSettled(false);
    let second: number | undefined;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => { entered.current = true; setEntranceSettled(true); });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second != null) cancelAnimationFrame(second);
    };
  }, [visible]);
  const offset = localHandCenterOffset(geometry);
  const laneWidth = geometry?.localHandBounds?.width;
  const cardWidth = "var(--desktop-hand-card-w, clamp(3.4rem, min(9.6vw, 22vh), 6.75rem))";
  // Detach only from presentation immediately; the canonical hand stays server-owned.
  const presentedCards = cards.filter(card => card.id !== pendingCardId);
  const cardOverlap = presentedCards.length <= 3 ? 0.18 : presentedCards.length <= 5 ? 0.28 : presentedCards.length <= 7 ? 0.36 : 0.42;
  const revealOverlap = entranceSettled ? cardOverlap : 0.86;

  const handLayoutRef = useHandReflow(JSON.stringify(presentedCards.map(card => card.id)), visible && entranceSettled && !revealing);

  return (
    <div
      ref={handLayoutRef}
      className="flex w-full items-end justify-center px-3 transition-[transform,opacity] duration-[600ms] motion-reduce:duration-75"
      style={{
        "--card-w": cardWidth,
        transform: `translateX(${offset}px) translateY(${entranceSettled ? "calc(var(--card-w) * 0.52 + 0px)" : "calc(100% + max(.15rem, env(safe-area-inset-bottom)) + 2px)"})`,
        opacity: 1,
        transitionDuration: `${LOCAL_HAND_ENTRANCE_MS}ms`,
        transitionTimingFunction: "linear",
      } as React.CSSProperties}
      data-hand-center-offset={offset}
      data-hand-entrance={!entranceSettled ? "entering" : "settled"}
    >
      <div
        className="flex justify-center overflow-visible pt-2"
        style={{ "--card-w": cardWidth, "--card-overlap": revealOverlap } as React.CSSProperties}
        data-hand-lane-width={laneWidth}
        data-hand-final-overlap={cardOverlap}
        data-hand-current-overlap={revealOverlap}
      >
        {visible ? (
          presentedCards.map((card, index) => (
            <div key={card.id} data-hand-layout-card={card.id} className={`relative shrink-0 ${index > 0 ? "-ml-[calc(var(--card-w)*var(--card-overlap))]" : ""} ${revealing || !entranceSettled ? "transition-[margin-left] duration-[520ms]" : ""}`}>
            <DraggableHandCard
              card={card}
              legal={legal.has(card.id)}
              blocked={blocked}
              revealing={revealing}
              faceUpOnReveal
              pending={pendingCardId === card.id}
              authorityKey={authorityKey}
              zIndex={index}
              overlap={false}
              dropRect={geometry?.feltRect ?? null}
              onCommit={onCommit}
            />
            </div>
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
