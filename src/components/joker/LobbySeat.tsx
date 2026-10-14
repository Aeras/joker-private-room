import { assets } from "@/assets/registry";
import type { Seat } from "@/domain/players";
import { t } from "@/i18n/el";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "./PlayerAvatar";

export function LobbySeat({
  seat,
  hostId,
  manageable = false,
  onManage,
}: {
  seat: Seat;
  hostId: string;
  manageable?: boolean;
  onManage?: () => void;
}) {
  const o = seat.occupant;
  const common = cn(
    "aspect-square min-h-0 min-w-0 rounded-xl border p-1.5 sm:p-3 transition",
    manageable && "cursor-pointer active:scale-[0.985]",
  );

  if (o.type === "empty") {
    const content = (
      <>
        <div className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-dashed border-primary/40 text-xl text-primary/75">+</div>
        <span className="font-display max-w-full truncate text-[10px] sm:text-sm text-foreground">{t.emptySeat}</span>
        {manageable && <span className="hidden text-[11px] text-primary/80 sm:block">Επιλογή bot</span>}
      </>
    );
    return manageable ? (
      <button type="button" className={cn(common, "flex w-full flex-col items-center justify-center gap-1 sm:gap-1.5 border-dashed border-primary/35 bg-black/10 text-muted-foreground hover:border-primary/60")} onClick={onManage}>
        {content}
      </button>
    ) : (
      <div className={cn(common, "flex flex-col items-center justify-center gap-1.5 border-dashed border-primary/25 text-muted-foreground")}>{content}</div>
    );
  }

  const name = o.type === "human" ? o.player.displayName : o.bot.displayName;
  const id = o.type === "human" ? o.player.id : o.bot.id;
  const status = o.type === "bot" ? null : o.player.id === hostId ? t.host : o.connected ? t.connected : t.disconnected;
  const content = (
    <>
      <PlayerAvatar name={name} isBot={o.type === "bot"} imageUrl={assets.avatar(id, name)} />
      <span className="font-display text-sm text-foreground">{name}</span>
      {status && <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] sm:px-2.5 sm:text-[11px]", status === t.host ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>{status}</span>}
      {o.type === "bot" && manageable && <span className="text-[11px] text-primary/80">Αλλαγή bot</span>}
    </>
  );

  return manageable ? (
    <button type="button" className={cn(common, "panel flex w-full flex-col items-center justify-center gap-1.5 hover:border-primary/45")} onClick={onManage}>
      {content}
    </button>
  ) : (
    <div className={cn(common, "panel flex flex-col items-center justify-center gap-1.5")}>{content}</div>
  );
}
