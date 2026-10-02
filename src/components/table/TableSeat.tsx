import { assets } from "@/assets/registry";
import type { Seat } from "@/domain/players";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "../joker/PlayerAvatar";
import { PlayingCard } from "../joker/PlayingCard";

export interface SeatStats {
  totalScore: number;
  declaration: number | null;
  tricksTaken: number;
  isDealer: boolean;
  isActive: boolean;
  cardCount: number;
}

export function TableSeat({ seat, stats, orientation, showCards = true, local = false }: {
  seat: Seat;
  stats: SeatStats;
  orientation: "horizontal" | "vertical";
  showCards?: boolean;
  local?: boolean;
}) {
  const o = seat.occupant;
  const name = o.type === "human" ? o.player.displayName : o.type === "bot" ? o.bot.displayName : t.emptySeat;
  const id = o.type === "human" ? o.player.id : o.type === "bot" ? o.bot.id : `empty-${seat.index}`;
  const explicitAvatar = o.type === "human" ? o.player.avatarUrl : o.type === "bot" ? o.bot.avatarUrl : undefined;
  const connected = o.type === "bot" || (o.type === "human" && o.connected);
  const score = stats.totalScore < 0 ? `−${Math.abs(stats.totalScore)}` : `${stats.totalScore}`;

  if (local) {
    return (
      <div className={cn("rounded-xl border border-primary/35 bg-black/70 px-4 py-1.5 text-center shadow-xl backdrop-blur-sm", stats.isActive && "ring-gold")}>
        <div className="text-xs font-semibold text-foreground">{name} <span className="text-primary">· ΕΣΥ</span></div>
        <div className={cn("font-display text-base font-bold tabular-nums", stats.totalScore < 0 ? "text-negative" : "text-primary")}>{score}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5", orientation === "vertical" ? "flex-col" : "flex-row")}>
      <div className={cn("relative flex flex-col items-center", stats.isActive && "drop-shadow-[0_0_12px_var(--gold)]")}>
        <div className="relative rounded-full border-2 border-primary/70 bg-black/70 p-1 shadow-2xl">
          <PlayerAvatar name={name} isBot={o.type === "bot"} imageUrl={explicitAvatar ?? assets.avatar(id, name)} size="lg" className="h-16 w-16 border-0 sm:h-20 sm:w-20" />
          <span className={cn("absolute bottom-1 right-0 h-3 w-3 rounded-full border-2 border-black", connected ? "bg-online" : "bg-muted-foreground")} aria-label={connected ? t.connected : t.disconnected} />
          {stats.isDealer && <span title={t.dealer} className="absolute -left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[0.65rem] font-bold text-primary-foreground">D</span>}
        </div>
        <div className="-mt-2 min-w-24 rounded-lg border border-primary/40 bg-black/80 px-2.5 py-1 text-center shadow-xl backdrop-blur-sm">
          <div className="truncate text-xs font-semibold text-foreground sm:text-sm">{name}{o.type === "bot" ? " · BOT" : ""}</div>
          <div className={cn("font-display text-sm font-bold tabular-nums", stats.totalScore < 0 ? "text-negative" : "text-primary")}>{score}</div>
        </div>
      </div>
      {showCards && stats.cardCount > 0 && (
        <div className="flex -space-x-4 [--card-w:1.45rem] sm:[--card-w:1.85rem]">
          {Array.from({ length: Math.min(stats.cardCount, 9) }, (_, i) => <PlayingCard key={i} faceDown />)}
        </div>
      )}
    </div>
  );
}
