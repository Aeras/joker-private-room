import { assets } from "@/assets/registry";
import { cardLabel, isRedSuit, SUIT_SYMBOL, type Card } from "@/domain/cards";
import { cn } from "@/lib/utils";

/**
 * Placeholder playing card. Uses registry artwork when available.
 * Size is controlled by the --card-w CSS variable on a parent or via className.
 */
export function PlayingCard({
  card,
  faceDown,
  selected,
  onClick,
  className,
}: {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const base = cn(
    "relative aspect-[5/7] w-[var(--card-w,4.5rem)] shrink-0 rounded-[0.5rem] shadow-card transition-transform duration-150",
    onClick && "cursor-pointer",
    selected && "-translate-y-4 ring-gold",
    className,
  );

  if (faceDown || !card) {
    const back = assets.cardBack;
    return (
      <div className={cn(base, "overflow-hidden border border-primary/30")} aria-label="Κλειστό φύλλο">
        {back ? (
          <img src={back} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="card-back-pattern absolute inset-[3px] rounded-[0.35rem]" />
        )}
      </div>
    );
  }

  const face = assets.cardFace(card);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      aria-label={cardLabel(card)}
      className={cn(base, "overflow-hidden bg-card-face text-card-ink")}
    >
      {face ? (
        <img src={face} alt={cardLabel(card)} className="h-full w-full object-cover" />
      ) : card.kind === "joker" ? (
        <div className="flex h-full flex-col items-center justify-center gap-0.5 font-display text-card-red">
          <span className="text-[calc(var(--card-w,4.5rem)*0.32)] leading-none">★</span>
          <span className="text-[calc(var(--card-w,4.5rem)*0.16)] font-semibold tracking-wider">JOKER</span>
        </div>
      ) : (
        <div className={cn("flex h-full flex-col p-[6%]", isRedSuit(card.suit) && "text-card-red")}>
          <span className="text-left font-display text-[calc(var(--card-w,4.5rem)*0.28)] font-semibold leading-none">
            {card.rank}
          </span>
          <span className="text-left text-[calc(var(--card-w,4.5rem)*0.22)] leading-none">
            {SUIT_SYMBOL[card.suit]}
          </span>
          <span className="mt-auto self-end text-[calc(var(--card-w,4.5rem)*0.42)] leading-none">
            {SUIT_SYMBOL[card.suit]}
          </span>
        </div>
      )}
    </Tag>
  );
}
