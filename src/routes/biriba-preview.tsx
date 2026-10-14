import { createFileRoute } from "@tanstack/react-router";
import { BiribaPixiPreview } from "@/biriba/BiribaPixiPreview";
import { createBiribaLocalDeal } from "@/biriba/localDeal";
import "@/biriba/biribaReferenceTable.css";

const previewDeal = createBiribaLocalDeal(4, () => 0.5);
const facePath = (card: (typeof previewDeal.hands)[number][number]) =>
  card.joker
    ? "/cards/optimized-png/faces/joker_red.png"
    : `/cards/optimized-png/faces/${card.suit}_${({ 1: "ace", 11: "jack", 12: "queen", 13: "king" } as Record<number, string>)[card.rank] ?? card.rank}.png`;

export const Route = createFileRoute("/biriba-preview")({
  head: () => ({ meta: [{ title: "ΜΠΙΡΙΜΠΑ — Προεπισκόπηση τραπεζιού" }] }),
  component: () => (
    <main className="biriba-table-container">
      <BiribaPixiPreview deal={previewDeal} />
      <div className="biriba-team-zone biriba-team-zone--red">
        <div className="biriba-team-heading">
          <span>ΚΟΚΚΙΝΗ ΟΜΑΔΑ</span>
          <span className="biriba-team-score">120</span>
        </div>
      </div>
      <div className="biriba-team-zone biriba-team-zone--blue">
        <div className="biriba-team-heading">
          <span>ΜΠΛΕ ΟΜΑΔΑ</span>
          <span className="biriba-team-score">80</span>
        </div>
      </div>
      <div className="biriba-pile-labels">
        <span className="biriba-pile-label">ΚΛΕΙΣΤΗ ΤΡΑΠΟΥΛΑ</span>
        <span className="biriba-pile-label">ΠΕΤΑΜΕΝΑ</span>
        <span className="biriba-pile-label">ΜΠΙΡΙΜΠΑΚΙ 1</span>
        <span className="biriba-pile-label">ΜΠΙΡΙΜΠΑΚΙ 2</span>
      </div>
      <div className="biriba-trump-frame">ΑΤΟΥ</div>
      {(["top", "left", "right", "local"] as const).map((side) => (
        <div key={side} className={`biriba-seat biriba-seat--${side}`}>
          <div className="biriba-seat-avatar biriba-preview-avatar">●</div>
          <span className="biriba-seat-name">
            {side === "top"
              ? "ΣΥΜΠΑΙΚΤΗΣ"
              : side === "left"
                ? "ΑΝΤΙΠΑΛΟΣ Α"
                : side === "right"
                  ? "ΑΝΤΙΠΑΛΟΣ Β"
                  : "ΕΣΥ"}
          </span>
        </div>
      ))}
      <div className="biriba-hand" aria-label="Δείγμα βεντάλιας φύλλων">
        {previewDeal.hands[0]?.map((card, index, cards) => {
          const norm =
            cards.length > 1 ? (index - (cards.length - 1) / 2) / ((cards.length - 1) / 2) : 0;
          return (
            <img
              key={card.id}
              className="biriba-fan-card"
              src={facePath(card)}
              alt=""
              style={{
                transform: `translateY(${norm * norm * 22}px) rotate(${norm * 15}deg)`,
                zIndex: index + 1,
              }}
            />
          );
        })}
      </div>
      <div className="biriba-hand-lip" aria-hidden="true" />
      <div className="absolute right-3 top-3 z-50 rounded-lg border border-amber-500/50 bg-black/80 px-3 py-2 text-xs text-white">
        Προεπισκόπηση · Δεν είναι online παρτίδα
      </div>
      <a
        href="/"
        className="absolute left-3 top-3 z-50 rounded-lg border border-white/30 bg-black/75 px-3 py-2 text-sm text-white"
      >
        ← Επιλογή παιχνιδιού
      </a>
    </main>
  ),
});
