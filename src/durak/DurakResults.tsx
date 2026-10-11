import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { durakTableText as text } from "@/i18n/durak.el";
import type { DurakGameView } from "@/services/durakRoomFunctions";

/** Uses only confirmed public match results, after the presentation queue settles. */
export function DurakResults({
  game,
  playerName,
  onNewGame,
}: {
  game: DurakGameView;
  playerName: (seat: number) => string;
  onNewGame?: (() => Promise<void>) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  async function createGame() {
    if (creating || !onNewGame) return;
    setCreating(true);
    setError("");
    try {
      await onNewGame();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.newGameFailed);
    } finally {
      setCreating(false);
    }
  }
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
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!creating) setOpen(value);
      }}
    >
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
          {error && (
            <p role="alert" className="text-sm text-red-200">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {onNewGame && (
              <button
                type="button"
                disabled={creating}
                onClick={() => void createGame()}
                className="durak-results-close"
              >
                {creating ? text.creatingGame : text.newGame}
              </button>
            )}
            <Dialog.Close disabled={creating} className="durak-results-close">
              {text.closeResults}
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
