import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import type { BiribaCard, BiribaSuit } from "./rules";
import { BIRIBA_DISCARD_RECT, biribaCardArtwork } from "./biribaVisualModel";

const greekSuits: Record<BiribaSuit, string> = {
  spades: "μπαστούνι",
  hearts: "κούπα",
  diamonds: "καρό",
  clubs: "σπαθί",
};

function accessibleCardName(card: BiribaCard): string {
  return card.joker ? "Τζόκερ" : `${card.rank} ${greekSuits[card.suit]}`;
}

/** Transparent, keyboard-accessible button precisely over the face-up Pixi discard card. */
export function BiribaDiscardPileTrigger({
  visible,
  onOpen,
}: {
  visible: boolean;
  onOpen: () => void;
}) {
  if (!visible) return null;
  return (
    <button
      type="button"
      className="biriba-discard-pile-hitbox"
      style={{
        left: `${(BIRIBA_DISCARD_RECT.x / 1280) * 100}%`,
        top: `${(BIRIBA_DISCARD_RECT.y / 720) * 100}%`,
        width: `${(BIRIBA_DISCARD_RECT.width / 1280) * 100}%`,
        height: `${(BIRIBA_DISCARD_RECT.height / 720) * 100}%`,
      }}
      aria-label="Προβολή πεταμένων φύλλων πατώντας τη στοίβα"
      onClick={onOpen}
    />
  );
}

/** Inspecting this dialog never performs a pickup. Pickup actions are supplied explicitly. */
export function BiribaDiscardsDialog({
  cards,
  onClose,
  children,
}: {
  cards: readonly BiribaCard[];
  onClose: () => void;
  children?: ReactNode;
}) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  return (
    <div
      className="biriba-discard-backdrop"
      data-testid="biriba-discard-backdrop"
      onClick={(event) => {
        // Close only from the backdrop itself; a click on the cards is read-only.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="biriba-discard-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Πεταμένα φύλλα"
      >
        <div className="biriba-discard-dialog-header">
          <h2>Πεταμένα φύλλα ({cards.length})</h2>
          <button type="button" autoFocus onClick={onClose} aria-label="Κλείσιμο πεταμένων">
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="biriba-discard-dialog-cards" aria-label="Πεταμένα φύλλα με τη σειρά που πετάχτηκαν">
          {cards.map((card) => (
            <img
              key={card.id}
              src={biribaCardArtwork(card)}
              alt={accessibleCardName(card)}
              draggable={false}
              className="biriba-discard-dialog-card"
            />
          ))}
          {cards.length === 0 && <span className="biriba-discard-dialog-empty">Δεν υπάρχουν πεταμένα φύλλα.</span>}
        </div>
        {children}
      </section>
    </div>
  );
}
