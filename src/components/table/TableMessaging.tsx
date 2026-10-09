import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import type { Room } from "@/domain/players";
import type { PlayerGameProjection } from "@/domain/projection";
import { getTableMessages, sendTableMessage } from "@/services/tableMessageFunctions";
import { mergeLiveTableMessages, type LiveTableMessage } from "@/lib/liveTableMessages";
import { t } from "@/i18n/el";
import { JButton } from "../joker/JButton";
import { ChatPanel } from "./ChatPanel";

export function TableMessaging({
  room,
  projection,
  onMessagesChange,
}: {
  room: Room;
  projection: PlayerGameProjection;
  onMessagesChange?: (messages: LiveTableMessage[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<LiveTableMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const generation = useRef(0);
  const names = room.seats.map((s) =>
    s.occupant.type === "human"
      ? s.occupant.player.displayName
      : s.occupant.type === "bot"
        ? s.occupant.bot.displayName
        : `${s.index + 1}`,
  );

  useEffect(() => { onMessagesChange?.(messages); }, [messages, onMessagesChange]);

  useEffect(() => {
    ++generation.current;
    const invalidate = () => { generation.current++; };
    let cancelled = false;
    let pending = false;
    setOpen(false);
    setMessages([]);
    setError(null);
    setDraftEpoch((v) => v + 1);
    const clear = () => {
      setMessages([]);
      setOpen(false);
      setDraftEpoch((v) => v + 1);
      generation.current++;
    };
    const poll = async () => {
      if (cancelled || pending || document.hidden || projection.lifecycle === "complete") return;
      pending = true;
      const started = Date.now();
      const currentGeneration = generation.current;
      try {
        const result = await getTableMessages({ data: { gameId: projection.gameId } });
        if (!cancelled && currentGeneration === generation.current && result.ok) {
          setMessages((previous) => !previous.length && !result.messages.length ? previous : mergeLiveTableMessages(previous, result.messages, result.serverNow, started, Date.now()));
        }
      } finally {
        pending = false;
      }
    };
    const polling = setInterval(() => { void poll().catch(() => undefined); }, 1000);
    const visibility = () => {
      clear();
      if (!document.hidden) void poll().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", clear);
    void poll().catch(() => undefined);
    return () => {
      cancelled = true;
      invalidate();
      clearInterval(polling);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", clear);
    };
  }, [projection.gameId, projection.lifecycle]);

  useEffect(() => {
    if (!messages.length) return;
    const nextExpiry = Math.min(...messages.map(message => message.localExpiresAt));
    const timer = window.setTimeout(() => setMessages(current => { const live = current.filter(message => message.localExpiresAt > Date.now()); return live.length === current.length ? current : live; }), Math.max(0, nextExpiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [messages]);

  if (projection.lifecycle === "complete") return null;
  const recipients = [
    { value: "all" as const, label: t.messageEveryone },
    ...room.seats
      .filter((s) => s.index !== projection.viewerSeat && s.occupant.type !== "empty")
      .map((s) => ({ value: s.index, label: names[s.index]! })),
  ];

  return (
    <>
      <div className="absolute right-[max(.75rem,env(safe-area-inset-right))] bottom-[max(.75rem,env(safe-area-inset-bottom))] z-[70]">
        <JButton
          variant="outlineGold"
          className="min-h-11 min-w-11 bg-black/70"
          aria-label={t.chat}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          <MessageCircle className="h-4 w-4" />
        </JButton>
      </div>
      <div className="relative z-[130]">
        <ChatPanel
          key={draftEpoch}
          open={open}
          onClose={() => setOpen(false)}
          recipients={recipients}
          busy={sending}
          error={error}
          onSend={async (to, text) => {
            if (sending) return false;
            setSending(true);
            setError(null);
            const started = Date.now();
            const epoch = generation.current;
            try {
              if (navigator.onLine === false) {
                setError(t.messageUnavailable);
                return false;
              }
              const result = await sendTableMessage({
                data: { gameId: projection.gameId, messageId: crypto.randomUUID(), to, text },
              });
              if (epoch !== generation.current) return false;
              if (!result.ok) {
                setError(result.code === "RATE_LIMITED" ? t.messageRateLimited : t.messageUnavailable);
                return false;
              }
              setMessages((previous) => mergeLiveTableMessages(previous, result.messages, result.serverNow, started, Date.now()));
              return true;
            } catch {
              setError(t.messageUnavailable);
              return false;
            } finally {
              setSending(false);
            }
          }}
        />
      </div>
    </>
  );
}
