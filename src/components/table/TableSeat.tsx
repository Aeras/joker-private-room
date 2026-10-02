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

export function TableSeat({
  seat,
  stats,
  orientation,
  showCards = true,
}: {
  seat: Seat;
  stats: SeatStats;
  orientation: "horizontal" | "vertical";
  showCards?: boolean;
}) {
  const o = seat.occupant;
  const name = o.type === "human" ? o.player.displayName : o.type === "bot" ? o.bot.displayName : t.emptySeat;
  const id = o.type === "human" ? o.player.id : o.type === "bot" ? o.bot.id : `empty-${seat.index}`;
  const connected = o.type === "bot" || (o.type === "human" && o.connected);

  return (
    <div className={cn("flex items-center gap-1.5", orientation === "vertical" ? "flex-col" : "flex-row")}>
      <div
        className={cn(
          "panel flex items-center gap-2 rounded-2xl p-1.5 pr-3 transition-shadow",
          orientation === "vertical" && "flex-col p-2 pr-2 text-center",
          stats.isActive && "ring-gold",
        )}
      >
        <div className="relative">
          <PlayerAvatar name={name} isBot={o.type === "bot"} imageUrl={assets.avatar(id)} size="sm" />
          <span
            className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card", connected ? "bg-online" : "bg-muted-foreground")}
            aria-label={connected ? t.connected : t.disconnected}
          />
          {stats.isDealer && (
            <span title={t.dealer} className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[0.6rem] font-bold text-primary-foreground">
              D
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1 truncate text-sm font-medium text-foreground">
            {name}
            {o.type === "bot" && <span className="rounded bg-secondary px-1 text-[0.6rem] text-muted-foreground">BOT</span>}
          </div>
          <div className="flex gap-2 text-[0.7rem] tabular-nums text-muted-foreground">
            <span className={cn(stats.totalScore < 0 ? "text-negative" : "text-primary")}>
              {stats.totalScore < 0 ? `−${Math.abs(stats.totalScore)}` : stats.totalScore}
            </span>
            <span title={`${t.declaration} / ${t.tricks}`}>
              {stats.tricksTaken}/{stats.declaration ?? "–"}
            </span>
          </div>
        </div>
      </div>
      {showCards && stats.cardCount > 0 && (
        <div className={cn("flex [--card-w:1.4rem] sm:[--card-w:1.9rem]", orientation === "vertical" ? "-space-x-4" : "-space-x-4")}>
          {Array.from({ length: Math.min(stats.cardCount, 9) }, (_, i) => (
            <PlayingCard key={i} faceDown />
          ))}
        </div>
      )}
    </div>
  );
}
