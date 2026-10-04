import { useEffect, useMemo, useRef, useState } from "react";
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

function visualSeat(viewerSeat: number, seat: number): VisualSeat {
  return ((seat - viewerSeat + 4) % 4) as VisualSeat;
}

function relativeTransform(point: Point, center: Point, scale = 1): string {
  return `translate(calc(-50% + ${point.x - center.x}px), calc(-50% + ${point.y - center.y}px)) scale(${scale})`;
}

function RevealedCard({
  beat,
  projection,
  geometry,
  finalAce,
}: {
  beat: RevealedBeat;
  projection: PlayerGameProjection;
  geometry: TableGeometry;
  finalAce: boolean;
}) {
  const [arrived, setArrived] = useState(false);
  const pos = visualSeat(projection.viewerSeat, beat.seat);
  const center = geometry.usableCenter;
  const base = geometry.seatOrigins[pos];
  const stackOffset = (beat.index % 4) * 4;
  const target = {
    x: base.x + (pos === 1 ? 34 : pos === 3 ? -34 : stackOffset - 6),
    y: base.y + (pos === 0 ? -48 : pos === 2 ? 48 : stackOffset - 6),
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
  const [cueVisible, setCueVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const timers = useRef<number[]>([]);
  const selection = projection.initialDealerSelection?.status === "resolved"
    ? projection.initialDealerSelection
    : null;
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const beats = useMemo<RevealedBeat[]>(() => {
    if (!selection) return [];
    return selection.revealedSelectionCards.map((card, index) => ({
      id: `${projection.gameId}:dealer-select:${selection.resolvedAtStateVersion}:${index}:${card.id}`,
      card,
      seat: dealerSelectionRecipient(selection.firstRecipientSeat, index),
      index,
    }));
  }, [projection.gameId, selection]);

  const clear = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  useEffect(() => {
    clear();
    setCueVisible(false);
    setVisibleCount(0);

    const needsPresentation = Boolean(selection && beats.length > 0 && dealerSelectionNeedsPresentation(projection));
    if (!needsPresentation) {
      onActiveChange(false);
      return clear;
    }

    startTimingDiagnosticSession(projection.gameId);
    onActiveChange(true);
    if (!geometry) {
      recordTimingDiagnostic("dealer_waiting_for_geometry", { reducedMotion: Boolean(reducedMotion) });
      return clear;
    }

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
      firstRecipientSeat: selection?.firstRecipientSeat ?? -1,
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
      onActiveChange(false);
    }, completeAt));

    return clear;
  }, [beats, geometry?.epoch, projection.gameId, reducedMotion, selection?.resolvedAtStateVersion]);

  useEffect(() => {
    const interrupt = () => {
      if (!dealerSelectionNeedsPresentation(projection)) return;
      clear();
      recordTimingDiagnostic("dealer_sequence_interrupted", {
        visibilityState: document.visibilityState,
      });
      markDealerSelectionPresented(projection);
      setCueVisible(false);
      setVisibleCount(0);
      onActiveChange(false);
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
      clear();
    };
  }, [projection.gameId, selection?.resolvedAtStateVersion]);

  if (!geometry || (!cueVisible && visibleCount === 0)) return null;
  const visible = beats.slice(0, visibleCount);
  const finalIndex = beats.length - 1;

  return (
    <div
      className="pointer-events-none absolute z-30 h-0 w-0"
      style={{ left: geometry.usableCenter.x, top: geometry.usableCenter.y }}
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
          projection={projection}
          geometry={geometry}
          finalAce={beat.index === finalIndex}
        />
      ))}
    </div>
  );
}
