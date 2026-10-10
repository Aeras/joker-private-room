import type { Suit } from "@/domain/cards";

const paths: Record<Suit, string> = {
  hearts: "M32 54C26 48 8 35 8 21C8 8 24 6 32 18C40 6 56 8 56 21C56 35 38 48 32 54Z",
  diamonds: "M32 6L51 32L32 58L13 32Z",
  clubs: "M32 8C19 8 17 22 23 28C9 22 4 39 14 45C20 49 27 45 30 40C30 47 27 52 23 56H41C37 52 34 47 34 40C37 45 44 49 50 45C60 39 55 22 41 28C47 22 45 8 32 8Z",
  spades: "M32 6C27 15 9 27 9 38C9 50 25 51 30 40C30 47 27 52 23 56H41C37 52 34 47 34 40C39 51 55 50 55 38C55 27 37 15 32 6Z",
};

/** Font-independent artwork, sized by its container on every device. */
export function SuitSymbol({ suit, className }: { suit: Suit; className?: string }) {
  return <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false" data-suit-symbol={suit}>
    <path d={paths[suit]} fill="currentColor" stroke="currentColor" strokeWidth=".5" strokeLinejoin="round" />
  </svg>;
}
