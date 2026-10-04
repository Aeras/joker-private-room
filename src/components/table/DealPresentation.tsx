import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { nextSeat, type SeatIndex } from "@/domain/dealing";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { recordTimingDiagnostic, startTimingDiagnosticSession } from "@/lib/timingDiagnostics";
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
  useLayoutEffect(() => {
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
 *
 * Once a deal presentation starts, its geometry snapshot and public sequence are frozen.
 * Polling projections and later ResizeObserver epochs are not allowed to restart or cancel it.
 */
export function DealPresentation({
  projection,
  geometry = null,
  paused = false,
  onActiveChange,
}: {
  projection: PlayerGameProjection;
  geometry?: TableGeometry | null;
  paused?: boolean;
  onActiveChange?: (active: boolean) => void;
}) {
  const previousGameId = useRef(projection.gameId);
  const previousStageKey = useRef<string | null>(null);
  const [beats, setBeats] = useState<DealBeat[]>([]);
  const [visibleIndex, setVisibleIndex] = useState(-1);
  const [runGeometry, setRunGeometry] = useState<TableGeometry | null>(null);
  const [runViewerSeat, setRunViewerSeat] = useState<SeatIndex>(projection.viewerSeat);
  const timers = useRef<number[]>([]);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
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

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  const clearPresentation = useCallback(() => {
    clearTimers();
    setBeats([]);
    setVisibleIndex(-1);
    setRunGeometry(null);
    onActiveChangeRef.current?.(false);
  }, [clearTimers]);

  // Layout effect is intentional: when dealer intro releases its gate, the normal-deal
  // gate is raised again before the browser can paint the real hand/declaration UI.
  useLayoutEffect(() => {
    if (previousGameId.current !== projection.gameId) {
      clearPresentation();
      previousGameId.current = projection.gameId;
      previousStageKey.current = null;
    }

    if (paused || !stageKey || sequence.length === 0 || alreadyPresented(stageKey)) {
      previousStageKey.current = stageKey;
      return;
    }
    if (stageKey === previousStageKey.current) return;

    startTimingDiagnosticSession(projection.gameId);
    previousStageKey.current = stageKey;
    markPresented(stageKey);
    onActiveChangeRef.current?.(true);
    const frozenSequence = sequence.map((beat) => ({ ...beat }));
    const frozenGeometry = geometry;
    const frozenViewerSeat = projection.viewerSeat;
    setRunGeometry(frozenGeometry);
    setRunViewerSeat(frozenViewerSeat);
    setBeats(frozenSequence);
    setVisibleIndex(-1);
    if (stage !== "remaining") playGameSound("shuffle", `${projection.gameId}:${projection.progression.dealNumber}`);

    const { staggerMs, tailMs } = dealPresentationTiming(reducedMotion);
    recordTimingDiagnostic("deal_sequence_start", {
      reducedMotion: Boolean(reducedMotion),
      stage,
      dealNumber: projection.progression.dealNumber,
      dealerSeat: projection.progression.dealerSeat ?? -1,
      cardCount: frozenSequence.length,
      staggerMs,
      travelMs: reducedMotion ? 75 : 260,
      tailMs,
      frozenGeometryEpoch: frozenGeometry?.epoch ?? 0,
    });

    frozenSequence.forEach((beat, index) => {
      timers.current.push(window.setTimeout(() => {
        setVisibleIndex(index);
        recordTimingDiagnostic("deal_card_visible", {
          index,
          seat: beat.seat,
          stage,
          scheduledOffsetMs: index * staggerMs,
        });
        playGameSound("deal", beat.id);
      }, index * staggerMs));
    });

    const completeAt = frozenSequence.length * staggerMs + tailMs;
    timers.current.push(window.setTimeout(() => {
      recordTimingDiagnostic("deal_sequence_complete", {
        stage,
        scheduledOffsetMs: completeAt,
      });
      clearPresentation();
    }, completeAt));
  }, [clearPresentation, paused, projection.gameId, projection.progression.dealNumber, reducedMotion, sequence, stage, stageKey]);

  useLayoutEffect(() => {
    const visibility = () => {
      if (document.visibilityState !== "visible") {
        recordTimingDiagnostic("deal_sequence_interrupted", { visibilityState: document.visibilityState });
        clearPresentation();
      }
    };
    const interrupt = () => clearPresentation();
    window.addEventListener("orientationchange", interrupt);
    window.addEventListener("blur", interrupt);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("orientationchange", interrupt);
      window.removeEventListener("blur", interrupt);
      document.removeEventListener("visibilitychange", visibility);
      clearTimers();
    };
  }, [clearPresentation, clearTimers]);

  if (beats.length === 0 || visibleIndex < 0) return null;

  const beat = beats[Math.min(visibleIndex, beats.length - 1)];
  if (!beat) return null;
  const pos = visualPosition(runViewerSeat, beat.seat);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      aria-hidden="true"
      data-deal-geometry-epoch={runGeometry?.epoch ?? 0}
    >
      <TravelingBack key={beat.id} beat={beat} pos={pos} geometry={runGeometry} />
    </div>
  );
}
