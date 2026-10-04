import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CopyButton, copyText } from "@/components/joker/CopyButton";
import { JButton, jButton } from "@/components/joker/JButton";
import { LobbySeat } from "@/components/joker/LobbySeat";
import { RoomCodeCard } from "@/components/joker/RoomCodeCard";
import { ScreenShell, SectionLabel } from "@/components/joker/ScreenShell";
import type { PublicPlayer, Room } from "@/domain/players";
import { RULESETS } from "@/domain/rulesets";
import { t } from "@/i18n/el";
import { roomFailureMessage } from "@/lib/room-feedback";
import { getCurrentPlayer } from "@/services/authFunctions";
import { getProductionRoom, startProductionRoom } from "@/services/roomFunctions";
import { roomInviteUrl } from "@/services/rooms";

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
      setError(roomFailureMessage(result));
      setLoading(false);
      return;
    }
    setRoom(result.room);
    setError(null);
    setLoading(false);
  }, [code]);

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
      <ScreenShell title={t.lobby}>
        <p className="text-muted-foreground">{error ?? t.noRoom}</p>
        <Link to="/" className={jButton({ className: "mt-4" })}>{t.home}</Link>
      </ScreenShell>
    );
  }

  const isHost = room.hostId === localPlayer.id;
  const hasEmpty = room.seats.some((s) => s.occupant.type === "empty");

  const start = async () => {
    if (!isHost || starting || room.status !== "lobby") return;
    setStarting(true);
    setError(null);
    startActionId.current ??= crypto.randomUUID();
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
      startActionId.current = null;
      setRoom(result.room);
      if (result.room.gameId) {
        void navigate({ to: "/table", search: { code: result.room.code, gameId: result.room.gameId } });
      }
    } finally {
      setStarting(false);
    }
  };

  const invite = async () => {
    const url = roomInviteUrl(room.code);
    if (navigator.share) {
      try {
        await navigator.share({ title: "JOKER", text: `${t.roomCode}: ${room.code}`, url });
        return;
      } catch {
        /* fall through */
      }
    }
    await copyText(url);
  };

  return (
    <ScreenShell
      title={t.lobby}
      footer={
        <div className="space-y-2">
          {error && <p className="text-center text-sm text-negative">{error}</p>}
          {room.status === "lobby" ? (
            <>
              <JButton size="lg" className="w-full text-lg" disabled={!isHost || starting} onClick={start}>
                {t.startGame}
              </JButton>
              <p className="text-center text-xs text-muted-foreground">
                {isHost ? hasEmpty && t.emptySeatsBecomeBots : t.hostOnly}
              </p>
            </>
          ) : room.gameId ? (
            <Link
              to="/table"
              search={{ code: room.code, gameId: room.gameId }}
              className={jButton({ size: "lg", className: "w-full text-lg" })}
            >
              Μετάβαση στο τραπέζι
            </Link>
          ) : (
            <div className="panel p-4 text-center text-sm text-muted-foreground">{t.gameStarting}</div>
          )}
        </div>
      }
    >
      <RoomCodeCard code={room.code} />
      <p className="mt-3 text-center text-sm text-muted-foreground">{RULESETS[room.rulesetId].name}</p>

      <div className="mt-6">
        <SectionLabel>Παίκτες</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {room.seats.map((s) => (
            <LobbySeat key={s.index} seat={s} hostId={room.hostId} />
          ))}
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <JButton variant="outlineGold" className="flex-1" onClick={invite}>
          <Share2 className="h-4 w-4" />
          {t.inviteFriends}
        </JButton>
        <CopyButton text={roomInviteUrl(room.code)} label={t.copyLink} kind="link" />
      </div>
    </ScreenShell>
  );
}
