import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@/domain/players";
import type { DialogueMessage } from "@/services/dialogueFunctions";
import { t } from "@/i18n/el";
import { JButton } from "../joker/JButton";

export function DialogueOverlay({
  room,
  messages,
  busy,
  feedback,
  onSend,
}: {
  room: Room;
  messages: DialogueMessage[];
  busy: boolean;
  feedback?: string | null;
  onSend: (botId: string, text: string) => Promise<void>;
}) {
  const bots = useMemo(
    () =>
      room.seats.flatMap((seat) =>
        seat.occupant.type === "bot"
          ? [{ id: seat.occupant.bot.id, name: seat.occupant.bot.displayName }]
          : [],
      ),
    [room],
  );
  const [botId, setBotId] = useState(() => bots[0]?.id ?? "");
  const [text, setText] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [sentPreview, setSentPreview] = useState<{ botId: string; text: string } | null>(null);
  const [visibleMessages, setVisibleMessages] = useState<DialogueMessage[]>([]);
  const messageDeadlines = useRef(new Map<string, number>());
  const playedAudioIds = useRef(new Set<string>());
  const audioQueue = useRef<DialogueMessage[]>([]);
  const audioPlaying = useRef(false);

  useEffect(() => {
    if (!sentPreview) return;
    const timer = window.setTimeout(() => setSentPreview(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [sentPreview]);

  useEffect(() => {
    const deadlines = messageDeadlines.current;
    for (const message of messages) {
      // Polling must never restart the four-second display window.
      if (!deadlines.has(message.id)) deadlines.set(message.id, Date.now() + 4_000);
    }
    // Retain recent expired IDs so an unchanged poll cannot replay a bubble.
    while (deadlines.size > 512) deadlines.delete(deadlines.keys().next().value!);
    let timer: number | undefined;
    const refresh = () => {
      const now = Date.now();
      const live = messages.filter(message => (deadlines.get(message.id) ?? 0) > now);
      setVisibleMessages(live);
      if (live.length) {
        const nextExpiry = Math.min(...live.map(message => deadlines.get(message.id)!));
        timer = window.setTimeout(refresh, nextExpiry - now);
      }
    };
    refresh();
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    if (!room.botSettings.ttsEnabled) return;

    for (const message of messages) {
      if (!message.audioContent || playedAudioIds.current.has(message.id)) continue;
      playedAudioIds.current.add(message.id);
      audioQueue.current.push(message);
    }

    const playNext = () => {
      if (audioPlaying.current) return;
      const message = audioQueue.current.shift();
      if (!message?.audioContent) return;
      audioPlaying.current = true;
      const audio = new Audio(`data:${message.audioMimeType ?? "audio/mpeg"};base64,${message.audioContent}`);
      audio.preload = "auto";
      const finish = () => {
        audioPlaying.current = false;
        playNext();
      };
      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
      void audio.play().catch(finish);
    };

    playNext();
  }, [messages, room.botSettings.ttsEnabled]);

  if (!room.botSettings.botsTalk || bots.length === 0) return null;

  const submit = async () => {
    const trimmed = text.trim();
    if (!botId || !trimmed || busy) return;
    setText("");
    setSentPreview({ botId, text: trimmed });
    await onSend(botId, trimmed);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[70]">
      <div className="absolute left-1/2 top-12 flex w-[min(92vw,34rem)] -translate-x-1/2 flex-col gap-2">
        {sentPreview && (
          <div className="rounded-2xl border border-white/10 bg-black/70 px-3 py-2 text-sm text-white/80 shadow-lg backdrop-blur" role="status">
            <span className="font-semibold text-white">Εσύ → {bots.find((bot) => bot.id === sentPreview.botId)?.name ?? "Bot"}:</span>{" "}
            {sentPreview.text}
          </div>
        )}
        {room.botSettings.showDialogueText !== false && visibleMessages.slice(-3).map((message) => {
          const speaker = bots.find((bot) => bot.id === message.speakerBotId)?.name ?? "Bot";
          return (
            <div
              key={message.id}
              className="rounded-2xl border border-white/15 bg-black/80 px-3 py-2 text-sm text-white shadow-xl backdrop-blur"
              role="status"
              aria-live="polite"
            >
              <span className="font-semibold text-primary">{speaker}:</span> {message.text}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-expanded={composerOpen}
        aria-controls="bot-dialogue-composer"
        className="pointer-events-auto absolute right-[max(.5rem,env(safe-area-inset-right))] top-[max(2.7rem,calc(env(safe-area-inset-top)+2.4rem))] rounded-lg border border-white/20 bg-black/80 px-3 py-2 text-xs text-white"
        onClick={() => setComposerOpen((open) => !open)}
      >
        {composerOpen ? t.botComposerClose : t.botComposerOpen}
      </button>
      {composerOpen && (
        <div
          id="bot-dialogue-composer"
          role="region"
          aria-label={t.botComposerOpen}
          className="pointer-events-auto absolute left-1/2 top-1/2 max-h-[65dvh] w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-white/15 bg-black/90 p-3 text-white shadow-xl backdrop-blur"
          onKeyDown={(event) => {
            if (event.key === "Escape") setComposerOpen(false);
          }}
        >
          {room.botSettings.aiEnabled && (
            <p className="mb-2 text-[11px] leading-snug text-white/65">
              AI ατάκες ενεργές. Μήνυμα που στέλνεις σε bot μπορεί να επεξεργαστεί από εξωτερικό
              πάροχο AI.
            </p>
          )}
          {feedback && (
            <p className="mb-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/75" role="status" aria-live="polite">
              {feedback}
            </p>
          )}
          <div className="flex gap-2">
            <select
              value={botId}
              onChange={(event) => setBotId(event.target.value)}
              className="min-w-0 rounded-lg border border-white/15 bg-black/70 px-2 text-xs"
              aria-label="Bot παραλήπτης"
            >
              {bots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name}
                </option>
              ))}
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
            <JButton size="sm" disabled={busy || !text.trim()} onClick={() => void submit()}>
              Στείλε
            </JButton>
          </div>
        </div>
      )}
    </div>
  );
}
