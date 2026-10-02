import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { CopyButton, copyText } from "@/components/joker/CopyButton";
import { JButton, jButton } from "@/components/joker/JButton";
import { LobbySeat } from "@/components/joker/LobbySeat";
import { RoomCodeCard } from "@/components/joker/RoomCodeCard";
import { ScreenShell, SectionLabel } from "@/components/joker/ScreenShell";
import { DEMO_HOST } from "@/demo/mockIdentity";
import { mockRoomService } from "@/demo/mockRooms";
import { demoStore, useDemoState } from "@/demo/store";
import { RULESETS } from "@/domain/rulesets";
import { t } from "@/i18n/el";
import { roomInviteUrl } from "@/services/rooms";

export const Route = createFileRoute("/lobby")({
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
  const { hydrated, room, localPlayer } = useDemoState();
  const navigate = useNavigate();
  if (!hydrated) return <div className="surface-room min-h-dvh" />;
  if (!room || !localPlayer) {
    return (
      <ScreenShell title={t.lobby}>
        <p className="text-muted-foreground">{t.noRoom}</p>
        <Link to="/" className={jButton({ className: "mt-4" })}>{t.home}</Link>
      </ScreenShell>
    );
  }
  const isHost = room.hostId === localPlayer.id;
  const hasEmpty = room.seats.some((s) => s.occupant.type === "empty");

  const start = async () => {
    await mockRoomService.startGame(room.code, localPlayer.id);
    navigate({ to: "/table" });
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
          <JButton size="lg" className="w-full text-lg" disabled={!isHost} onClick={start}>
            {t.startGame}
          </JButton>
          <p className="text-center text-xs text-muted-foreground">
            {isHost ? hasEmpty && t.emptySeatsBecomeBots : t.hostOnly}
          </p>
          {!isHost && (
            <button className="w-full text-center text-xs text-primary underline" onClick={() => demoStore.set({ localPlayer: DEMO_HOST })}>
              {t.demoMode}: συνέχεια ως host
            </button>
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
