import { recordTimingDiagnostic } from "@/lib/timingDiagnostics";
import { assets } from "@/assets/registry";
import { useCriticalCardArtwork } from "./useCriticalCardArtwork";
import { TrickPresentationJournal } from "./trickPresentationJournal";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Suit } from "@/domain/cards";
import type { SeatIndex } from "@/domain/dealing";
import type { JokerSemantic, PlayedCard } from "@/domain/engine";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../joker/PlayingCard";
import { LocalFlightCard, MOTION_FALLBACK_SLACK_MS } from "./LocalFlightCard";
import type { LocalPlayPresentation } from "./localPlayPresentation";
import { trickPresentationTiming } from "./trickPresentationModel";
import type { Point, TableGeometry, VisualSeat } from "./useTableGeometry";

type Pos = VisualSeat;
type DepartingStage = "holding" | "flipping" | "collecting";
type Departing = { id: string; cards: PlayedCard[]; winnerSeat: SeatIndex; stage: DepartingStage };

type JokerAnnouncement = { id: string; text: string };

const FALLBACK_LANDING: Record<Pos, Point> = { 0: { x: 0, y: 38 }, 1: { x: -40, y: 0 }, 2: { x: 0, y: -38 }, 3: { x: 40, y: 0 } };
const ROTATION: Record<Pos, number> = { 0: 2, 1: -7, 2: -2, 3: 7 };
const JOKER_ANNOUNCEMENT_MS = 3_000;
const SUIT_ANNOUNCEMENT = { hearts: "κούπες", diamonds: "καρό", clubs: "σπαθιά", spades: "μπαστούνια" } as const;
function posOf(viewerSeat: SeatIndex, seat: number): Pos { return ((seat - viewerSeat + 4) % 4) as Pos; }
function playKey(play: PlayedCard): string { return `${play.seatIndex}:${play.card.id}`; }
function jokerAnnouncementText(semantic: JokerSemantic, trumpSuit: Suit | null): string | null {
  if (semantic.context === "OPEN_TRICK") return null;
  if (semantic.mode === "HIGHER_SUIT" && trumpSuit === semantic.requestedSuit) return "Θέλω μεγαλύτερο ατού";
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
function isFromBelowJoker(play: PlayedCard): boolean {
  return play.card.kind === "joker" && play.joker?.context === "OPEN_TRICK" && play.joker.mode === "FROM_BELOW";
}
function underStackPoint(landing: Point, center: Point): Point {
  return {
    x: center.x + (landing.x - center.x) * 0.28,
    y: center.y + (landing.y - center.y) * 0.28,
  };
}

function AnimatedTrickCard({ play, viewerSeat, departingStage, winnerSeat, geometry, settled = false, reducedMotion, onMotionComplete, completionGeneration, paused }: {
  play: PlayedCard; viewerSeat: SeatIndex; departingStage: DepartingStage | null; winnerSeat: SeatIndex | null; geometry: TableGeometry | null; settled?: boolean; reducedMotion: boolean; onMotionComplete: (play: PlayedCard, stage: DepartingStage | "landing") => void; completionGeneration: number; paused: boolean;
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
  const launchGeometry = useRef(geometry);
  const collectionGeometry = useRef<TableGeometry | null>(null);
  if (departingStage === "collecting" && !collectionGeometry.current) collectionGeometry.current = geometry;
  const motionGeometry = departingStage === "collecting" ? collectionGeometry.current : settled ? geometry : launchGeometry.current;
  const center = geometryCenter(motionGeometry);
  const landing = landingPoint(pos, motionGeometry);
  const origin = motionGeometry?.seatOrigins[pos] ?? landing;
  const collectTarget = winnerPos == null ? landing : motionGeometry?.seatOrigins[winnerPos] ?? landingPoint(winnerPos, motionGeometry);
  const timing = trickPresentationTiming(reducedMotion);
  const duration = departingStage === "flipping" ? timing.flipMs : departingStage === "collecting" ? timing.collectMs : timing.settleMs;
  const completionRef = useRef(onMotionComplete); completionRef.current = onMotionComplete;
  const playRef = useRef(play); playRef.current = play;
  useEffect(() => {
    if (paused || !arrived || departingStage === "holding" || (!departingStage && settled)) return;
    const timer = window.setTimeout(() => completionRef.current(playRef.current, departingStage ?? "landing"), duration + MOTION_FALLBACK_SLACK_MS);
    return () => window.clearTimeout(timer);
  }, [arrived, departingStage, duration, play.card.id, completionGeneration, paused, settled]);
  const collecting = departingStage === "collecting";
  const fromBelowJoker = isFromBelowJoker(play);
  const faceDown = fromBelowJoker || departingStage === "flipping" || collecting;
  const settledPoint = fromBelowJoker && !departingStage ? underStackPoint(landing, center) : landing;
  const transform = collecting
    ? relativeTransform(collectTarget, center, ROTATION[pos], 0.78, 180)
    : departedTransform(arrived, faceDown, settledPoint, origin, center, pos);
  const easing = collecting ? "cubic-bezier(0.22, 0.8, 0.24, 1)" : "cubic-bezier(0.22, 1, 0.36, 1)";
  return <div data-joker-from-below={fromBelowJoker ? "true" : undefined} data-trick-collecting={collecting ? "true" : undefined} className={cn("fixed transition-[transform,opacity] [transform-style:preserve-3d]", fromBelowJoker && !departingStage ? "z-0" : "z-10", winner && departingStage && "z-30 drop-shadow-[0_0_16px_var(--gold)]", collecting && !winner && "opacity-85")} style={{ "--card-w": motionGeometry ? `${motionGeometry.trickCardSize.width}px` : undefined, left: (motionGeometry?.feltRect.left ?? 0) + center.x, top: (motionGeometry?.feltRect.top ?? 0) + center.y, transform, transitionDuration: `${duration}ms`, transitionTimingFunction: easing } as React.CSSProperties} onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === "transform") completionRef.current(play, departingStage ?? "landing"); }}>
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

export function TrickPresentation({ projection, geometry, localPlayPresentation, onLocalFlightSettled, onBusyChange, onPresentationReady, onCollectionComplete, onScorePresentationActiveChange }: { projection: PlayerGameProjection; geometry: TableGeometry | null; localPlayPresentation: LocalPlayPresentation | null; onLocalFlightSettled: () => void; onBusyChange?: (busy: boolean) => void; onCollectionComplete?: () => void; onScorePresentationActiveChange?: (active: boolean) => void; onPresentationReady?: (token: number) => Promise<boolean> }) {
  const collectionCallback = useRef(onCollectionComplete); collectionCallback.current = onCollectionComplete;
  const readyCallback = useRef(onPresentationReady); readyCallback.current = onPresentationReady;
  const acknowledgedTokens = useRef(new Set<number>());
  const [ackAttempt, retryAck] = useState(0);
  const journal = useRef(new TrickPresentationJournal());
  const [revision, revise] = useState(0);
  const [displayedCards, setDisplayedCards] = useState<PlayedCard[]>([]);
  const [departing, setDeparting] = useState<Departing | null>(null);
  const [announcementQueue, setAnnouncementQueue] = useState<JokerAnnouncement[]>([]);
  const [paused, setPaused] = useState(document.visibilityState === "hidden");
  const [resumeGeneration, resume] = useState(0);
  const landedCards = useRef(new Set<string>());
  const stageCards = useRef(new Set<string>());
  const announcedJokers = useRef(new Set<string>());
  const activeId = useRef<string | null>(null);
  const departingRef = useRef(departing); departingRef.current = departing;
  const localPresentationRef = useRef(localPlayPresentation); localPresentationRef.current = localPlayPresentation;
  const reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const resolvedTrumpSuit = projection.trump?.status === "resolved" ? projection.trump.suit : null;

  const enqueueJokerAnnouncement = useCallback((play: PlayedCard) => {
    if (play.card.kind !== "joker" || !play.joker) return;
    const id = journal.current.active?.id + ":" + playKey(play) + ":" + JSON.stringify(play.joker);
    if (announcedJokers.current.has(id)) return;
    announcedJokers.current.add(id);
    const text = jokerAnnouncementText(play.joker!, resolvedTrumpSuit);
    if (!text) return;
    setAnnouncementQueue(items => [...items, { id, text }]);
  }, [resolvedTrumpSuit]);
  const announcementId = announcementQueue[0]?.id;
  useEffect(() => {
    if (!announcementId) return;
    const timer = window.setTimeout(() => setAnnouncementQueue(items => items[0]?.id === announcementId ? items.slice(1) : items), JOKER_ANNOUNCEMENT_MS);
    return () => window.clearTimeout(timer);
  }, [announcementId]);

  // Publish the latch before the parent's passive score reconciliation can run.
  // Settled hydration skips historical replay; live partial tricks remain latched
  // even between card flights when the input-busy flag is temporarily false.
  useLayoutEffect(() => {
    if (journal.current.ingest(projection)) revise(n => n + 1);
    const current = journal.current.active;
    onScorePresentationActiveChange?.(Boolean(current && (!current.hydrated || current.winnerSeat != null)));
  }, [projection, revision, onScorePresentationActiveChange]);
  const active = journal.current.active;
  const artworkSettled = useCriticalCardArtwork([assets.cardBack, ...(active?.cards.map(play => assets.cardFace(play.card)) ?? [])]);
  useEffect(() => {
    if (activeId.current === active?.id) return;
    activeId.current = active?.id ?? null;
    landedCards.current.clear(); stageCards.current.clear();
    departingRef.current = null; setDeparting(null);
    if (active?.hydrated) {
      for (const play of active.cards) landedCards.current.add(playKey(play));
      setDisplayedCards([...active.cards]);
    } else setDisplayedCards([]);
  }, [active?.id, active?.cards, active?.hydrated]);

  const onMotionComplete = useCallback((play: PlayedCard, stage: DepartingStage | "landing") => {
    if (paused) return;
    if (stage === "landing") {
      if (landedCards.current.has(playKey(play))) return;
      landedCards.current.add(playKey(play));
      playGameSound("play", journal.current.active?.id + ":" + playKey(play));
      recordTimingDiagnostic("trick_card_landed", { trickId: journal.current.active?.id ?? "none", seat: play.seatIndex, cardId: play.card.id });
      revise(n => n + 1); return;
    }
    const current = departingRef.current;
    if (!current || current.stage !== stage) return;
    stageCards.current.add(playKey(play));
    if (stageCards.current.size < current.cards.length) return;
    stageCards.current.clear();
    if (stage === "flipping") {
      const next = { ...current, stage: "collecting" as const }; departingRef.current = next; setDeparting(next);
    } else if (stage === "collecting") {
      recordTimingDiagnostic("trick_collection_complete", { trickId: current.id, winnerSeat: current.winnerSeat });
      collectionCallback.current?.();
      journal.current.collect(current.id); departingRef.current = null; setDeparting(null); revise(n => n + 1);
    }
  }, [paused]);
  const settleLocalFlight = useCallback(() => {
    const local = localPresentationRef.current;
    if (local?.status === "accepted") landedCards.current.add(local.actorSeat + ":" + local.cardId);
    onLocalFlightSettled(); revise(n => n + 1);
  }, [onLocalFlightSettled]);

  useEffect(() => {
    if (!artworkSettled || paused || !active || activeId.current !== active.id || departing) return;
    // A local accepted play joins this same surface only after its flight lands.
    const next = active.cards[displayedCards.length];
    if (next) {
      if (displayedCards.some(play => !landedCards.current.has(playKey(play)))) return;
      const local = isPresentationCard(localPlayPresentation, next);
      const delay = local || !displayedCards.length ? 0 : trickPresentationTiming(reducedMotion).interPlayBeatMs;
      const show = () => {
        setDisplayedCards(cards => [...cards, next]); enqueueJokerAnnouncement(next);
        recordTimingDiagnostic("trick_card_launch", { trickId: active.id, seat: next.seatIndex, cardId: next.card.id });
      };
      if (local) { show(); return undefined; }
      const timer = window.setTimeout(show, delay);
      return () => window.clearTimeout(timer);
    }
    if (active.winnerSeat == null || localPlayPresentation || !active.cards.every(play => landedCards.current.has(playKey(play)))) return;
    stageCards.current.clear();
    const completion: Departing = { id: active.id, cards: [...active.cards], winnerSeat: active.winnerSeat, stage: "holding" };
    recordTimingDiagnostic("trick_hold_start", { trickId: completion.id, holdMs: trickPresentationTiming(reducedMotion).holdMs });
    departingRef.current = completion; setDeparting(completion);
    return undefined;
  }, [active, active?.cards.length, active?.winnerSeat, displayedCards, departing, paused, reducedMotion, localPlayPresentation, enqueueJokerAnnouncement, revision, artworkSettled]);

  useEffect(() => {
    if (paused || departing?.stage !== "holding") return;
    const timer = window.setTimeout(() => {
      const next = { ...departing, stage: "flipping" as const }; departingRef.current = next; stageCards.current.clear(); setDeparting(next);
    }, trickPresentationTiming(reducedMotion).holdMs);
    return () => window.clearTimeout(timer);
  }, [departing, paused, reducedMotion]);
  useEffect(() => {
    const interrupt = () => setPaused(true);
    const restore = () => { if (document.visibilityState !== "hidden") { setPaused(false); resume(n => n + 1); } };
    const visibility = () => document.visibilityState === "hidden" ? interrupt() : restore();
    // Orientation uses a new completion generation, without discarding the journal.
    const orientation = () => resume(n => n + 1);
    window.addEventListener("blur", interrupt); window.addEventListener("focus", restore);
    window.addEventListener("orientationchange", orientation); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", interrupt); window.removeEventListener("focus", restore); window.removeEventListener("orientationchange", orientation); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    for (const play of active?.cards ?? []) if (displayedCards.some(card => playKey(card) === playKey(play))) enqueueJokerAnnouncement(play);
  }, [active, displayedCards, enqueueJokerAnnouncement, revision]);
  const currentId = projection.gameId + ":" + projection.progression.dealNumber + ":" + (projection.cards.completedTricks.length + 1);
  const busy = Boolean(active && (active.id !== currentId || departing || displayedCards.length < active.cards.length || displayedCards.some(play => !landedCards.current.has(playKey(play)))));
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const hasPresentationGeometry = Boolean(geometry);
  const localMotionPending = Boolean(localPlayPresentation);
  const token = projection.timing?.turnPresentation?.token;
  const alreadyAcknowledged = projection.timing?.turnPresentation?.completedSeats.includes(projection.viewerSeat);
  useEffect(() => {
    if (token == null || alreadyAcknowledged || paused || !artworkSettled || localMotionPending || !hasPresentationGeometry || acknowledgedTokens.current.has(token)) return;
    let cancelled = false; let timer: number | undefined;
    const settle = async () => {
      const current = journal.current.active;
      if (departingRef.current || (current && (current.winnerSeat != null || current.cards.some(play => !landedCards.current.has(playKey(play)))))) return;
      try {
        const accepted = await readyCallback.current?.(token);
        if (!cancelled && accepted) {
          acknowledgedTokens.current.add(token);
          while (acknowledgedTokens.current.size > 96) acknowledgedTokens.current.delete(acknowledgedTokens.current.values().next().value!);
        } else if (!cancelled) timer = window.setTimeout(() => retryAck(n => n + 1), 1_500);
      } catch { if (!cancelled) timer = window.setTimeout(() => retryAck(n => n + 1), 1_500); }
    };
    void settle();
    return () => { cancelled = true; if (timer != null) window.clearTimeout(timer); };
  }, [token, alreadyAcknowledged, paused, artworkSettled, hasPresentationGeometry, localMotionPending, revision, departing?.stage, resumeGeneration, ackAttempt]);
  const cards = departing?.cards ?? displayedCards;
  const visibleCards = cards.filter((play) => !isPresentationCard(localPlayPresentation, play));
  const showLocalFlight = Boolean(localPlayPresentation && geometry && !departing);
  const announcement = announcementQueue[0] ?? null;
  if (visibleCards.length === 0 && !showLocalFlight && !announcement) return null;
  const rootStyle = geometry ? { left: geometry.usableCenter.x, top: geometry.usableCenter.y } : { left: "50%", top: "50%" };
  return <div className="pointer-events-none absolute z-20 h-0 w-0 [--card-w:clamp(3rem,6vw,5rem)]" style={rootStyle} data-geometry-epoch={geometry?.epoch ?? 0} data-trick-presentation-id={active?.id ?? "current"} data-trick-departing-stage={departing?.stage ?? "none"} aria-label={departing ? "Ολοκληρωμένη μπάζα" : "Τρέχουσα μπάζα"}>
    <span className="sr-only" aria-live="polite">{departing ? `Η μπάζα κερδήθηκε από τη θέση ${departing.winnerSeat + 1}.` : announcement?.text ?? ""}</span>
    {announcement && <div className="absolute left-0 top-[-4.4rem] z-50 -translate-x-1/2 whitespace-nowrap rounded-xl border border-amber-300/60 bg-black/88 px-4 py-2 text-center text-sm font-semibold text-white shadow-2xl backdrop-blur" data-joker-announcement={announcement.id}>{announcement.text}</div>}
    {visibleCards.map((play) => <AnimatedTrickCard key={`${active?.id}:${play.seatIndex}:${play.card.id}`} play={play} viewerSeat={projection.viewerSeat} departingStage={departing?.stage ?? null} winnerSeat={departing?.winnerSeat ?? null} geometry={geometry} settled={landedCards.current.has(playKey(play))} reducedMotion={reducedMotion} onMotionComplete={onMotionComplete} completionGeneration={resumeGeneration} paused={paused} />)}
    {showLocalFlight && localPlayPresentation && geometry && <LocalFlightCard key={`${localPlayPresentation.cardId}:${localPlayPresentation.sourceStateVersion}`} presentation={localPlayPresentation} viewerSeat={projection.viewerSeat} geometry={geometry} reducedMotion={reducedMotion} onSettled={settleLocalFlight} />}
  </div>;
}
