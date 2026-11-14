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
  const isHost = o.type === "human" && o.player.id === hostId;
  const common = cn(
    "h-28 sm:h-32 min-h-0 min-w-0 rounded-2xl p-2 sm:p-2.5 transition-all shadow-md flex flex-col items-center justify-between text-center select-none",
    manageable && "cursor-pointer active:scale-[0.985]",
  );

  if (o.type === "empty") {
    const content = (
      <>
        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Θέση {seat.index + 1}</span>
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#292a2f] border border-dashed border-[#f5c15d]/50 flex items-center justify-center text-[#f5c15d] text-base font-bold shadow-sm">
          +
        </div>
        <div>
          <span className="font-display text-[11px] sm:text-xs font-semibold text-stone-300 block">{t.emptySeat}</span>
          {manageable && <span className="text-[10px] font-medium text-[#f5c15d] block">Επιλογή bot</span>}
        </div>
      </>
    );
    return manageable ? (
      <button type="button" className={cn(common, "w-full bg-[#1a1b1f] border border-dashed border-white/20 hover:border-[#f5c15d] hover:bg-[#222328]")} onClick={onManage}>
        {content}
      </button>
    ) : (
      <div className={cn(common, "bg-[#1a1b1f] border border-dashed border-white/10 text-muted-foreground")}>{content}</div>
    );
  }

  const name = o.type === "human" ? o.player.displayName : o.bot.displayName;
  const id = o.type === "human" ? o.player.id : o.bot.id;
  const status = o.type === "bot" ? null : isHost ? t.host : o.connected ? t.connected : t.disconnected;
  const content = (
    <>
      <span className={cn("text-[10px] font-bold uppercase tracking-wider", isHost ? "text-[#f5c15d]" : "text-stone-400")}>
        Θέση {seat.index + 1}
      </span>
      <div className="relative">
        <PlayerAvatar name={name} isBot={o.type === "bot"} imageUrl={assets.avatar(id, name)} />
        {status && (
          <span className={cn(
            "absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded text-[8px] font-bold shadow-sm",
            status === t.host ? "bg-[#f5c15d] text-[#1a1202]" : "bg-emerald-500 text-black"
          )}>
            {status}
          </span>
        )}
      </div>
      <div className="max-w-full">
        <span className="font-display text-xs font-bold text-white truncate block max-w-[5.5rem] sm:max-w-[7rem]">{name}</span>
        {o.type === "bot" && manageable && <span className="text-[10px] text-[#f5c15d] block">Αλλαγή bot</span>}
      </div>
    </>
  );

  return manageable ? (
    <button
      type="button"
      className={cn(common, isHost ? "bg-[#292a2f] border-2 border-[#f5c15d] shadow-[0_0_15px_rgba(245,193,93,0.18)]" : "bg-[#222328] border border-white/10 hover:border-[#f5c15d]/60")}
      onClick={onManage}
    >
      {content}
    </button>
  ) : (
    <div className={cn(common, isHost ? "bg-[#292a2f] border-2 border-[#f5c15d] shadow-[0_0_15px_rgba(245,193,93,0.18)]" : "bg-[#222328] border border-white/10")}>
      {content}
    </div>
  );
}
