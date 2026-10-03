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
    return <div className={cn("rounded-lg border border-primary/40 bg-black/75 px-3 py-1 text-center shadow-xl backdrop-blur-sm", stats.isActive && "ring-gold")}><div className="text-[10px] font-semibold leading-tight text-foreground sm:text-xs">{name} <span className="text-primary">· ΕΣΥ</span></div><div className={cn("font-display text-sm font-bold leading-tight tabular-nums sm:text-base", stats.totalScore < 0 ? "text-negative" : "text-primary")}>{score}</div></div>;
  }

  return (
    <div className={cn("flex items-center gap-1", orientation === "vertical" ? "flex-col" : "flex-row")}>
      <div className={cn("relative flex flex-col items-center", stats.isActive && "drop-shadow-[0_0_10px_var(--gold)]")}>
        <div className="relative rounded-full border border-primary/70 bg-black/70 p-0.5 shadow-xl">
          <PlayerAvatar name={name} isBot={o.type === "bot"} imageUrl={explicitAvatar ?? assets.avatar(id, name)} size="lg" className="h-11 w-11 border-0 sm:h-14 sm:w-14 lg:h-16 lg:w-16" />
          <span className={cn("absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-black", connected ? "bg-online" : "bg-muted-foreground")} aria-label={connected ? t.connected : t.disconnected} />
          {stats.isDealer && <span title={t.dealer} className="absolute -left-1 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[0.55rem] font-bold text-primary-foreground">D</span>}
        </div>
        <div className="-mt-1 min-w-20 max-w-32 rounded-md border border-primary/40 bg-black/85 px-2 py-0.5 text-center shadow-lg backdrop-blur-sm">
          <div className="truncate text-[10px] font-semibold leading-tight text-foreground sm:text-xs">{name}{o.type === "bot" ? " · BOT" : ""}</div>
          <div className={cn("font-display text-xs font-bold leading-tight tabular-nums sm:text-sm", stats.totalScore < 0 ? "text-negative" : "text-primary")}>{score}</div>
        </div>
      </div>
      {showCards && stats.cardCount > 0 && <div className="flex -space-x-3 [--card-w:1.05rem] sm:[--card-w:1.35rem] lg:[--card-w:1.55rem]">{Array.from({ length: Math.min(stats.cardCount, 9) }, (_, i) => <PlayingCard key={i} faceDown />)}</div>}
    </div>
  );
}
