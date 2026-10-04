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
        setDeparting({ id, cards: trick.cards.map((play) => ({ ...play, card: { ...play.card } })), winnerSeat: trick.winnerSeat, collecting: false });
        const last = trick.cards[trick.cards.length - 1];
        if (last) playGameSound("play", `${id}:${last.seatIndex}:${last.card.id}`);

        for (const timer of timers.current) window.clearTimeout(timer);
        timers.current = [];
        const holdMs = reducedMotion ? 120 : 520;
        const clearMs = reducedMotion ? 260 : 920;
        timers.current.push(window.setTimeout(() => setDeparting((value) => value?.id === id ? { ...value, collecting: true } : value), holdMs));
        timers.current.push(window.setTimeout(() => setDeparting((value) => value?.id === id ? null : value), clearMs));
      }
    } else if (signature !== previousCurrent.current && projection.cards.currentTrick.length > 0) {
      const latest = projection.cards.currentTrick[projection.cards.currentTrick.length - 1];
      if (latest) {
        playGameSound("play", `${projection.gameId}:${projection.progression.dealNumber}:current:${signature}:${latest.card.id}`);
      }
    }

    previousCurrent.current = signature;
    previousCompletedCount.current = completedCount;
  }, [projection, reducedMotion]);

  useEffect(() => () => {
    for (const timer of timers.current) window.clearTimeout(timer);
  }, []);

  const cards = departing?.cards ?? projection.cards.currentTrick;
  if (cards.length === 0) return null;
  const winnerPos = departing ? posOf(projection.viewerSeat, departing.winnerSeat) : null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-0 w-0 [--card-w:clamp(3rem,6vw,5rem)]" aria-label={departing ? "Ολοκληρωμένη μπάζα" : "Τρέχουσα μπάζα"}>
      {cards.map((play) => {
        const pos = posOf(projection.viewerSeat, play.seatIndex);
        const winner = departing?.winnerSeat === play.seatIndex;
        const transform = departing?.collecting && winnerPos != null ? COLLECT[winnerPos] : LANDING[pos];
        return (
          <div
            key={`${departing?.id ?? "current"}:${play.seatIndex}:${play.card.id}`}
            className={cn(
              "absolute left-0 top-0 transition-all duration-300 ease-out motion-reduce:duration-75",
              winner && departing && "z-30 drop-shadow-[0_0_16px_var(--gold)]",
              departing?.collecting && !winner && "opacity-30",
            )}
            style={{ transform }}
          >
            <PlayingCard card={play.card} />
          </div>
        );
      })}
    </div>
  );
}
