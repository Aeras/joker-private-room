import { useEffect, useRef, useState } from "react";
import type { SeatIndex } from "@/domain/dealing";
import type { PlayedCard } from "@/domain/engine";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { cn } from "@/lib/utils";
import { PlayingCard } from "../joker/PlayingCard";

type Pos = 0 | 1 | 2 | 3;
type Departing = {
  id: string;
  cards: PlayedCard[];
  winnerSeat: SeatIndex;
  collecting: boolean;
};

const ORIGIN: Record<Pos, string> = {
  0: "translate(-50%, 54vh) scale(.92)",
  1: "translate(-48vw, -50%) scale(.92)",
  2: "translate(-50%, -47vh) scale(.92)",
  3: "translate(43vw, -50%) scale(.92)",
};

const LANDING: Record<Pos, string> = {
  0: "translate(-50%, 34%) rotate(2deg)",
  1: "translate(-112%, -50%) rotate(-7deg)",
  2: "translate(-50%, -134%) rotate(-2deg)",
  3: "translate(12%, -50%) rotate(7deg)",
};

const COLLECT: Record<Pos, string> = {
  0: "translate(-50%, 52vh) scale(.72)",
  1: "translate(-48vw, -50%) scale(.72)",
  2: "translate(-50%, -46vh) scale(.72)",
  3: "translate(42vw, -50%) scale(.72)",
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

function AnimatedTrickCard({
  play,
  viewerSeat,
  departing,
  collecting,
  winnerSeat,
  reducedMotion,
}: {
  play: PlayedCard;
  viewerSeat: SeatIndex;
  departing: boolean;
  collecting: boolean;
  winnerSeat: SeatIndex | null;
  reducedMotion: boolean;
}) {
  const pos = posOf(viewerSeat, play.seatIndex);
  const winner = winnerSeat === play.seatIndex;
  const winnerPos = winnerSeat == null ? null : posOf(viewerSeat, winnerSeat);
  const [arrived, setArrived] = useState(departing || reducedMotion);

  useEffect(() => {
    if (departing || reducedMotion) {
      setArrived(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => setArrived(true));
    return () => window.cancelAnimationFrame(frame);
  }, [departing, reducedMotion]);

  const transform = collecting && winnerPos != null
    ? COLLECT[winnerPos]
    : arrived
      ? LANDING[pos]
      : ORIGIN[pos];

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
export function TrickPresentation({ projection }: { projection: PlayerGameProjection }) {
  const firstRender = useRef(true);
  const previousCurrent = useRef("");
  const previousCompletedCount = useRef(projection.cards.completedTricks.length);
  const timers = useRef<number[]>([]);
  const [departing, setDeparting] = useState<Departing | null>(null);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

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

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-0 w-0 [--card-w:clamp(3rem,6vw,5rem)]" aria-label={departing ? "Ολοκληρωμένη μπάζα" : "Τρέχουσα μπάζα"}>
      {cards.map((play) => (
        <AnimatedTrickCard
          key={`${departing?.id ?? "current"}:${play.seatIndex}:${play.card.id}`}
          play={play}
          viewerSeat={projection.viewerSeat}
          departing={Boolean(departing)}
          collecting={Boolean(departing?.collecting)}
          winnerSeat={departing?.winnerSeat ?? null}
          reducedMotion={reducedMotion}
        />
      ))}
    </div>
  );
}
