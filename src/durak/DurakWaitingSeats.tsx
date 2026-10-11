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
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={text.seats}>
        {seats.map((seat) => {
          const bot = CANONICAL_BOTS.find((bot) => bot.displayName === seat.name);
          const name = seat.name ?? text.empty;
          const content = (
            <>
              <span className="text-xs text-muted-foreground">{text.seat(seat.index + 1)}</span>
              {seat.occupant === "empty" ? (
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-primary/50 text-3xl">
                  +
                </span>
              ) : (
                <PlayerAvatar
                  name={name}
                  imageUrl={assets.tableAvatar(bot?.avatarUrl ?? assets.avatar("", name))}
                  isBot={seat.occupant === "bot"}
                  size="lg"
                />
              )}
              <span className="max-w-full truncate text-sm font-semibold">{name}</span>
            </>
          );
          return host && seat.occupant !== "human" ? (
            <button
              key={seat.index}
              type="button"
              disabled={busy}
              aria-label={text.chooseSeat(seat.index + 1)}
              onClick={() => setSelected(seat.index)}
              className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-primary/40 bg-secondary/40 p-3 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait"
            >
              {content}
            </button>
          ) : (
            <div
              key={seat.index}
              className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 p-3"
            >
              {content}
            </div>
          );
        })}
      </div>
      {canChoose && (
        <section
          role="dialog"
          aria-label={text.chooseSeat(target.index + 1)}
          className="space-y-3 rounded-xl border border-primary bg-secondary p-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{text.chooseSeat(target.index + 1)}</h3>
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(null)}
              className="min-h-11 px-3"
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
                  className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-primary/30 p-2 disabled:opacity-50"
                >
                  <PlayerAvatar
                    name={bot.displayName}
                    imageUrl={assets.tableAvatar(bot.avatarUrl)}
                    isBot
                    size="md"
                  />
                  <span className="text-sm">{bot.displayName}</span>
                </button>
              );
            })}
          </div>
          {target.occupant === "bot" && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await onRemove(target.index);
                setSelected(null);
              }}
              className="min-h-11 rounded-lg border px-3"
            >
              {text.remove}
            </button>
          )}
        </section>
      )}
    </>
  );
}
