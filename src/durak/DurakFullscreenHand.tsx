import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { durakTableText as text } from "@/i18n/durak.el";
import { cardLabel } from "@/domain/cards";
import { cardForArtwork, DurakCardFace } from "./DurakTableVisuals";
import type { DurakCard } from "./rules";
import { useHandReflow } from "@/components/table/useHandReflow";

/** Same horizontal fan pattern as JOKER, fitted to DURAK's up-to-36-card hand. */
function durakHandOverlap(count: number) {
  return count <= 3 ? 0.25 : count <= 5 ? 0.36 : count <= 7 ? 0.44 : 0.5;
}

export function DurakFullscreenHand({
  cards,
  concealed = false,
  arriving = [],
  busy,
  canPlay,
  onPlay,
  canDrop,
  onDrop,
  onDragTarget,
}: {
  cards: readonly DurakCard[];
  concealed?: boolean;
  arriving?: readonly DurakCard[];
  busy: boolean;
  canPlay: (card: DurakCard) => boolean;
  onPlay: (card: DurakCard) => void;
  canDrop?: (card: DurakCard, pair: number) => boolean;
  onDrop?: ((card: DurakCard, pair: number) => void) | undefined;
  onDragTarget?: (pair: number | null) => void;
}) {
  type Gesture = {
    card: DurakCard;
    pointer: number;
    x: number;
    y: number;
    active: boolean;
    width: number;
  };
  const gesture = useRef<Gesture | null>(null);
  const layout = useHandReflow(cards.map(card => card.suit + ":" + card.rank).join("|"), !concealed);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ card: DurakCard; x: number; y: number; width: number } | null>(
    null,
  );
  const reset = () => {
    gesture.current = null;
    setDrag(null);
    onDragTarget?.(null);
  };
  useEffect(() => {
    if (
      gesture.current &&
      (busy ||
        !cards.some(
          (card) =>
            card.suit === gesture.current?.card.suit && card.rank === gesture.current?.card.rank,
        ))
    )
      reset();
  });
  const targetAt = (event: PointerEvent) => {
    const hit = document
      .elementFromPoint?.(event.clientX, event.clientY)
      ?.closest("[data-durak-pair]");
    const pair = hit?.getAttribute("data-durak-pair-index");
    return pair !== null && pair !== undefined && /^\d+$/.test(pair) ? Number(pair) : null;
  };
  const down = (event: PointerEvent<HTMLButtonElement>, card: DurakCard) => {
    if (gesture.current || event.isPrimary === false || event.button !== 0) return;
    suppressClick.current = false;
    if (!onDrop || busy || !canPlay(card)) return;
    gesture.current = {
      card,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      active: false,
      width: event.currentTarget.getBoundingClientRect().width,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 8)
      return;
    current.active = true;
    suppressClick.current = true;
    event.preventDefault();
    setDrag({ card: current.card, x: event.clientX, y: event.clientY, width: current.width });
    const pair = targetAt(event);
    onDragTarget?.(pair !== null && canDrop?.(current.card, pair) ? pair : null);
  };
  const up = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (current.active) {
      event.preventDefault();
      suppressClick.current = true;
      const pair = targetAt(event);
      if (!busy && pair !== null && canDrop?.(current.card, pair)) onDrop?.(current.card, pair);
    }
    reset();
  };
  const step = `min(calc(var(--durak-hand-card-w) * ${1 - durakHandOverlap(cards.length)}), calc((100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 24px - var(--durak-hand-card-w)) / ${Math.max(1, cards.length - 1)}))`;
  return (
    <div
      className="durak-fullscreen-hand"
      data-durak-hand
      aria-hidden={concealed}
      style={{ "--durak-hand-step": step } as CSSProperties}
    >
      <div ref={layout} className="durak-fullscreen-hand-row">
        {cards.map((card, index) => {
          const allowed = canPlay(card);
          return (
            <button
              key={card.suit + ":" + card.rank}
              type="button"
              data-durak-hand-card
              data-durak-card-key={card.suit + ":" + card.rank}
              data-hand-layout-card={card.suit + ":" + card.rank}
              data-durak-arriving={arriving.some(incoming => incoming.suit === card.suit && incoming.rank === card.rank) || undefined}
              aria-label={cardLabel(cardForArtwork(card))}
              disabled={busy || !allowed}
              data-playable={allowed}
              onClick={() => {
                if (!suppressClick.current && !gesture.current?.active) onPlay(card);
              }}
              onKeyDown={() => {
                suppressClick.current = false;
              }}
              onPointerDown={(event) => down(event, card)}
              onDragStart={(event) => event.preventDefault()}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={(event) => {
                if (gesture.current?.pointer !== event.pointerId) return;
                suppressClick.current = true;
                reset();
              }}
              onLostPointerCapture={(event) => {
                if (gesture.current?.pointer !== event.pointerId) return;
                if (gesture.current?.active) suppressClick.current = true;
                reset();
              }}
              data-dragging={
                (drag?.card.suit === card.suit && drag?.card.rank === card.rank) || undefined
              }
              className="durak-fullscreen-hand-card"
              style={{
                touchAction: onDrop ? "none" : "manipulation",
                zIndex: index,
                marginLeft: index ? "calc(var(--durak-hand-step) - var(--durak-hand-card-w))" : 0,
              }}
            >
              <DurakCardFace card={card} />
            </button>
          );
        })}
      </div>
      {drag &&
        createPortal(
          <div
            className="durak-drag-card"
            aria-hidden="true"
            style={{ left: drag.x, top: drag.y, "--card-w": `${drag.width}px` } as CSSProperties}
          >
            <DurakCardFace card={drag.card} />
            <span>{text.dropDefense}</span>
          </div>,
          document.body,
        )}
    </div>
  );
}
