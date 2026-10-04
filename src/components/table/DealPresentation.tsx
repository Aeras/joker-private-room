import { useEffect, useMemo, useRef, useState } from "react";
import { nextSeat, type SeatIndex } from "@/domain/dealing";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { PlayingCard } from "../joker/PlayingCard";

type DealBeat = {
  id: string;
  seat: SeatIndex;
  index: number;
};

type Stage = "initial" | "remaining" | "full";

function stageFor(projection: PlayerGameProjection): Stage | null {
  if (projection.progression.cardsPerPlayer === 9) {
    if (projection.progression.phase === "NINE_CARD_TRUMP_CHOICE") return "initial";
    if (projection.progression.phase === "DECLARATION" && projection.cards.ownHand.length === 9) return "remaining";
    return null;
  }
  if (projection.progression.phase === "DECLARATION") return "full";
  return null;
}

function beatCount(projection: PlayerGameProjection, stage: Stage): number {
  if (stage === "initial") return 12;
  if (stage === "remaining") return 24;
  return projection.progression.cardsPerPlayer * 4;
}

function recipientFor(dealerSeat: SeatIndex, beatIndex: number): SeatIndex {
  return nextSeat(nextSeat(dealerSeat), beatIndex % 4);
}

function visualPosition(viewerSeat: SeatIndex, seat: SeatIndex): 0 | 1 | 2 | 3 {
  return ((seat - viewerSeat + 4) % 4) as 0 | 1 | 2 | 3;
}

const TARGET: Record<0 | 1 | 2 | 3, string> = {
  0: "translate(-50%, 42vh)",
  1: "translate(-43vw, 0)",
  2: "translate(-50%, -38vh)",
  3: "translate(38vw, 0)",
};

/**
 * Replays already-authoritative deal counts as backs only. It never receives deck order or hidden card identities.
 * First render is intentionally skipped so reconnect/resume cannot replay a historical deal burst.
 */
export function DealPresentation({ projection }: { projection: PlayerGameProjection }) {
  const firstRender = useRef(true);
  const previousStageKey = useRef<string | null>(null);
  const [beats, setBeats] = useState<DealBeat[]>([]);
  const [visibleIndex, setVisibleIndex] = useState(-1);
  const timers = useRef<number[]>([]);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const stage = stageFor(projection);
  const stageKey = stage
    ? `${projection.gameId}:${projection.progression.dealNumber}:${projection.progression.dealerSeat ?? "none"}:${stage}`
    : null;

  const sequence = useMemo(() => {
    if (!stage || projection.progression.dealerSeat == null) return [];
    const count = beatCount(projection, stage);
    const dealer = projection.progression.dealerSeat as SeatIndex;
    return Array.from({ length: count }, (_, index) => ({
      id: `${stageKey}:${index}`,
      seat: recipientFor(dealer, index),
      index,
    }));
  }, [projection, stage, stageKey]);

  useEffect(() => {
    const clearTimers = () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
    };
    clearTimers();

    if (firstRender.current) {
      firstRender.current = false;
      previousStageKey.current = stageKey;
      return clearTimers;
    }
    if (!stageKey || stageKey === previousStageKey.current || sequence.length === 0) {
      previousStageKey.current = stageKey;
      return clearTimers;
    }

    previousStageKey.current = stageKey;
    setBeats(sequence);
    setVisibleIndex(-1);
    playGameSound("shuffle", stageKey);

    const stagger = reducedMotion ? 28 : 72;
    sequence.forEach((beat, index) => {
      timers.current.push(window.setTimeout(() => {
        setVisibleIndex(index);
        playGameSound("deal", beat.id);
      }, index * stagger));
    });
    timers.current.push(window.setTimeout(() => {
      setBeats([]);
      setVisibleIndex(-1);
    }, sequence.length * stagger + (reducedMotion ? 120 : 360)));

    return clearTimers;
  }, [reducedMotion, sequence, stageKey]);

  if (beats.length === 0 || visibleIndex < 0) return null;

  const beat = beats[Math.min(visibleIndex, beats.length - 1)];
  if (!beat) return null;
  const pos = visualPosition(projection.viewerSeat, beat.seat);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden="true">
      <div
        key={beat.id}
        className="absolute left-1/2 top-1/2 [--card-w:clamp(1.8rem,4vw,3rem)] transition-transform duration-200 ease-out motion-reduce:duration-75"
        style={{ transform: TARGET[pos] }}
      >
        <PlayingCard faceDown />
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-[10px] tabular-nums text-white/70">
        {Math.min(visibleIndex + 1, beats.length)} / {beats.length}
      </div>
    </div>
  );
}
