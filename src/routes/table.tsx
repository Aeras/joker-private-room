import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { jButton } from "@/components/joker/JButton";
import { GameTable } from "@/components/table/GameTable";
import type { GameplayCommand } from "@/domain/gameplayCommands";
import type { Room } from "@/domain/players";
import type { PlayerGameProjection } from "@/domain/projection";
import {
  getProjectedGameState,
  reclaimProjectedGameControl,
  submitProjectedGameplayCommand,
} from "@/services/gameProjectionFunctions";
import { getProductionRoom } from "@/services/roomFunctions";

export const Route = createFileRoute("/table")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search["code"] === "string" ? search["code"].toUpperCase() : undefined,
    gameId: typeof search["gameId"] === "string" ? search["gameId"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Τραπέζι — JOKER" },
      { name: "description", content: "Το production τραπέζι τεσσάρων παικτών του JOKER." },
      { property: "og:title", content: "Τραπέζι — JOKER" },
      { property: "og:description", content: "Το production τραπέζι τεσσάρων παικτών του JOKER." },
    ],
  }),
  component: TablePage,
});

function gameplayFailureMessage(code: string): string {
  switch (code) {
    case "STALE_STATE":
      return "Η παρτίδα προχώρησε σε νεότερη κατάσταση. Έγινε συγχρονισμός.";
    case "NOT_CURRENT_ACTOR":
      return "Δεν είναι η σειρά σου.";
    case "ILLEGAL_CARD":
      return "Αυτό το φύλλο δεν είναι νόμιμη κίνηση.";
    case "INVALID_DECLARATION":
    case "FORBIDDEN_DEALER_DECLARATION":
      return "Η δήλωση δεν επιτρέπεται.";
    case "CONTROLLER_CHANGED":
      return "Ο έλεγχος της θέσης άλλαξε. Έγινε συγχρονισμός.";
    case "NOT_AUTHENTICATED":
      return "Η συνεδρία σου δεν είναι πλέον ενεργή.";
    default:
      return "Η ενέργεια δεν ολοκληρώθηκε. Έγινε νέος συγχρονισμός.";
  }
}

function TablePage() {
  const { code, gameId } = Route.useSearch();
  const [room, setRoom] = useState<Room | null>(null);
  const [projection, setProjection] = useState<PlayerGameProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refreshProjection = useCallback(async () => {
    if (!gameId) return;
    const result = await getProjectedGameState({ data: { gameId } });
    if (!mounted.current) return;
    if (!result.ok) {
      setError(gameplayFailureMessage(result.code));
      return;
    }
    setProjection(result.projection);
    setError(null);
  }, [gameId]);

  const refreshAll = useCallback(async () => {
    if (!code || !gameId) {
      setLoading(false);
      return;
    }
    const [roomResult, gameResult] = await Promise.all([
      getProductionRoom({ data: { code } }),
      getProjectedGameState({ data: { gameId } }),
    ]);
    if (!mounted.current) return;
    if (roomResult.ok) setRoom(roomResult.room);
    if (gameResult.ok) setProjection(gameResult.projection);
    if (!roomResult.ok || !gameResult.ok) {
      setError(gameplayFailureMessage(!gameResult.ok ? gameResult.code : roomResult.code));
    } else {
      setError(null);
    }
    setLoading(false);
  }, [code, gameId]);

  useEffect(() => {
    mounted.current = true;
    void refreshAll();
    const timer = window.setInterval(() => void refreshProjection(), 1500);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refreshAll, refreshProjection]);

  const submit = async (command: GameplayCommand) => {
    if (!projection || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitProjectedGameplayCommand({
        data: {
          gameId: projection.gameId,
          actionId: crypto.randomUUID(),
          expectedStateVersion: projection.stateVersion,
          command,
        },
      });
      if (result.ok) {
        if (mounted.current) setProjection(result.projection);
        return;
      }
      if (mounted.current) setError(gameplayFailureMessage(result.code));
      await refreshProjection();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const reclaim = async () => {
    if (!projection || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await reclaimProjectedGameControl({
        data: {
          gameId: projection.gameId,
          actionId: crypto.randomUUID(),
          expectedStateVersion: projection.stateVersion,
        },
      });
      if (result.ok) {
        if (mounted.current) setProjection(result.projection);
        return;
      }
      if (mounted.current) setError(gameplayFailureMessage(result.code));
      await refreshProjection();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  if (loading) return <div className="surface-wood h-dvh" />;
  if (!code || !gameId || !room || !projection) {
    return (
      <div className="surface-room flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">{error ?? "Δεν βρέθηκε ενεργή παρτίδα."}</p>
        <Link to="/" className={jButton()}>Αρχική</Link>
      </div>
    );
  }

  return (
    <GameTable
      room={room}
      projection={projection}
      busy={busy}
      error={error}
      onCommand={submit}
      onReclaim={reclaim}
    />
  );
}
