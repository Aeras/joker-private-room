import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { jButton } from "@/components/joker/JButton";
import { DialogueOverlay } from "@/components/table/DialogueOverlay";
import { GameTable } from "@/components/table/GameTable";
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dialogueBusy, setDialogueBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const roomRef = useRef<Room | null>(null);
  const previousProjectionRef = useRef<PlayerGameProjection | null>(null);
  const seenDialogueMessages = useRef(new Set<string>());

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

  const refreshProjection = useCallback(async () => {
    if (!gameId) return;
    const result = await getProjectedGameState({ data: { gameId } });
    if (!mounted.current) return;
    if (!result.ok) {
      setError(gameplayFailureMessage(result.code));
      return;
    }
    setProjection(result.projection);
    triggerPublicDialogue(result.projection);
    setError(null);
  }, [gameId, triggerPublicDialogue]);

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
        data: {
          gameId,
          sourceMessageId: message.id,
          responderBotId: responder.id,
        },
      }).catch(() => undefined);
    }
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

    if (roomResult.ok) {
      roomRef.current = roomResult.room;
      setRoom(roomResult.room);
    }
    if (gameResult.ok) {
      setProjection(gameResult.projection);
      triggerPublicDialogue(gameResult.projection);
    }

    if (!gameResult.ok) setError(gameplayFailureMessage(gameResult.code));
    else if (!roomResult.ok) setError(gameplayFailureMessage(roomResult.code));
    else setError(null);
    setLoading(false);
  }, [code, gameId, triggerPublicDialogue]);

  useEffect(() => {
    mounted.current = true;
    void refreshAll();
    const gameTimer = window.setInterval(() => void refreshProjection(), 1500);
    const dialogueTimer = window.setInterval(() => void refreshDialogue(), 1000);
    return () => {
      mounted.current = false;
      window.clearInterval(gameTimer);
      window.clearInterval(dialogueTimer);
    };
  }, [refreshAll, refreshDialogue, refreshProjection]);

  const submit = async (command: GameplayCommand) => {
    if (!projection || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitProjectedGameplayCommand({
        data: { gameId: projection.gameId, actionId: crypto.randomUUID(), expectedStateVersion: projection.stateVersion, command },
      });
      if (result.ok) {
        if (mounted.current) {
          setProjection(result.projection);
          triggerPublicDialogue(result.projection);
        }
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
        data: { gameId: projection.gameId, actionId: crypto.randomUUID(), expectedStateVersion: projection.stateVersion },
      });
      if (result.ok) {
        if (mounted.current) {
          setProjection(result.projection);
          triggerPublicDialogue(result.projection);
        }
        return;
      }
      if (mounted.current) setError(gameplayFailureMessage(result.code));
      await refreshProjection();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const sendDialogue = async (speakerBotId: string, text: string) => {
    if (!projection || dialogueBusy) return;
    setDialogueBusy(true);
    try {
      await sendHumanMessageToBot({
        data: { gameId: projection.gameId, actionId: crypto.randomUUID(), speakerBotId, text },
      });
      await refreshDialogue();
    } finally {
      if (mounted.current) setDialogueBusy(false);
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
    <div className="relative h-dvh overflow-hidden">
      <GameTable room={room} projection={projection} busy={busy} error={error} onCommand={submit} onReclaim={reclaim} />
      <DialogueOverlay room={room} messages={messages} busy={dialogueBusy} onSend={sendDialogue} />
    </div>
  );
}
