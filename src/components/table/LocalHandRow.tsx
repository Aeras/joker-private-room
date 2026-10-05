import { RANK_VALUE, SUITS, type Card, type Suit } from "@/domain/cards";
import { DraggableHandCard } from "./DraggableHandCard";
import { localHandCenterOffset } from "./tableControlModel";
import type { RectLike, TableGeometry } from "./useTableGeometry";

export function sortLocalHandCards(cards: readonly Card[], trumpSuit: Suit | null): Card[] {
  const suitOrder: Suit[] = trumpSuit
    ? [trumpSuit, ...SUITS.filter((suit) => suit !== trumpSuit)]
    : [...SUITS];
  const suitPriority = new Map(suitOrder.map((suit, index) => [suit, index]));

  return cards.slice().sort((a, b) => {
    if (a.kind === "joker" || b.kind === "joker") {
      if (a.kind === "joker" && b.kind === "joker") return a.id.localeCompare(b.id);
      return a.kind === "joker" ? -1 : 1;
    }

    const suitDifference = (suitPriority.get(a.suit) ?? 99) - (suitPriority.get(b.suit) ?? 99);
    if (suitDifference !== 0) return suitDifference;

    const rankDifference = RANK_VALUE[b.rank] - RANK_VALUE[a.rank];
    return rankDifference !== 0 ? rankDifference : a.id.localeCompare(b.id);
  });
}

export function LocalHandRow({
  cards,
  visible,
  legalCardIds,
  blocked,
  pendingCardId,
  authorityKey,
  geometry,
  trumpSuit,
  onCommit,
}: {
  cards: readonly Card[];
  visible: boolean;
  legalCardIds: readonly string[];
  blocked: boolean;
  pendingCardId: string | null;
  authorityKey: string;
  geometry: TableGeometry | null;
  trumpSuit: Suit | null;
  onCommit: (cardId: string, releaseRect: RectLike) => Promise<void>;
}) {
  const legal = new Set(legalCardIds);
  const offset = localHandCenterOffset(geometry);
  const sortedCards = sortLocalHandCards(cards, trumpSuit);

  return (
    <div
      className="flex w-full items-end justify-center px-3 transition-transform duration-200"
      style={{ transform: `translateX(${offset}px)` }}
      data-hand-center-offset={offset}
    >
      <div className="flex justify-center overflow-visible pt-2 [--card-w:clamp(3rem,7.2vw,5rem)]">
        {visible ? (
          sortedCards.map((card, index) => (
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
