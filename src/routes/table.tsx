import { TableReturnSync, hydrateReturnedPresentation } from "@/components/table/tableReturnSync";
import { reclaimWithFreshSnapshot } from "@/components/table/reclaimWithFreshSnapshot";
import { retryCommandDelivery } from "@/components/table/retryCommandDelivery";
import { LandscapeTableGuard } from "@/components/table/LandscapeTableGuard";
import { SnapshotAdmission } from "@/components/table/snapshotAdmission";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jButton } from "@/components/joker/JButton";
import { DialogueOverlay } from "@/components/table/DialogueOverlay";
import { dealPresentationStageKey, dealPresentationWasCompleted } from "@/components/table/dealPresentationModel";
import { dealerSelectionPresentationKey } from "@/components/table/dealerSelectionPresentationModel";
import type { DealPresentationStage } from "@/components/table/DealPresentation";
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
import type { GameReadinessSnapshot } from "@/server/gameReadiness";
import {
  getDialogueMessages,
  requestBotDialogueReply,
  requestDialogueReaction,
  sendHumanMessageToBot,
  type DialogueMessage,
} from "@/services/dialogueFunctions";
import {
  completeProjectedTurnPresentation,
  completeProjectedNineCardPresentation,
  completeProjectedStartPresentation,
  getProjectedGameReadiness,
  getProjectedGameState,
  reclaimProjectedGameControl,
  setProjectedGameReady,
  startProjectedGame,
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
  head: () => ({ meta: [
    { title: "Τραπέζι — JOKER" },
    { name: "description", content: "Το production τραπέζι τεσσάρων παικτών του JOKER." },
  ] }),
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
    case "NOT_HOST": return "Μόνο ο host μπορεί να ξεκινήσει ή να τερματίσει την παρτίδα.";
    case "PLAYERS_NOT_READY": return "Περιμένουμε να είναι έτοιμοι όλοι οι πραγματικοί παίκτες.";
    case "GAME_NOT_ACTIVE": return "Η παρτίδα δεν είναι πλέον σε αυτή την κατάσταση.";
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

type StartupPresentationStage = "idle" | "dealer" | "deal" | "ack";

function storageHas(key: string | null): boolean {
  if (!key || typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function startupPresentationStage(projection: PlayerGameProjection | null): StartupPresentationStage {
  if (!projection || projection.lifecycle !== "starting" || projection.progression.phase !== "DEAL_SETUP") return "idle";
  const selection = projection.initialDealerSelection;
  if (!selection || selection.status !== "resolved") return "idle";

  const dealerKey = dealerSelectionPresentationKey(projection);
  if (!storageHas(dealerKey)) return "dealer";

  const dealKey = dealPresentationStageKey(
    projection.gameId,
    projection.progression.dealNumber,
    projection.progression.dealerSeat,
    "full",
  );
  if (!dealPresentationWasCompleted(dealKey)) return "deal";
  return "ack";
}

function TablePage() {
  const { code, gameId } = Route.useSearch();
  const [room, setRoom] = useState<Room | null>(null);
  const [projection, setProjection] = useState<PlayerGameProjection | null>(null);
  const [readiness, setReadiness] = useState<GameReadinessSnapshot | null>(null);
  const [messages, setMessages] = useState<DialogueMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<TableConnectionStatus>("initial-loading");
  const [tableEpoch, setTableEpoch] = useState(0);
  const [presentationTick, setPresentationTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dialogueBusy, setDialogueBusy] = useState(false);
  const [dialogueFeedback, setDialogueFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [landscape, setLandscape] = useState(false);
  const [visible, setVisible] = useState(() => typeof document !== "undefined" && document.visibilityState === "visible");
  const [geometryReady, setGeometryReady] = useState(false);
  const admission = useMemo(() => new SnapshotAdmission(`${code}:${gameId}`), [code, gameId]);
  const returnSync = useMemo(() => new TableReturnSync(admission.routeKey), [admission]);
  const activeAdmission = useRef(admission);
  activeAdmission.current = admission;
  const mounted = useRef(true);
  const roomRef = useRef<Room | null>(null);
  const projectionRef = useRef<PlayerGameProjection | null>(null);
  const connectionStatusRef = useRef<TableConnectionStatus>("initial-loading");
  const previousProjectionRef = useRef<PlayerGameProjection | null>(null);
  const seenDialogueMessages = useRef(new Set<string>());
  const readySent = useRef<boolean | null>(null);
  const presentationAckInFlight = useRef<string | null>(null);
  const nineCardAckInFlight = useRef<string | null>(null);
  const autoStartInFlight = useRef(false);
  const reclaimInFlight = useRef<number | null>(null);

  const updateConnectionStatus = useCallback((status: TableConnectionStatus) => {
    connectionStatusRef.current = status;
    setConnectionStatus(status);
  }, []);

  const triggerPublicDialogue = useCallback((next: PlayerGameProjection) => {
    const currentRoom = roomRef.current;
    const previous = previousProjectionRef.current;
    previousProjectionRef.current = next;
    if (!currentRoom?.botSettings.botsTalk) return;
    for (const dialogueEvent of derivePublicDialogueEvents(previous, next, currentRoom)) {
      void requestDialogueReaction({ data: { gameId: next.gameId, eventId: dialogueEvent.id } }).catch(() => undefined);
    }
  }, []);

  const acceptSnapshot = useCallback((nextRoom: Room, nextProjection: PlayerGameProjection, freshRead = false): boolean => {
    if (!mounted.current || activeAdmission.current !== admission) return false;
    if (returnSync.pending && !freshRead) return false;
    if (!gameId || !isCoherentTableSnapshot({ room: nextRoom, projection: nextProjection, expectedGameId: gameId })) return false;
    if (!admission.admit(nextProjection.stateVersion)) return true; // Obsolete, coherent response: ignore without disconnecting.
    const restoring = returnSync.pending || connectionStatusRef.current !== "ready";
    if (restoring) { hydrateReturnedPresentation(nextProjection); setBusy(false); }
    returnSync.complete();
    roomRef.current = nextRoom;
    projectionRef.current = nextProjection;
    setRoom(nextRoom);
    setProjection(nextProjection);
    triggerPublicDialogue(nextProjection);
    setError(null);
    updateConnectionStatus("ready");
    if (restoring) setTableEpoch((value) => value + 1);
    return true;
  }, [admission, gameId, returnSync, triggerPublicDialogue, updateConnectionStatus]);

  const markRefreshFailure = useCallback((message: string) => {
    setError(message);
    updateConnectionStatus(roomRef.current && projectionRef.current ? "reconnecting" : "failed");
  }, [updateConnectionStatus]);

  const refreshAll = useCallback(async () => {
    if (!code || !gameId) return markRefreshFailure("Δεν βρέθηκε έγκυρη ενεργή παρτίδα.");
    const generation = returnSync.generation;
    const request = admission.beginRequest();
    try {
      const [roomResult, initialGameResult] = await Promise.all([
        getProductionRoom({ data: { code } }), getProjectedGameState({ data: { gameId } }),
      ]);
      let gameResult = initialGameResult;
      const current = () => mounted.current && activeAdmission.current === admission && returnSync.accepts(generation);
      if (!current()) return;
      // A reconciler CAS collision on a read is synchronization, not a rejected player move.
      if (!gameResult.ok && gameResult.code === "STALE_STATE") {
        gameResult = await getProjectedGameState({ data: { gameId } });
        if (!current()) return;
      }
      if ((!roomResult.ok || !gameResult.ok) && !admission.acceptsFailure(request)) return;
      if (!roomResult.ok) return markRefreshFailure(gameplayFailureMessage(roomResult.code));
      if (!gameResult.ok) {
        if (gameResult.code === "STALE_STATE") { setError(null); updateConnectionStatus("reconnecting"); return; }
        return markRefreshFailure(gameplayFailureMessage(gameResult.code));
      }
      if (!acceptSnapshot(roomResult.room, gameResult.projection, true)) {
        markRefreshFailure("Η κατάσταση του δωματίου και της παρτίδας δεν συμφωνεί ακόμη. Γίνεται επανασύνδεση.");
      }
    } catch {
      if (mounted.current && activeAdmission.current === admission && returnSync.accepts(generation) && admission.acceptsFailure(request)) {
        markRefreshFailure("Δεν ήταν δυνατός ο συγχρονισμός. Γίνεται νέα προσπάθεια.");
      }
    }
  }, [acceptSnapshot, admission, code, gameId, markRefreshFailure, returnSync, updateConnectionStatus]);

  const refreshReadiness = useCallback(async () => {
    if (!gameId) return;
    const result = await getProjectedGameReadiness({ data: { gameId } });
    if (mounted.current && result.ok) setReadiness(result);
  }, [gameId]);

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
      void requestBotDialogueReply({ data: { gameId, sourceMessageId: message.id, responderBotId: responder.id } }).catch(() => undefined);
    }
  }, [gameId]);

  useEffect(() => {
    const update = () => setLandscape(window.innerWidth > window.innerHeight);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  useEffect(() => {
    let wasVisible = document.visibilityState === "visible";
    let lostFocus = false;
    const beginReturn = () => { returnSync.begin(); setBusy(false); setError(null); updateConnectionStatus("reconnecting"); };
    setVisible(wasVisible);
    const refreshForeground = () => {
      void refreshAll();
      void refreshDialogue();
    };
    const visibility = () => {
      const nextVisible = document.visibilityState === "visible";
      const returningFromBackground = !wasVisible && nextVisible;
      wasVisible = nextVisible;
      setVisible(nextVisible);
      if (returningFromBackground) {
        // Remount presentation-only state so a suspended tab adopts the current
        // authoritative snapshot instead of replaying an obsolete visual backlog.
        beginReturn();
        lostFocus = false;
        refreshForeground();
      }
    };
    const focus = () => {
      if (document.visibilityState === "visible") {
        if (lostFocus) beginReturn();
        lostFocus = false; refreshForeground();
      }
    };
    const blur = () => { lostFocus = true; };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
    };
  }, [refreshAll, refreshDialogue, returnSync, updateConnectionStatus]);

  useEffect(() => {
    const waiting = projection?.lifecycle === "starting" && projection.progression.phase === "INITIAL_DEALER_SELECTION";
    if (!waiting || !landscape || connectionStatus !== "ready" || !visible) {
      setGeometryReady(false);
      return;
    }

    let frame = 0;
    let previous: DOMRect | null = null;
    let stableFrames = 0;
    const sample = () => {
      const felt = document.querySelector<HTMLElement>("#table-fullscreen-root .joker-room main > div");
      const rect = felt?.getBoundingClientRect();
      if (!rect || rect.width < 100 || rect.height < 100) {
        stableFrames = 0;
        previous = null;
        frame = window.requestAnimationFrame(sample);
        return;
      }
      if (
        previous &&
        Math.abs(previous.left - rect.left) < 0.5 &&
        Math.abs(previous.top - rect.top) < 0.5 &&
        Math.abs(previous.width - rect.width) < 0.5 &&
        Math.abs(previous.height - rect.height) < 0.5
      ) stableFrames += 1;
      else stableFrames = 0;
      previous = rect;
      if (stableFrames >= 2) {
        setGeometryReady(true);
        return;
      }
      frame = window.requestAnimationFrame(sample);
    };
    setGeometryReady(false);
    frame = window.requestAnimationFrame(sample);
    return () => window.cancelAnimationFrame(frame);
  }, [connectionStatus, landscape, projection?.lifecycle, projection?.progression.phase, tableEpoch, visible]);

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
  }, [refreshAll, refreshDialogue, returnSync, updateConnectionStatus]);

  useEffect(() => {
    if (projection?.lifecycle !== "starting") return;
    void refreshReadiness();
    const timer = window.setInterval(() => void refreshReadiness(), 750);
    return () => window.clearInterval(timer);
  }, [projection?.lifecycle, refreshReadiness]);

  useEffect(() => {
    const waiting = projection?.lifecycle === "starting" && projection.progression.phase === "INITIAL_DEALER_SELECTION";
    if (!gameId || !waiting) {
      readySent.current = null;
      return;
    }
    const shouldBeReady = landscape && visible && geometryReady && connectionStatus === "ready";
    if (readySent.current === shouldBeReady) return;
    const timer = window.setTimeout(() => {
      void setProjectedGameReady({ data: { gameId, ready: shouldBeReady } }).then((result) => {
        if (result.ok && mounted.current) {
          readySent.current = shouldBeReady;
          setReadiness(result);
        }
      });
    }, shouldBeReady ? 150 : 0);
    return () => window.clearTimeout(timer);
  }, [connectionStatus, gameId, geometryReady, landscape, projection?.lifecycle, projection?.progression.phase, visible]);

  useEffect(() => {
    if (projection?.lifecycle !== "starting" || projection.progression.phase !== "DEAL_SETUP") return;
    const complete = () => setPresentationTick(value => value + 1);
    window.addEventListener("joker:presentation-completed", complete);
    return () => window.removeEventListener("joker:presentation-completed", complete);
  }, [projection?.gameId, projection?.lifecycle, projection?.progression.phase]);

  const presentationStage = startupPresentationStage(projection);
  const resolvedSelectionVersion = projection?.initialDealerSelection?.status === "resolved"
    ? projection.initialDealerSelection.resolvedAtStateVersion
    : null;
  void presentationTick;

  useEffect(() => {
    if (!gameId || resolvedSelectionVersion == null || presentationStage !== "ack" || !landscape || !visible) return;
    const key = `${gameId}:${resolvedSelectionVersion}`;
    if (presentationAckInFlight.current === key) return;

    let cancelled = false;
    let retryTimer = 0;
    const sendAck = async () => {
      if (cancelled || presentationAckInFlight.current === key) return;
      presentationAckInFlight.current = key;
      try {
        const result = await completeProjectedStartPresentation({ data: { gameId } });
        if (cancelled || !mounted.current) return;
        if (result.ok) {
          const currentRoom = roomRef.current;
          if (currentRoom) acceptSnapshot(currentRoom, result.projection);
          return;
        }
        setError(gameplayFailureMessage(result.code));
      } catch {
        if (!cancelled && mounted.current) setError("Η ολοκλήρωση του μοιράσματος δεν επιβεβαιώθηκε. Γίνεται νέα προσπάθεια…");
      }
      presentationAckInFlight.current = null;
      if (!cancelled) retryTimer = window.setTimeout(() => void sendAck(), 1000);
    };

    void sendAck();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (presentationAckInFlight.current === key) presentationAckInFlight.current = null;
    };
  }, [acceptSnapshot, gameId, landscape, presentationStage, resolvedSelectionVersion, visible]);

  const completeNineCardStage = useCallback(async (stage: DealPresentationStage, dealNumber: number): Promise<PlayerGameProjection | null> => {
    if (!gameId || connectionStatusRef.current !== "ready") return null;
    const currentProjection = projectionRef.current;
    const currentRoom = roomRef.current;
    if (!currentProjection || !currentRoom) return null;
    const key = `${currentProjection.gameId}:${dealNumber}:${stage}`;
    if (nineCardAckInFlight.current === key) return null;
    nineCardAckInFlight.current = key;
    try {
      const result = await completeProjectedNineCardPresentation({ data: { gameId, dealNumber, stage } });
      if (!mounted.current) return null;
      if (!result.ok) {
        setError(gameplayFailureMessage(result.code));
        return null;
      }
      if (acceptSnapshot(currentRoom, result.projection)) return result.projection;
      return null;
    } catch {
      if (mounted.current) setError("Η φάση του 9φυλλου δεν επιβεβαιώθηκε. Γίνεται νέος συγχρονισμός…");
      return null;
    } finally {
      if (nineCardAckInFlight.current === key) nineCardAckInFlight.current = null;
    }
  }, [acceptSnapshot, gameId]);

  const completeTurn = useCallback(async (token: number) => {
    if (!gameId || connectionStatusRef.current !== "ready" || !roomRef.current) return false;
    const result = await completeProjectedTurnPresentation({ data: { gameId, token } });
    if (!mounted.current || !result.ok) return false;
    acceptSnapshot(roomRef.current, result.projection);
    return true;
  }, [acceptSnapshot, gameId]);

  const submit = async (command: GameplayCommand): Promise<PlayerGameProjection | null> => {
    if (!projection || busy || connectionStatusRef.current !== "ready") return null;
    const generation = returnSync.generation;
    const commandAdmission = activeAdmission.current;
    const stillCurrent = () => mounted.current && activeAdmission.current === commandAdmission && returnSync.accepts(generation);
    setBusy(true); setError(null);
    try {
      const data = { gameId: projection.gameId, actionId: crypto.randomUUID(), expectedStateVersion: projection.stateVersion, command };
      const result = await retryCommandDelivery(submitProjectedGameplayCommand, { data });
      if (!stillCurrent()) return null;
      if (result.ok) {
        const currentRoom = roomRef.current;
        if (currentRoom && acceptSnapshot(currentRoom, result.projection)) return projectionRef.current;
        await refreshAll(); return null;
      }
      if (mounted.current) setError(gameplayFailureMessage(result.code));
      await refreshAll();
      // A retry may be stale because the original play committed before its response was lost.
      return command.type === "play_card" ? projectionRef.current : null;
    } catch (cause) {
      if (!stillCurrent()) return null;
      if (mounted.current) setError("Δεν επιβεβαιώθηκε η κίνηση. Γίνεται επανασύνδεση.");
      try { await refreshAll(); } catch { /* Periodic reconnect will recover canonical ownership. */ }
      throw cause;
    } finally { if (stillCurrent()) setBusy(false); }
  };

  const reclaim = async () => {
    if (!projection || busy || reclaimInFlight.current === returnSync.generation || connectionStatusRef.current !== "ready") return;
    const reclaimAdmission = activeAdmission.current;
    const generation = returnSync.generation;
    reclaimInFlight.current = generation;
    setBusy(true); setError(null);
    const stillCurrent = () => mounted.current && activeAdmission.current === reclaimAdmission && returnSync.accepts(generation);
    try {
      const result = await reclaimWithFreshSnapshot({
        gameId: projection.gameId,
        current: () => stillCurrent() && connectionStatusRef.current === "ready" ? projectionRef.current : null,
        refresh: refreshAll,
        send: reclaimProjectedGameControl,
      });
      if (!stillCurrent() || !result) return;
      if (result.ok) {
        const currentRoom = roomRef.current;
        if (currentRoom && acceptSnapshot(currentRoom, result.projection)) return;
      } else setError(gameplayFailureMessage(result.code));
      await refreshAll();
    } catch {
      if (stillCurrent()) {
        setError("Δεν επιβεβαιώθηκε η ανάκτηση ελέγχου. Γίνεται επανασύνδεση.");
        try { await refreshAll(); } catch { /* Polling will recover the current controller. */ }
      }
    } finally {
      if (reclaimInFlight.current === generation) reclaimInFlight.current = null;
      if (stillCurrent()) setBusy(false);
    }
  };

  const startGame = useCallback(async () => {
    if (!projection || busy || !readiness?.isHost || !readiness.allReady || autoStartInFlight.current) return;
    autoStartInFlight.current = true;
    setBusy(true); setError(null);
    try {
      const result = await startProjectedGame({ data: { gameId: projection.gameId } });
      if (!result.ok) {
        if (mounted.current) setError(gameplayFailureMessage(result.code));
        await refreshReadiness();
        return;
      }
      const currentRoom = roomRef.current;
      if (currentRoom) acceptSnapshot(currentRoom, result.projection);
    } finally {
      autoStartInFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [acceptSnapshot, busy, projection, readiness, refreshReadiness]);

  useEffect(() => {
    const waiting = projection?.lifecycle === "starting" && projection.progression.phase === "INITIAL_DEALER_SELECTION";
    if (!waiting || !landscape || !visible || !geometryReady || connectionStatus !== "ready") return;
    if (!readiness?.isHost || !readiness.allReady) return;
    void startGame();
  }, [connectionStatus, geometryReady, landscape, projection?.lifecycle, projection?.progression.phase, readiness?.allReady, readiness?.isHost, startGame, visible]);

  const endGame = async (): Promise<boolean> => {
    if (!projection || busy || connectionStatusRef.current !== "ready") return false;
    setBusy(true); setError(null);
    try {
      const result = await terminateProjectedGame({ data: { gameId: projection.gameId, actionId: crypto.randomUUID(), expectedStateVersion: projection.stateVersion } });
      if (result.ok) {
        const currentRoom = roomRef.current;
        if (currentRoom && acceptSnapshot(currentRoom, result.projection)) return true;
        await refreshAll(); return true;
      }
      if (mounted.current) setError(gameplayFailureMessage(result.code));
      await refreshAll(); return false;
    } finally { if (mounted.current) setBusy(false); }
  };

  const sendDialogue = async (speakerBotId: string, text: string) => {
    if (!projection || dialogueBusy) return;
    setDialogueBusy(true);
    setDialogueFeedback(null);
    try {
      const result = await sendHumanMessageToBot({
        data: { gameId: projection.gameId, actionId: crypto.randomUUID(), speakerBotId, text },
      });
      if (!mounted.current) return;
      if (!result.ok) {
        const message =
          result.code === "DIALOGUE_RATE_LIMITED" || result.code === "DIALOGUE_COOLDOWN" || result.code === "DIALOGUE_SPEAKER_COOLDOWN"
            ? "Το bot θέλει μια μικρή παύση πριν απαντήσει ξανά."
            : result.code === "HUMAN_MESSAGE_RATE_LIMITED"
              ? "Έστειλες πολλά μηνύματα γρήγορα. Δοκίμασε ξανά σε λίγο."
              : "Το μήνυμα έφτασε, αλλά το bot δεν μπόρεσε να απαντήσει τώρα.";
        setDialogueFeedback(message);
        return;
      }
      if (result.message) {
        setMessages((current) => [
          ...current.filter((message) => message.id !== result.message!.id),
          result.message!,
        ]);
        setDialogueFeedback(result.message.source === "xai" ? "Απάντηση AI." : "Απάντηση εφεδρικής ατάκας.");
      } else if (result.source === "silence") {
        setDialogueFeedback("Το bot δεν απάντησε αυτή τη φορά.");
      }
      await refreshDialogue();
    } catch {
      if (mounted.current) setDialogueFeedback("Η απάντηση του bot δεν ήταν διαθέσιμη.");
    } finally {
      if (mounted.current) setDialogueBusy(false);
    }
  };

  if (returnSync.pending || connectionStatus !== "ready" || projection?.gameId !== gameId) {
    return (
      <div className="surface-wood flex h-dvh items-center justify-center p-6" role="status" aria-live="polite">
        <div className="rounded-2xl border border-primary/30 bg-black/70 px-6 py-5 text-center shadow-2xl backdrop-blur">
          <div className="font-display text-lg text-primary">Προετοιμασία τραπεζιού</div>
          <p className="mt-2 text-sm text-white/70">Συγχρονισμός με την τωρινή κατάσταση της παρτίδας…</p>
          {error && <p className="mt-2 text-sm text-white/70">{error}</p>}
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
  const waitingForPlay = projection.lifecycle === "starting" && projection.progression.phase === "INITIAL_DEALER_SELECTION";
  const humanCount = readiness?.humans.length ?? room.seats.filter((seat) => seat.occupant.type === "human").length;
  const readyCount = readiness ? readiness.humans.filter((human) => human.ready).length : null;
  const tableProjection: PlayerGameProjection = presentationStage === "dealer"
    ? {
        ...projection,
        progression: { ...projection.progression, phase: "INITIAL_DEALER_SELECTION" },
      }
    : projection;

  return (
    <div id="table-fullscreen-root" className="relative h-dvh overflow-hidden bg-[#090b09]">
      <LandscapeTableGuard>
      <GameTable key={`${projection.gameId}:${tableEpoch}`} room={room} projection={tableProjection} busy={busy || uncertain || waitingForPlay} error={error} onCommand={submit} onReclaim={reclaim} onEndGame={endGame} onTurnPresentationComplete={completeTurn} onNineCardPresentationComplete={completeNineCardStage} />
      <TableMessaging key={projection.gameId} room={room} projection={projection} />
      <DialogueOverlay room={room} messages={messages} busy={dialogueBusy} feedback={dialogueFeedback} onSend={sendDialogue} />

      {waitingForPlay && landscape && (
        <div className="absolute inset-0 z-[95] flex items-center justify-center bg-black/15" role="status" aria-live="polite">
          <div className="min-w-52 rounded-2xl border border-primary/40 bg-black/80 px-5 py-4 text-center shadow-2xl backdrop-blur">
            <div className="text-xs uppercase tracking-[.18em] text-white/55">Παίκτες έτοιμοι</div>
            <div className="mt-1 text-lg font-semibold text-white">{readyCount == null ? `—/${humanCount}` : `${readyCount}/${humanCount}`}</div>
            {!geometryReady && <div className="mt-1 text-xs text-white/50">Σταθεροποίηση τραπεζιού…</div>}
            {readiness == null ? (
              <div className="mt-3 text-sm text-white/65">Έλεγχος ετοιμότητας…</div>
            ) : readiness.allReady ? (
              <div className="mt-3 text-sm text-white/75">Όλοι είναι έτοιμοι · ξεκινά η επιλογή dealer…</div>
            ) : (
              <div className="mt-3 text-sm text-white/65">Περιμένουμε να ανοίξει το τραπέζι σε όλους τους πραγματικούς παίκτες.</div>
            )}
          </div>
        </div>
      )}

      {uncertain && (
        <div className="pointer-events-auto absolute inset-0 z-[110] flex items-start justify-center bg-black/15 pt-[max(4rem,env(safe-area-inset-top))]" role="status" aria-live="polite">
          <div className="rounded-xl border border-primary/35 bg-black/85 px-4 py-2 text-sm text-white shadow-xl backdrop-blur">
            {connectionStatus === "reconnecting" ? "Επανασύνδεση…" : "Η σύνδεση διακόπηκε — γίνεται νέα προσπάθεια…"}
          </div>
        </div>
      )}
      </LandscapeTableGuard>
    </div>
  );
}
