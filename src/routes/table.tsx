import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { jButton } from "@/components/joker/JButton";
import { DialogueOverlay } from "@/components/table/DialogueOverlay";
import { GameTable } from "@/components/table/GameTable";
import { TableMessaging } from "@/components/table/TableMessaging";
import {
  isCoherentTableSnapshot,
  type TableConnectionStatus,
} from "@/components/table/tableConnectionModel";
import { derivePublicDialogueEvents } from "@/dialogue/publicEvents";
import type { GameplayCommand } from "@/domain/gameplayCommands";
import type { Room } from "@/domain/players";
import type { PlayerGameProjection } from "@/domain/projection";
import {
  getDialogueMessages,
  requestBotDialogueReply,
  requestDialogueReaction,
  sendHumanMessageToBot,
  type DialogueMessage,
} from "@/services/dialogueFunctions";
import {
  getProjectedGameState,
  reclaimProjectedGameControl,
  submitProjectedGameplayCommand,
  terminateProjectedGame,
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
    case "STALE_STATE": return "Η παρτίδα προχώρησε σε νεότερη κατάσταση. Έγινε συγχρονισμός.";
    case "NOT_CURRENT_ACTOR": return "Δεν είναι η σειρά σου.";
    case "ILLEGAL_CARD": return "Αυτό το φύλλο δεν είναι νόμιμη κίνηση.";
    case "INVALID_DECLARATION":
    case "FORBIDDEN_DEALER_DECLARATION": return "Η δήλωση δεν επιτρέπεται.";
    case "CONTROLLER_CHANGED": return "Ο έλεγχος της θέσης άλλαξε. Έγινε συγχρονισμός.";
    case "NOT_HOST": return "Μόνο ο host μπορεί να τερματίσει την παρτίδα.";
    case "GAME_NOT_ACTIVE": return "Η παρτίδα δεν είναι πλέον ενεργή.";
    case "NOT_AUTHENTICATED": return "Η συνεδρία σου δεν είναι πλέον ενεργή.";
    default: return "Η ενέργεια δεν ολοκληρώθηκε. Έγινε νέος συγχρονισμός.";
  }
}

function stableReplyBucket(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function TablePage() {
  const { code, gameId } = Route.useSearch();
  const [room, setRoom] = useState<Room | null>(null);
  const [projection, setProjection] = useState<PlayerGameProjection | null>(null);
  const [messages, setMessages] = useState<DialogueMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<TableConnectionStatus>("initial-loading");
  const [tableEpoch, setTableEpoch] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dialogueBusy, setDialogueBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const roomRef = useRef<Room | null>(null);
  const projectionRef = useRef<PlayerGameProjection | null>(null);
  const connectionStatusRef = useRef<TableConnectionStatus>("initial-loading");
  const previousProjectionRef = useRef<PlayerGameProjection | null>(null);
  const seenDialogueMessages = useRef(new Set<string>());

  const updateConnectionStatus = useCallback((status: TableConnectionStatus) => {
    connectionStatusRef.current = status;
    setConnectionStatus(status);
  }, []);

  const triggerPublicDialogue = useCallback((next: PlayerGameProjection) => {
    const currentRoom = roomRef.current;
    const previous = previousProjectionRef.current;
    previousProjectionRef.current = next;
    if (!currentRoom?.botSettings.botsTalk) return;
    const events = derivePublicDialogueEvents(previous, next, currentRoom);
    for (const dialogueEvent of events) {
      void requestDialogueReaction({ data: { gameId: next.gameId, eventId: dialogueEvent.id } }).catch(() => undefined);
    }
  }, []);

  const acceptSnapshot = useCallback((nextRoom: Room, nextProjection: PlayerGameProjection): boolean => {
    if (!gameId || !isCoherentTableSnapshot({ room: nextRoom, projection: nextProjection, expectedGameId: gameId })) return false;
    const restoring = connectionStatusRef.current !== "ready";
    roomRef.current = nextRoom;
    projectionRef.current = nextProjection;
    setRoom(nextRoom);
    setProjection(nextProjection);
    triggerPublicDialogue(nextProjection);
    setError(null);
    updateConnectionStatus("ready");
    if (restoring) setTableEpoch((value) => value + 1);
    return true;
  }, [gameId, triggerPublicDialogue, updateConnectionStatus]);

  const markRefreshFailure = useCallback((message: string) => {
    setError(message);
    updateConnectionStatus(roomRef.current && projectionRef.current ? "reconnecting" : "failed");
  }, [updateConnectionStatus]);

  const refreshAll = useCallback(async () => {
    if (!code || !gameId) {
      markRefreshFailure("Δεν βρέθηκε έγκυρη ενεργή παρτίδα.");
      return;
    }
    const [roomResult, gameResult] = await Promise.all([
      getProductionRoom({ data: { code } }),
      getProjectedGameState({ data: { gameId } }),
    ]);
    if (!mounted.current) return;
    if (!roomResult.ok) {
      markRefreshFailure(gameplayFailureMessage(roomResult.code));
      return;
    }
    if (!gameResult.ok) {
      markRefreshFailure(gameplayFailureMessage(gameResult.code));
      return;
    }
    if (!acceptSnapshot(roomResult.room, gameResult.projection)) {
      markRefreshFailure("Η κατάσταση του δωματίου και της παρτίδας δεν συμφωνεί ακόμη. Γίνεται επανασύνδεση.");
    }
  }, [acceptSnapshot, code, gameId, markRefreshFailure]);

  const refreshDialogue = useCallback(async () => {
    if (!gameId || !roomRef.current?.botSettings.botsTalk) return;
    const result = await getDialogueMessages({ data: { gameId } });
    if (!mounted.current || !result.ok) return;
    setMessages(result.messages);
    const currentRoom = roomRef.current;
    if (!currentRoom || currentRoom.botSettings.intensity === "conservative") return;
    const bots = currentRoom.seats.flatMap((seat) => seat.occupant.type === "bot" ? [seat.occupant.bot] : []);
    if (bots.length < 2) return;
    for (const message of result.messages) {
      if (seenDialogueMessages.current.has(message.id)) continue;
      seenDialogueMessages.current.add(message.id);
      if (message.replyDepth !== 0) continue;
      const bucket = stableReplyBucket(`${message.id}:${currentRoom.botSettings.intensity}`) % 100;
      const threshold = currentRoom.botSettings.intensity === "chaos" ? 55 : 20;
      if (bucket >= threshold) continue;
      const responder = bots.find((bot) => bot.id !== message.speakerBotId);
      if (!responder) continue;
      void requestBotDialogueReply({
        data: { gameId, sourceMessageId: message.id, responderBotId: responder.id },
      }).catch(() => undefined);
    }
  }, [gameId]);

  useEffect(() => {
    mounted.current = true;
    void refreshAll();
    const gameTimer = window.setInterval(() => void refreshAll(), 1500);
    const dialogueTimer = window.setInterval(() => void refreshDialogue(), 1000);
    return () => {
      mounted.current = false;
      window.clearInterval(gameTimer);
      window.clearInterval(dialogueTimer);
    };
  }, [refreshAll, refreshDialogue]);

  const submit = async (command: GameplayCommand): Promise<PlayerGameProjection | null> => {
    if (!projection || busy || connectionStatusRef.current !== "ready") return null;
    setBusy(true);
    setError(null);
    try {
      const result = await submitProjectedGameplayCommand({
        data: { gameId: projection.gameId, actionId: crypto.randomUUID(), expectedStateVersion: projection.stateVersion, command },
      });
      if (result.ok) {
        const currentRoom = roomRef.current;
        if (currentRoom && acceptSnapshot(currentRoom, result.projection)) return result.projection;
        markRefreshFailure("Η παρτίδα προχώρησε, αλλά απαιτείται ασφαλής επανασύνδεση του τραπεζιού.");
        await refreshAll();
        return null;
      }
      if (mounted.current) setError(gameplayFailureMessage(result.code));
      await refreshAll();
      return null;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const reclaim = async () => {
    if (!projection || busy || connectionStatusRef.current !== "ready") return;
    setBusy(true);
    setError(null);
    try {
      const result = await reclaimProjectedGameControl({
        data: { gameId: projection.gameId, actionId: crypto.randomUUID(), expectedStateVersion: projection.stateVersion },
      });
      if (result.ok) {
        const currentRoom = roomRef.current;
        if (currentRoom && acceptSnapshot(currentRoom, result.projection)) return;
        markRefreshFailure("Ο έλεγχος άλλαξε, αλλά απαιτείται ασφαλής επανασύνδεση του τραπεζιού.");
        await refreshAll();
        return;
      }
      if (mounted.current) setError(gameplayFailureMessage(result.code));
      await refreshAll();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const endGame = async (): Promise<boolean> => {
    if (!projection || busy || connectionStatusRef.current !== "ready") return false;
    setBusy(true);
    setError(null);
    try {
      const result = await terminateProjectedGame({
        data: { gameId: projection.gameId, actionId: crypto.randomUUID(), expectedStateVersion: projection.stateVersion },
      });
      if (result.ok) {
        const currentRoom = roomRef.current;
        if (currentRoom && acceptSnapshot(currentRoom, result.projection)) return true;
        await refreshAll();
        return true;
      }
      if (mounted.current) setError(gameplayFailureMessage(result.code));
      await refreshAll();
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const sendDialogue = async (speakerBotId: string, text: string) => {
    if (!projection || dialogueBusy) return;
    setDialogueBusy(true);
    try {
      await sendHumanMessageToBot({ data: { gameId: projection.gameId, actionId: crypto.randomUUID(), speakerBotId, text } });
      await refreshDialogue();
    } finally {
      if (mounted.current) setDialogueBusy(false);
    }
  };

  if (connectionStatus === "initial-loading" && (!room || !projection)) {
    return (
      <div className="surface-wood flex h-dvh items-center justify-center p-6" role="status" aria-live="polite">
        <div className="rounded-2xl border border-primary/30 bg-black/70 px-6 py-5 text-center shadow-2xl backdrop-blur">
          <div className="font-display text-lg text-primary">Επιστροφή στο παιχνίδι</div>
          <p className="mt-2 text-sm text-white/70">Φορτώνεται το τρέχον τραπέζι…</p>
        </div>
      </div>
    );
  }

  if (!code || !gameId || !room || !projection) {
    return (
      <div className="surface-room flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted-foreground">{error ?? "Δεν βρέθηκε ενεργή παρτίδα."}</p>
        <Link to="/" className={jButton()}>Αρχική</Link>
      </div>
    );
  }

  const uncertain = connectionStatus !== "ready";
  return (
    <div id="table-fullscreen-root" className="relative h-dvh overflow-hidden bg-[#090b09]">
      <GameTable
        key={`${projection.gameId}:${tableEpoch}`}
        room={room}
        projection={projection}
        busy={busy || uncertain}
        error={error}
        onCommand={submit}
        onReclaim={reclaim}
        onEndGame={endGame}
      />
      <TableMessaging key={projection.gameId} room={room} projection={projection} />
      <DialogueOverlay room={room} messages={messages} busy={dialogueBusy} onSend={sendDialogue} />
      {uncertain && (
        <div className="pointer-events-auto absolute inset-0 z-[110] flex items-start justify-center bg-black/15 pt-[max(4rem,env(safe-area-inset-top))]" role="status" aria-live="polite">
          <div className="rounded-xl border border-primary/35 bg-black/85 px-4 py-2 text-sm text-white shadow-xl backdrop-blur">
            {connectionStatus === "reconnecting" ? "Επανασύνδεση…" : "Η σύνδεση διακόπηκε — γίνεται νέα προσπάθεια…"}
          </div>
        </div>
      )}
    </div>
  );
}
