import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { durakTableText as text } from "@/i18n/durak.el";
import type { DurakGameView } from "@/services/durakRoomFunctions";

/** Uses only confirmed public match results, after the presentation queue settles. */
export function DurakResults({
  game,
  playerName,
}: {
  game: DurakGameView;
  playerName: (seat: number) => string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(game.ended);
  }, [game.ended]);
  if (!game.ended) return null;
  const winners = game.handSizes.map((_, seat) => seat).filter((seat) => seat !== game.fool);
  const order = game.finishOrder ?? [];
  const known =
    game.finishOrderComplete === true &&
    order.length === winners.length &&
    new Set(order).size === order.length &&
    winners.every((seat) => order.includes(seat));
  const rows = [...(known ? order : winners), ...(game.fool === null ? [] : [game.fool])];
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="durak-results-trigger">
          {text.results}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="durak-results-overlay" />
        <Dialog.Content className="durak-results-dialog">
          <Dialog.Title className="text-lg font-semibold">{text.results}</Dialog.Title>
          <Dialog.Description className="text-sm text-amber-100/80">
            {game.fool === null ? text.draw : text.exitOrder}
          </Dialog.Description>
          {!known && <p className="text-xs text-amber-100/80">{text.unknownOrder}</p>}
          <ol className="durak-results-list">
            {rows.map((seat, index) => (
              <li
                key={seat}
                data-durak-result-seat={seat}
                data-loser={seat === game.fool || undefined}
              >
                <span className="min-w-0 truncate" title={playerName(seat)}>
                  {known ? `${index + 1}. ` : ""}
                  {playerName(seat)}
                </span>
                <span className="shrink-0 text-sm">
                  {seat === game.fool ? text.loser : text.finished}
                </span>
              </li>
            ))}
          </ol>
          <Dialog.Close className="durak-results-close">{text.closeResults}</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
