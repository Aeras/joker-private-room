import { useCanvasArtwork } from "./canvas/useCanvasArtwork";
import { DEAL_LAUNCH_SCALE, dealProgress, dealtCard3DFlightFrames } from "./dealtCardMotion";
import { CanvasPresentation, type PresentationSprite } from "./canvas/CanvasPresentation";
import { dealSprite, dealSource } from "./canvas/dealSceneMotion";
import { dealerCardOrientation, SEAT_ROTATION } from "./DealPresentation";
import { useReducedMotion } from "./useReducedMotion";
import { REDUCED_MOTION_DISTANCE_PX } from "./presentationTiming";
import { PresentationRun } from "./presentationRun";
import { assets } from "@/assets/registry";
import { useCriticalCardArtwork } from "./useCriticalCardArtwork";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Card } from "@/domain/cards";
import type { SeatIndex } from "@/domain/dealing";
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

const INTRO_SLIDE_IN_MS = 850;
const INTRO_TO_DEALER_MS = 750;
const INTRO_OPENING_CARD_MS = 450;
const TOTAL_INTRO_MS = INTRO_SLIDE_IN_MS + INTRO_TO_DEALER_MS + INTRO_OPENING_CARD_MS;

type RevealedBeat = {
  id: string;
  card: Card;
  seat: 0 | 1 | 2 | 3;
  index: number;
  stackIndex: number;
};

type FrozenRun = {
  key: string;
  gameId: string;
  viewerSeat: number;
  geometry: TableGeometry;
  dealerPos: VisualSeat;
  dealerPoint: Point;
  dealerLocal: Point;
  centerPoint: Point;
  centerLocal: Point;
  startPoint: Point;
  startLocal: Point;
  openingCard: Card;
  beats: RevealedBeat[];
  cardWidth: number;
  deckWidth: number;
};

type IntroPhase = "idle" | "slide-in" | "to-dealer" | "opening-card" | "dealing";

function visualSeat(viewerSeat: number, seat: number): VisualSeat {
  return ((seat - viewerSeat + 4) % 4) as VisualSeat;
}

function stackedTarget(base: Point, pos: VisualSeat, stackIndex: number): Point {
  const offset = stackIndex * 6;
  const clearanceY = pos === 0 ? 18 : pos === 2 ? -18 : 0;
  const clearanceX = pos === 1 ? -14 : pos === 3 ? 14 : 0;
  if (pos === 3) return { x: base.x - offset + clearanceX, y: base.y + stackIndex * 2 + clearanceY };
  return { x: base.x + offset + clearanceX, y: base.y + stackIndex * 2 + clearanceY };
}

function CanvasDealerLabel({ run, beat }: { run: FrozenRun; beat: RevealedBeat }) {
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setArrived(true), DEALER_SELECTION_CARD_TRAVEL_MS);
    return () => window.clearTimeout(timer);
  }, [beat.id]);
  const pos = visualSeat(run.viewerSeat, beat.seat);
  const target = stackedTarget(
    run.geometry.dealTargets[pos],
    pos,
    beat.stackIndex,
  );
  const labelY =
    pos === 2
      ? target.y - run.cardWidth * 0.72 - 24
      : target.y + run.cardWidth * 0.72 + 6;
  return arrived ? (
    <div
      className="fixed z-40 -translate-x-1/2 rounded-md bg-black/85 px-2.5 py-1 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-primary shadow-[0_0_12px_rgba(212,175,55,0.7)] border border-primary/40 animate-in fade-in zoom-in-95 duration-200"
      style={{
        left: run.geometry.feltRect.left + target.x,
        top: run.geometry.feltRect.top + labelY,
      }}
    >
      Dealer
    </div>
  ) : null;
}

function RevealedCard({
  beat,
  viewerSeat,
  geometry,
  dealerPos,
  finalAce,
  cardWidth,
}: {
  beat: RevealedBeat;
  viewerSeat: number;
  geometry: TableGeometry;
  dealerPos: VisualSeat;
  finalAce: boolean;
  cardWidth: number;
}) {
  const preference = useReducedMotion();
  const reduced = useRef(preference).current;
  const [arrived, setArrived] = useState(false);
  const flightId = `dealer-flight-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const pos = visualSeat(viewerSeat, beat.seat);
  const dealerSource = dealSource(geometry, dealerPos);
  const dealerLocal = {
    x: dealerSource.x - geometry.feltRect.left,
    y: dealerSource.y - geometry.feltRect.top,
  };
  const base = geometry.dealTargets[pos];
  const target = stackedTarget(base, pos, beat.stackIndex);
  const targetRot = SEAT_ROTATION[pos];
  const dealerRot = dealerCardOrientation(dealerPos);
  const frames = !reduced ? dealtCard3DFlightFrames(dealerLocal, target, dealerRot, targetRot) : null;

  useEffect(() => {
    setArrived(false);
    const frame = window.requestAnimationFrame(() => setArrived(true));
    return () => window.cancelAnimationFrame(frame);
  }, [beat.id]);

  return (
    <div
      className={`absolute left-0 top-0 transition-[transform,opacity] ease-out ${finalAce ? "z-40 drop-shadow-[0_0_20px_rgba(212,175,55,0.95)]" : "z-30"}`}
      style={{
        width: cardWidth,
        left: dealerLocal.x,
        top: dealerLocal.y,
        zIndex: finalAce ? 60 : 30 + beat.stackIndex,
        opacity: reduced && !arrived ? 0 : 1,
        transitionDuration: `${DEALER_SELECTION_CARD_TRAVEL_MS}ms`,
        transitionProperty: frames ? "opacity" : "transform, opacity",
        animationName: frames ? flightId : "none",
        animationDuration: `${DEALER_SELECTION_CARD_TRAVEL_MS}ms`,
        animationTimingFunction: "linear",
        transform: `translate(calc(-50% + ${arrived || reduced ? target.x - dealerLocal.x : 0}px), calc(-50% + ${reduced ? target.y - dealerLocal.y + (arrived ? 0 : REDUCED_MOTION_DISTANCE_PX) : arrived ? target.y - dealerLocal.y : 0}px)) scale(${reduced || arrived ? 1 : DEAL_LAUNCH_SCALE}) rotate(${arrived ? targetRot : dealerRot}deg)`,
      }}
    >
      {frames && <style>{`@keyframes ${flightId}{${frames}}`}</style>}
      <PlayingCard card={beat.card} />
      {finalAce && arrived && (
        <div className="mt-1 rounded-md bg-black/85 px-2.5 py-1 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-primary shadow-[0_0_12px_rgba(212,175,55,0.7)] border border-primary/40">
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
  const [interrupted, setInterrupted] = useState(document.visibilityState === "hidden");
  const [resumeGeneration, resume] = useState(0);
  const [run, setRun] = useState<FrozenRun | null>(null);
  const [introPhase, setIntroPhase] = useState<IntroPhase>("idle");
  const [domSlideArrived, setDomSlideArrived] = useState(false);
  const [domToDealerArrived, setDomToDealerArrived] = useState(false);
  const [openingVisible, setOpeningVisible] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const runs = useRef(new PresentationRun());
  const timers = useRef<number[]>([]);
  const startupFrames = useRef<number[]>([]);
  const startedKey = useRef<string | null>(null);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const selection =
    projection.initialDealerSelection?.status === "resolved"
      ? projection.initialDealerSelection
      : null;
  const selectionKey = selection
    ? `${projection.gameId}:${selection.resolvedAtStateVersion}`
    : null;
  const canvasPrepared = useCanvasArtwork(
    selection
      ? [
          assets.cardBack,
          ...selection.revealedSelectionCards.map((card) => assets.cardFace(card)),
          assets.cardFace(selection.openingCard ?? selection.revealedSelectionCards[0]!),
        ]
      : [],
    dealerSelectionNeedsPresentation(projection) ? selectionKey : null,
  );
  const [failedCanvasKey, failCanvas] = useState<string | null>(null);
  const reducedCanvas = useReducedMotion();
  const openingAssetCard = selection?.openingCard ?? selection?.revealedSelectionCards[0];
  const artworkSettled = useCriticalCardArtwork([
    assets.cardBack,
    openingAssetCard ? assets.cardFace(openingAssetCard) : undefined,
  ]);
  const geometryReady = geometry != null;
  const needsPresentation = Boolean(
    selectionKey && selection && dealerSelectionNeedsPresentation(projection),
  );

  const clearTimers = useCallback(() => {
    runs.current.invalidate();
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
    for (const frame of startupFrames.current) window.cancelAnimationFrame(frame);
    startupFrames.current = [];
  }, []);

  useLayoutEffect(() => {
    clearTimers();
    startedKey.current = null;
    setRun(null);
    setIntroPhase("idle");
    setDomSlideArrived(false);
    setDomToDealerArrived(false);
    setOpeningVisible(false);
    setVisibleCount(0);
    return clearTimers;
  }, [selectionKey, clearTimers]);

  useEffect(() => {
    if (interrupted) return;
    if (!needsPresentation) {
      if (startedKey.current == null) onActiveChangeRef.current(false);
      return;
    }
    onActiveChangeRef.current(true);
    if (
      !artworkSettled ||
      canvasPrepared === null ||
      !geometryReady ||
      !geometry ||
      !selection ||
      !selectionKey
    ) {
      recordTimingDiagnostic("dealer_waiting_for_geometry");
      return;
    }
    if (startedKey.current === selectionKey) return;

    const firstFrame = window.requestAnimationFrame(
      runs.current.guard(() => {
        const secondFrame = window.requestAnimationFrame(
          runs.current.guard(() => {
            if (startedKey.current === selectionKey) return;
            const openingCard = selection.openingCard ?? selection.revealedSelectionCards[0];
            if (!openingCard) {
              recordTimingDiagnostic("dealer_sequence_missing_opening_card");
              return;
            }
            startedKey.current = selectionKey;
            startTimingDiagnosticSession(projection.gameId);

            const initialDealerSeat = ((selection.firstRecipientSeat + 3) % 4) as SeatIndex;
            const dealerPos = visualSeat(projection.viewerSeat, initialDealerSeat);
            const dealerPoint = dealSource(geometry, dealerPos);
            const standardDeckWidth = Math.round(geometry.trickCardSize.width * 0.95);
            const selectionCardWidth = Math.round(geometry.trickCardSize.width * 0.78);
            const centerPoint = {
              x: geometry.feltRect.left + geometry.dealCenter.x,
              y: geometry.feltRect.top + geometry.dealCenter.y,
            };
            const centerLocal = {
              x: geometry.dealCenter.x,
              y: geometry.dealCenter.y,
            };
            const dealerLocal = {
              x: dealerPoint.x - geometry.feltRect.left,
              y: dealerPoint.y - geometry.feltRect.top,
            };
            const startPoint = {
              x: geometry.feltRect.left + geometry.feltRect.width + standardDeckWidth + 60,
              y: centerPoint.y,
            };
            const startLocal = {
              x: geometry.feltRect.width + standardDeckWidth + 60,
              y: centerLocal.y,
            };

            const beats: RevealedBeat[] = selection.revealedSelectionCards.map((card, index) => ({
              id: `${projection.gameId}:dealer-select:${selection.resolvedAtStateVersion}:${index}:${card.id}`,
              card: { ...card },
              seat: dealerSelectionRecipient(selection.firstRecipientSeat, index),
              index,
              stackIndex: Math.floor(index / 4),
            }));
            const frozenRun: FrozenRun = {
              key: selectionKey,
              gameId: projection.gameId,
              viewerSeat: projection.viewerSeat,
              geometry,
              dealerPos,
              dealerPoint,
              dealerLocal,
              centerPoint,
              centerLocal,
              startPoint,
              startLocal,
              openingCard: { ...openingCard },
              beats,
              cardWidth: selectionCardWidth,
              deckWidth: standardDeckWidth,
            };
            setRun(frozenRun);
            setVisibleCount(0);

            const isFastOrResumed = reducedCanvas || resumeGeneration > 0;
            const cueMs = isFastOrResumed ? DEALER_START_CUE_MS : TOTAL_INTRO_MS;
            const staggerMs = DEALER_SELECTION_STAGGER_MS;
            const holdMs = DEALER_SELECTION_WINNER_HOLD_MS;

            recordTimingDiagnostic("dealer_sequence_start", {
              browserReducedMotion:
                window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
              gameplayReducedMotionOverride: false,
              cueMs,
              staggerMs,
              travelMs: DEALER_SELECTION_CARD_TRAVEL_MS,
              holdMs,
              openingCardId: openingCard.id,
              cardCount: beats.length,
              firstRecipientSeat: selection.firstRecipientSeat,
              frozenGeometryEpoch: geometry.epoch,
              dealCenterX: geometry.dealCenter.x,
              dealCenterY: geometry.dealCenter.y,
            });

            if (isFastOrResumed) {
              setIntroPhase("dealing");
              setOpeningVisible(true);
              playGameSound("shuffle", `${projection.gameId}:dealer-selection`);
            } else {
              setIntroPhase("slide-in");
              setDomSlideArrived(false);
              window.requestAnimationFrame(() => setDomSlideArrived(true));
              playGameSound("shuffle", `${projection.gameId}:dealer-intro-slide`);

              timers.current.push(
                window.setTimeout(
                  runs.current.guard(() => {
                    setIntroPhase("to-dealer");
                    setDomToDealerArrived(false);
                    window.requestAnimationFrame(() => setDomToDealerArrived(true));
                  }),
                  INTRO_SLIDE_IN_MS,
                ),
              );

              timers.current.push(
                window.setTimeout(
                  runs.current.guard(() => {
                    setIntroPhase("opening-card");
                    playGameSound("deal", `${projection.gameId}:dealer-opening-draw`);
                  }),
                  INTRO_SLIDE_IN_MS + INTRO_TO_DEALER_MS,
                ),
              );

              timers.current.push(
                window.setTimeout(
                  runs.current.guard(() => {
                    setIntroPhase("dealing");
                    setOpeningVisible(true);
                  }),
                  TOTAL_INTRO_MS,
                ),
              );
            }

            beats.forEach((beat, index) => {
              timers.current.push(
                window.setTimeout(
                  runs.current.guard(() => {
                    setVisibleCount(index + 1);
                    recordTimingDiagnostic("dealer_card_visible", {
                      index,
                      seat: beat.seat,
                      scheduledOffsetMs: cueMs + index * staggerMs,
                      finalAce: index === beats.length - 1,
                    });
                    playGameSound("deal", beat.id);
                  }),
                  cueMs + index * staggerMs,
                ),
              );
            });

            const completeAt = cueMs + beats.length * staggerMs + holdMs;
            timers.current.push(
              window.setTimeout(
                runs.current.guard(() => {
                  recordTimingDiagnostic("dealer_sequence_complete", {
                    scheduledOffsetMs: completeAt,
                  });
                  markDealerSelectionPresented(projection);
                  setOpeningVisible(false);
                  setVisibleCount(0);
                  setIntroPhase("idle");
                  setRun(null);
                  onActiveChangeRef.current(false);
                }),
                completeAt,
              ),
            );
          }),
        );
        startupFrames.current.push(secondFrame);
      }),
    );
    startupFrames.current.push(firstFrame);
  }, [
    geometryReady,
    needsPresentation,
    selectionKey,
    interrupted,
    resumeGeneration,
    geometry,
    projection,
    selection,
    artworkSettled,
    canvasPrepared,
    reducedCanvas,
  ]);

  useEffect(() => {
    const interrupt = () => {
      setInterrupted(true);
      if (!selectionKey || (run && run.key !== selectionKey)) return;
      clearTimers();
      recordTimingDiagnostic("dealer_sequence_interrupted", {
        visibilityState: document.visibilityState,
      });
      startedKey.current = null;
      setOpeningVisible(false);
      setVisibleCount(0);
      setIntroPhase("idle");
      setRun(null);
      onActiveChangeRef.current(true);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") {
        setInterrupted(false);
        resume((n) => n + 1);
      }
    };
    const orientation = () => {
      interrupt();
      restore();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") interrupt();
      else restore();
    };
    window.addEventListener("orientationchange", orientation);
    window.addEventListener("focus", restore);
    window.addEventListener("blur", interrupt);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("orientationchange", orientation);
      window.removeEventListener("focus", restore);
      window.removeEventListener("blur", interrupt);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [clearTimers, run, selectionKey]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!run || (introPhase === "idle" && !openingVisible && visibleCount === 0)) return null;
  const visible = run.beats.slice(0, visibleCount);
  const finalIndex = run.beats.length - 1;
  const canvasOwnsSelection = canvasPrepared === true && failedCanvasKey !== run.key;

  const canvasSprites: PresentationSprite[] = [];
  if (canvasOwnsSelection) {
    // 1. 3D Volumetric Deck Sprites (layered thickness)
    if (introPhase === "slide-in") {
      for (const layer of [2, 1, 0]) {
        canvasSprites.push({
          id: `selection-intro-deck:${layer}`,
          url: assets.cardBack,
          layer: 15 + layer,
          phase: "slide-in",
          duration: INTRO_SLIDE_IN_MS,
          sample: (t) => {
            const p = 1 - Math.pow(1 - t, 3);
            const ox = layer * 2;
            const oy = -layer * 1.8;
            return {
              x: run.startPoint.x + (run.centerPoint.x - run.startPoint.x) * p + ox,
              y: run.startPoint.y + (run.centerPoint.y - run.startPoint.y) * p + oy,
              width: run.deckWidth,
              height: run.deckWidth * 1.4,
              rotation: -3 * (1 - p),
              opacity: 1,
              flip: 0,
              shadowBlur: layer === 0 ? 16 : 3,
              shadowOffsetY: layer === 0 ? 8 : 1,
              shadowOffsetX: layer === 0 ? -4 : 0,
            };
          },
        });
      }
    } else if (introPhase === "to-dealer") {
      for (const layer of [2, 1, 0]) {
        canvasSprites.push({
          id: `selection-intro-deck:${layer}`,
          url: assets.cardBack,
          layer: 15 + layer,
          phase: "to-dealer",
          duration: INTRO_TO_DEALER_MS,
          sample: (t) => {
            const p = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const arc = 4 * t * (1 - t);
            const targetRot = dealerCardOrientation(run.dealerPos);
            const scale = 1 + 0.20 * arc;
            const ox = layer * 2 * scale;
            const oy = -layer * 1.8 * scale;
            return {
              x: run.centerPoint.x + (run.dealerPoint.x - run.centerPoint.x) * p + ox,
              y: run.centerPoint.y + (run.dealerPoint.y - run.centerPoint.y) * p + oy,
              width: run.deckWidth * scale,
              height: run.deckWidth * 1.4 * scale,
              rotation: targetRot * p,
              opacity: 1,
              flip: 0,
              shadowBlur: layer === 0 ? Math.round(14 + 22 * arc) : 3,
              shadowOffsetY: layer === 0 ? Math.round(6 + 26 * arc) : 1,
              shadowOffsetX: layer === 0 ? Math.round(-4 * (1 - p)) : 0,
            };
          },
        });
      }
    } else if (introPhase === "opening-card" || introPhase === "dealing") {
      for (const layer of [2, 1, 0]) {
        canvasSprites.push({
          id: `selection-dealer-deck:${layer}`,
          url: assets.cardBack,
          layer: 15 + layer,
          phase: "docked",
          duration: 0,
          sample: () => {
            const rot = dealerCardOrientation(run.dealerPos);
            const isHoriz = rot === 90 || rot === -90;
            const ox = isHoriz ? 0 : layer * 2;
            const oy = isHoriz ? -layer * 2 : -layer * 1.8;
            return {
              x: run.dealerPoint.x + ox,
              y: run.dealerPoint.y + oy,
              width: run.deckWidth,
              height: run.deckWidth * 1.4,
              rotation: rot,
              opacity: 1,
              flip: 0,
              shadowBlur: layer === 0 ? 10 : 2,
              shadowOffsetY: layer === 0 ? 4 : 1,
              shadowOffsetX: 0,
            };
          },
        });
      }
    }

    // 2. Opening Center Card (sized to match dealt cards)
    if (introPhase === "opening-card") {
      canvasSprites.push({
        id: "opening",
        url: assets.cardFace(run.openingCard)!,
        backUrl: assets.cardBack,
        layer: 20,
        phase: "drawing",
        duration: INTRO_OPENING_CARD_MS,
        sample: (t) => {
          const p = dealProgress(t);
          const arc = 4 * p * (1 - p);
          const startRot = dealerCardOrientation(run.dealerPos);
          return {
            x: run.dealerPoint.x + (run.centerPoint.x - run.dealerPoint.x) * p,
            y: run.dealerPoint.y + (run.centerPoint.y - run.dealerPoint.y) * p,
            width: run.cardWidth * (1.1 - 0.1 * p + 0.1 * arc),
            height: run.cardWidth * 1.4 * (1.1 - 0.1 * p + 0.1 * arc),
            rotation: startRot * (1 - p),
            opacity: 1,
            flip: Math.max(0, (1 - p * 2) * 180),
            shadowBlur: Math.round(5 + 16 * arc),
            shadowOffsetY: Math.round(4 + 18 * arc),
            shadowOffsetX: 0,
          };
        },
      });
    } else if (introPhase === "dealing" || openingVisible) {
      canvasSprites.push({
        id: "opening",
        url: assets.cardFace(run.openingCard)!,
        layer: 20,
        phase: "rest",
        duration: 0,
        sample: () => ({
          x: run.centerPoint.x,
          y: run.centerPoint.y,
          width: run.cardWidth,
          height: run.cardWidth * 1.4,
          rotation: 0,
          opacity: 1,
          flip: 0,
          shadowBlur: 8,
          shadowOffsetY: 3,
          shadowOffsetX: 0,
        }),
      });
    }

    // 3. Dealt Selection Cards
    for (const beat of visible) {
      canvasSprites.push(
        dealSprite(
          beat,
          run.geometry,
          run.viewerSeat,
          run.dealerPos,
          run.cardWidth,
          "selection",
          false,
          false,
          reducedCanvas,
          beat.index === finalIndex,
        ),
      );
    }
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      aria-hidden="true"
    >
      {canvasOwnsSelection && (
        <CanvasPresentation
          key={run.key}
          name="dealer-selection"
          sprites={canvasSprites}
          onFailure={() => failCanvas(run.key)}
        />
      )}
      {canvasOwnsSelection && visible.at(-1)?.index === finalIndex && (
        <CanvasDealerLabel
          key={visible.at(-1)!.id}
          run={run}
          beat={visible.at(-1)!}
        />
      )}
      {!canvasOwnsSelection && introPhase === "slide-in" && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform ease-out drop-shadow-2xl"
          style={{
            width: run.deckWidth,
            left: run.startLocal.x,
            top: run.startLocal.y,
            transitionDuration: `${INTRO_SLIDE_IN_MS}ms`,
            transform: `translate(calc(-50% + ${domSlideArrived ? run.centerLocal.x - run.startLocal.x : 0}px), -50%) rotate(${domSlideArrived ? 0 : -4}deg)`,
          }}
        >
          {[2, 1, 0].map((layer) => (
            <div
              key={layer}
              className="absolute left-0 top-0"
              style={{ transform: `translate(${layer * 2}px, ${-layer * 1.8}px)` }}
            >
              <PlayingCard back />
            </div>
          ))}
        </div>
      )}
      {!canvasOwnsSelection && introPhase === "to-dealer" && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 transition-all ease-out drop-shadow-2xl"
          style={{
            width: run.deckWidth,
            left: run.centerLocal.x,
            top: run.centerLocal.y,
            transitionDuration: `${INTRO_TO_DEALER_MS}ms`,
            transform: `translate(calc(-50% + ${domToDealerArrived ? run.dealerLocal.x - run.centerLocal.x : 0}px), calc(-50% + ${domToDealerArrived ? run.dealerLocal.y - run.centerLocal.y : 0}px)) rotate(${domToDealerArrived ? dealerCardOrientation(run.dealerPos) : 0}deg) scale(${domToDealerArrived ? 1 : 1.25})`,
          }}
        >
          {[2, 1, 0].map((layer) => (
            <div
              key={layer}
              className="absolute left-0 top-0"
              style={{ transform: `translate(${layer * 2}px, ${-layer * 1.8}px)` }}
            >
              <PlayingCard back />
            </div>
          ))}
        </div>
      )}
      {!canvasOwnsSelection && (introPhase === "opening-card" || introPhase === "dealing") && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 drop-shadow-xl"
          style={{
            width: run.deckWidth,
            left: run.dealerLocal.x,
            top: run.dealerLocal.y,
            transform: `translate(-50%, -50%) rotate(${dealerCardOrientation(run.dealerPos)}deg)`,
          }}
        >
          {[2, 1, 0].map((layer) => (
            <div
              key={layer}
              className="absolute left-0 top-0"
              style={{ transform: `translate(${layer * 2}px, ${-layer * 1.8}px)` }}
            >
              <PlayingCard back />
            </div>
          ))}
        </div>
      )}
      {!canvasOwnsSelection && openingVisible && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 drop-shadow-xl z-20"
          style={{
            width: run.cardWidth,
            left: run.centerLocal.x,
            top: run.centerLocal.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          <PlayingCard card={run.openingCard} />
        </div>
      )}
      {!canvasOwnsSelection &&
        visible.map((beat) => (
          <RevealedCard
            key={beat.id}
            beat={beat}
            viewerSeat={run.viewerSeat}
            geometry={run.geometry}
            dealerPos={run.dealerPos}
            finalAce={beat.index === finalIndex}
            cardWidth={run.cardWidth}
          />
        ))}
    </div>
  );
}
