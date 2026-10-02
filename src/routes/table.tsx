import { createFileRoute, Link } from "@tanstack/react-router";
import { jButton } from "@/components/joker/JButton";
import { GameTable } from "@/components/table/GameTable";
import { useDemoState } from "@/demo/store";
import { t } from "@/i18n/el";

export const Route = createFileRoute("/table")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Τραπέζι — JOKER" },
      { name: "description", content: "Το τραπέζι τεσσάρων παικτών του JOKER." },
      { property: "og:title", content: "Τραπέζι — JOKER" },
      { property: "og:description", content: "Το τραπέζι τεσσάρων παικτών του JOKER." },
    ],
  }),
  component: TablePage,
});

function TablePage() {
  const { hydrated, room, localPlayer } = useDemoState();
  if (!hydrated) return <div className="surface-wood h-dvh" />;
  if (!room || !localPlayer || room.status !== "playing") {
    return (
      <div className="surface-room flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">{t.noRoom}</p>
        <Link to="/" className={jButton()}>{t.home}</Link>
      </div>
    );
  }
  return <GameTable room={room} localPlayerId={localPlayer.id} />;
}
