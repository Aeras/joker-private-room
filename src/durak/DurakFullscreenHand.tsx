import type { CSSProperties } from "react";
import { cardLabel } from "@/domain/cards";
import { cardForArtwork, DurakCardFace } from "./DurakTableVisuals";
import type { DurakCard } from "./rules";

/** Same horizontal fan pattern as JOKER, fitted to DURAK's up-to-36-card hand. */
function durakHandOverlap(count: number) {
  return count <= 3 ? 0.25 : count <= 5 ? 0.36 : count <= 7 ? 0.44 : 0.5;
}

export function DurakFullscreenHand({
  cards,
  busy,
  canPlay,
  onPlay,
}: {
  cards: readonly DurakCard[];
  busy: boolean;
  canPlay: (card: DurakCard) => boolean;
  onPlay: (card: DurakCard) => void;
}) {
  const step = `min(calc(var(--durak-hand-card-w) * ${1 - durakHandOverlap(cards.length)}), calc((100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 24px - var(--durak-hand-card-w)) / ${Math.max(1, cards.length - 1)}))`;
  return (
    <div
      className="durak-fullscreen-hand"
      data-durak-hand
      style={{ "--durak-hand-step": step } as CSSProperties}
    >
      <div className="durak-fullscreen-hand-row">
        {cards.map((card, index) => {
          const allowed = canPlay(card);
          return (
            <button
              key={card.suit + ":" + card.rank}
              type="button"
              data-durak-hand-card
              aria-label={cardLabel(cardForArtwork(card))}
              disabled={busy || !allowed}
              data-playable={allowed}
              onClick={() => onPlay(card)}
              className="durak-fullscreen-hand-card"
              style={{
                zIndex: index,
                marginLeft: index ? "calc(var(--durak-hand-step) - var(--durak-hand-card-w))" : 0,
              }}
            >
              <DurakCardFace card={card} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
