import type { Card, Suit } from "@/domain/cards";
import type { PlayerGameProjection } from "@/domain/projection";
import { SuitSymbol } from "../joker/SuitSymbol";
import { PlayingCard } from "../joker/PlayingCard";
import { assets } from "@/assets/registry";
import { CanvasStaticCards } from "./canvas/CanvasStaticCards";

const SUIT_META: Record<Suit, { symbol: string; label: string; tone: string }> = {
  hearts: { symbol: "♥", label: "Κούπες", tone: "text-red-600" },
  diamonds: { symbol: "♦", label: "Καρό", tone: "text-red-600" },
  clubs: { symbol: "♣", label: "Σπαθιά", tone: "text-neutral-950" },
  spades: { symbol: "♠", label: "Μπαστούνια", tone: "text-neutral-950" },
};

export function trumpAnnouncementLabel(trump: PlayerGameProjection["trump"]): string | null {
  if (trump.status !== "resolved") return null;
  if (trump.suit == null) return "Χωρίς ατού";
  return `Ατού: ${SUIT_META[trump.suit].symbol} ${SUIT_META[trump.suit].label}`;
}

export function TrumpIndicator({ trump, exposedTrumpCard }: {
  trump: PlayerGameProjection["trump"];
  exposedTrumpCard: Card | null;
}) {
  if (exposedTrumpCard) return <div className="relative w-[var(--card-w)]" data-trump-deck>
    <CanvasStaticCards kind="trump" count={3} faceUrl={assets.cardFace(exposedTrumpCard)}>
      {[2, 1].map(layer => <div key={layer} className="absolute left-0 top-0" style={{ transform: `translate(${layer * 3}px, ${layer * -2}px)` }}><PlayingCard faceDown /></div>)}
      <div data-static-card-measure><PlayingCard card={exposedTrumpCard} /></div>
    </CanvasStaticCards>
  </div>;
  if (trump.status !== "resolved") return null;

  if (trump.suit == null) {
    return <div className="relative aspect-[180/265] w-[var(--card-w)] drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]" data-trump-indicator="no-trump">
      <img src={assets.trumpPlaque(null)} alt="Χωρίς ατού" className="h-full w-full object-contain select-none" draggable={false} />
    </div>;
  }

  const meta = SUIT_META[trump.suit];
  return <div className="relative aspect-[180/265] w-[var(--card-w)] drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]" data-trump-indicator={trump.suit}>
    <img src={assets.trumpPlaque(trump.suit)} alt={meta.label} className="h-full w-full object-contain select-none" draggable={false} />
  </div>;
}
