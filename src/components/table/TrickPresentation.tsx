import { useCallback, useEffect, useRef, useState } from "react";
import type { SeatIndex } from "@/domain/dealing";
import type { JokerSemantic, PlayedCard } from "@/domain/engine";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../joker/PlayingCard";
import { LocalFlightCard, MOTION_FALLBACK_SLACK_MS } from "./LocalFlightCard";
import type { LocalPlayPresentation } from "./localPlayPresentation";
import { completedTrickPresentationId, trickPresentationTiming } from "./trickPresentationModel";
import type { Point, TableGeometry, VisualSeat } from "./useTableGeometry";

type Pos = VisualSeat;
type DepartingStage = "holding" | "flipping" | "collecting";
type Departing = { id: string; cards: PlayedCard[]; winnerSeat: SeatIndex; stage: DepartingStage };
type PendingCompletion = { id: string; cards: PlayedCard[]; winnerSeat: SeatIndex };
type JokerAnnouncement = { id: string; text: string };

const FALLBACK_LANDING: Record<Pos, Point> = { 0: { x: 0, y: 38 }, 1: { x: -40, y: 0 }, 2: { x: 0, y: -38 }, 3: { x: 40, y: 0 } };
const ROTATION: Record<Pos, number> = { 0: 2, 1: -7, 2: -2, 3: 7 };
const JOKER_ANNOUNCEMENT_MS = 3_000;
const SUIT_ANNOUNCEMENT = { hearts: "κούπες", diamonds: "καρό", clubs: "σπαθιά", spades: "πίκες" } as const;
function posOf(viewerSeat: SeatIndex, seat: number): Pos { return ((seat - viewerSeat + 4) % 4) as Pos; }
function playKey(play: PlayedCard): string { return `${play.seatIndex}:${play.card.id}`; }
function currentSignature(cards: readonly PlayedCard[]): string { return cards.map(playKey).join("|"); }
function acceptedPlayEventId(projection: PlayerGameProjection, trickOrdinal: number, play: PlayedCard): string { return `${projection.gameId}:${projection.progression.dealNumber}:trick:${trickOrdinal}:${play.seatIndex}:${play.card.id}`; }
function jokerAnnouncementText(semantic: JokerSemantic): string {
  if (semantic.context === "OPEN_TRICK") return semantic.mode === "COMPETE" ? "Τζόκερ από πάνω" : "Τζόκερ από κάτω";
  const suit = SUIT_ANNOUNCEMENT[semantic.requestedSuit];
  return semantic.mode === "HIGHER_SUIT" ? `Θέλω μεγαλύτερο — ${suit}` : `Παίρνουν — ${suit}`;
}
function relativeTransform(point: Point, center: Point, rotation: number, scale = 1, flip = 0): string {
  const x = point.x - center.x; const y = point.y - center.y;
  return `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rotation}deg) rotateY(${flip}deg) scale(${scale})`;
}
function landingPoint(pos: Pos, geometry: TableGeometry | null): Point { return geometry ? geometry.trickSlots[pos] : FALLBACK_LANDING[pos]; }
function geometryCenter(geometry: TableGeometry | null): Point { return geometry?.usableCenter ?? { x: 0, y: 0 }; }
function isPresentationCard(presentation: LocalPlayPresentation | null, play: PlayedCard): boolean { return Boolean(presentation && play.seatIndex === presentation.actorSeat && play.card.id === presentation.cardId); }

function AnimatedTrickCard({ play, viewerSeat, departingStage, winnerSeat, geometry, settled = false, reducedMotion, onMotionComplete }: {
  play: PlayedCard; viewerSeat: SeatIndex; departingStage: DepartingStage | null; winnerSeat: SeatIndex | null; geometry: TableGeometry | null; settled?: boolean; reducedMotion: boolean; onMotionComplete: (play: PlayedCard, stage: DepartingStage | "landing") => void;
}) {
  const pos = posOf(viewerSeat, play.seatIndex);
  const winner = winnerSeat === play.seatIndex;
  const winnerPos = winnerSeat == null ? null : posOf(viewerSeat, winnerSeat);
  const [arrived, setArrived] = useState(settled || Boolean(departingStage) || !geometry);
  const hasGeometry = geometry != null;
  useEffect(() => {
    if (settled || departingStage || !hasGeometry) { setArrived(true); return; }
    setArrived(false); const frame = window.requestAnimationFrame(() => setArrived(true)); return () => window.cancelAnimationFrame(frame);
  }, [departingStage, settled, hasGeometry, play.card.id]);
  const center = geometryCenter(geometry);
  const landing = landingPoint(pos, geometry);
  const origin = geometry?.seatOrigins[pos] ?? landing;
  const collectTarget = winnerPos == null ? landing : geometry?.seatOrigins[winnerPos] ?? landingPoint(winnerPos, geometry);
  const timing = trickPresentationTiming(reducedMotion);
  const duration = departingStage === "flipping" ? timing.flipMs : departingStage === "collecting" ? timing.collectMs : timing.settleMs;
  const completionRef = useRef(onMotionComplete); completionRef.current = onMotionComplete;
  const playRef = useRef(play); playRef.current = play;
  useEffect(() => {
    if (!arrived || departingStage === "holding") return;
    const timer = window.setTimeout(() => completionRef.current(playRef.current, departingStage ?? "landing"), duration + MOTION_FALLBACK_SLACK_MS);
    return () => window.clearTimeout(timer);
  }, [arrived, departingStage, duration, play.card.id]);
  const collecting = departingStage === "collecting";
  const faceDown = departingStage === "flipping" || collecting;
  const transform = collecting
    ? relativeTransform(collectTarget, center, ROTATION[pos], 0.58, 180)
    : departedTransform(arrived, faceDown, landing, origin, center, pos);
  return <div className={cn("absolute left-0 top-0 transition-[transform,opacity] ease-out [transform-style:preserve-3d]", winner && departingStage && "z-30 drop-shadow-[0_0_16px_var(--gold)]", collecting && !winner && "opacity-85")} style={{ transform, transitionDuration: `${duration}ms` }} onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === "transform") completionRef.current(play, departingStage ?? "landing"); }}>
    <div className="relative [transform-style:preserve-3d]">
      <div className="[backface-visibility:hidden]"><PlayingCard card={play.card} /></div>
      <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"><PlayingCard faceDown /></div>
    </div>
  </div>;
}
function departedTransform(arrived: boolean, faceDown: boolean, landing: Point, origin: Point, center: Point, pos: Pos): string {
  if (arrived) return relativeTransform(landing, center, ROTATION[pos], faceDown ? 0.96 : 1, faceDown ? 180 : 0);
  return relativeTransform(origin, center, ROTATION[pos], 0.92, 0);
}

export function TrickPresentation({ projection, geometry, localPlayPresentation, onLocalFlightSettled }: { projection: PlayerGameProjection; geometry: TableGeometry | null; localPlayPresentation: LocalPlayPresentation | null; onLocalFlightSettled: () => void }) {
  const firstRender = useRef(true); const previousCurrent = useRef(""); const previousCompletedCount = useRef(projection.cards.completedTricks.length); const previousDealNumber = useRef(projection.progression.dealNumber); const previousGeometryEpoch = useRef(geometry?.epoch ?? 0);
  const displayedRef = useRef<PlayedCard[]>([]); const queueRef = useRef<PlayedCard[]>([]); const queueTimer = useRef<number | null>(null); const completionTimer = useRef<number | null>(null); const holdTimer = useRef<number | null>(null); const collectTimer = useRef<number | null>(null); const clearTimer = useRef<number | null>(null);
  const pendingCompletion = useRef<PendingCompletion | null>(null); const deferredCurrent = useRef<PlayedCard[]>([]); const localPresentationRef = useRef(localPlayPresentation); const projectionRef = useRef(projection);
  const announcedJokers = useRef(new Set<string>());
  const landedCards = useRef(new Set<string>());
  const stageCards = useRef(new Set<string>());
  const departingRef = useRef<Departing | null>(null);
  const [displayedCards, setDisplayedCards] = useState<PlayedCard[]>([]); const [departing, setDeparting] = useState<Departing | null>(null); const [announcementQueue, setAnnouncementQueue] = useState<JokerAnnouncement[]>([]);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  localPresentationRef.current = localPlayPresentation; projectionRef.current = projection; departingRef.current = departing;

  const clearTimers = useCallback(() => {
    for (const ref of [queueTimer, completionTimer, holdTimer, collectTimer, clearTimer]) { if (ref.current != null) window.clearTimeout(ref.current); ref.current = null; }
  }, []);
  const replaceDisplayed = useCallback((cards: readonly PlayedCard[]) => { displayedRef.current = cards.map((play) => ({ ...play, card: { ...play.card } })); setDisplayedCards(displayedRef.current); }, []);
  const startDeferred = useCallback(() => { const deferred = deferredCurrent.current; deferredCurrent.current = []; if (deferred.length === 0) return; replaceDisplayed([]); queueRef.current = deferred.map((play) => ({ ...play, card: { ...play.card } })); }, [replaceDisplayed]);
  const enqueueJokerAnnouncement = useCallback((play: PlayedCard) => {
    if (play.card.kind !== "joker" || !play.joker) return;
    const id = `${projectionRef.current.gameId}:${projectionRef.current.progression.dealNumber}:${play.seatIndex}:${play.card.id}:${JSON.stringify(play.joker)}`;
    if (announcedJokers.current.has(id)) return;
    announcedJokers.current.add(id);
    setAnnouncementQueue((current) => [...current, { id, text: jokerAnnouncementText(play.joker!) }]);
  }, []);

  useEffect(() => {
    const current = announcementQueue[0];
    if (!current) return;
    const timer = window.setTimeout(() => setAnnouncementQueue((items) => items[0]?.id === current.id ? items.slice(1) : items), JOKER_ANNOUNCEMENT_MS);
    return () => window.clearTimeout(timer);
  }, [announcementQueue]);

  const finishCollection = useCallback(() => {
    departingRef.current = null; setDeparting(null); replaceDisplayed([]); startDeferred();
  }, [replaceDisplayed, startDeferred]);
  const onMotionComplete = useCallback((play: PlayedCard, stage: DepartingStage | "landing") => {
    if (stage === "landing") { if (landedCards.current.has(playKey(play))) return; landedCards.current.add(playKey(play)); setDisplayedCards([...displayedRef.current]); return; }
    const active = departingRef.current;
    if (!active || active.stage !== stage) return;
    stageCards.current.add(playKey(play));
    if (stageCards.current.size < active.cards.length) return;
    stageCards.current.clear();
    if (stage === "flipping") { const next = { ...active, stage: "collecting" as const }; departingRef.current = next; setDeparting(next); }
    if (stage === "collecting") finishCollection();
  }, [finishCollection]);
  const settleLocalFlight = useCallback(() => {
    const local = localPresentationRef.current;
    if (local?.status === "accepted") landedCards.current.add(local.actorSeat + ":" + local.cardId);
    onLocalFlightSettled(); setDisplayedCards([...displayedRef.current]);
  }, [onLocalFlightSettled]);
  const beginCompletion = useCallback((completion: PendingCompletion) => {
    if (departingRef.current || completionTimer.current != null || localPresentationRef.current) return;
    if (!completion.cards.every((play) => landedCards.current.has(playKey(play)))) return;
    pendingCompletion.current = null; stageCards.current.clear();
    const active: Departing = { ...completion, stage: "holding" };
    departingRef.current = active; setDeparting(active);
    holdTimer.current = window.setTimeout(() => {
      if (departingRef.current?.id !== completion.id) return;
      const next: Departing = { ...active, stage: "flipping" }; departingRef.current = next; setDeparting(next);
    }, trickPresentationTiming(reducedMotion).holdMs);
  }, [reducedMotion]);

  const pump = useCallback(() => {
    if (queueTimer.current != null || completionTimer.current != null || departing) return;
    const next = queueRef.current.shift();
    if (!next) { const completion = pendingCompletion.current; if (completion && displayedRef.current.length >= completion.cards.length) beginCompletion(completion); return; }
    const { playSpacingMs } = trickPresentationTiming(reducedMotion); const delay = displayedRef.current.length === 0 ? 0 : playSpacingMs;
    queueTimer.current = window.setTimeout(() => {
      queueTimer.current = null;
      if (!displayedRef.current.some((play) => playKey(play) === playKey(next))) {
        displayedRef.current = [...displayedRef.current, { ...next, card: { ...next.card } }]; setDisplayedCards(displayedRef.current);
        enqueueJokerAnnouncement(next);
        if (!isPresentationCard(localPresentationRef.current, next)) { const currentProjection = projectionRef.current; playGameSound("play", acceptedPlayEventId(currentProjection, currentProjection.cards.completedTricks.length + (currentProjection.cards.currentTrick.length > 0 ? 1 : 0), next)); }
      }
      pump();
    }, delay);
  }, [beginCompletion, departing, enqueueJokerAnnouncement, reducedMotion]);

  const enqueueCommitted = useCallback((plays: readonly PlayedCard[]) => {
    const known = new Set([...displayedRef.current.map(playKey), ...queueRef.current.map(playKey)]); const local = localPresentationRef.current;
    for (const play of plays) {
      const key = playKey(play); if (known.has(key)) continue;
      if (isPresentationCard(local, play)) { displayedRef.current = [...displayedRef.current, { ...play, card: { ...play.card } }]; setDisplayedCards(displayedRef.current); enqueueJokerAnnouncement(play); known.add(key); continue; }
      queueRef.current.push({ ...play, card: { ...play.card } }); known.add(key);
    }
    pump();
  }, [enqueueJokerAnnouncement, pump]);

  useEffect(() => {
    const canonicalPlays = [...projection.cards.completedTricks.flatMap((trick) => trick.cards), ...projection.cards.currentTrick];
    for (const play of canonicalPlays) {
      if (!play.joker || play.card.kind !== "joker") continue;
      if (displayedRef.current.some((displayed) => playKey(displayed) === playKey(play))) enqueueJokerAnnouncement(play);
    }
  }, [enqueueJokerAnnouncement, projection.cards.completedTricks, projection.cards.currentTrick]);

  useEffect(() => {
    const nextEpoch = geometry?.epoch ?? 0; if (previousGeometryEpoch.current === nextEpoch) return; previousGeometryEpoch.current = nextEpoch;
    clearTimers(); queueRef.current = []; pendingCompletion.current = null; deferredCurrent.current = []; setDeparting(null); replaceDisplayed(projection.cards.currentTrick);
  }, [geometry?.epoch, clearTimers, replaceDisplayed, projection.cards.currentTrick]);

  useEffect(() => {
    const signature = currentSignature(projection.cards.currentTrick); const completedCount = projection.cards.completedTricks.length;
    if (firstRender.current || previousDealNumber.current !== projection.progression.dealNumber) {
      landedCards.current.clear(); departingRef.current = null; firstRender.current = false; previousDealNumber.current = projection.progression.dealNumber; previousCurrent.current = signature; previousCompletedCount.current = completedCount;
      clearTimers(); queueRef.current = []; pendingCompletion.current = null; deferredCurrent.current = []; setDeparting(null); for (const play of projection.cards.currentTrick) landedCards.current.add(playKey(play)); replaceDisplayed(projection.cards.currentTrick); return;
    }
    if (completedCount > previousCompletedCount.current) {
      const trick = projection.cards.completedTricks[completedCount - 1];
      if (trick) {
        const id = completedTrickPresentationId({ gameId: projection.gameId, dealNumber: projection.progression.dealNumber, trickOrdinal: completedCount, cards: trick.cards, winnerSeat: trick.winnerSeat });
        pendingCompletion.current = { id, cards: trick.cards.map((play) => ({ ...play, card: { ...play.card } })), winnerSeat: trick.winnerSeat };
        enqueueCommitted(trick.cards);
        if (projection.cards.currentTrick.length > 0) deferredCurrent.current = projection.cards.currentTrick.map((play) => ({ ...play, card: { ...play.card } }));
        pump();
      }
    } else if (signature !== previousCurrent.current && projection.cards.currentTrick.length > 0) {
      if (departing || completionTimer.current != null) deferredCurrent.current = projection.cards.currentTrick.map((play) => ({ ...play, card: { ...play.card } }));
      else {
        const firstDisplayed = displayedRef.current[0]; const firstCanonical = projection.cards.currentTrick[0];
        if (firstDisplayed && firstCanonical && playKey(firstDisplayed) !== playKey(firstCanonical)) { clearTimers(); queueRef.current = []; pendingCompletion.current = null; replaceDisplayed([]); }
        enqueueCommitted(projection.cards.currentTrick);
      }
    }
    previousCurrent.current = signature; previousCompletedCount.current = completedCount;
  }, [projection, departing, clearTimers, enqueueCommitted, pump, replaceDisplayed]);

  useEffect(() => { pump(); }, [displayedCards, localPlayPresentation, departing, pump]);
  useEffect(() => {
    const interrupt = () => { clearTimers(); queueRef.current = []; pendingCompletion.current = null; deferredCurrent.current = []; setDeparting(null); replaceDisplayed(projectionRef.current.cards.currentTrick); onLocalFlightSettled(); };
    const visibility = () => { if (document.visibilityState !== "visible") interrupt(); };
    window.addEventListener("orientationchange", interrupt); window.addEventListener("blur", interrupt); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("orientationchange", interrupt); window.removeEventListener("blur", interrupt); document.removeEventListener("visibilitychange", visibility); clearTimers(); };
  }, [clearTimers, onLocalFlightSettled, replaceDisplayed]);

  const cards = departing?.cards ?? displayedCards;
  const visibleCards = cards.filter((play) => !isPresentationCard(localPlayPresentation, play));
  const showLocalFlight = Boolean(localPlayPresentation && geometry && !departing);
  const announcement = announcementQueue[0] ?? null;
  if (visibleCards.length === 0 && !showLocalFlight && !announcement) return null;
  const rootStyle = geometry ? { left: geometry.usableCenter.x, top: geometry.usableCenter.y } : { left: "50%", top: "50%" };
  return <div className="pointer-events-none absolute z-20 h-0 w-0 [--card-w:clamp(3rem,6vw,5rem)]" style={rootStyle} data-geometry-epoch={geometry?.epoch ?? 0} data-trick-presentation-id={departing?.id ?? "current"} data-trick-departing-stage={departing?.stage ?? "none"} aria-label={departing ? "Ολοκληρωμένη μπάζα" : "Τρέχουσα μπάζα"}>
    <span className="sr-only" aria-live="polite">{departing ? `Η μπάζα κερδήθηκε από τη θέση ${departing.winnerSeat + 1}.` : announcement?.text ?? ""}</span>
    {announcement && <div className="absolute left-0 top-[-4.4rem] z-50 -translate-x-1/2 whitespace-nowrap rounded-xl border border-amber-300/60 bg-black/88 px-4 py-2 text-center text-sm font-semibold text-white shadow-2xl backdrop-blur" data-joker-announcement={announcement.id}>{announcement.text}</div>}
    {visibleCards.map((play) => <AnimatedTrickCard key={`${projection.gameId}:${projection.progression.dealNumber}:${play.seatIndex}:${play.card.id}`} play={play} viewerSeat={projection.viewerSeat} departingStage={departing?.stage ?? null} winnerSeat={departing?.winnerSeat ?? null} geometry={geometry} settled={landedCards.current.has(playKey(play))} reducedMotion={reducedMotion} onMotionComplete={onMotionComplete} />)}
    {showLocalFlight && localPlayPresentation && geometry && <LocalFlightCard key={`${localPlayPresentation.cardId}:${localPlayPresentation.sourceStateVersion}`} presentation={localPlayPresentation} viewerSeat={projection.viewerSeat} geometry={geometry} reducedMotion={reducedMotion} onSettled={settleLocalFlight} />}
  </div>;
}
