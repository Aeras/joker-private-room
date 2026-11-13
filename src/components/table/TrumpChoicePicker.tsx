import type { Suit } from "@/domain/cards";

const SUITS: readonly Suit[] = ["hearts", "diamonds", "clubs", "spades"];

const META: Record<Suit, { symbol: string; label: string; micro: string; color: string; border: string; gradId: string }> = {
  hearts: { symbol: "♥", label: "Κούπες", micro: "ΚΟΥΠΑ", color: "#fca5a5", border: "rgba(239, 68, 68, 0.45)", gradId: "heartGrad" },
  diamonds: { symbol: "♦", label: "Καρό", micro: "ΚΑΡΟ", color: "#fca5a5", border: "rgba(239, 68, 68, 0.45)", gradId: "diamondGrad" },
  clubs: { symbol: "♣", label: "Σπαθιά", micro: "ΣΠΑΘΙ", color: "#e5e7eb", border: "rgba(212, 175, 55, 0.4)", gradId: "clubGrad" },
  spades: { symbol: "♠", label: "Μπαστούνια", micro: "ΜΠΑΣΤΟΥΝΙ", color: "#e5e7eb", border: "rgba(212, 175, 55, 0.4)", gradId: "spadeGrad" },
};

const SUIT_PATHS: Record<Suit, string> = {
  hearts: "M32 54C26 48 8 35 8 21C8 8 24 6 32 18C40 6 56 8 56 21C56 35 38 48 32 54Z",
  diamonds: "M32 6L51 32L32 58L13 32Z",
  clubs: "M32 8C19 8 17 22 23 28C9 22 4 39 14 45C20 49 27 45 30 40C30 47 27 52 23 56H41C37 52 34 47 34 40C37 45 44 49 50 45C60 39 55 22 41 28C47 22 45 8 32 8Z",
  spades: "M32 6C27 15 9 27 9 38C9 50 25 51 30 40C30 47 27 52 23 56H41C37 52 34 47 34 40C39 51 55 50 55 38C55 27 37 15 32 6Z",
};

export function randomTrumpChoice(choices: readonly (Suit | null)[], random = Math.random): Suit | null {
  if (!choices.length) throw new Error("No legal trump choices");
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))]!;
}

export function TrumpChoicePicker({
  suits,
  busy,
  onSelect,
}: {
  suits: readonly (Suit | null)[];
  busy: boolean;
  onSelect: (suit: Suit | null) => void;
}) {
  return (
    <div
      className="absolute left-1/2 top-[42%] z-[85] w-fit max-w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 select-none rounded-[22px] border-2 border-[#dfbc43] bg-[radial-gradient(circle_at_50%_20%,#1e261f_0%,#0c100d_80%,#060806_100%)] p-4 sm:p-5 text-center shadow-[0_24px_60px_rgba(0,0,0,0.92),inset_0_1px_2px_rgba(255,255,255,0.25)] backdrop-blur-md [--suit-size:clamp(70px,8vw,94px)] [@media(max-height:450px)]:[--suit-size:66px] [@media(max-height:450px)]:p-3"
      role="dialog"
      aria-label="Επίλεξε ατού"
      data-trump-choice
    >
      {/* Corner filigree brackets */}
      <span className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 rounded-tl-sm border-l-2 border-t-2 border-[#e8c258]/80" aria-hidden="true" />
      <span className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 rounded-tr-sm border-r-2 border-t-2 border-[#e8c258]/80" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-2 left-2 h-3.5 w-3.5 rounded-bl-sm border-b-2 border-l-2 border-[#e8c258]/80" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-2 right-2 h-3.5 w-3.5 rounded-br-sm border-b-2 border-r-2 border-[#e8c258]/80" aria-hidden="true" />

      {/* Title */}
      <h2 className="mb-3.5 flex items-center justify-center gap-2.5 text-xs sm:text-sm font-extrabold uppercase tracking-[0.16em]">
        <span className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#e8c258]/60" />
        <span className="bg-gradient-to-b from-[#fffceb] via-[#e8c258] to-[#996e14] bg-clip-text text-transparent">
          Επίλεξε ατού
        </span>
        <span className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#e8c258]/60" />
      </h2>

      {/* SVG Gradient Definitions */}
      <svg className="sr-only" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="heartGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ff7b89" />
            <stop offset="50%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </radialGradient>
          <radialGradient id="diamondGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ff9999" />
            <stop offset="50%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </radialGradient>
          <radialGradient id="clubGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#8b949e" />
            <stop offset="55%" stopColor="#24292f" />
            <stop offset="100%" stopColor="#0a0c0f" />
          </radialGradient>
          <radialGradient id="spadeGrad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#8b949e" />
            <stop offset="55%" stopColor="#24292f" />
            <stop offset="100%" stopColor="#0a0c0f" />
          </radialGradient>
        </defs>
      </svg>

      {/* 4 Suit Tiles */}
      <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
        {SUITS.map((suit) => {
          const meta = META[suit];
          const enabled = !busy && suits.includes(suit);
          return (
            <button
              key={suit}
              type="button"
              disabled={!enabled}
              aria-label={meta.label}
              onClick={() => onSelect(suit)}
              className="group relative flex h-[var(--suit-size)] w-[var(--suit-size)] flex-col items-center justify-center gap-1 rounded-2xl border bg-gradient-to-b from-[#242921] via-[#111410] to-[#0a0c09] p-1.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),0_6px_14px_rgba(0,0,0,0.6)] transition-all duration-200 enabled:cursor-pointer enabled:hover:-translate-y-1 enabled:hover:border-[#f3d470] enabled:hover:bg-gradient-to-b enabled:hover:from-[#323a2e] enabled:hover:via-[#1a1e17] enabled:hover:to-[#0f120e] enabled:hover:shadow-[0_10px_22px_rgba(0,0,0,0.8),0_0_16px_rgba(243,212,112,0.45)] enabled:active:translate-y-0 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
              style={{ borderColor: meta.border }}
            >
              <div className="flex h-[58%] w-[58%] items-center justify-center drop-shadow-[0_3px_5px_rgba(0,0,0,0.7)] transition-transform duration-200 group-hover:scale-110">
                <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden="true" focusable="false">
                  <path
                    d={SUIT_PATHS[suit]}
                    fill={`url(#${meta.gradId})`}
                    stroke="#ffd700"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span
                className="text-[9px] sm:text-[10px] font-extrabold tracking-wider"
                style={{ color: meta.color }}
              >
                {meta.micro}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom Actions */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-2.5">
        <button
          type="button"
          disabled={busy || !suits.length}
          onClick={() => onSelect(randomTrumpChoice(suits))}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#d4af37]/40 bg-gradient-to-b from-[#21271e] to-[#0c100d] px-3 text-xs sm:text-sm font-bold text-[#f3f4f6] shadow-md transition-all duration-200 enabled:cursor-pointer enabled:hover:border-[#ffd700] enabled:hover:bg-gradient-to-b enabled:hover:from-[#2e372a] enabled:hover:to-[#131812] enabled:hover:shadow-[0_0_12px_rgba(212,175,55,0.35)] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <span className="text-base" aria-hidden="true">🎲</span>
          <span>Τυχαίο</span>
        </button>
        <button
          type="button"
          disabled={busy || !suits.includes(null)}
          onClick={() => onSelect(null)}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#d4af37]/40 bg-gradient-to-b from-[#21271e] to-[#0c100d] px-3 text-xs sm:text-sm font-bold text-[#f3f4f6] shadow-md transition-all duration-200 enabled:cursor-pointer enabled:hover:border-[#ffd700] enabled:hover:bg-gradient-to-b enabled:hover:from-[#2e372a] enabled:hover:to-[#131812] enabled:hover:shadow-[0_0_12px_rgba(212,175,55,0.35)] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <span className="text-base" aria-hidden="true">⊘</span>
          <span>Χωρίς ατού</span>
        </button>
      </div>
    </div>
  );
}
