import { useMemo, useState } from "react";
import type { Room } from "@/domain/players";
import type { DialogueMessage } from "@/services/dialogueFunctions";
import { JButton } from "../joker/JButton";

export function DialogueOverlay({
  room,
  messages,
  busy,
  onSend,
}: {
  room: Room;
  messages: DialogueMessage[];
  busy: boolean;
  onSend: (botId: string, text: string) => Promise<void>;
}) {
  const bots = useMemo(
    () => room.seats.flatMap((seat) => seat.occupant.type === "bot" ? [{ id: seat.occupant.bot.id, name: seat.occupant.bot.displayName }] : []),
    [room],
  );
  const [botId, setBotId] = useState(() => bots[0]?.id ?? "");
  const [text, setText] = useState("");

  if (!room.botSettings.botsTalk || bots.length === 0) return null;

  const submit = async () => {
    const trimmed = text.trim();
    if (!botId || !trimmed || busy) return;
    setText("");
    await onSend(botId, trimmed);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[70]">
      <div className="absolute left-1/2 top-12 flex w-[min(92vw,34rem)] -translate-x-1/2 flex-col gap-2">
        {messages.slice(-3).map((message) => {
          const speaker = bots.find((bot) => bot.id === message.speakerBotId)?.name ?? "Bot";
          return (
            <div key={message.id} className="pointer-events-auto rounded-2xl border border-white/15 bg-black/80 px-3 py-2 text-sm text-white shadow-xl backdrop-blur" role="status" aria-live="polite">
              <span className="font-semibold text-primary">{speaker}:</span> {message.text}
            </div>
          );
        })}
      </div>

      <div className="pointer-events-auto absolute bottom-2 left-2 w-[min(92vw,30rem)] rounded-2xl border border-white/15 bg-black/75 p-2 text-white shadow-xl backdrop-blur">
        {room.botSettings.aiEnabled && (
          <p className="mb-2 text-[11px] leading-snug text-white/65">
            AI ατάκες ενεργές. Μήνυμα που στέλνεις σε bot μπορεί να επεξεργαστεί από εξωτερικό πάροχο AI.
          </p>
        )}
        <div className="flex gap-2">
          <select
            value={botId}
            onChange={(event) => setBotId(event.target.value)}
            className="min-w-0 rounded-lg border border-white/15 bg-black/70 px-2 text-xs"
            aria-label="Bot παραλήπτης"
          >
            {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
          </select>
          <input
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 160))}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Πες κάτι στο bot…"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/70 px-2 py-1.5 text-xs outline-none focus:border-primary/60"
            aria-label="Μήνυμα προς bot"
          />
          <JButton size="sm" disabled={busy || !text.trim()} onClick={() => void submit()}>Στείλε</JButton>
        </div>
      </div>
    </div>
  );
}
