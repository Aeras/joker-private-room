import { useEffect, useRef, useState } from "react";
import type { SeatIndex } from "@/domain/dealing";
import type { PlayedCard } from "@/domain/engine";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../joker/PlayingCard";
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

/** Public, presentation-only trick layer. Winner always comes from completedTricks authority. */
export function TrickPresentation({
  projection,
  geometry,
}: {
  projection: PlayerGameProjection;
  geometry: TableGeometry | null;
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
    // A departing trick is disposable presentation state. On geometry change,
    // current canonical projection wins rather than finishing on stale coordinates.
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
          playGameSound("play", acceptedPlayEventId(projection, completedCount, play));
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
        playGameSound("play", acceptedPlayEventId(projection, trickOrdinal, play));
      }
    }

    previousCurrent.current = signature;
    previousCompletedCount.current = completedCount;
  }, [projection, reducedMotion]);

  useEffect(() => {
    const interrupt = () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
      setDeparting(null);
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
      interrupt();
    };
  }, []);

  const cards = departing?.cards ?? projection.cards.currentTrick;
  if (cards.length === 0) return null;

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
      {cards.map((play) => (
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
    </div>
  );
}
