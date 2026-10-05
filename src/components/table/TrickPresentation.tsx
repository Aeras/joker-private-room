import { useCallback, useEffect, useRef, useState } from "react";
import type { SeatIndex } from "@/domain/dealing";
import type { PlayedCard } from "@/domain/engine";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../joker/PlayingCard";
import type { LocalPlayPresentation } from "./localPlayPresentation";
import { completedTrickPresentationId, trickPresentationTiming } from "./trickPresentationModel";
import type { Point, TableGeometry, VisualSeat } from "./useTableGeometry";

type Pos = VisualSeat;
type DepartingStage = "holding" | "flipping" | "collecting";
type Departing = { id: string; cards: PlayedCard[]; winnerSeat: SeatIndex; stage: DepartingStage };
type PendingCompletion = { id: string; cards: PlayedCard[]; winnerSeat: SeatIndex };

const FALLBACK_LANDING: Record<Pos, Point> = { 0: { x: 0, y: 38 }, 1: { x: -40, y: 0 }, 2: { x: 0, y: -38 }, 3: { x: 40, y: 0 } };
const ROTATION: Record<Pos, number> = { 0: 2, 1: -7, 2: -2, 3: 7 };
function posOf(viewerSeat: SeatIndex, seat: number): Pos { return ((seat - viewerSeat + 4) % 4) as Pos; }
function playKey(play: PlayedCard): string { return `${play.seatIndex}:${play.card.id}`; }
function currentSignature(cards: readonly PlayedCard[]): string { return cards.map(playKey).join("|"); }
function acceptedPlayEventId(projection: PlayerGameProjection, trickOrdinal: number, play: PlayedCard): string { return `${projection.gameId}:${projection.progression.dealNumber}:trick:${trickOrdinal}:${play.seatIndex}:${play.card.id}`; }
function relativeTransform(point: Point, center: Point, rotation: number, scale = 1, flip = 0): string {
  const x = point.x - center.x; const y = point.y - center.y;
  return `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rotation}deg) rotateY(${flip}deg) scale(${scale})`;
}
function landingPoint(pos: Pos, geometry: TableGeometry | null): Point { return geometry ? geometry.trickSlots[pos] : FALLBACK_LANDING[pos]; }
function geometryCenter(geometry: TableGeometry | null): Point { return geometry?.usableCenter ?? { x: 0, y: 0 }; }
function isPresentationCard(presentation: LocalPlayPresentation | null, play: PlayedCard): boolean { return Boolean(presentation && play.seatIndex === presentation.actorSeat && play.card.id === presentation.cardId); }

function AnimatedTrickCard({ play, viewerSeat, departingStage, winnerSeat, geometry }: {
  play: PlayedCard; viewerSeat: SeatIndex; departingStage: DepartingStage | null; winnerSeat: SeatIndex | null; geometry: TableGeometry | null;
}) {
  const pos = posOf(viewerSeat, play.seatIndex);
  const winner = winnerSeat === play.seatIndex;
  const winnerPos = winnerSeat == null ? null : posOf(viewerSeat, winnerSeat);
  const [arrived, setArrived] = useState(Boolean(departingStage) || !geometry);
  useEffect(() => {
    if (departingStage || !geometry) { setArrived(true); return; }
    setArrived(false); const frame = window.requestAnimationFrame(() => setArrived(true)); return () => window.cancelAnimationFrame(frame);
  }, [departingStage, geometry?.epoch, play.card.id]);
  const center = geometryCenter(geometry);
  const landing = landingPoint(pos, geometry);
  const origin = geometry?.seatOrigins[pos] ?? landing;
  const collectTarget = winnerPos == null ? landing : geometry?.seatOrigins[winnerPos] ?? landingPoint(winnerPos, geometry);
  const collecting = departingStage === "collecting";
  const faceDown = departingStage === "flipping" || collecting;
  const transform = collecting
    ? relativeTransform(collectTarget, center, ROTATION[pos], 0.58, 180)
    : departedTransform(arrived, faceDown, landing, origin, center, pos);
  return <div className={cn("absolute left-0 top-0 transition-all duration-[340ms] ease-out motion-reduce:duration-75 [transform-style:preserve-3d]", winner && departingStage && "z-30 drop-shadow-[0_0_16px_var(--gold)]", collecting && !winner && "opacity-85")} style={{ transform }}>
    <PlayingCard card={faceDown ? undefined : play.card} faceDown={faceDown} />
  </div>;
}
function departedTransform(arrived: boolean, faceDown: boolean, landing: Point, origin: Point, center: Point, pos: Pos): string {
  if (arrived) return relativeTransform(landing, center, ROTATION[pos], faceDown ? 0.96 : 1, faceDown ? 180 : 0);
  return relativeTransform(origin, center, ROTATION[pos], 0.92, 0);
}

function LocalFlightCard({ presentation, projection, geometry, reducedMotion, onSettled }: { presentation: LocalPlayPresentation; projection: PlayerGameProjection; geometry: TableGeometry; reducedMotion: boolean; onSettled: () => void }) {
  const [atTarget, setAtTarget] = useState(false); const settledRef = useRef(false);
  const pos = posOf(projection.viewerSeat, presentation.actorSeat); const center = geometry.usableCenter;
  const releasePoint: Point = { x: presentation.releaseRect.left - geometry.feltRect.left + presentation.releaseRect.width / 2, y: presentation.releaseRect.top - geometry.feltRect.top + presentation.releaseRect.height / 2 };
  const target = geometry.trickSlots[pos];
  useEffect(() => {
    if (presentation.status === "rejected") { setAtTarget(false); const timer = window.setTimeout(onSettled, reducedMotion ? 90 : 320); return () => window.clearTimeout(timer); }
    setAtTarget(false); const frame = window.requestAnimationFrame(() => setAtTarget(true)); return () => window.cancelAnimationFrame(frame);
  }, [presentation.status, presentation.cardId, reducedMotion, onSettled]);
  useEffect(() => {
    if (presentation.status !== "accepted" || !atTarget || settledRef.current) return;
    const timer = window.setTimeout(() => { if (settledRef.current) return; settledRef.current = true; playGameSound("play", `${presentation.gameId}:${presentation.dealNumber}:local-flight:${presentation.cardId}:${presentation.acceptedStateVersion ?? "accepted"}`); onSettled(); }, reducedMotion ? 40 : 90);
    return () => window.clearTimeout(timer);
  }, [atTarget, onSettled, presentation, reducedMotion]);
  return <div className="absolute left-0 top-0 z-40 transition-transform duration-300 ease-out motion-reduce:duration-75" style={{ transform: relativeTransform(atTarget ? target : releasePoint, center, ROTATION[pos], atTarget ? 1 : 1.04) }} data-local-flight-card={presentation.cardId} data-local-flight-status={presentation.status}><PlayingCard card={presentation.card} /></div>;
}

export function TrickPresentation({ projection, geometry, localPlayPresentation, onLocalFlightSettled }: { projection: PlayerGameProjection; geometry: TableGeometry | null; localPlayPresentation: LocalPlayPresentation | null; onLocalFlightSettled: () => void }) {
  const firstRender = useRef(true); const previousCurrent = useRef(""); const previousCompletedCount = useRef(projection.cards.completedTricks.length); const previousDealNumber = useRef(projection.progression.dealNumber); const previousGeometryEpoch = useRef(geometry?.epoch ?? 0);
  const displayedRef = useRef<PlayedCard[]>([]); const queueRef = useRef<PlayedCard[]>([]); const queueTimer = useRef<number | null>(null); const completionTimer = useRef<number | null>(null); const holdTimer = useRef<number | null>(null); const collectTimer = useRef<number | null>(null); const clearTimer = useRef<number | null>(null);
  const pendingCompletion = useRef<PendingCompletion | null>(null); const deferredCurrent = useRef<PlayedCard[]>([]); const localPresentationRef = useRef(localPlayPresentation); const projectionRef = useRef(projection);
  const [displayedCards, setDisplayedCards] = useState<PlayedCard[]>([]); const [departing, setDeparting] = useState<Departing | null>(null);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  localPresentationRef.current = localPlayPresentation; projectionRef.current = projection;

  const clearTimers = useCallback(() => {
    for (const ref of [queueTimer, completionTimer, holdTimer, collectTimer, clearTimer]) { if (ref.current != null) window.clearTimeout(ref.current); ref.current = null; }
  }, []);
  const replaceDisplayed = useCallback((cards: readonly PlayedCard[]) => { displayedRef.current = cards.map((play) => ({ ...play, card: { ...play.card } })); setDisplayedCards(displayedRef.current); }, []);
  const startDeferred = useCallback(() => { const deferred = deferredCurrent.current; deferredCurrent.current = []; if (deferred.length === 0) return; replaceDisplayed([]); queueRef.current = deferred.map((play) => ({ ...play, card: { ...play.card } })); }, [replaceDisplayed]);

  const beginCompletion = useCallback((completion: PendingCompletion) => {
    if (departing || completionTimer.current != null) return;
    pendingCompletion.current = null;
    const { settleMs, holdMs, flipMs, collectStartMs, clearMs } = trickPresentationTiming(reducedMotion);
    completionTimer.current = window.setTimeout(() => {
      completionTimer.current = null;
      const frozen = completion.cards.map((play) => ({ ...play, card: { ...play.card } }));
      setDeparting({ id: completion.id, cards: frozen, winnerSeat: completion.winnerSeat, stage: "holding" });
      holdTimer.current = window.setTimeout(() => setDeparting((current) => current?.id === completion.id ? { ...current, stage: "flipping" } : current), holdMs);
      collectTimer.current = window.setTimeout(() => setDeparting((current) => current?.id === completion.id ? { ...current, stage: "collecting" } : current), holdMs + flipMs);
      clearTimer.current = window.setTimeout(() => { setDeparting((current) => current?.id === completion.id ? null : current); replaceDisplayed([]); startDeferred(); }, clearMs - settleMs);
    }, settleMs);
    void collectStartMs;
  }, [departing, reducedMotion, replaceDisplayed, startDeferred]);

  const pump = useCallback(() => {
    if (queueTimer.current != null || completionTimer.current != null || departing) return;
    const next = queueRef.current.shift();
    if (!next) { const completion = pendingCompletion.current; if (completion && displayedRef.current.length >= completion.cards.length) beginCompletion(completion); return; }
    const { playSpacingMs } = trickPresentationTiming(reducedMotion); const delay = displayedRef.current.length === 0 ? 0 : playSpacingMs;
    queueTimer.current = window.setTimeout(() => {
      queueTimer.current = null;
      if (!displayedRef.current.some((play) => playKey(play) === playKey(next))) {
        displayedRef.current = [...displayedRef.current, { ...next, card: { ...next.card } }]; setDisplayedCards(displayedRef.current);
        if (!isPresentationCard(localPresentationRef.current, next)) { const currentProjection = projectionRef.current; playGameSound("play", acceptedPlayEventId(currentProjection, currentProjection.cards.completedTricks.length + (currentProjection.cards.currentTrick.length > 0 ? 1 : 0), next)); }
      }
      pump();
    }, delay);
  }, [beginCompletion, departing, reducedMotion]);

  const enqueueCommitted = useCallback((plays: readonly PlayedCard[]) => {
    const known = new Set([...displayedRef.current.map(playKey), ...queueRef.current.map(playKey)]); const local = localPresentationRef.current;
    for (const play of plays) {
      const key = playKey(play); if (known.has(key)) continue;
      if (isPresentationCard(local, play)) { displayedRef.current = [...displayedRef.current, { ...play, card: { ...play.card } }]; setDisplayedCards(displayedRef.current); known.add(key); continue; }
      queueRef.current.push({ ...play, card: { ...play.card } }); known.add(key);
    }
    pump();
  }, [pump]);

  useEffect(() => {
    const nextEpoch = geometry?.epoch ?? 0; if (previousGeometryEpoch.current === nextEpoch) return; previousGeometryEpoch.current = nextEpoch;
    clearTimers(); queueRef.current = []; pendingCompletion.current = null; deferredCurrent.current = []; setDeparting(null); replaceDisplayed(projection.cards.currentTrick);
  }, [geometry?.epoch, clearTimers, replaceDisplayed, projection.cards.currentTrick]);

  useEffect(() => {
    const signature = currentSignature(projection.cards.currentTrick); const completedCount = projection.cards.completedTricks.length;
    if (firstRender.current || previousDealNumber.current !== projection.progression.dealNumber) {
      firstRender.current = false; previousDealNumber.current = projection.progression.dealNumber; previousCurrent.current = signature; previousCompletedCount.current = completedCount;
      clearTimers(); queueRef.current = []; pendingCompletion.current = null; deferredCurrent.current = []; setDeparting(null); replaceDisplayed(projection.cards.currentTrick); return;
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

  useEffect(() => { pump(); }, [displayedCards.length, departing, pump]);
  useEffect(() => {
    const interrupt = () => { clearTimers(); queueRef.current = []; pendingCompletion.current = null; deferredCurrent.current = []; setDeparting(null); replaceDisplayed(projectionRef.current.cards.currentTrick); onLocalFlightSettled(); };
    const visibility = () => { if (document.visibilityState !== "visible") interrupt(); };
    window.addEventListener("orientationchange", interrupt); window.addEventListener("blur", interrupt); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("orientationchange", interrupt); window.removeEventListener("blur", interrupt); document.removeEventListener("visibilitychange", visibility); clearTimers(); };
  }, [clearTimers, onLocalFlightSettled, replaceDisplayed]);

  const cards = departing?.cards ?? displayedCards;
  const visibleCards = cards.filter((play) => !isPresentationCard(localPlayPresentation, play));
  const showLocalFlight = Boolean(localPlayPresentation && geometry && !departing);
  if (visibleCards.length === 0 && !showLocalFlight) return null;
  const rootStyle = geometry ? { left: geometry.usableCenter.x, top: geometry.usableCenter.y } : { left: "50%", top: "50%" };
  return <div className="pointer-events-none absolute z-20 h-0 w-0 [--card-w:clamp(3rem,6vw,5rem)]" style={rootStyle} data-geometry-epoch={geometry?.epoch ?? 0} data-trick-presentation-id={departing?.id ?? "current"} data-trick-departing-stage={departing?.stage ?? "none"} aria-label={departing ? "Ολοκληρωμένη μπάζα" : "Τρέχουσα μπάζα"}>
    <span className="sr-only" aria-live="polite">{departing ? `Η μπάζα κερδήθηκε από τη θέση ${departing.winnerSeat + 1}.` : ""}</span>
    {visibleCards.map((play) => <AnimatedTrickCard key={`${departing?.id ?? "current"}:${play.seatIndex}:${play.card.id}`} play={play} viewerSeat={projection.viewerSeat} departingStage={departing?.stage ?? null} winnerSeat={departing?.winnerSeat ?? null} geometry={geometry} />)}
    {showLocalFlight && localPlayPresentation && geometry && <LocalFlightCard presentation={localPlayPresentation} projection={projection} geometry={geometry} reducedMotion={reducedMotion} onSettled={onLocalFlightSettled} />}
  </div>;
}
