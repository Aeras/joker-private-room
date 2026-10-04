import { useEffect, useRef, useState } from "react";
import type { SeatIndex } from "@/domain/dealing";
import type { PlayedCard } from "@/domain/engine";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../joker/PlayingCard";
import type { LocalPlayPresentation } from "./localPlayPresentation";
import type { Point, TableGeometry, VisualSeat } from "./useTableGeometry";

type Pos = VisualSeat;
type Departing = {
  id: string;
  cards: PlayedCard[];
  winnerSeat: SeatIndex;
  collecting: boolean;
};

const FALLBACK_LANDING: Record<Pos, Point> = {
  0: { x: 0, y: 38 },
  1: { x: -40, y: 0 },
  2: { x: 0, y: -38 },
  3: { x: 40, y: 0 },
};

const ROTATION: Record<Pos, number> = {
  0: 2,
  1: -7,
  2: -2,
  3: 7,
};

function posOf(viewerSeat: SeatIndex, seat: number): Pos {
  return ((seat - viewerSeat + 4) % 4) as Pos;
}

function currentSignature(cards: readonly PlayedCard[]): string {
  return cards.map((play) => `${play.seatIndex}:${play.card.id}`).join("|");
}

function acceptedPlayEventId(
  projection: PlayerGameProjection,
  trickOrdinal: number,
  play: PlayedCard,
): string {
  return `${projection.gameId}:${projection.progression.dealNumber}:trick:${trickOrdinal}:${play.seatIndex}:${play.card.id}`;
}

function relativeTransform(point: Point, center: Point, rotation: number, scale = 1): string {
  const x = point.x - center.x;
  const y = point.y - center.y;
  return `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rotation}deg) scale(${scale})`;
}

function landingPoint(pos: Pos, geometry: TableGeometry | null): Point {
  if (geometry) return geometry.trickSlots[pos];
  return FALLBACK_LANDING[pos];
}

function geometryCenter(geometry: TableGeometry | null): Point {
  return geometry?.usableCenter ?? { x: 0, y: 0 };
}

function isPresentationCard(
  presentation: LocalPlayPresentation | null,
  play: PlayedCard,
): boolean {
  return Boolean(
    presentation &&
    play.seatIndex === presentation.actorSeat &&
    play.card.id === presentation.cardId,
  );
}

function AnimatedTrickCard({
  play,
  viewerSeat,
  departing,
  collecting,
  winnerSeat,
  reducedMotion,
  geometry,
}: {
  play: PlayedCard;
  viewerSeat: SeatIndex;
  departing: boolean;
  collecting: boolean;
  winnerSeat: SeatIndex | null;
  reducedMotion: boolean;
  geometry: TableGeometry | null;
}) {
  const pos = posOf(viewerSeat, play.seatIndex);
  const winner = winnerSeat === play.seatIndex;
  const winnerPos = winnerSeat == null ? null : posOf(viewerSeat, winnerSeat);
  // When geometry is unavailable, correctness wins over sophisticated motion.
  const [arrived, setArrived] = useState(departing || reducedMotion || !geometry);

  useEffect(() => {
    if (departing || reducedMotion || !geometry) {
      setArrived(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => setArrived(true));
    return () => window.cancelAnimationFrame(frame);
  }, [departing, geometry, reducedMotion]);

  const center = geometryCenter(geometry);
  const landing = landingPoint(pos, geometry);
  const origin = geometry?.seatOrigins[pos] ?? landing;
  const collectTarget = winnerPos == null
    ? landing
    : geometry?.seatOrigins[winnerPos] ?? landingPoint(winnerPos, geometry);
  const transform = collecting
    ? relativeTransform(collectTarget, center, ROTATION[pos], 0.72)
    : arrived
      ? relativeTransform(landing, center, ROTATION[pos])
      : relativeTransform(origin, center, ROTATION[pos], 0.92);

  return (
    <div
      className={cn(
        "absolute left-0 top-0 transition-all duration-300 ease-out motion-reduce:duration-75",
        winner && departing && "z-30 drop-shadow-[0_0_16px_var(--gold)]",
        collecting && !winner && "opacity-30",
      )}
      style={{ transform }}
    >
      <PlayingCard card={play.card} />
    </div>
  );
}

function LocalFlightCard({
  presentation,
  projection,
  geometry,
  reducedMotion,
  onSettled,
}: {
  presentation: LocalPlayPresentation;
  projection: PlayerGameProjection;
  geometry: TableGeometry;
  reducedMotion: boolean;
  onSettled: () => void;
}) {
  const [landed, setLanded] = useState(false);
  const settledRef = useRef(false);
  const pos = posOf(projection.viewerSeat, presentation.actorSeat);
  const center = geometry.usableCenter;
  const releasePoint: Point = {
    x: presentation.releaseRect.left - geometry.feltRect.left + presentation.releaseRect.width / 2,
    y: presentation.releaseRect.top - geometry.feltRect.top + presentation.releaseRect.height / 2,
  };
  const target = geometry.trickSlots[pos];

  useEffect(() => {
    if (presentation.status !== "accepted") {
      setLanded(false);
      return;
    }
    if (reducedMotion) {
      setLanded(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => setLanded(true));
    return () => window.cancelAnimationFrame(frame);
  }, [presentation.status, reducedMotion]);

  useEffect(() => {
    if (presentation.status !== "accepted" || !landed || settledRef.current) return;
    const settle = () => {
      if (settledRef.current) return;
      settledRef.current = true;
      playGameSound(
        "play",
        `${presentation.gameId}:${presentation.dealNumber}:local-flight:${presentation.cardId}:${presentation.acceptedStateVersion ?? "accepted"}`,
      );
      onSettled();
    };
    const timer = window.setTimeout(settle, reducedMotion ? 90 : 340);
    return () => window.clearTimeout(timer);
  }, [landed, onSettled, presentation, reducedMotion]);

  return (
    <div
      className="absolute left-0 top-0 z-40 transition-transform duration-300 ease-out motion-reduce:duration-75"
      style={{
        transform: relativeTransform(
          landed ? target : releasePoint,
          center,
          ROTATION[pos],
          landed ? 1 : 1.04,
        ),
      }}
      data-local-flight-card={presentation.cardId}
    >
      <PlayingCard card={presentation.card} />
    </div>
  );
}

/** Public, presentation-only trick layer. Winner always comes from completedTricks authority. */
export function TrickPresentation({
  projection,
  geometry,
  localPlayPresentation,
  onLocalFlightSettled,
}: {
  projection: PlayerGameProjection;
  geometry: TableGeometry | null;
  localPlayPresentation: LocalPlayPresentation | null;
  onLocalFlightSettled: () => void;
}) {
  const firstRender = useRef(true);
  const previousCurrent = useRef("");
  const previousCompletedCount = useRef(projection.cards.completedTricks.length);
  const previousGeometryEpoch = useRef(geometry?.epoch ?? 0);
  const timers = useRef<number[]>([]);
  const [departing, setDeparting] = useState<Departing | null>(null);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const nextEpoch = geometry?.epoch ?? 0;
    if (previousGeometryEpoch.current === nextEpoch) return;
    previousGeometryEpoch.current = nextEpoch;
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
    // Disposable presentation must never finish against stale geometry.
    setDeparting(null);
  }, [geometry?.epoch]);

  useEffect(() => {
    const signature = currentSignature(projection.cards.currentTrick);
    const completedCount = projection.cards.completedTricks.length;

    if (firstRender.current) {
      firstRender.current = false;
      previousCurrent.current = signature;
      previousCompletedCount.current = completedCount;
      return;
    }

    if (completedCount > previousCompletedCount.current) {
      const trick = projection.cards.completedTricks[completedCount - 1];
      if (trick) {
        const id = `${projection.gameId}:${projection.progression.dealNumber}:trick:${completedCount}`;
        setDeparting({
          id,
          cards: trick.cards.map((play) => ({ ...play, card: { ...play.card } })),
          winnerSeat: trick.winnerSeat,
          collecting: false,
        });
        for (const play of trick.cards) {
          if (!isPresentationCard(localPlayPresentation, play)) {
            playGameSound("play", acceptedPlayEventId(projection, completedCount, play));
          }
        }

        for (const timer of timers.current) window.clearTimeout(timer);
        timers.current = [];
        const holdMs = reducedMotion ? 120 : 520;
        const clearMs = reducedMotion ? 260 : 920;
        timers.current.push(window.setTimeout(
          () => setDeparting((value) => value?.id === id ? { ...value, collecting: true } : value),
          holdMs,
        ));
        timers.current.push(window.setTimeout(
          () => setDeparting((value) => value?.id === id ? null : value),
          clearMs,
        ));
      }
    } else if (signature !== previousCurrent.current && projection.cards.currentTrick.length > 0) {
      const trickOrdinal = completedCount + 1;
      for (const play of projection.cards.currentTrick) {
        if (!isPresentationCard(localPlayPresentation, play)) {
          playGameSound("play", acceptedPlayEventId(projection, trickOrdinal, play));
        }
      }
    }

    previousCurrent.current = signature;
    previousCompletedCount.current = completedCount;
  }, [localPlayPresentation, projection, reducedMotion]);

  useEffect(() => {
    const interrupt = () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
      setDeparting(null);
      onLocalFlightSettled();
    };
    const visibility = () => {
      if (document.visibilityState !== "visible") interrupt();
    };
    window.addEventListener("orientationchange", interrupt);
    window.addEventListener("blur", interrupt);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("orientationchange", interrupt);
      window.removeEventListener("blur", interrupt);
      document.removeEventListener("visibilitychange", visibility);
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
    };
  }, [onLocalFlightSettled]);

  const cards = departing?.cards ?? projection.cards.currentTrick;
  const visibleCards = cards.filter((play) => !isPresentationCard(localPlayPresentation, play));
  const showLocalFlight = Boolean(localPlayPresentation && geometry);
  if (visibleCards.length === 0 && !showLocalFlight) return null;

  const rootStyle = geometry
    ? { left: geometry.usableCenter.x, top: geometry.usableCenter.y }
    : { left: "50%", top: "50%" };

  return (
    <div
      className="pointer-events-none absolute z-20 h-0 w-0 [--card-w:clamp(3rem,6vw,5rem)]"
      style={rootStyle}
      data-geometry-epoch={geometry?.epoch ?? 0}
      aria-label={departing ? "Ολοκληρωμένη μπάζα" : "Τρέχουσα μπάζα"}
    >
      {visibleCards.map((play) => (
        <AnimatedTrickCard
          key={`${departing?.id ?? "current"}:${play.seatIndex}:${play.card.id}`}
          play={play}
          viewerSeat={projection.viewerSeat}
          departing={Boolean(departing)}
          collecting={Boolean(departing?.collecting)}
          winnerSeat={departing?.winnerSeat ?? null}
          reducedMotion={reducedMotion}
          geometry={geometry}
        />
      ))}
      {localPlayPresentation && geometry && (
        <LocalFlightCard
          presentation={localPlayPresentation}
          projection={projection}
          geometry={geometry}
          reducedMotion={reducedMotion}
          onSettled={onLocalFlightSettled}
        />
      )}
    </div>
  );
}
