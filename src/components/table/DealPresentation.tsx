import { useEffect, useMemo, useRef, useState } from "react";
import { nextSeat, type SeatIndex } from "@/domain/dealing";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { PlayingCard } from "../joker/PlayingCard";
import { dealPresentationTiming } from "./dealPresentationModel";
import type { Point, TableGeometry, VisualSeat } from "./useTableGeometry";

type DealBeat = {
  id: string;
  seat: SeatIndex;
  index: number;
};

type Stage = "initial" | "remaining" | "full";

const FALLBACK_TARGET: Record<VisualSeat, string> = {
  0: "translate(-50%, 42vh)",
  1: "translate(-43vw, -50%)",
  2: "translate(-50%, -38vh)",
  3: "translate(38vw, -50%)",
};

function stageFor(projection: PlayerGameProjection): Stage | null {
  if (projection.progression.cardsPerPlayer === 9 && projection.rulesetId !== "classic") {
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

function visualPosition(viewerSeat: SeatIndex, seat: SeatIndex): VisualSeat {
  return ((seat - viewerSeat + 4) % 4) as VisualSeat;
}

function viewportPoint(geometry: TableGeometry, local: Point): Point {
  return {
    x: geometry.feltRect.left + local.x,
    y: geometry.feltRect.top + local.y,
  };
}

function presentationStorageKey(stageKey: string): string {
  return `joker:deal-presented:${stageKey}`;
}

function alreadyPresented(stageKey: string): boolean {
  return typeof window !== "undefined" && window.sessionStorage.getItem(presentationStorageKey(stageKey)) === "1";
}

function markPresented(stageKey: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(presentationStorageKey(stageKey), "1");
}

function TravelingBack({
  beat,
  pos,
  geometry,
}: {
  beat: DealBeat;
  pos: VisualSeat;
  geometry: TableGeometry | null;
}) {
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    setArrived(false);
    const frame = window.requestAnimationFrame(() => setArrived(true));
    return () => window.cancelAnimationFrame(frame);
  }, [beat.id]);

  if (!geometry) {
    return (
      <div
        className="absolute left-1/2 top-1/2 [--card-w:clamp(1.8rem,4vw,3rem)] transition-transform duration-260 ease-out motion-reduce:duration-75"
        style={{ transform: arrived ? FALLBACK_TARGET[pos] : "translate(-50%, -50%) scale(.58)" }}
      >
        <PlayingCard faceDown />
      </div>
    );
  }

  const source = viewportPoint(geometry, geometry.usableCenter);
  const target = viewportPoint(geometry, geometry.seatOrigins[pos]);
  return (
    <div
      className="absolute [--card-w:clamp(1.8rem,4vw,3rem)] transition-[left,top,transform] duration-260 ease-out motion-reduce:duration-75"
      style={{
        left: arrived ? target.x : source.x,
        top: arrived ? target.y : source.y,
        transform: `translate(-50%, -50%) scale(${arrived ? 1 : 0.58})`,
      }}
    >
      <PlayingCard faceDown />
    </div>
  );
}

/**
 * Replays public deal counts as backs only. A session-scoped presentation marker
 * prevents historical deal bursts from replaying after refresh/reconnect while
 * still allowing the first live projection of a newly-created deal to animate.
 */
export function DealPresentation({
  projection,
  geometry = null,
  paused = false,
}: {
  projection: PlayerGameProjection;
  geometry?: TableGeometry | null;
  paused?: boolean;
}) {
  const previousGameId = useRef(projection.gameId);
  const previousStageKey = useRef<string | null>(null);
  const previousGeometryEpoch = useRef(geometry?.epoch ?? 0);
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
  }, [projection.progression.cardsPerPlayer, projection.progression.dealerSeat, stage, stageKey]);

  const interrupt = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
    setBeats([]);
    setVisibleIndex(-1);
  };

  useEffect(() => {
    const nextEpoch = geometry?.epoch ?? 0;
    if (previousGeometryEpoch.current === nextEpoch) return;
    previousGeometryEpoch.current = nextEpoch;
    interrupt();
  }, [geometry?.epoch]);

  useEffect(() => {
    interrupt();

    if (previousGameId.current !== projection.gameId) {
      previousGameId.current = projection.gameId;
      previousStageKey.current = null;
    }
    if (paused || !stageKey || sequence.length === 0 || alreadyPresented(stageKey)) {
      previousStageKey.current = stageKey;
      return interrupt;
    }
    if (stageKey === previousStageKey.current && beats.length > 0) return interrupt;

    previousStageKey.current = stageKey;
    markPresented(stageKey);
    setBeats(sequence);
    setVisibleIndex(-1);
    if (stage !== "remaining") playGameSound("shuffle", `${projection.gameId}:${projection.progression.dealNumber}`);

    const { staggerMs, tailMs } = dealPresentationTiming(reducedMotion);
    sequence.forEach((beat, index) => {
      timers.current.push(window.setTimeout(() => {
        setVisibleIndex(index);
        playGameSound("deal", beat.id);
      }, index * staggerMs));
    });
    timers.current.push(window.setTimeout(
      () => interrupt(),
      sequence.length * staggerMs + tailMs,
    ));

    return interrupt;
  }, [paused, projection.gameId, projection.progression.dealNumber, reducedMotion, sequence, stage, stageKey]);

  useEffect(() => {
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

  if (beats.length === 0 || visibleIndex < 0) return null;

  const beat = beats[Math.min(visibleIndex, beats.length - 1)];
  if (!beat) return null;
  const pos = visualPosition(projection.viewerSeat, beat.seat);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      aria-hidden="true"
      data-deal-geometry-epoch={geometry?.epoch ?? 0}
    >
      <TravelingBack key={beat.id} beat={beat} pos={pos} geometry={geometry} />
    </div>
  );
}
