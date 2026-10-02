import { assets } from "@/assets/registry";
import type { Seat } from "@/domain/players";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "./PlayerAvatar";

export function LobbySeat({ seat, hostId }: { seat: Seat; hostId: string }) {
  const o = seat.occupant;
  if (o.type === "empty") {
    return (
      <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 p-4 text-muted-foreground">
        <div className="h-12 w-12 rounded-full border border-dashed border-primary/30" />
        <span className="text-sm">{t.emptySeat}</span>
      </div>
    );
  }
  const name = o.type === "human" ? o.player.displayName : o.bot.displayName;
  const id = o.type === "human" ? o.player.id : o.bot.id;
  const status =
    o.type === "bot" ? t.bot : o.player.id === hostId ? t.host : o.connected ? t.connected : t.disconnected;
  return (
    <div className="panel flex min-h-28 flex-col items-center justify-center gap-2 p-4">
      <PlayerAvatar name={name} isBot={o.type === "bot"} imageUrl={assets.avatar(id)} />
      <span className="font-display text-base text-foreground">{name}</span>
      <span
        className={cn(
          "rounded-full px-2.5 py-0.5 text-xs",
          status === t.host ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
        )}
      >
        {status}
      </span>
    </div>
  );
}
