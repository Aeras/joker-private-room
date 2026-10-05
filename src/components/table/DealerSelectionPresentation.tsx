import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "@/domain/cards";
import type { PlayerGameProjection } from "@/domain/projection";
import { playGameSound } from "@/lib/gameAudio";
import { recordTimingDiagnostic, startTimingDiagnosticSession } from "@/lib/timingDiagnostics";
import { PlayingCard } from "../joker/PlayingCard";
import {
  DEALER_SELECTION_CARD_TRAVEL_MS,
  DEALER_SELECTION_STAGGER_MS,
  DEALER_SELECTION_WINNER_HOLD_MS,
  DEALER_START_CUE_MS,
  dealerSelectionNeedsPresentation,
  dealerSelectionRecipient,
  markDealerSelectionPresented,
} from "./dealerSelectionPresentationModel";
import type { Point, TableGeometry, VisualSeat } from "./useTableGeometry";

type RevealedBeat = {
  id: string;
  card: Card;
  seat: 0 | 1 | 2 | 3;
  index: number;
};

type FrozenRun = {
  key: string;
  gameId: string;
  viewerSeat: number;
  geometry: TableGeometry;
  beats: RevealedBeat[];
};

function visualSeat(viewerSeat: number, seat: number): VisualSeat {
  return ((seat - viewerSeat + 4) % 4) as VisualSeat;
}

function relativeTransform(point: Point, center: Point, scale = 1): string {
  return `translate(calc(-50% + ${point.x - center.x}px), calc(-50% + ${point.y - center.y}px)) scale(${scale})`;
}

function RevealedCard({
  beat,
  viewerSeat,
  geometry,
  finalAce,
}: {
  beat: RevealedBeat;
  viewerSeat: number;
  geometry: TableGeometry;
  finalAce: boolean;
}) {
  const [arrived, setArrived] = useState(false);
  const pos = visualSeat(viewerSeat, beat.seat);
  const center = geometry.usableCenter;
  const base = geometry.dealTargets[pos];
  const stackOffset = (beat.index % 4) * 4;
  const target = {
    x: base.x + (pos === 0 || pos === 2 ? stackOffset - 6 : 0),
    y: base.y + (pos === 1 || pos === 3 ? stackOffset - 6 : 0),
  };

  useEffect(() => {
    setArrived(false);
    const frame = window.requestAnimationFrame(() => setArrived(true));
    return () => window.cancelAnimationFrame(frame);
  }, [beat.id]);

  return (
    <div
      className={`absolute left-0 top-0 [--card-w:clamp(2.4rem,5vw,3.8rem)] transition-transform ease-out ${finalAce ? "z-40 drop-shadow-[0_0_18px_var(--gold)]" : "z-30"}`}
      style={{
        transitionDuration: `${DEALER_SELECTION_CARD_TRAVEL_MS}ms`,
        transform: relativeTransform(arrived ? target : center, center, arrived ? 1 : 0.72),
      }}
    >
      <PlayingCard card={beat.card} />
      {finalAce && arrived && (
        <div className="mt-1 rounded-md bg-black/80 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
          Dealer
        </div>
      )}
    </div>
  );
}

export function DealerSelectionPresentation({
  projection,
  geometry,
  onActiveChange,
}: {
  projection: PlayerGameProjection;
  geometry: TableGeometry | null;
  onActiveChange: (active: boolean) => void;
}) {
  const [run, setRun] = useState<FrozenRun | null>(null);
  const [cueVisible, setCueVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const timers = useRef<number[]>([]);
  const startupFrames = useRef<number[]>([]);
  const startedKey = useRef<string | null>(null);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const selection = projection.initialDealerSelection?.status === "resolved"
    ? projection.initialDealerSelection
    : null;
  const selectionKey = selection
    ? `${projection.gameId}:${selection.resolvedAtStateVersion}`
    : null;
  const geometryReady = geometry != null;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const needsPresentation = Boolean(selectionKey && selection && dealerSelectionNeedsPresentation(projection));

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
    for (const frame of startupFrames.current) window.cancelAnimationFrame(frame);
    startupFrames.current = [];
  }, []);

  useEffect(() => {
    if (!needsPresentation) {
      if (startedKey.current == null) onActiveChangeRef.current(false);
      return;
    }
    onActiveChangeRef.current(true);
    if (!geometryReady || !geometry || !selection || !selectionKey) {
      recordTimingDiagnostic("dealer_waiting_for_geometry", { reducedMotion: Boolean(reducedMotion) });
      return;
    }
    if (startedKey.current === selectionKey) return;

    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => {
        if (startedKey.current === selectionKey) return;
        startedKey.current = selectionKey;
        startTimingDiagnosticSession(projection.gameId);

        const beats: RevealedBeat[] = selection.revealedSelectionCards.map((card, index) => ({
          id: `${projection.gameId}:dealer-select:${selection.resolvedAtStateVersion}:${index}:${card.id}`,
          card: { ...card },
          seat: dealerSelectionRecipient(selection.firstRecipientSeat, index),
          index,
        }));
        const frozenRun: FrozenRun = {
          key: selectionKey,
          gameId: projection.gameId,
          viewerSeat: projection.viewerSeat,
          geometry,
          beats,
        };
        setRun(frozenRun);
        setVisibleCount(0);
        setCueVisible(true);
        playGameSound("shuffle", `${projection.gameId}:dealer-selection`);

        const cueMs = reducedMotion ? 90 : DEALER_START_CUE_MS;
        const staggerMs = reducedMotion ? 90 : DEALER_SELECTION_STAGGER_MS;
        const holdMs = reducedMotion ? 160 : DEALER_SELECTION_WINNER_HOLD_MS;
        recordTimingDiagnostic("dealer_sequence_start", {
          reducedMotion: Boolean(reducedMotion),
          cueMs,
          staggerMs,
          travelMs: reducedMotion ? 75 : DEALER_SELECTION_CARD_TRAVEL_MS,
          holdMs,
          cardCount: beats.length,
          firstRecipientSeat: selection.firstRecipientSeat,
          frozenGeometryEpoch: geometry.epoch,
        });

        beats.forEach((beat, index) => {
          timers.current.push(window.setTimeout(() => {
            if (index === 0) setCueVisible(false);
            setVisibleCount(index + 1);
            recordTimingDiagnostic("dealer_card_visible", {
              index,
              seat: beat.seat,
              scheduledOffsetMs: cueMs + index * staggerMs,
              finalAce: index === beats.length - 1,
            });
            playGameSound("deal", beat.id);
          }, cueMs + index * staggerMs));
        });

        const completeAt = cueMs + beats.length * staggerMs + holdMs;
        timers.current.push(window.setTimeout(() => {
          recordTimingDiagnostic("dealer_sequence_complete", { scheduledOffsetMs: completeAt });
          markDealerSelectionPresented(projection);
          setCueVisible(false);
          setVisibleCount(0);
          setRun(null);
          onActiveChangeRef.current(false);
        }, completeAt));
      });
      startupFrames.current.push(secondFrame);
    });
    startupFrames.current.push(firstFrame);
  }, [geometryReady, needsPresentation, reducedMotion, selectionKey]);

  useEffect(() => {
    const interrupt = () => {
      if (!run || !selectionKey || run.key !== selectionKey) return;
      clearTimers();
      recordTimingDiagnostic("dealer_sequence_interrupted", {
        visibilityState: document.visibilityState,
      });
      markDealerSelectionPresented(projection);
      setCueVisible(false);
      setVisibleCount(0);
      setRun(null);
      onActiveChangeRef.current(false);
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
    };
  }, [clearTimers, projection, run, selectionKey]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!run || (!cueVisible && visibleCount === 0)) return null;
  const visible = run.beats.slice(0, visibleCount);
  const finalIndex = run.beats.length - 1;

  return (
    <div
      className="pointer-events-none absolute z-30 h-0 w-0"
      style={{ left: run.geometry.usableCenter.x, top: run.geometry.usableCenter.y }}
      aria-hidden="true"
    >
      {cueVisible && (
        <div className="absolute left-0 top-0 z-20 -translate-x-1/2 -translate-y-1/2 [--card-w:clamp(2.6rem,5vw,4rem)] drop-shadow-xl">
          <PlayingCard faceDown />
        </div>
      )}
      {visible.map((beat) => (
        <RevealedCard
          key={beat.id}
          beat={beat}
          viewerSeat={run.viewerSeat}
          geometry={run.geometry}
          finalAce={beat.index === finalIndex}
        />
      ))}
    </div>
  );
}
