import type { Suit } from "@/domain/cards";
import type { LocalLegalAction } from "@/domain/projection";

type JokerOption = Extract<LocalLegalAction, { type: "choose_joker_semantic" }>["options"][number];

const SUIT_META: Record<Suit, { symbol: string; label: string; tone: string }> = {
  hearts: { symbol: "♥", label: "κούπες", tone: "text-red-400" },
  diamonds: { symbol: "♦", label: "καρό", tone: "text-red-400" },
  clubs: { symbol: "♣", label: "σπαθιά", tone: "text-white" },
  spades: { symbol: "♠", label: "μπαστούνια", tone: "text-white" },
};

const SUIT_ORDER: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

const CENTER_PANEL =
  "fixed left-1/2 top-1/2 z-[85] -translate-x-1/2 -translate-y-1/2 pointer-events-auto";

export function JokerChoicePicker({
  options,
  busy,
  trumpSuit,
  onSelect,
}: {
  options: readonly JokerOption[];
  busy: boolean;
  trumpSuit?: Suit | null;
  onSelect: (option: JokerOption) => void;
}) {
  const leadOptions = options.filter((option) => option.context === "LEAD");
  const openTrickOptions = options.filter((option) => option.context === "OPEN_TRICK");

  if (leadOptions.length > 0) {
    const findLead = (mode: "HIGHER_SUIT" | "SUIT_WINS", suit: Suit) =>
      leadOptions.find((option) => option.context === "LEAD" && option.mode === mode && option.requestedSuit === suit);

    const row = (mode: "HIGHER_SUIT" | "SUIT_WINS", title: string) => (
      <div className="grid grid-cols-[7rem_repeat(4,3.6rem)] items-stretch border-t border-white/10 first:border-t-0">
        <div className="flex items-center justify-center px-2 text-center text-[11px] font-semibold leading-tight text-primary">
          {title}
        </div>
        {SUIT_ORDER.map((suit) => {
          const option = findLead(mode, suit);
          const meta = SUIT_META[suit];
          const actionLabel = mode === "HIGHER_SUIT" && trumpSuit === suit ? "Θέλω μεγαλύτερο ατού" : mode === "HIGHER_SUIT" ? `Θέλω μεγαλύτερο ${meta.label}` : `Παίρνουν ${meta.label}`;
          return (
            <button
              key={`${mode}-${suit}`}
              type="button"
              disabled={busy || !option}
              aria-label={actionLabel}
              title={actionLabel}
              onClick={() => option && onSelect(option)}
              className={`flex h-12 items-center justify-center border-l border-white/10 text-3xl transition-colors enabled:hover:bg-primary/15 enabled:active:bg-primary/25 disabled:opacity-20 ${meta.tone}`}
            >
              {meta.symbol}
            </button>
          );
        })}
      </div>
    );

    return (
      <div className={CENTER_PANEL} data-joker-choice-position="table-center">
        <div className="overflow-hidden rounded-2xl border border-primary/35 bg-black/88 shadow-2xl backdrop-blur-md">
          {row("HIGHER_SUIT", "Θέλω μεγαλύτερο")}
          {row("SUIT_WINS", "Παίρνουν")}
        </div>
      </div>
    );
  }

  if (openTrickOptions.length > 0) {
    const compete = openTrickOptions.find((option) => option.mode === "COMPETE");
    const fromBelow = openTrickOptions.find((option) => option.mode === "FROM_BELOW");

    return (
      <div className={CENTER_PANEL} data-joker-choice-position="table-center">
        <div className="rounded-2xl border border-white/15 bg-black/72 p-2.5 shadow-2xl backdrop-blur-md">
          <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Τζόκερ
          </div>
          <div className="flex items-center justify-center gap-2.5">
            <button
              type="button"
              disabled={busy || !compete}
              onClick={() => compete && onSelect(compete)}
              className="h-11 min-w-[9rem] rounded-xl border border-red-300/60 bg-red-600 px-4 text-sm font-bold text-white shadow-[0_8px_22px_rgba(185,28,28,.28)] transition-transform enabled:hover:-translate-y-0.5 enabled:hover:bg-red-500 enabled:active:translate-y-0 disabled:opacity-40"
            >
              Τζόκερ από πάνω
            </button>
            <button
              type="button"
              disabled={busy || !fromBelow}
              onClick={() => fromBelow && onSelect(fromBelow)}
              className="h-11 min-w-[9rem] rounded-xl border border-[#b99a5d] bg-white px-4 text-sm font-bold text-black shadow-[0_8px_22px_rgba(0,0,0,.24)] transition-transform enabled:hover:-translate-y-0.5 enabled:bg-white enabled:active:translate-y-0 disabled:opacity-40"
            >
              Τζόκερ από κάτω
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
