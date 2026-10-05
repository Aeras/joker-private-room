import type { Suit } from "@/domain/cards";
import type { LocalLegalAction } from "@/domain/projection";

type JokerOption = Extract<LocalLegalAction, { type: "choose_joker_semantic" }>["options"][number];

const SUIT_META: Record<Suit, { symbol: string; label: string; tone: string }> = {
  hearts: { symbol: "♥", label: "κούπες", tone: "text-red-400" },
  diamonds: { symbol: "♦", label: "καρό", tone: "text-red-400" },
  clubs: { symbol: "♣", label: "σπαθιά", tone: "text-white" },
  spades: { symbol: "♠", label: "πίκες", tone: "text-white" },
};

const SUIT_ORDER: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

export function JokerChoicePicker({
  options,
  busy,
  onSelect,
}: {
  options: readonly JokerOption[];
  busy: boolean;
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
          const actionLabel = mode === "HIGHER_SUIT" ? `Θέλω μεγαλύτερο ${meta.label}` : `Παίρνουν ${meta.label}`;
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
      <div className="mb-2 overflow-hidden rounded-2xl border border-primary/35 bg-black/85 shadow-2xl backdrop-blur">
        {row("HIGHER_SUIT", "Θέλω μεγαλύτερο")}
        {row("SUIT_WINS", "Παίρνουν")}
      </div>
    );
  }

  if (openTrickOptions.length > 0) {
    return (
      <div className="mb-2 flex overflow-hidden rounded-xl border border-primary/35 bg-black/85 shadow-2xl backdrop-blur">
        {openTrickOptions.map((option) => (
          <button
            key={option.mode}
            type="button"
            disabled={busy}
            onClick={() => onSelect(option)}
            className="min-w-32 border-l border-white/10 px-4 py-3 text-sm font-semibold text-foreground transition-colors first:border-l-0 enabled:hover:bg-primary/15 enabled:active:bg-primary/25 disabled:opacity-40"
          >
            {option.mode === "COMPETE" ? "Joker ψηλά" : "Joker από κάτω"}
          </button>
        ))}
      </div>
    );
  }

  return null;
}
