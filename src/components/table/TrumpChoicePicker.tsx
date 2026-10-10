import { SuitSymbol } from "../joker/SuitSymbol";
import type { Suit } from "@/domain/cards";
const SUITS: readonly Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const META: Record<Suit, { symbol: string; label: string }> = {
  hearts: { symbol: "♥", label: "Κούπες" }, diamonds: { symbol: "♦", label: "Καρό" },
  clubs: { symbol: "♣", label: "Σπαθιά" }, spades: { symbol: "♠", label: "Μπαστούνια" },
};
export function randomTrumpChoice(choices: readonly (Suit | null)[], random = Math.random): Suit | null {
  if (!choices.length) throw new Error("No legal trump choices");
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]!;
}
export function TrumpChoicePicker({ suits, busy, onSelect }: { suits: readonly (Suit | null)[]; busy: boolean; onSelect: (suit: Suit | null) => void }) {
  const button = "rounded-xl border border-white/20 bg-white/10 font-bold transition-colors enabled:hover:bg-white/20 enabled:active:bg-primary/25 disabled:opacity-30";
  return <div className="absolute left-1/2 top-[42%] z-[85] w-fit max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-primary/40 bg-black/90 p-4 text-center shadow-2xl backdrop-blur-md [--suit-size:clamp(72px,7vw,96px)] [@media(max-height:400px)]:[--suit-size:72px]" role="dialog" aria-label="Επίλεξε ατού" data-trump-choice>
    <h2 className="mb-3 text-lg font-bold text-primary">Επίλεξε ατού</h2>
    <div className="grid grid-cols-4 gap-2">
      {SUITS.map(suit => <button key={suit} type="button" disabled={busy || !suits.includes(suit)} aria-label={META[suit].label} onClick={() => onSelect(suit)} className={`${button} flex h-[var(--suit-size)] w-[var(--suit-size)] items-center justify-center ${suit === "hearts" || suit === "diamonds" ? "text-red-400" : "text-white"}`}><SuitSymbol suit={suit} className="h-[62%] w-[62%]" /></button>)}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button type="button" disabled={busy || !suits.length} onClick={() => onSelect(randomTrumpChoice(suits))} className={`${button} min-h-12 px-3 text-sm text-white`}>⚄ Τυχαίο</button>
      <button type="button" disabled={busy || !suits.includes(null)} onClick={() => onSelect(null)} className={`${button} min-h-12 px-3 text-sm text-white`}>Χωρίς ατού</button>
    </div>
  </div>;
}