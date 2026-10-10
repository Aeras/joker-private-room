import type { Card, Suit } from "@/domain/cards";
import type { PlayerGameProjection } from "@/domain/projection";
import { SuitSymbol } from "../joker/SuitSymbol";
import { PlayingCard } from "../joker/PlayingCard";

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
    {[2, 1].map(layer => <div key={layer} className="absolute left-0 top-0" style={{ transform: `translate(${layer * 3}px, ${layer * -2}px)` }}><PlayingCard faceDown /></div>)}
    <PlayingCard card={exposedTrumpCard} />
  </div>;
  if (trump.status !== "resolved") return null;

  if (trump.suit == null) {
    return <div className="flex aspect-[180/265] w-[var(--card-w)] flex-col items-center justify-center rounded-[8%] border border-neutral-300 bg-white px-[10%] text-center shadow-lg" data-trump-indicator="no-trump">
      <span className="text-[2.1em] font-black leading-none text-red-600">✕</span>
      <span className="mt-1 text-[clamp(6.5px,calc(var(--card-w)*.11),14px)] font-semibold leading-tight text-neutral-800">Χωρίς ατού</span>
    </div>;
  }

  const meta = SUIT_META[trump.suit];
  return <div className="flex aspect-[180/265] w-[var(--card-w)] flex-col items-center justify-center rounded-[8%] border border-neutral-300 bg-white px-[10%] text-center shadow-lg" data-trump-indicator={trump.suit}>
    <SuitSymbol suit={trump.suit} className={`w-[68%] shrink-0 drop-shadow-[0_1px_1px_#0002] ${meta.tone}`} />
    <span className="mt-1 block w-full whitespace-nowrap text-[clamp(6.5px,calc(var(--card-w)*.11),14px)] font-semibold leading-tight text-neutral-800">{meta.label}</span>
  </div>;
}
