import { Link } from "@tanstack/react-router";
import { ArrowLeft, Maximize, Minimize, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assets } from "@/assets/registry";

import type { GameplayCommand } from "@/domain/gameplayCommands";
import { SEAT_COUNT } from "@/domain/gameConfig";
import type { Room } from "@/domain/players";
import type { LocalLegalAction, PlayerGameProjection } from "@/domain/projection";
import type { ScoreSheet } from "@/domain/scoreSheet";
import { JButton } from "../joker/JButton";
import { DealerSelectionPresentation } from "./DealerSelectionPresentation";
import { DealPresentation, type DealPresentationStage } from "./DealPresentation";
import { DeclarationPicker } from "./DeclarationPicker";
import { TrumpChoicePicker } from "./TrumpChoicePicker";
import { JokerChoicePicker } from "./JokerChoicePicker";
import { LocalHandRow } from "./LocalHandRow";
import { projectionContainsPendingCard, type LocalPlayPresentation } from "./localPlayPresentation";
import { dealerSelectionNeedsPresentation } from "./dealerSelectionPresentationModel";
import { SoundToggle } from "./SoundToggle";
import { Scoreboard } from "./Scoreboard";
import { TableSeat } from "./TableSeat";
import { TableSurface } from "./TableSurface";
import { TableUtilityMenu } from "./TableUtilityMenu";
import { TrickPresentation } from "./TrickPresentation";
import { TrumpIndicator, trumpAnnouncementLabel } from "./TrumpIndicator";
import { useTableGeometry, type CardReleaseRect } from "./useTableGeometry";
import { useCriticalCardArtwork } from "./useCriticalCardArtwork";

type Pos = 0 | 1 | 2 | 3;
type OrientationLock = ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> };
const HAND_REVEAL_MS = 660;
const PRESENTATION_ACK_DELAY_MS = 40;
const TRUMP_ANNOUNCEMENT_MS = 3_000;


function authoritativeScoreSheet(projection: PlayerGameProjection): ScoreSheet {
  return {
    deals: projection.score.completedDeals.map((deal) => ({ dealNumber: deal.dealNumber, scores: [...deal.dealScores] })),
    special: projection.score.roundPremia.map((record) => ({ phase: record.round, kind: "premia" as const, label: "Πρέμια", values: [...record.adjustments] })),
  };
}
function legalAction<T extends LocalLegalAction["type"]>(projection: PlayerGameProjection, type: T): Extract<LocalLegalAction, { type: T }> | undefined {
  return projection.local.legalActions.find((action) => action.type === type) as Extract<LocalLegalAction, { type: T }> | undefined;
}
function publicCardCount(projection: PlayerGameProjection, seat: number): number {
  const completed = projection.cards.completedTricks.reduce((count, trick) => count + trick.cards.filter((play) => play.seatIndex === seat).length, 0);
  const current = projection.cards.currentTrick.filter((play) => play.seatIndex === seat).length;
  return Math.max(0, projection.progression.cardsPerPlayer - completed - current);
}
function phaseMessage(projection: PlayerGameProjection): string {
  if (projection.lifecycle === "complete") return projection.termination?.kind === "host_ended" ? "Η παρτίδα τερματίστηκε" : "Η παρτίδα ολοκληρώθηκε";
  switch (projection.progression.phase) {
    case "INITIAL_DEALER_SELECTION": return "Επιλογή πρώτου dealer";
    case "NINE_CARD_INITIAL_DEAL_ALL_SEATS": return "Πρώτα 3 φύλλα";
    case "NINE_CARD_TRUMP_CHOICE": return "Επιλογή ατού για το 9φυλλο";
    case "NINE_CARD_REMAINING_DEAL": return "Συνέχεια μοιράσματος";
    case "DECLARATION": return "Δηλώσεις";
    case "CARD_PLAY": return "Παίξιμο φύλλου";
    case "JOKER_DECISION": return "Επιλογή Joker";
    case "DEAL_RESULT": return "Υπολογισμός μοιρασιάς";
    case "PHASE_RESULT": return "Υπολογισμός πρέμιας";
    default: return "Η παρτίδα εξελίσσεται";
  }
}

export function GameTable({ room, projection, busy, error, onCommand, onReclaim, onEndGame, onNineCardPresentationComplete, onTurnPresentationComplete }: {
  room: Room;
  projection: PlayerGameProjection;
  busy: boolean;
  error: string | null;
  onCommand: (command: GameplayCommand) => Promise<PlayerGameProjection | null>;
  onReclaim: () => Promise<void>;
  onEndGame: () => Promise<boolean>;
  onTurnPresentationComplete?: (token: number) => Promise<boolean>;
  onNineCardPresentationComplete: (stage: DealPresentationStage, dealNumber: number) => Promise<PlayerGameProjection | null>;
}) {
  const latestProjection = useRef(projection);
  latestProjection.current = projection;
  const scorePresentationActive = useRef(false);
  const displayedGameId = useRef(projection.gameId);
  const [displayedScore, setDisplayedScore] = useState<Pick<PlayerGameProjection["score"], "tricksTaken" | "cumulativeTotals"> & { declarations: (number | null)[]; dealNumber: number }>(() => ({
    declarations: [...projection.declarations.values],
    dealNumber: projection.progression.dealNumber,
    tricksTaken: [...projection.score.tricksTaken],
    cumulativeTotals: [...projection.score.cumulativeTotals],
  }));
  const refreshDisplayedScore = useCallback(() => {
    const current = latestProjection.current;
    const score = current.score;
    setDisplayedScore(previous =>
      previous.dealNumber === current.progression.dealNumber &&
      previous.declarations.every((value, seat) => value === current.declarations.values[seat]) &&
      previous.tricksTaken.every((value, seat) => value === score.tricksTaken[seat]) &&
      previous.cumulativeTotals.every((value, seat) => value === score.cumulativeTotals[seat])
        ? previous
        : { dealNumber: current.progression.dealNumber, declarations: [...current.declarations.values], tricksTaken: [...score.tricksTaken], cumulativeTotals: [...score.cumulativeTotals] });
  }, []);
  const trackScorePresentation = useCallback((active: boolean) => {
    scorePresentationActive.current = active;
    if (!active) refreshDisplayedScore();
  }, [refreshDisplayedScore]);
  useEffect(() => {
    const newGame = displayedGameId.current !== projection.gameId;
    displayedGameId.current = projection.gameId;
    if (newGame || !scorePresentationActive.current) refreshDisplayedScore();
  }, [projection, refreshDisplayedScore]);
  const trumpCardRef = useRef<HTMLDivElement>(null);
  const [placedTrumpKey, setPlacedTrumpKey] = useState<string | null>(null);
  const tableRootRef = useRef<HTMLDivElement>(null);
  const playSubmissionLock = useRef(false);
  const handRevealTimer = useRef<number | null>(null);
  const trumpAnnouncementTimer = useRef<number | null>(null);
  const revealedHands = useRef(new Set<string>());
  const announcedTrumpKeys = useRef(new Set<string>());
  const tableGeometry = useTableGeometry();
  const localSeat = projection.viewerSeat;
  const [scoreOpen, setScoreOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [submittingCardId, setSubmittingCardId] = useState<string | null>(null);
  const [pendingDeclarationValue, setPendingDeclarationValue] = useState<number | null>(null);
  const [localPlayPresentation, setLocalPlayPresentation] = useState<LocalPlayPresentation | null>(null);
  const [dealerIntroActive, setDealerIntroActive] = useState(() => dealerSelectionNeedsPresentation(projection));
  const [trickPresentationBusy, setTrickPresentationBusy] = useState(false);
  const [dealSettling, setDealSettling] = useState(false);
  const [dealPresentationActive, setDealPresentationActive] = useState(false);
  const [pendingPresentationAck, setPendingPresentationAck] = useState<{ stage: DealPresentationStage; dealNumber: number } | null>(null);
  const [handRevealActive, setHandRevealActive] = useState(false);
  const [trumpAnnouncement, setTrumpAnnouncement] = useState<string | null>(null);
  const ownArtworkSettled = useCriticalCardArtwork(projection.cards.ownHandVisible
    ? [assets.cardBack, ...projection.cards.ownHand.map(card => assets.cardFace(card))]
    : []);
  const authoritativeDealPresentationActive =
    projection.progression.phase === "DEAL_SETUP" ||
    projection.progression.phase === "DEAL_PRESENTATION" ||
    projection.progression.phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS" ||
    projection.progression.phase === "NINE_CARD_REMAINING_DEAL";
  const startupPresentationActive = dealerIntroActive || dealPresentationActive || authoritativeDealPresentationActive;
  const interactionPresentationActive = startupPresentationActive || handRevealActive || trickPresentationBusy || !ownArtworkSettled;
  const completeVisibleTurn = useCallback(async (token: number) => {
    if (startupPresentationActive || handRevealActive || !ownArtworkSettled || portrait || !tableGeometry.geometry || localPlayPresentation) return false;
    return onTurnPresentationComplete ? onTurnPresentationComplete(token) : false;
  }, [startupPresentationActive, handRevealActive, ownArtworkSettled, portrait, tableGeometry.geometry, localPlayPresentation, onTurnPresentationComplete]);
  const clearLocalFlight = useCallback(() => setLocalPlayPresentation(null), []);

  const names = room.seats.map((seat) => seat.occupant.type === "human" ? seat.occupant.player.displayName : seat.occupant.type === "bot" ? seat.occupant.bot.displayName : `Θέση ${seat.index + 1}`);
  const sheet = useMemo(() => authoritativeScoreSheet(projection), [projection]);
  const playAction = legalAction(projection, "play_card");
  const declarationAction = legalAction(projection, "declare");
  const trumpAction = legalAction(projection, "choose_trump");
  const jokerAction = legalAction(projection, "choose_joker_semantic");
  const reclaimAction = legalAction(projection, "reclaim_control");
  const declarationValues = declarationAction ? Array.from({ length: 10 }, (_, value) => value) : [];
  const viewerOccupant = room.seats[localSeat]?.occupant;
  const isHost = viewerOccupant?.type === "human" && viewerOccupant.player.id === room.hostId;
  const handAuthorityKey = [projection.gameId, projection.stateVersion, projection.progression.phase, projection.progression.currentActorSeat ?? "none", playAction?.cardIds.join(",") ?? "none", projection.cards.ownHand.map((card) => card.id).join(",")].join(":");
  const nameAt = (seat: number) => names[seat] ?? `Θέση ${seat + 1}`;
  const seatAt = (pos: Pos) => ((localSeat + pos) % SEAT_COUNT) as Pos;
  const presentedPhaseMessage = dealerIntroActive ? "Επιλογή πρώτου dealer" : dealPresentationActive ? "Μοίρασμα φύλλων" : handRevealActive ? "Άνοιγμα φύλλων" : phaseMessage(projection);

  const beginHandReveal = useCallback(() => {
    if (!ownArtworkSettled || !projection.cards.ownHandVisible || projection.cards.ownHand.length === 0) return;
    if (projection.progression.phase !== "DECLARATION" && projection.progression.phase !== "NINE_CARD_TRUMP_CHOICE" && projection.progression.phase !== "DEAL_PRESENTATION" && projection.progression.phase !== "NINE_CARD_INITIAL_DEAL_ALL_SEATS" && projection.progression.phase !== "NINE_CARD_REMAINING_DEAL") return;
    const key = `${projection.gameId}:${projection.progression.dealNumber}:${projection.cards.ownHand.length}`;
    if (revealedHands.current.has(key)) return;
    revealedHands.current.add(key);
    if (handRevealTimer.current != null) window.clearTimeout(handRevealTimer.current);
    setHandRevealActive(true);
    handRevealTimer.current = window.setTimeout(() => {
      handRevealTimer.current = null;
      setHandRevealActive(false);
    }, HAND_REVEAL_MS);
  }, [ownArtworkSettled, projection.cards.ownHand, projection.cards.ownHandVisible, projection.gameId, projection.progression.dealNumber, projection.progression.phase]);

  useEffect(() => () => {
    if (handRevealTimer.current != null) window.clearTimeout(handRevealTimer.current);
    if (trumpAnnouncementTimer.current != null) window.clearTimeout(trumpAnnouncementTimer.current);
  }, []);
  useEffect(() => {
    const update = () => setPortrait(window.innerHeight > window.innerWidth);
    update(); window.addEventListener("resize", update); window.addEventListener("orientationchange", update);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); };
  }, []);
  useEffect(() => { const change = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", change); return () => document.removeEventListener("fullscreenchange", change); }, []);
  useEffect(() => { if (!declarationAction || projection.declarations.values[localSeat] === pendingDeclarationValue) setPendingDeclarationValue(null); }, [projection.stateVersion, projection.declarations.values, localSeat, pendingDeclarationValue, declarationAction]);
  useEffect(() => { setDealerIntroActive(dealerSelectionNeedsPresentation(projection)); }, [projection.gameId, projection.initialDealerSelection?.status === "resolved" ? projection.initialDealerSelection.resolvedAtStateVersion : null]);
  useEffect(() => {
    if (startupPresentationActive && !dealSettling) return;
    beginHandReveal();
  }, [beginHandReveal, startupPresentationActive, dealSettling, projection.stateVersion]);
  useEffect(() => {
    if (projection.progression.phase !== "NINE_CARD_REMAINING_DEAL" || projection.trump.status !== "resolved") return;
    const label = trumpAnnouncementLabel(projection.trump);
    if (!label) return;
    const key = `${projection.gameId}:${projection.progression.dealNumber}:${projection.trump.suit ?? "none"}`;
    if (announcedTrumpKeys.current.has(key)) return;
    announcedTrumpKeys.current.add(key);
    if (trumpAnnouncementTimer.current != null) window.clearTimeout(trumpAnnouncementTimer.current);
    setTrumpAnnouncement(label);
    trumpAnnouncementTimer.current = window.setTimeout(() => {
      trumpAnnouncementTimer.current = null;
      setTrumpAnnouncement(null);
    }, TRUMP_ANNOUNCEMENT_MS);
  }, [projection.gameId, projection.progression.dealNumber, projection.progression.phase, projection.trump]);

  const [uncertainPlay, setUncertainPlay] = useState<string | null>(null);
  useEffect(() => {
    setLocalPlayPresentation(current => {
      if (!current || current.status !== "submitted" || projection.gameId !== current.gameId || projection.stateVersion <= current.sourceStateVersion) return current;
      const sameDeal = projection.progression.dealNumber === current.dealNumber;
      const confirmed = projectionContainsPendingCard(current, sameDeal ? projection.cards.currentTrick : [], [...(sameDeal ? projection.cards.completedTricks : []), ...(projection.cards.presentationTail ?? []).filter(trick => trick.dealNumber === current.dealNumber)]);
      if (confirmed) return { ...current, status: "accepted", acceptedStateVersion: projection.stateVersion };
      // An ambiguous transport failure is not a rejection. Wait for canonical evidence.
      if (uncertainPlay === current.cardId && sameDeal && projection.cards.ownHand.some(card => card.id === current.cardId)) return { ...current, status: "rejected" };
      return current;
    });
  }, [projection, uncertainPlay]);

  const commitCard = async (cardId: string, releaseRect: CardReleaseRect) => {
    if (!playAction?.cardIds.includes(cardId) || busy || interactionPresentationActive || localPlayPresentation || playSubmissionLock.current) return;
    const card = projection.cards.ownHand.find((candidate) => candidate.id === cardId); if (!card) return;
    playSubmissionLock.current = true; setSubmittingCardId(cardId);
    const geometryEpoch = tableGeometry.geometry?.epoch ?? 0;
    const presentation: LocalPlayPresentation | null = tableGeometry.geometry ? { gameId: projection.gameId, dealNumber: projection.progression.dealNumber, card, cardId, actorSeat: localSeat, sourceStateVersion: projection.stateVersion, acceptedStateVersion: null, geometryEpoch, releaseRect, status: "submitted" } : null;
    setUncertainPlay(null);
    setLocalPlayPresentation(presentation);
    try {
      const response = await onCommand({ type: "play_card", cardId });
      const polled = latestProjection.current;
      const authoritative = response && response.stateVersion >= polled.stateVersion ? response : polled;
      if (!authoritative || !presentation || authoritative.gameId !== presentation.gameId || authoritative.progression.dealNumber < presentation.dealNumber || authoritative.stateVersion <= presentation.sourceStateVersion || !projectionContainsPendingCard(presentation, authoritative.progression.dealNumber === presentation.dealNumber ? authoritative.cards.currentTrick : [], [...(authoritative.progression.dealNumber === presentation.dealNumber ? authoritative.cards.completedTricks : []), ...(authoritative.cards.presentationTail ?? []).filter(trick => trick.dealNumber === presentation.dealNumber)])) {
        setLocalPlayPresentation((current) => current && current.cardId === cardId && current.status === "submitted" ? { ...current, status: "rejected" } : current); return;
      }
      setLocalPlayPresentation((current) => current && current.cardId === cardId && current.sourceStateVersion === presentation.sourceStateVersion ? { ...current, status: "accepted", acceptedStateVersion: authoritative.stateVersion } : current);
    } catch {
      setUncertainPlay(cardId);
    } finally { playSubmissionLock.current = false; setSubmittingCardId(null); }
  };
  const [pendingJokerChoice, setPendingJokerChoice] = useState<{ cardId: string; semantic: Extract<GameplayCommand, { type: "choose_joker_semantic" }>["semantic"] } | null>(null);
  const jokerChoiceLock = useRef(false);
  const submitJokerChoice = async (semantic: Extract<GameplayCommand, { type: "choose_joker_semantic" }>["semantic"]) => {
    if (busy || jokerChoiceLock.current || !jokerAction) return;
    const play = projection.cards.currentTrick.find(play => play.seatIndex === localSeat && play.card.kind === "joker");
    if (!play) return;
    jokerChoiceLock.current = true;
    setPendingJokerChoice({ cardId: play.card.id, semantic });
    try { await onCommand({ type: "choose_joker_semantic", semantic }); }
    catch { /* Reopen the choices after a failed request. */ }
    finally { jokerChoiceLock.current = false; setPendingJokerChoice(null); }
  };
  const submitDeclaration = async (value: number) => {
    if (!declarationAction?.values.includes(value) || pendingDeclarationValue != null || busy) return;
    setPendingDeclarationValue(value);
    try {
      const result = await onCommand({ type: "declare", value });
      if (!result) setPendingDeclarationValue(null);
    } catch {
      setPendingDeclarationValue(null);
    }
  };
  const handleDealPresentationComplete = useCallback((stage: DealPresentationStage) => {
    if (stage === "full" && projection.progression.phase !== "DEAL_PRESENTATION") return;
    setPendingPresentationAck({ stage, dealNumber: projection.progression.dealNumber });
  }, [projection.progression.dealNumber, projection.progression.phase]);
  useEffect(() => {
    if (!pendingPresentationAck || !ownArtworkSettled || handRevealActive || dealPresentationActive) return;
    let timer: number | undefined;
    const schedule = () => {
      if (timer != null) window.clearTimeout(timer);
      if (document.visibilityState === "hidden" || window.innerHeight > window.innerWidth) return;
      timer = window.setTimeout(() => {
        void onNineCardPresentationComplete(pendingPresentationAck.stage, pendingPresentationAck.dealNumber);
        setPendingPresentationAck(null);
      }, PRESENTATION_ACK_DELAY_MS);
    };
    schedule(); document.addEventListener("visibilitychange", schedule); window.addEventListener("focus", schedule); window.addEventListener("orientationchange", schedule);
    return () => { if (timer != null) window.clearTimeout(timer); document.removeEventListener("visibilitychange", schedule); window.removeEventListener("focus", schedule); window.removeEventListener("orientationchange", schedule); };
  }, [pendingPresentationAck, onNineCardPresentationComplete, ownArtworkSettled, handRevealActive, dealPresentationActive]);
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) { const root = document.getElementById("table-fullscreen-root") ?? tableRootRef.current; await root?.requestFullscreen(); const orientation = screen.orientation as OrientationLock; await orientation.lock?.("landscape").catch(() => undefined); }
      else await document.exitFullscreen();
    } catch { /* support differs by browser */ }
  };

  const countdownPhase = projection.progression.phase === "CARD_PLAY" || projection.progression.phase === "JOKER_DECISION";
  const seatBlock = (pos: Pos, orientation: "horizontal" | "vertical") => {
    const seat = seatAt(pos); const roomSeat = room.seats[seat]; if (!roomSeat) return null;
    const publicDeadline = projection.timing?.currentHumanDeadline ?? projection.local.humanDeadline;
    const isActor = !interactionPresentationActive && projection.progression.currentActorSeat === seat;
    return <TableSeat seat={roomSeat} orientation={orientation} infoLayout={pos === 2 ? "left" : "below"} showCards={false} local={pos === 0} stats={{ totalScore: displayedScore.cumulativeTotals[seat], declaration: displayedScore.dealNumber !== projection.progression.dealNumber ? displayedScore.declarations[seat] ?? null : startupPresentationActive ? null : pos === 0 ? pendingDeclarationValue ?? displayedScore.declarations[seat] ?? null : displayedScore.declarations[seat] ?? null, tricksTaken: displayedScore.tricksTaken[seat], isDealer: !dealerIntroActive && projection.progression.dealerSeat === seat, isActive: isActor, cardCount: startupPresentationActive ? 0 : publicCardCount(projection, seat), humanDeadline: isActor && countdownPhase ? publicDeadline : null, isTemporarilyControlled: projection.seats[seat].owner.type === "human" && projection.seats[seat].controller === "temporary_bot" }} />;
  };

  const forcedEnd = projection.termination?.kind === "host_ended";
  const finalRows = projection.lifecycle === "complete" && !forcedEnd ? projection.score.finalPlacements.map((placement, seat) => ({ seat, placement, score: projection.score.cumulativeTotals[seat] ?? 0 })).sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99) || b.score - a.score) : [];
  const handPresented = !startupPresentationActive || (!dealerIntroActive && (dealSettling || (!dealPresentationActive && revealedHands.current.has(`${projection.gameId}:${projection.progression.dealNumber}:${projection.cards.ownHand.length}`))));
  const showTrumpIndicator = (!startupPresentationActive || placedTrumpKey === `${projection.gameId}:${projection.progression.dealNumber}`) && (projection.cards.exposedTrumpCard != null || projection.trump.status === "resolved");

  return <div ref={tableRootRef} className="joker-room relative h-dvh w-full overflow-hidden bg-[#090b09]">
    <TableSurface />
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/15" />
    {portrait && <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/95 px-8 text-center backdrop-blur-sm"><div className="max-w-sm rounded-3xl border border-primary/35 bg-card/95 p-6 shadow-2xl"><div className="mb-3 text-4xl">↻</div><div className="font-display text-xl text-primary">Γύρισε τη συσκευή οριζόντια</div><p className="mt-2 text-sm text-muted-foreground">Το τραπέζι είναι σχεδιασμένο για landscape προβολή.</p><JButton className="mt-5" variant="outlineGold" onClick={toggleFullscreen}><Maximize className="h-4 w-4" /> Πλήρης οθόνη</JButton></div></div>}
    <header className="absolute inset-x-0 top-0 z-50 flex items-center gap-1 px-[max(.35rem,env(safe-area-inset-left))] pt-[max(.25rem,env(safe-area-inset-top))]">
      <Link to="/lobby" search={{ code: room.code }} aria-label="Πίσω" className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white/75 backdrop-blur"><ArrowLeft className="h-4 w-4" /></Link>
      <div className="ml-2 rounded-lg bg-black/60 px-2 py-1 text-xs text-white/75 backdrop-blur">Γύρος {projection.progression.round} · Μοιρασιά {projection.progression.dealNumber}/24 · {presentedPhaseMessage}</div>
      <div className="ml-auto flex items-center gap-1 pr-[max(0rem,env(safe-area-inset-right))]"><SoundToggle /><JButton variant="outlineGold" size="sm" className="h-8 px-2 bg-black/60" onClick={() => setScoreOpen(true)} aria-label="Σκορ"><Trophy className="h-4 w-4" /><span className="hidden lg:inline">Σκορ</span></JButton><TableUtilityMenu isHost={isHost} disabled={busy || projection.lifecycle === "complete"} onEndGame={onEndGame} /><JButton variant="outlineGold" size="sm" className="h-8 px-2 bg-black/60" onClick={toggleFullscreen} aria-label={fullscreen ? "Έξοδος από πλήρη οθόνη" : "Πλήρης οθόνη"}>{fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}</JButton></div>
    </header>
    <main className="absolute inset-x-[5vw] top-[10vh] bottom-[27vh]"><div ref={tableGeometry.feltRef} className="relative h-full w-full"><div ref={tableGeometry.topSeatRef} className="absolute left-1/2 top-[-10%] z-20 -translate-x-1/2">{seatBlock(2, "horizontal")}</div><div ref={tableGeometry.leftSeatRef} className="absolute left-[-2%] top-[50%] z-20 -translate-y-1/2">{seatBlock(1, "vertical")}</div><div ref={tableGeometry.rightSeatRef} className="absolute right-[-2%] top-[50%] z-20 -translate-y-1/2">{seatBlock(3, "vertical")}</div><DealerSelectionPresentation projection={projection} geometry={tableGeometry.geometry} onActiveChange={setDealerIntroActive} />{<TrickPresentation key={projection.gameId} projection={projection} geometry={tableGeometry.geometry} localPlayPresentation={localPlayPresentation} pendingJokerChoice={pendingJokerChoice} onLocalFlightSettled={clearLocalFlight} onBusyChange={setTrickPresentationBusy} onScorePresentationActiveChange={trackScorePresentation} onCollectionComplete={refreshDisplayedScore} onPresentationReady={completeVisibleTurn} />}</div></main>
    {!interactionPresentationActive && trumpAction && <TrumpChoicePicker suits={trumpAction.suits} busy={busy} onSelect={(suit) => void onCommand({ type: "choose_trump", suit })} />}
    {(projection.cards.exposedTrumpCard != null || projection.trump.status === "resolved") && <div style={{ visibility: showTrumpIndicator ? "visible" : "hidden" }} className="pointer-events-none absolute left-[72%] top-[10vh] z-30 -translate-x-1/2 [--card-w:clamp(3.2rem,6.4vw,5rem)]"><div className="mb-1 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Ατού</div><div ref={trumpCardRef} className="w-fit"><TrumpIndicator trump={projection.trump} exposedTrumpCard={projection.cards.exposedTrumpCard} /></div></div>}
    {trumpAnnouncement && <div className="pointer-events-none absolute left-1/2 top-1/2 z-[65] -translate-x-1/2 -translate-y-[4.8rem] rounded-xl border border-primary/55 bg-black/90 px-5 py-2.5 text-center text-base font-semibold text-white shadow-2xl backdrop-blur" role="status" aria-live="polite" data-trump-announcement>{trumpAnnouncement}</div>}
    <DealPresentation projection={projection} trumpTargetRef={trumpCardRef} onTrumpPlaced={setPlacedTrumpKey} geometry={tableGeometry.geometry} paused={dealerIntroActive || trickPresentationBusy} onActiveChange={setDealPresentationActive} onSettlingChange={setDealSettling} onPresentationComplete={handleDealPresentationComplete} />
    <footer className="absolute inset-x-0 bottom-[max(.15rem,env(safe-area-inset-bottom))] z-40 flex flex-col items-center">
      {error && <div className="mb-1 rounded-lg bg-black/80 px-3 py-1 text-xs text-negative">{error}</div>}
      {!interactionPresentationActive && declarationAction && pendingDeclarationValue == null && <div className="relative top-5 animate-in slide-in-from-bottom-2 fade-in duration-200"><DeclarationPicker values={declarationValues} legalValues={declarationAction.values} busy={busy} onSelect={(value) => void submitDeclaration(value)} /></div>}
      {!startupPresentationActive && !handRevealActive && ownArtworkSettled && jokerAction && !pendingJokerChoice && <JokerChoicePicker options={jokerAction.options} busy={busy} trumpSuit={projection.trump.status === "resolved" ? projection.trump.suit : null} onSelect={(semantic) => void submitJokerChoice(semantic)} />}
      {!interactionPresentationActive && reclaimAction && <JButton className="mb-2" variant="outlineGold" size="sm" disabled={busy} onClick={onReclaim}>Πάρε ξανά τον έλεγχο</JButton>}
      <LocalHandRow cards={handPresented ? projection.cards.ownHand : []} visible={handPresented && projection.cards.ownHandVisible && ownArtworkSettled} legalCardIds={startupPresentationActive ? [] : playAction?.cardIds ?? []} blocked={interactionPresentationActive || busy || Boolean(submittingCardId)} pendingCardId={startupPresentationActive ? null : localPlayPresentation?.cardId ?? null} authorityKey={handAuthorityKey} geometry={tableGeometry.geometry} revealing={handRevealActive} onCommit={commitCard} />
      <div ref={tableGeometry.localSeatRef} className="absolute bottom-0 left-[max(.65rem,env(safe-area-inset-left))]">{seatBlock(0, "horizontal")}</div>
    </footer>
    {projection.lifecycle === "complete" && (forcedEnd || !trickPresentationBusy) && <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"><div className="w-full max-w-md rounded-3xl border border-primary/40 bg-card/95 p-6 text-center shadow-2xl"><h2 className="font-display text-2xl text-primary">{forcedEnd ? "Η παρτίδα τερματίστηκε" : "Τελικό αποτέλεσμα"}</h2>{forcedEnd ? <p className="mt-3 text-sm text-white/70">Ο host τερμάτισε την παρτίδα. Όλοι οι παίκτες έχουν αποδεσμευτεί.</p> : <div className="mt-4 space-y-2">{finalRows.map((row) => <div key={row.seat} className="flex items-center justify-between rounded-xl bg-secondary/70 px-4 py-2"><span>{row.placement}η θέση · {nameAt(row.seat)}</span><strong className="tabular-nums">{row.score}</strong></div>)}</div>}<div className="mt-5 flex justify-center gap-2">{!forcedEnd && <JButton variant="outlineGold" onClick={() => setScoreOpen(true)}>Αναλυτικό σκορ</JButton>}<Link to="/" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground">Αρχική</Link></div></div></div>}
    <div className="relative z-[120]"><Scoreboard open={scoreOpen} onClose={() => setScoreOpen(false)} playerNames={names} sheet={sheet} projection={projection} /></div>
  </div>;
}
