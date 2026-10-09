import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bot, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { JButton, jButton } from "@/components/joker/JButton";
import { LobbySeat } from "@/components/joker/LobbySeat";
import { ScreenShell, SectionLabel } from "@/components/joker/ScreenShell";
import type { PublicBotDefinition, PublicPlayer, Room } from "@/domain/players";
import { publicRulesetName } from "@/domain/rulesetPresentation";
import { t } from "@/i18n/el";
import { enterGameDisplayMode, rollbackGameDisplayMode } from "@/lib/gameDisplayMode";
import { roomFailureMessage } from "@/lib/room-feedback";
import { getCurrentPlayer } from "@/services/authFunctions";
import {
  assignProductionBot,
  clearProductionBot,
  getProductionRoom,
  replaceProductionBot,
  startProductionRoom,
  leaveWaitingRoom,
} from "@/services/roomFunctions";

export const Route = createFileRoute("/lobby")({
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s["code"] === "string" ? s["code"].toUpperCase() : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Lobby — JOKER" },
      { name: "description", content: "Περίμενε τους φίλους σου στο ιδιωτικό δωμάτιο." },
      { property: "og:title", content: "Lobby — JOKER" },
      { property: "og:description", content: "Περίμενε τους φίλους σου στο ιδιωτικό δωμάτιο." },
    ],
  }),
  component: Lobby,
});

function Lobby() {
  const { code } = Route.useSearch();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [localPlayer, setLocalPlayer] = useState<PublicPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [botSeatIndex, setBotSeatIndex] = useState<number | null>(null);
  const startActionId = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!code || code.length !== 4) {
      setLoading(false);
      return;
    }
    const [player, result] = await Promise.all([
      getCurrentPlayer(),
      getProductionRoom({ data: { code } }),
    ]);
    setLocalPlayer(player);
    if (!result.ok) {
      if (result.code === "ROOM_NOT_FOUND") { void navigate({ to: "/join", search: { code: undefined } }); return; }
      setError(roomFailureMessage(result));
      setLoading(false);
      return;
    }
    setRoom(result.room);
    setError(null);
    setLoading(false);
  }, [code, navigate]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (room?.status !== "playing" || !room.gameId) return;
    void navigate({ to: "/table", search: { code: room.code, gameId: room.gameId } });
  }, [navigate, room]);

  if (loading) return <div className="surface-room min-h-dvh" />;
  if (!code || !room || !localPlayer) {
    return (
      <ScreenShell title={t.lobby} variant="pregame" contentClassName="pregame-centered-content">
        <div className="panel p-4">
          <p className="text-muted-foreground">{error ?? t.noRoom}</p>
          <Link to="/" className={jButton({ className: "pregame-primary-button mt-4" })}>{t.home}</Link>
        </div>
      </ScreenShell>
    );
  }

  const isHost = room.hostId === localPlayer.id;
  const selectedSeat = botSeatIndex == null ? null : room.seats.find((seat) => seat.index === botSeatIndex) ?? null;
  const availableBots = room.botCatalog?.bots ?? [];

  const applyBot = async (bot: PublicBotDefinition) => {
    if (!isHost || botSeatIndex == null || botBusy || room.status !== "lobby") return;
    const seat = room.seats.find((candidate) => candidate.index === botSeatIndex);
    if (!seat || seat.occupant.type === "human") return;
    setBotBusy(true);
    setError(null);
    try {
      const payload = {
        actionId: crypto.randomUUID(),
        code: room.code,
        seatIndex: botSeatIndex,
        botId: bot.id,
        expectedRoomVersion: room.version ?? 0,
      };
      const result = seat.occupant.type === "bot"
        ? await replaceProductionBot({ data: payload })
        : await assignProductionBot({ data: payload });
      if (!result.ok) {
        setError(roomFailureMessage(result));
        return;
      }
      setRoom(result.room);
      setBotSeatIndex(null);
    } finally {
      setBotBusy(false);
    }
  };

  const removeBot = async () => {
    if (!isHost || botSeatIndex == null || botBusy || room.status !== "lobby") return;
    const seat = room.seats.find((candidate) => candidate.index === botSeatIndex);
    if (!seat || seat.occupant.type !== "bot") return;
    setBotBusy(true);
    setError(null);
    try {
      const result = await clearProductionBot({
        data: {
          actionId: crypto.randomUUID(),
          code: room.code,
          seatIndex: botSeatIndex,
          expectedRoomVersion: room.version ?? 0,
        },
      });
      if (!result.ok) {
        setError(roomFailureMessage(result));
        return;
      }
      setRoom(result.room);
      setBotSeatIndex(null);
    } finally {
      setBotBusy(false);
    }
  };

  const start = async () => {
    if (!isHost || starting || room.status !== "lobby") return;
    setStarting(true);
    setError(null);
    startActionId.current ??= crypto.randomUUID();
    const displayMode = await enterGameDisplayMode();
    let keepDisplayMode = false;
    try {
      const result = await startProductionRoom({
        data: {
          actionId: startActionId.current,
          code: room.code,
          expectedRoomVersion: room.version ?? 0,
        },
      });
      if (!result.ok) {
        setError(roomFailureMessage(result));
        if (result.code !== "SERVICE_UNAVAILABLE") startActionId.current = null;
        return;
      }
      keepDisplayMode = true;
      startActionId.current = null;
      setRoom(result.room);
      if (result.room.gameId) {
        void navigate({ to: "/table", search: { code: result.room.code, gameId: result.room.gameId } });
      }
    } finally {
      if (!keepDisplayMode) await rollbackGameDisplayMode(displayMode);
      setStarting(false);
    }
  };

  const leave = async () => {
    if (!code || starting || botBusy) return;
    const result = await leaveWaitingRoom({ data: { code } });
    if (!result.ok) { setError("Δεν ήταν δυνατή η έξοδος."); return; }
    void navigate({ to: "/join", search: { code: undefined } });
  };


  return (
    <ScreenShell
      title={t.lobby}
      variant="pregame"
      contentClassName="pregame-lobby-content"
      footer={
        <div className="pregame-lobby-footer">
          {error && <p className="text-sm text-negative">{error}</p>}
          <div className="flex items-center gap-2">
            {room.status === "lobby" && <JButton variant="outlineGold" onClick={() => void leave()}>Έξοδος</JButton>}
            {room.status === "lobby" ? (
              <JButton size="lg" className="pregame-primary-button min-w-64 text-lg" disabled={!isHost || starting || botBusy} onClick={start}>
                {t.startGame}
              </JButton>
            ) : room.gameId ? (
              <Link to="/table" search={{ code: room.code, gameId: room.gameId }} className={jButton({ size: "lg", className: "pregame-primary-button min-w-64 text-lg" })}>
                Μετάβαση στο τραπέζι
              </Link>
            ) : (
              <div className="panel px-4 py-3 text-sm text-muted-foreground">{t.gameStarting}</div>
            )}
          </div>
        </div>
      }
    >
      <div className="pregame-lobby-grid">
        <section className="pregame-room-summary panel">
          <p className="text-center font-semibold">Δωμάτιο αναμονής</p>
          <p className="mt-2 text-center text-sm text-muted-foreground">{room.rulesetName ?? publicRulesetName(room.rulesetId)}</p>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {isHost ? "Πάτησε μια κενή θέση για να επιλέξεις bot." : "Περιμένουμε τον host να ξεκινήσει."}
          </p>
        </section>

        <section>
          <SectionLabel>Παίκτες</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {room.seats.map((seat) => (
              <LobbySeat
                key={seat.index}
                seat={seat}
                hostId={room.hostId}
                manageable={isHost && room.status === "lobby" && seat.occupant.type !== "human"}
                onManage={() => setBotSeatIndex(seat.index)}
              />
            ))}
          </div>
        </section>
      </div>

      {botSeatIndex != null && selectedSeat && (
        <div className="pregame-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setBotSeatIndex(null);
        }}>
          <div className="pregame-bot-modal" role="dialog" aria-modal="true" aria-labelledby="bot-picker-title">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-primary"><Bot className="h-5 w-5" /><span className="text-xs uppercase tracking-[.18em]">Θέση {botSeatIndex + 1}</span></div>
                <h2 id="bot-picker-title" className="mt-1 font-display text-2xl">Επιλογή bot</h2>
              </div>
              <button type="button" onClick={() => setBotSeatIndex(null)} className="rounded-xl border border-border p-2 text-muted-foreground hover:text-foreground" aria-label="Κλείσιμο">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {availableBots.map((bot) => {
                const isCurrent = selectedSeat.occupant.type === "bot" && selectedSeat.occupant.bot.id === bot.id;
                const disabled = botBusy || (!bot.available && !isCurrent);
                return (
                  <button
                    key={bot.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => void applyBot(bot)}
                    className="pregame-bot-option"
                  >
                    <img src={bot.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                    <span className="font-semibold">{bot.displayName}</span>
                    <small>Tier {bot.tier}{isCurrent ? " · τώρα" : ""}</small>
                  </button>
                );
              })}
            </div>

            {selectedSeat.occupant.type === "bot" && (
              <button type="button" disabled={botBusy} onClick={() => void removeBot()} className="mt-4 w-full rounded-xl border border-negative/35 px-4 py-3 text-sm text-negative transition active:scale-[0.99]">
                Αφαίρεση bot
              </button>
            )}
          </div>
        </div>
      )}
    </ScreenShell>
  );
}
