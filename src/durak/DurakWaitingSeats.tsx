import { useState } from "react";
import { PlayerAvatar } from "@/components/joker/PlayerAvatar";
import { assets } from "@/assets/registry";
import { CANONICAL_BOTS } from "../../supabase/functions/_shared/bot-catalog";
import type { DurakSeatView } from "@/services/durakRoomFunctions";
import { durakLobbyText as text } from "@/i18n/durak.el";

/** DURAK seats reuse JOKER artwork/catalog, never its room or game logic. */
export function DurakWaitingSeats({
  seats,
  host,
  busy,
  onSelect,
  onRemove,
}: {
  seats: DurakSeatView[];
  host: boolean;
  busy: boolean;
  onSelect: (seat: number, botId: string) => Promise<void>;
  onRemove: (seat: number) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const target = seats.find((seat) => seat.index === selected);
  const canChoose = host && target && target.occupant !== "human";

  const gridCols =
    seats.length <= 2
      ? "grid-cols-2"
      : seats.length === 3
        ? "grid-cols-3"
        : seats.length === 4
          ? "grid-cols-2 sm:grid-cols-4"
          : seats.length === 5
            ? "grid-cols-3 sm:grid-cols-5"
            : "grid-cols-3 sm:grid-cols-6";

  return (
    <>
      <div className={`grid ${gridCols} gap-2 sm:gap-3`} aria-label={text.seats}>
        {seats.map((seat) => {
          const bot = CANONICAL_BOTS.find((bot) => bot.displayName === seat.name);
          const name = seat.name ?? text.empty;
          const isHuman = seat.occupant === "human";
          const isEmpty = seat.occupant === "empty";

          const content = (
            <>
              <div className="flex items-center justify-between w-full px-1">
                <span className="text-[10px] font-display uppercase tracking-wider text-primary/80">
                  {text.seat(seat.index + 1)}
                </span>
                {isHuman && (
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                    Host
                  </span>
                )}
                {seat.occupant === "bot" && (
                  <span className="text-[9px] font-bold text-amber-300 bg-amber-400/15 border border-amber-400/30 px-1.5 py-0.2 rounded">
                    Bot
                  </span>
                )}
              </div>

              <div className="my-0.5 flex items-center justify-center">
                {isEmpty ? (
                  <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-dashed border-primary/50 text-primary text-base transition-transform group-hover:scale-105">
                    +
                  </span>
                ) : (
                  <div className="relative rounded-full ring-1 ring-primary/40 p-0.5">
                    <PlayerAvatar
                      name={name}
                      imageUrl={assets.tableAvatar(bot?.avatarUrl ?? assets.avatar("", name))}
                      isBot={seat.occupant === "bot"}
                      size="sm"
                    />
                  </div>
                )}
              </div>

              <span className="max-w-full truncate text-[11px] font-semibold text-foreground text-center">
                {isEmpty ? "+ Κενή θέση" : name}
              </span>
            </>
          );

          return host && seat.occupant !== "human" ? (
            <button
              key={seat.index}
              type="button"
              disabled={busy}
              aria-label={text.chooseSeat(seat.index + 1)}
              onClick={() => setSelected(seat.index)}
              className="group flex flex-col items-center justify-between gap-0.5 rounded-xl border border-primary/40 bg-black/40 hover:border-primary hover:bg-primary/10 p-1.5 sm:p-2 transition active:scale-[0.98] disabled:cursor-wait focus-visible:ring-2 focus-visible:ring-primary shadow-sm"
            >
              {content}
            </button>
          ) : (
            <div
              key={seat.index}
              className={`flex flex-col items-center justify-between gap-0.5 rounded-xl border p-1.5 sm:p-2 shadow-sm ${
                isHuman
                  ? "border-primary/60 bg-gradient-to-b from-primary/20 via-black/40 to-black/60 ring-1 ring-primary/30"
                  : "border-border/60 bg-black/40"
              }`}
            >
              {content}
            </div>
          );
        })}
      </div>

      {canChoose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm animate-in fade-in duration-150">
          <section
            role="dialog"
            aria-label={text.chooseSeat(target.index + 1)}
            className="w-full max-w-lg space-y-3 rounded-2xl border border-primary/50 bg-[#16060c] p-4 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-primary/20 pb-2">
              <h3 className="font-display font-bold text-foreground text-sm sm:text-base">
                {text.chooseSeat(target.index + 1)}
              </h3>
              <button
                type="button"
                disabled={busy}
                onClick={() => setSelected(null)}
                className="px-3 py-1 rounded-lg border border-border/80 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
              >
                {text.close}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CANONICAL_BOTS.map((bot) => {
                const used = seats.some(
                  (seat) =>
                    seat.index !== target.index &&
                    seat.occupant === "bot" &&
                    seat.name === bot.displayName,
                );
                return (
                  <button
                    key={bot.id}
                    type="button"
                    aria-label={bot.displayName}
                    disabled={busy || used}
                    onClick={async () => {
                      await onSelect(target.index, bot.id);
                      setSelected(null);
                    }}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-black/40 hover:border-primary hover:bg-primary/10 p-2.5 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="relative rounded-full ring-1 ring-primary/30 p-0.5">
                      <PlayerAvatar
                        name={bot.displayName}
                        imageUrl={assets.tableAvatar(bot.avatarUrl)}
                        isBot
                        size="md"
                      />
                    </div>
                    <span className="text-xs font-semibold text-foreground truncate max-w-full">
                      {bot.displayName}
                    </span>
                  </button>
                );
              })}
            </div>

            {target.occupant === "bot" && (
              <div className="pt-2 border-t border-border/30">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    await onRemove(target.index);
                    setSelected(null);
                  }}
                  className="w-full py-2 rounded-xl border border-destructive/40 bg-destructive/15 text-destructive-foreground hover:bg-destructive/25 text-xs font-semibold transition"
                >
                  {text.remove}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
